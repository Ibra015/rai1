/**
 * Agro-Omni Camera AI Module
 * TensorFlow.js + MobileNet مع نظام Agro-Brain للتصحيح الذكي
 */

let video = null;
let canvas = null;
let ctx = null;
let model = null;
let aiStatus = null;
let stream = null;
let isRunning = false;
let allowDebug = false;

// تاريخ التوقعات للاستقرار
let history = [];
const HISTORY_SIZE = 15;
const CONFIDENCE_THRESHOLD = 0.60;

// OffscreenCanvas لتحليل الألوان (تجنب الرسم على الـ canvas المرئي)
let _colorCanvas = null;
let _colorCtx = null;

async function initCameraAI() {
    video = document.getElementById('camVideo');
    canvas = document.getElementById('camCanvas');
    aiStatus = document.getElementById('aiStatusText');
    const overlay = document.getElementById('camOverlay');

    if (!video || !canvas) {
        console.error('[Camera] عناصر الكاميرا غير موجودة');
        return;
    }

    if (isRunning) {
        stopCamera();
        return;
    }

    ctx = canvas.getContext('2d');

    try {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });
        } catch (e) {
            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
        }

        video.srcObject = stream;
        isRunning = true;

        if (overlay) overlay.style.display = 'none';
        updateCamUI(true);

        video.onloadedmetadata = () => {
            video.play();
            resizeCanvas();
            loadAI();
        };
    } catch (err) {
        console.error("[Camera] خطأ:", err);
        if (aiStatus) {
            aiStatus.innerHTML = `خطأ: ${err.name || err.message}`;
            aiStatus.style.color = "red";
        }
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (video) video.srcObject = null;
    isRunning = false;
    history = [];
    updateCamUI(false);

    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (aiStatus) aiStatus.innerHTML = "الكاميرا متوقفة";
}

function updateCamUI(active) {
    const overlay = document.getElementById('camOverlay');
    const stopBtn = document.getElementById('stopBtn');
    if (active) {
        if (overlay) overlay.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'flex';
    } else {
        if (overlay) overlay.style.display = 'flex';
        if (stopBtn) stopBtn.style.display = 'none';
    }
}

function resizeCanvas() {
    if (canvas && video) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
    }
}

// تحميل النموذج مع إعادة المحاولة
const MAX_RETRIES = 3;

async function loadAI(retryCount = 0) {
    if (!isRunning) return;

    if (aiStatus) {
        aiStatus.innerText = retryCount > 0
            ? `محاولة إعادة التحميل (${retryCount}/${MAX_RETRIES})...`
            : "جاري تحميل النموذج...";
    }

    // محاولة استخدام WebGL لتسريع الأداء
    try {
        if (typeof tf !== 'undefined') {
            await tf.setBackend('webgl');
            await tf.ready();
            console.log('[AI] Backend:', tf.getBackend());
        }
    } catch (e) {
        console.warn('[AI] WebGL غير متاح، استخدام CPU');
        if (typeof tf !== 'undefined') {
            await tf.setBackend('cpu');
        }
    }

    try {
        model = await mobilenet.load();

        if (isRunning && aiStatus) {
            aiStatus.innerHTML = "الذكاء الاصطناعي نشط <span style='color:var(--success)'>●</span>";
            detectFrame();
        }
    } catch (error) {
        console.error("[AI] خطأ في تحميل النموذج:", error);

        if (retryCount < MAX_RETRIES) {
            setTimeout(() => loadAI(retryCount + 1), 2000);
        } else if (aiStatus) {
            aiStatus.innerHTML = `فشل التحميل — <button onclick="loadAI(0)" style="background:var(--primary);color:white;border:none;border-radius:5px;padding:3px 10px;cursor:pointer;font-family:Cairo">إعادة المحاولة</button>`;
        }
    }
}

