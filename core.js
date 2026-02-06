/* core.js - Jewels-Ai: Ultra-Stable Engine (v12.1) */

const API_KEY = "AIzaSyAXG3iG2oQjUA_BpnO8dK8y-MHJ7HLrhyE"; 
const DRIVE_FOLDERS = {
  earrings: "1eftKhpOHbCj8hzO11-KioFv03g0Yn61n",
  chains: "1G136WEiA9QBSLtRk0LW1fRb3HDZb4VBD",
  rings: "1iB1qgTE-Yl7w-CVsegecniD_DzklQk90",
  bangles: "1d2b7I8XlhIEb8S_eXnRFBEaNYSwngnba"
};

/* Global Variables */
let activeJewelry = null;
let currentCategory = 'earrings';
let isProcessing = false;

const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

/* --- 1. STARTUP --- */
window.onload = async () => {
    loadCategory('earrings');
    startCamera();
};

async function loadCategory(cat) {
    currentCategory = cat;
    const url = `https://www.googleapis.com/drive/v3/files?q='${DRIVE_FOLDERS[cat]}' in parents and trashed = false&key=${API_KEY}&fields=files(id,thumbnailLink)`;
    const res = await fetch(url);
    const data = await res.json();
    
    const container = document.getElementById('jewelry-options');
    if(container) {
        container.innerHTML = '';
        data.files.forEach(file => {
            const img = document.createElement('img');
            img.src = file.thumbnailLink.replace(/=s\d+$/, "=s500");
            img.className = "thumb-btn";
            img.onclick = () => {
                const arImg = new Image();
                arImg.crossOrigin = "anonymous";
                arImg.src = img.src;
                arImg.onload = () => { activeJewelry = arImg; };
            };
            container.appendChild(img);
        });
    }
}

/* --- 2. CAMERA --- */
async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    video.onloadeddata = () => {
        video.play();
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        runAI();
    };
}

/* --- 3. AI ENGINE (Face Only for Stability) --- */
const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ refineLandmarks: false, minDetectionConfidence: 0.5 });

faceMesh.onResults((results) => {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Mirror for User View
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks[0] && activeJewelry) {
        const lm = results.multiFaceLandmarks[0];
        const leftEar = { x: lm[132].x * canvas.width, y: lm[132].y * canvas.height };
        const rightEar = { x: lm[361].x * canvas.width, y: lm[361].y * canvas.height };
        
        let size = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y) * 0.3;
        ctx.drawImage(activeJewelry, leftEar.x - size/2, leftEar.y, size, (activeJewelry.height/activeJewelry.width)*size);
        ctx.drawImage(activeJewelry, rightEar.x - size/2, rightEar.y, size, (activeJewelry.height/activeJewelry.width)*size);
    }
    ctx.restore();
    isProcessing = false;
});

async function runAI() {
    if (!isProcessing && video.readyState >= 2) {
        isProcessing = true;
        await faceMesh.send({ image: video });
    }
    requestAnimationFrame(runAI);
}

/* --- 4. EXPOSED FUNCTIONS --- */
window.selectJewelryType = (type) => loadCategory(type);