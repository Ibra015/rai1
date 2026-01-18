let video = null;
let canvas = null;
let ctx = null;
let model = null;
let aiStatus = null;
let stream = null;
let isRunning = false;

async function initCameraAI() {
    video = document.getElementById('camVideo');
    canvas = document.getElementById('camCanvas');
    aiStatus = document.getElementById('aiStatusText');
    const overlay = document.getElementById('camOverlay');

    if (!video || !canvas) return;

    // Stop if already running
    if (isRunning) {
        stopCamera();
        return;
    }

    ctx = canvas.getContext('2d');

    // 1. Start Camera
    try {
        try {
            // Try back camera first
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });
        } catch (e) {
            // Fallback to any camera
            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
        }

        video.srcObject = stream;
        isRunning = true;

        // Hide overlay on success
        if (overlay) overlay.style.display = 'none';

        // Show Stop Button (Dynamically update UI if needed, but here we just toggle state)
        updateCamUI(true);

        video.onloadedmetadata = () => {
            video.play();
            resizeCanvas();
            loadAI();
        };
    } catch (err) {
        console.error("Camera denied:", err);
        aiStatus.innerHTML = `Error: ${err.name || err.message}`;
        aiStatus.style.color = "red";
        alert("Camera Error: " + (err.name || err));
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    video.srcObject = null;
    isRunning = false;
    updateCamUI(false);

    // Clear canvas
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (aiStatus) aiStatus.innerHTML = "Camera Stopped";
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

        // Reset Video Poster or Black Screen
        const vid = document.getElementById('camVideo');
        if (vid) vid.srcObject = null;
    }
}

function resizeCanvas() {
    if (canvas && video) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
    }
}

// 2. Load AI Model
async function loadAI() {
    if (!isRunning) return;
    aiStatus.innerText = "Loading AI Model...";

    // Load MobileNet (Classification)
    model = await mobilenet.load();
    if (isRunning) {
        aiStatus.innerHTML = "AI Active <span style='color:var(--success)'>●</span>";
        detectFrame();
    }
}

// 3. Detection Loop
// 3. Detection Loop & Smoothing
// 3. Detection Loop & Smoothing with Agro-Brain
let history = [];
const HISTORY_SIZE = 15;
const CONFIDENCE_THRESHOLD = 0.60;