// حلقة الكشف مع CONFIDENCE_THRESHOLD
async function detectFrame() {
    if (!model || !isRunning || !video || !ctx) return;

    try {
        const predictions = await model.classify(video);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        resizeCanvas();

        // فحص عتبة الثقة
        if (!predictions || predictions.length === 0 ||
            predictions[0].probability < CONFIDENCE_THRESHOLD) {
            drawResult("قرّب النبات من الكاميرا", "⌛ ثقة منخفضة", '#FFAA00');
            if (isRunning) requestAnimationFrame(detectFrame);
            return;
        }

        let finalPred = predictions[0];

        // --- منطق Agro-Brain ---
        let colorData = null;
        try {
            if (video.readyState === 4) {
                colorData = analyzeColor();
                finalPred = smartCorrect(predictions[0], colorData);
            }
        } catch (e) {
            console.warn("[Agro-Brain] تم تخطي إطار:", e);
        }

        // إضافة للتاريخ
        history.push(finalPred);
        if (history.length > HISTORY_SIZE) history.shift();

        // تصويت الاستقرار مع tie-breaking بالثقة
        const counts = {};
        const probSums = {};

        history.forEach(p => {
            const name = p.name || p.className.split(',')[0];
            counts[name] = (counts[name] || 0) + 1;
            probSums[name] = (probSums[name] || 0) + (p.probability || 0);
        });

        let bestCandidate = null;
        let maxCount = 0;
        let maxAvgProb = 0;

        for (const [name, count] of Object.entries(counts)) {
            const avgProb = probSums[name] / count;
            if (count > maxCount || (count === maxCount && avgProb > maxAvgProb)) {
                maxCount = count;
                bestCandidate = name;
                maxAvgProb = avgProb;
            }
        }

        const isStable = maxCount > (HISTORY_SIZE / 2.5);

        if (isStable) {
            const isCorrected = history.some(h =>
                (h.name === bestCandidate || h.className?.split(',')[0] === bestCandidate)
                && h.isCorrected
            );

            let displayName = bestCandidate;
            let displayPercent = Math.round(predictions[0].probability * 100) + "%";

            if (isCorrected) {
                displayPercent = "Agro-Brain 🧠";
            }

            drawResult(displayName, displayPercent, isCorrected ? '#00FF00' : '#00FFFF');
        } else {
            drawResult("جاري التحليل...", "⌛", '#AAAAAA');
        }

        // تحديث لوحة التطوير (تمرير colorData مباشرة — بدون استدعاء مزدوج)
        updateDebugPanel(predictions[0], finalPred, colorData);

    } catch (error) {
        console.error("[AI] خطأ في الكشف:", error);
    }

    if (isRunning) {
        requestAnimationFrame(detectFrame);
    }
}

// --- دوال Agro-Brain ---

function analyzeColor() {
    try {
        // استخدام OffscreenCanvas لتجنب الرسم على الـ canvas المرئي
        if (!_colorCanvas) {
            if (typeof OffscreenCanvas !== 'undefined') {
                _colorCanvas = new OffscreenCanvas(50, 50);
            } else {
                _colorCanvas = document.createElement('canvas');
                _colorCanvas.width = 50;
                _colorCanvas.height = 50;
            }
            _colorCtx = _colorCanvas.getContext('2d');
        }

        // رسم المنطقة المركزية فقط (50x50)
        const sx = video.videoWidth / 2 - 25;
        const sy = video.videoHeight / 2 - 25;
        _colorCtx.drawImage(video, sx, sy, 50, 50, 0, 0, 50, 50);
        const frameData = _colorCtx.getImageData(0, 0, 50, 50);

        let r = 0, g = 0, b = 0;
        const count = frameData.data.length / 4;

        for (let i = 0; i < frameData.data.length; i += 4) {
            r += frameData.data[i];
            g += frameData.data[i + 1];
            b += frameData.data[i + 2];
        }

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        let dominant = 'Neutral';
        if (r > g + 40 && r > b + 40) dominant = 'Red';
        else if (g > r + 20 && g > b + 20) dominant = 'Green';
        else if (r > 200 && g > 150 && b < 100) dominant = 'Orange';
        else if (g > r && g > b && g > 80 && Math.abs(r - b) < 40) dominant = 'DarkGreen';

        return { r, g, b, dominant };
    } catch (error) {
        console.error("[Color] خطأ:", error);
        return { r: 0, g: 0, b: 0, dominant: 'Unknown' };
    }
}

