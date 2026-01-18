let video = null;
let canvas = null;
let ctx = null;
let model = null;
let aiStatus = null;

async function initCameraAI() {
    video = document.getElementById('camVideo');
    canvas = document.getElementById('camCanvas');
    aiStatus = document.getElementById('aiStatusText');

    if (!video || !canvas) return;

    const overlay = document.getElementById('camOverlay');

    if (!video || !canvas) return;

    ctx = canvas.getContext('2d');

    // 1. Start Camera
    try {
        let stream;
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

        // Hide overlay on success
        if (overlay) overlay.style.display = 'none';

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

function resizeCanvas() {
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
}

// 2. Load AI Model
async function loadAI() {
    aiStatus.innerText = "Loading AI Model...";

    // Load COCO-SSD (Objects)
    model = await cocoSsd.load();
    aiStatus.innerHTML = "AI Active <span style='color:var(--success)'>●</span>";

    detectFrame();
}

// 3. Detection Loop
async function detectFrame() {
    if (!model) return;

    // Detect objects
    const predictions = await model.detect(video);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resizeCanvas(); // Ensure canvas matches video size if window resizes

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
    requestAnimationFrame(detectFrame);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('resize', resizeCanvas);
// Remove auto-init to force user interaction button
// window.addEventListener('DOMContentLoaded', initCameraAI);