async function detectFrame() {
    if (!model || !isRunning) return;

    // Classify
    const predictions = await model.classify(video);

    // Clear & Resize
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resizeCanvas();

    if (predictions && predictions.length > 0) {
        let finalPred = predictions[0];

        // --- AGRO-BRAIN LOGIC START ---
        try {
            if (ctx && video.readyState === 4) { // Ensure video is ready
                const colorData = analyzeColor();
                finalPred = smartCorrect(predictions[0], colorData);
            }
        } catch (e) {
            console.warn("Agro-Brain Skipped Frame:", e);
            // Fallback to raw prediction if Brain fails
        }
        // --- AGRO-BRAIN LOGIC END ---

        // Add to history
        history.push(finalPred);
        if (history.length > HISTORY_SIZE) history.shift();

        // Stability Vote
        const counts = {};
        history.forEach(p => {
            const name = p.name || p.className.split(',')[0]; // Handle raw vs corrected
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
            // Find if this stable candidate was corrected by Agro-Brain in history
            // We check if the bestCandidate matches any corrected entry in history
            const isCorrected = history.some(h => (h.name === bestCandidate || h.className?.split(',')[0] === bestCandidate) && h.isCorrected);

            // Clean up name for display
            let displayName = bestCandidate;
            let displayPercent = Math.round(predictions[0].probability * 100) + "%";

            if (isCorrected) {
                displayPercent = "Agro-Brain 🧠";
            }

            drawResult(displayName, displayPercent, isCorrected ? '#00FF00' : '#00FFFF');
        } else {
            drawResult("Analysing...", 0, '#AAAAAA');
        }

        // Update debug panel if visible
        if (allowDebug && document.getElementById('aiDebugPanel').style.display !== 'none') {
            document.getElementById('dbgRaw').textContent = predictions[0].className.split(',')[0];
            document.getElementById('dbgColor').textContent = colorData ? `${colorData.dominant} (R${colorData.r} G${colorData.g} B${colorData.b})` : 'N/A';
            document.getElementById('dbgAction').textContent = finalPred.action || 'None';
        }
    }

    if (isRunning) requestAnimationFrame(detectFrame);
}

// --- AGRO-BRAIN FUNCTIONS ---

function analyzeColor() {
    // Sample center 50x50 pixels
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const sampleSize = 50;

    // Draw current frame to hidden canvas or process directly if possible (tf.js handles video, but we need pixel data)
    // We need to draw video to ctx to get data
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frameData = ctx.getImageData(cx - sampleSize / 2, cy - sampleSize / 2, sampleSize, sampleSize);

    // Average RGB
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

    // Determine Dominant Color
    let dominant = 'Neutral';
    if (r > g + 40 && r > b + 40) dominant = 'Red';
    else if (g > r + 20 && g > b + 20) dominant = 'Green'; // Green is often less intense than Red
    else if (r > 200 && g > 150 && b < 100) dominant = 'Orange';

    // Clear the drawImage (we only wanted data, not to display video on canvas)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    return { r, g, b, dominant };
}

function smartCorrect(prediction, colorData) {
    let name = prediction.className.split(',')[0].toLowerCase();
    let isCorrected = false;
    let action = "None"; // Debug info

    // Rule 1: The Tomato Fix
    // If AI says Orange/Apple/Pomegranate but color is RED -> Tomato
    const redFruits = ['orange', 'apple', 'pomegranate', 'peach', 'apricot'];
    if (redFruits.some(f => name.includes(f)) && colorData.dominant === 'Red') {
        name = 'Tomato';
        isCorrected = true;
        action = "Red Color -> Tomato Fix";
    }

    // Rule 2: The Cucumber Fix
    // If AI says Zucchini/Squash/Banana but color is GREEN -> Cucumber
    const greenVegs = ['zucchini', 'squash', 'banana', 'corn'];
    if (greenVegs.some(v => name.includes(v)) && colorData.dominant === 'Green') {
        name = 'Cucumber';
        isCorrected = true;
        action = "Green Color -> Cucumber Fix";
    }

    // Rule 3: The Leaf Fix (Greens)
    // If AI says Cabbage/Leaf/Broccoli and is Green -> Lettuce/Arugula (Simulated)
    if ((name.includes('cabbage') || name.includes('broccoli')) && colorData.dominant === 'Green') {
        // Just a guess optimization
        name = 'Leafy (Lettuce/Arugula)';
        isCorrected = true;
        action = "Green + Cabbage -> Leafy Fix";
    }

    // Rule 4: Pepper Fix
    if (name.includes('bell pepper') && (colorData.dominant === 'Red' || colorData.dominant === 'Green')) {
        name = 'Pepper'; // Simplify name
        isCorrected = false; // Not a hard correction, just formatting
        action = "Simpified Name";
    }

    return { name, isCorrected, action };
}

function drawResult(text, subText, color) {
    if (!ctx) return;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, canvas.height - 60, canvas.width - 20, 50);

    // Main Text
    ctx.fillStyle = color;
    ctx.font = 'bold 24px Cairo, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height - 30);

    // Sub Text (Confidence / Brain)
    ctx.fillStyle = '#DDDDDD';
    ctx.font = '14px Arial';
    ctx.fillText(subText, canvas.width / 2, canvas.height - 10);

    // Debug Color Dot
    // ctx.fillStyle = `rgb(${analyzeColor().r},${analyzeColor().g},${analyzeColor().b})`;
    // ctx.beginPath(); ctx.arc(30, canvas.height-30, 10, 0, Math.PI*2); ctx.fill();
}

function toggleDebug() {
    const p = document.getElementById('aiDebugPanel');
    if (p) {
        if (p.style.display === 'none') {
            p.style.display = 'block';
            allowDebug = true;
        } else {
            p.style.display = 'none';
            allowDebug = false;
        }
    }
}

window.addEventListener('resize', resizeCanvas);
