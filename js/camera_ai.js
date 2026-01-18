// ===== إصلاح جميع المشاكل في camera_ai.js =====

let video = null;
let canvas = null;
let ctx = null;
let model = null;
let aiStatus = null;
let stream = null;
let isRunning = false;
let allowDebug = false; // ✅ إضافة المتغير الناقص

// تاريخ التوقعات للاستقرار
let history = [];
const HISTORY_SIZE = 15;
const CONFIDENCE_THRESHOLD = 0.60;

async function initCameraAI() {
    video = document.getElementById('camVideo');
    canvas = document.getElementById('camCanvas');
    aiStatus = document.getElementById('aiStatusText');
    const overlay = document.getElementById('camOverlay');

    if (!video || !canvas) {
        console.error('عناصر الكاميرا غير موجودة في الصفحة');
        return;
    }

    // إيقاف الكاميرا إذا كانت تعمل
    if (isRunning) {
        stopCamera();
        return;
    }

    ctx = canvas.getContext('2d');

    // 1. تشغيل الكاميرا
    try {
        try {
            // محاولة استخدام الكاميرا الخلفية أولاً
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });
        } catch (e) {
            // استخدام أي كاميرا متاحة
            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
        }

        video.srcObject = stream;
        isRunning = true;

        // إخفاء شاشة البداية
        if (overlay) overlay.style.display = 'none';

        // تحديث واجهة المستخدم
        updateCamUI(true);

        video.onloadedmetadata = () => {
            video.play();
            resizeCanvas();
            loadAI();
        };
    } catch (err) {
        console.error("خطأ في الكاميرا:", err);
        if (aiStatus) {
            aiStatus.innerHTML = `خطأ: ${err.name || err.message}`;
            aiStatus.style.color = "red";
        }
        alert("خطأ في الكاميرا: " + (err.name || err.message));
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    if (video) video.srcObject = null;
    isRunning = false;
    history = []; // ✅ مسح التاريخ عند الإيقاف
    updateCamUI(false);

    // مسح الرسم على الكانفس
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

// 2. تحميل نموذج الذكاء الاصطناعي
async function loadAI() {
    if (!isRunning) return;

    if (aiStatus) aiStatus.innerText = "جاري تحميل النموذج...";

    try {
        // تحميل MobileNet
        model = await mobilenet.load();

        if (isRunning && aiStatus) {
            aiStatus.innerHTML = "الذكاء الاصطناعي نشط <span style='color:var(--success)'>●</span>";
            detectFrame();
        }
    } catch (error) {
        console.error("خطأ في تحميل النموذج:", error);
        if (aiStatus) {
            aiStatus.innerHTML = "فشل تحميل النموذج";
            aiStatus.style.color = "red";
        }
    }
}

// 3. حلقة الكشف مع التحسينات
async function detectFrame() {
    if (!model || !isRunning || !video || !ctx) return;

    try {
        // التصنيف
        const predictions = await model.classify(video);

        // مسح ومعايرة الكانفس
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        resizeCanvas();

        if (predictions && predictions.length > 0) {
            let finalPred = predictions[0];

            // --- منطق Agro-Brain ---
            try {
                if (ctx && video.readyState === 4) {
                    const colorData = analyzeColor();
                    finalPred = smartCorrect(predictions[0], colorData);
                }
            } catch (e) {
                console.warn("تم تخطي إطار Agro-Brain:", e);
            }

            // إضافة للتاريخ
            history.push(finalPred);
            if (history.length > HISTORY_SIZE) history.shift();

            // تصويت الاستقرار
            const counts = {};
            history.forEach(p => {
                const name = p.name || p.className.split(',')[0];
                counts[name] = (counts[name] || 0) + 1;
            });

            let bestCandidate = null;
            let maxCount = 0;
            for (const [name, count] of Object.entries(counts)) {
                if (count > maxCount) {
                    maxCount = count;
                    bestCandidate = name;
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

            // تحديث لوحة التطوير
            updateDebugPanel(predictions[0], finalPred);
        }
    } catch (error) {
        console.error("خطأ في الكشف:", error);
    }

    if (isRunning) {
        requestAnimationFrame(detectFrame);
    }
}

// --- دوال Agro-Brain ---

function analyzeColor() {
    try {
        // أخذ عينة من مركز الصورة 50x50 بكسل
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const sampleSize = 50;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = ctx.getImageData(
            Math.max(0, cx - sampleSize / 2),
            Math.max(0, cy - sampleSize / 2),
            Math.min(sampleSize, canvas.width),
            Math.min(sampleSize, canvas.height)
        );

        // حساب متوسط RGB
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

        // تحديد اللون السائد
        let dominant = 'Neutral';
        if (r > g + 40 && r > b + 40) {
            dominant = 'Red';
        } else if (g > r + 20 && g > b + 20) {
            dominant = 'Green';
        } else if (r > 200 && g > 150 && b < 100) {
            dominant = 'Orange';
        }

        // مسح الرسم (كنا نحتاج البيانات فقط)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        return { r, g, b, dominant };
    } catch (error) {
        console.error("خطأ في تحليل اللون:", error);
        return { r: 0, g: 0, b: 0, dominant: 'Unknown' };
    }
}

function smartCorrect(prediction, colorData) {
    let name = prediction.className.split(',')[0].toLowerCase();
    let isCorrected = false;
    let action = "بدون تصحيح";

    // القاعدة 1: إصلاح الطماطم
    const redFruits = ['orange', 'apple', 'pomegranate', 'peach', 'apricot'];
    if (redFruits.some(f => name.includes(f)) && colorData.dominant === 'Red') {
        name = 'Tomato (طماطم)';
        isCorrected = true;
        action = "تصحيح: لون أحمر → طماطم";
    }

    // القاعدة 2: إصلاح الخيار
    const greenVegs = ['zucchini', 'squash', 'banana', 'corn'];
    if (greenVegs.some(v => name.includes(v)) && colorData.dominant === 'Green') {
        name = 'Cucumber (خيار)';
        isCorrected = true;
        action = "تصحيح: لون أخضر → خيار";
    }

    // القاعدة 3: إصلاح الخضروات الورقية
    if ((name.includes('cabbage') || name.includes('broccoli')) && colorData.dominant === 'Green') {
        name = 'Leafy Greens (خس/جرجير)';
        isCorrected = true;
        action = "تصحيح: أخضر + كرنب → خضروات ورقية";
    }

    // القاعدة 4: تبسيط اسم الفلفل
    if (name.includes('bell pepper') || name.includes('pepper')) {
        name = 'Pepper (فلفل)';
        action = "تبسيط الاسم";
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
        // خلفية
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(10, canvas.height - 70, canvas.width - 20, 60);

        // النص الرئيسي
        ctx.fillStyle = color;
        ctx.font = 'bold 22px Cairo, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height - 38);

        // النص الفرعي
        ctx.fillStyle = '#DDDDDD';
        ctx.font = '16px Cairo, Arial, sans-serif';
        ctx.fillText(subText, canvas.width / 2, canvas.height - 15);
    } catch (error) {
        console.error("خطأ في الرسم:", error);
    }
}

function updateDebugPanel(rawPred, finalPred) {
    if (!allowDebug) return;

    const dbgPanel = document.getElementById('aiDebugPanel');
    if (!dbgPanel || dbgPanel.style.display === 'none') return;

    try {
        const dbgRaw = document.getElementById('dbgRaw');
        const dbgColor = document.getElementById('dbgColor');
        const dbgAction = document.getElementById('dbgAction');

        if (dbgRaw) dbgRaw.textContent = rawPred.className.split(',')[0];
        if (dbgAction) dbgAction.textContent = finalPred.action || 'None';

        // تحديث اللون فقط إذا كان متاحاً
        if (dbgColor) {
            try {
                const colorData = analyzeColor();
                dbgColor.textContent = colorData ?
                    `${colorData.dominant} (R${colorData.r} G${colorData.g} B${colorData.b})` :
                    'N/A';
            } catch (e) {
                dbgColor.textContent = 'Error';
            }
        }
    } catch (error) {
        console.error("خطأ في تحديث لوحة التطوير:", error);
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

// معايرة الكانفس عند تغيير حجم النافذة
window.addEventListener('resize', resizeCanvas);
