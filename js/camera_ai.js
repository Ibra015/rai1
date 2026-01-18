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

    // Load COCO-SSD (Objects)
    model = await cocoSsd.load();
    if (isRunning) {
        aiStatus.innerHTML = "AI Active <span style='color:var(--success)'>●</span>";
        detectFrame();
    }
}

// 3. Detection Loop
async function detectFrame() {
    if (!model || !isRunning) return;

    // Detect objects
    const predictions = await model.detect(video);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resizeCanvas();

    // Draw boxes
    predictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        const text = prediction.class;

        // Draw Box
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        // Draw Label Background
        ctx.fillStyle = '#00FFFF';
        ctx.fillRect(x, y - 20, width, 20);

        // Draw Text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(`${text} (${Math.round(prediction.score * 100)}%)`, x + 5, y - 5);
    });

    // Loop
    if (isRunning) {
        requestAnimationFrame(detectFrame);
    }
}

window.addEventListener('resize', resizeCanvas);
