/* core.js - Jewels-Ai: Master Engine (v12.0 - Anti-Freeze Version) */

const API_KEY = "AIzaSyAXG3iG2oQjUA_BpnO8dK8y-MHJ7HLrhyE"; 
const DRIVE_FOLDERS = {
  earrings: "1eftKhpOHbCj8hzO11-KioFv03g0Yn61n",
  chains: "1G136WEiA9QBSLtRk0LW1fRb3HDZb4VBD",
  rings: "1iB1qgTE-Yl7w-CVsegecniD_DzklQk90",
  bangles: "1d2b7I8XlhIEb8S_eXnRFBEaNYSwngnba"
};

window.JewelsState = {
    active: { earrings: null, chains: null, rings: null, bangles: null },
    currentType: 'earrings'
};

const JEWELRY_ASSETS = {}; 
const IMAGE_CACHE = {}; 
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');

let isProcessing = false; // Single lock to prevent hanging
let currentCameraMode = 'user';

/* --- 1. BOOT ENGINE --- */
window.onload = async () => {
    await fetchCategoryData('earrings'); // Load first category
    startCamera('user');
};

async function fetchCategoryData(category) {
    try {
        const url = `https://www.googleapis.com/drive/v3/files?q='${DRIVE_FOLDERS[category]}' in parents and trashed = false&fields=files(id,name,thumbnailLink)&key=${API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        JEWELRY_ASSETS[category] = data.files.map(f => ({
            id: f.id, 
            name: f.name,
            src: f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, "=s1000") : `https://drive.google.com/uc?export=view&id=${f.id}`
        }));
        renderGallery(category);
    } catch (e) { console.error("Load Error", e); }
}

function renderGallery(type) {
    const container = document.getElementById('jewelry-options');
    if(!container) return;
    container.innerHTML = '';
    JEWELRY_ASSETS[type].forEach((asset, i) => {
        const img = document.createElement('img');
        img.src = asset.src;
        img.className = "thumb-btn";
        img.onclick = () => applyProduct(asset);
        container.appendChild(img);
    });
}

async function applyProduct(asset) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = asset.src;
    img.onload = () => {
        window.JewelsState.active[window.JewelsState.currentType] = img;
    };
}

/* --- 2. CAMERA & AI --- */
async function startCamera(mode) {
    currentCameraMode = mode;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
    videoElement.srcObject = stream;
    videoElement.onloadeddata = () => {
        videoElement.play();
        requestAnimationFrame(renderLoop);
    };
}

const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ refineLandmarks: false, minDetectionConfidence: 0.5 }); // Disabled "refine" to save memory

faceMesh.onResults((results) => {
    const w = canvasElement.width = videoElement.videoWidth;
    const h = canvasElement.height = videoElement.videoHeight;
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, w, h);
    
    // Mirror for front cam
    if (currentCameraMode === 'user') {
        canvasCtx.translate(w, 0);
        canvasCtx.scale(-1, 1);
    }
    
    canvasCtx.drawImage(videoElement, 0, 0, w, h);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
        const lm = results.multiFaceLandmarks[0];
        const earring = window.JewelsState.active.earrings;
        
        if (earring && earring.complete) {
            const left = { x: lm[132].x * w, y: lm[132].y * h };
            const right = { x: lm[361].x * w, y: lm[361].y * h };
            let size = Math.hypot(right.x - left.x, right.y - left.y) * 0.3;
            canvasCtx.drawImage(earring, left.x - size/2, left.y, size, (earring.height/earring.width)*size);
            canvasCtx.drawImage(earring, right.x - size/2, right.y, size, (earring.height/earring.width)*size);
        }
    }
    canvasCtx.restore();
    isProcessing = false; // Unlock
});

async function renderLoop() {
    if (!isProcessing && videoElement.readyState >= 2) {
        isProcessing = true;
        await faceMesh.send({ image: videoElement });
    }
    requestAnimationFrame(renderLoop);
}

/* --- 3. SWITCHER --- */
window.selectJewelryType = async (type) => {
    window.JewelsState.currentType = type;
    const mode = (type === 'rings' || type === 'bangles') ? 'environment' : 'user';
    if(currentCameraMode !== mode) startCamera(mode);
    if(!JEWELRY_ASSETS[type]) await fetchCategoryData(type);
    else renderGallery(type);
};