function smartCorrect(prediction, colorData) {
    let name = prediction.className.split(',')[0].toLowerCase();
    let isCorrected = false;
    let action = "بدون تصحيح";

    // القاعدة 1: الطماطم (أحمر)
    const redFruits = ['orange', 'apple', 'pomegranate', 'peach', 'apricot', 'strawberry'];
    if (redFruits.some(f => name.includes(f)) && colorData.dominant === 'Red') {
        name = 'Tomato (طماطم)';
        isCorrected = true;
        action = "تصحيح: لون أحمر → طماطم";
    }

    // القاعدة 2: الخيار (أخضر + شكل ممدود)
    const greenVegs = ['zucchini', 'squash', 'banana', 'corn', 'cucumber'];
    if (greenVegs.some(v => name.includes(v)) && colorData.dominant === 'Green') {
        name = 'Cucumber (خيار)';
        isCorrected = true;
        action = "تصحيح: لون أخضر → خيار";
    }

    // القاعدة 3: الخضروات الورقية
    const leafyKeywords = ['cabbage', 'broccoli', 'cauliflower', 'kale'];
    if (leafyKeywords.some(k => name.includes(k)) && (colorData.dominant === 'Green' || colorData.dominant === 'DarkGreen')) {
        name = 'Leafy Greens (خس/جرجير)';
        isCorrected = true;
        action = "تصحيح: أوراق خضراء → خضروات ورقية";
    }

    // القاعدة 4: الفلفل
    if (name.includes('bell pepper') || name.includes('pepper') || name.includes('capsicum')) {
        name = 'Pepper (فلفل)';
        action = "تبسيط الاسم → فلفل";
    }

    // القاعدة 5: الجزر (برتقالي)
    if (colorData.dominant === 'Orange' && (name.includes('carrot') || name.includes('turnip') || name.includes('root'))) {
        name = 'Carrot (جزر)';
        isCorrected = true;
        action = "تصحيح: لون برتقالي → جزر";
    }

    // القاعدة 6: الفاصوليا/البازلاء (أخضر رفيع)
    if (colorData.dominant === 'Green' && (name.includes('bean') || name.includes('pea') || name.includes('pod'))) {
        name = 'Beans/Peas (فاصوليا/بازلاء)';
        isCorrected = true;
        action = "تصحيح: قرون خضراء";
    }

    // القاعدة 7: السبانخ (أخضر داكن)
    if (colorData.dominant === 'DarkGreen' && (name.includes('spinach') || name.includes('leaf') || name.includes('herb'))) {
        name = 'Spinach (سبانخ)';
        isCorrected = true;
        action = "تصحيح: أخضر داكن → سبانخ";
    }

    return {
        name,
        className: name,
        isCorrected,
        action,
        probability: prediction.probability
    };
}

function drawResult(text, subText, color) {
    if (!ctx || !canvas) return;

    try {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(10, canvas.height - 70, canvas.width - 20, 60);

        ctx.fillStyle = color;
        ctx.font = 'bold 22px Cairo, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height - 38);

        ctx.fillStyle = '#DDDDDD';
        ctx.font = '16px Cairo, Arial, sans-serif';
        ctx.fillText(subText, canvas.width / 2, canvas.height - 15);
    } catch (error) {
        console.error("[Draw] خطأ:", error);
    }
}

// تحديث لوحة التطوير — يستقبل colorData مباشرة (بدون استدعاء analyzeColor مرة ثانية)
function updateDebugPanel(rawPred, finalPred, colorData) {
    if (!allowDebug) return;

    const dbgPanel = document.getElementById('aiDebugPanel');
    if (!dbgPanel || dbgPanel.style.display === 'none') return;

    try {
        const dbgRaw = document.getElementById('dbgRaw');
        const dbgColor = document.getElementById('dbgColor');
        const dbgAction = document.getElementById('dbgAction');

        if (dbgRaw) dbgRaw.textContent = rawPred.className.split(',')[0];
        if (dbgAction) dbgAction.textContent = finalPred.action || 'None';
        if (dbgColor && colorData) {
            dbgColor.textContent = `${colorData.dominant} (R${colorData.r} G${colorData.g} B${colorData.b})`;
        }
    } catch (error) {
        console.error("[Debug] خطأ:", error);
    }
}

function toggleDebug() {
    const p = document.getElementById('aiDebugPanel');
    if (p) {
        if (p.style.display === 'none' || p.style.display === '') {
            p.style.display = 'block';
            allowDebug = true;
        } else {
            p.style.display = 'none';
            allowDebug = false;
        }
    }
}

window.addEventListener('resize', resizeCanvas);
