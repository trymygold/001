/* core.js - Jewels-Ai: Master Engine (v11.8 - Fix Hang & Render) */

/* --- CONFIGURATION --- */
const API_KEY = "AIzaSyAXG3iG2oQjUA_BpnO8dK8y-MHJ7HLrhyE"; 

const DRIVE_FOLDERS = {
  earrings: "1eftKhpOHbCj8hzO11-KioFv03g0Yn61n",
  chains: "1G136WEiA9QBSLtRk0LW1fRb3HDZb4VBD",
  rings: "1iB1qgTE-Yl7w-CVsegecniD_DzklQk90",
  bangles: "1d2b7I8XlhIEb8S_eXnRFBEaNYSwngnba"
};

/* --- GLOBAL STATE --- */
window.JewelsState = {
    active: { earrings: null, chains: null, rings: null, bangles: null }, 
    stackingEnabled: false, 
    currentType: ''
};

const JEWELRY_ASSETS = {}; 
const CATALOG_PROMISES = {}; 
const IMAGE_CACHE = {}; 
let dailyItem = null; 

const watermarkImg = new Image(); 
watermarkImg.crossOrigin = "anonymous"; 
watermarkImg.src = 'logo_watermark.png'; 

/* DOM Elements */
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const remoteVideo = document.getElementById('remote-video');
const canvasCtx = canvasElement.getContext('2d');
const loadingStatus = document.getElementById('loading-status');
const flashOverlay = document.getElementById('flash-overlay'); 

/* Tracking State */
let isProcessingHand = false, isProcessingFace = false;
let currentAssetName = "Select a Design"; 
let currentAssetIndex = 0; 
let currentCameraMode = 'user'; 

/* --- 1. CORE NAVIGATION --- */
function changeProduct(direction) { 
    if (!JEWELRY_ASSETS[window.JewelsState.currentType]) return; 
    const list = JEWELRY_ASSETS[window.JewelsState.currentType]; 
    let newIndex = currentAssetIndex + direction; 
    if (newIndex >= list.length) newIndex = 0; 
    if (newIndex < 0) newIndex = list.length - 1; 
    applyAssetInstantly(list[newIndex], newIndex, true); 
}

/* --- 2. ASSET LOADING --- */
function initBackgroundFetch() { Object.keys(DRIVE_FOLDERS).forEach(key => fetchCategoryData(key)); }

function fetchCategoryData(category) {
    if (CATALOG_PROMISES[category]) return CATALOG_PROMISES[category];
    const fetchPromise = new Promise(async (resolve) => {
        try {
            const url = `https://www.googleapis.com/drive/v3/files?q='${DRIVE_FOLDERS[category]}' in parents and trashed = false and mimeType contains 'image/'&pageSize=1000&fields=files(id,name,thumbnailLink)&key=${API_KEY}`;
            const response = await fetch(url);
            const data = await response.json();
            JEWELRY_ASSETS[category] = data.files.map(file => ({
                id: file.id, name: file.name,
                thumbSrc: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, "=s400") : `https://drive.google.com/thumbnail?id=${file.id}`,
                fullSrc: file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, "=s3000") : `https://drive.google.com/uc?export=view&id=${file.id}`
            }));
            resolve(JEWELRY_ASSETS[category]);
        } catch (err) { resolve([]); }
    });
    CATALOG_PROMISES[category] = fetchPromise;
    return fetchPromise;
}

function loadAsset(src, id) {
    return new Promise((resolve) => {
        if (IMAGE_CACHE[id]) { resolve(IMAGE_CACHE[id]); return; }
        const img = new Image(); img.crossOrigin = 'anonymous'; 
        img.onload = () => { IMAGE_CACHE[id] = img; resolve(img); };
        img.onerror = () => { resolve(null); };
        img.src = src;
    });
}

function setActiveARImage(img) {
    const type = window.JewelsState.currentType;
    if (window.JewelsState.active.hasOwnProperty(type)) window.JewelsState.active[type] = img;
}

/* --- 3. APP INIT --- */
window.onload = async () => {
    initBackgroundFetch();
    await startCameraFast('user');
    setTimeout(() => { if(loadingStatus) loadingStatus.style.display = 'none'; }, 2000);
    await selectJewelryType('earrings');
};

/* --- 4. SELECTION LOGIC --- */
async function selectJewelryType(type) {
  if (window.JewelsState.currentType === type) return;
  window.JewelsState.currentType = type;
  
  const targetMode = (type === 'rings' || type === 'bangles') ? 'environment' : 'user';
  startCameraFast(targetMode); 
  
  window.JewelsState.active = { earrings: null, chains: null, rings: null, bangles: null };

  const container = document.getElementById('jewelry-options'); 
  if(container) {
      container.innerHTML = ''; 
      let assets = JEWELRY_ASSETS[type] || await fetchCategoryData(type);
      assets.forEach((asset, i) => {
        const btnImg = new Image(); 
        btnImg.src = asset.thumbSrc; btnImg.className = "thumb-btn"; 
        btnImg.onclick = () => { applyAssetInstantly(asset, i, true); };
        container.appendChild(btnImg);
      });
      applyAssetInstantly(assets[0], 0, false);
  }
}

async function applyAssetInstantly(asset, index, shouldBroadcast = true) {
    currentAssetIndex = index; 
    currentAssetName = asset.name; 
    
    const thumbImg = new Image(); thumbImg.src = asset.thumbSrc; thumbImg.crossOrigin = 'anonymous'; 
    setActiveARImage(thumbImg);
    
    const highResImg = await loadAsset(asset.fullSrc, asset.id);
    if (currentAssetName === asset.name && highResImg) setActiveARImage(highResImg);
}

/* --- 5. CAMERA & RENDERING --- */
async function startCameraFast(mode = 'user') {
    if (videoElement.srcObject && currentCameraMode === mode) return;
    currentCameraMode = mode;
    if (videoElement.srcObject) videoElement.srcObject.getTracks().forEach(track => track.stop());
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: mode, width: 1280, height: 720 } 
    });
    videoElement.srcObject = stream;
    videoElement.onloadeddata = () => { videoElement.play(); detectLoop(); };
}

async function detectLoop() {
    if (videoElement.readyState >= 2) { 
        if (!isProcessingFace) { isProcessingFace = true; await faceMesh.send({image: videoElement}); isProcessingFace = false; }
        if (!isProcessingHand) { isProcessingHand = true; await hands.send({image: videoElement}); isProcessingHand = false; }
    }
    requestAnimationFrame(detectLoop);
}

const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ refineLandmarks: true, minDetectionConfidence: 0.5 });
faceMesh.onResults((results) => {
  const earringImg = window.JewelsState.active.earrings;
  const necklaceImg = window.JewelsState.active.chains;
  const w = videoElement.videoWidth; const h = videoElement.videoHeight;
  canvasElement.width = w; canvasElement.height = h;
  
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, w, h);
  if (currentCameraMode !== 'environment') {
      canvasCtx.translate(w, 0); canvasCtx.scale(-1, 1);
  }
  canvasCtx.drawImage(videoElement, 0, 0, w, h);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
    const lm = results.multiFaceLandmarks[0];
    const leftEar = { x: lm[132].x * w, y: lm[132].y * h };
    const rightEar = { x: lm[361].x * w, y: lm[361].y * h };
    const neck = { x: lm[152].x * w, y: lm[152].y * h };

    if (earringImg && earringImg.complete) {
        let ew = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y) * 0.25;
        let eh = (earringImg.height/earringImg.width) * ew;
        canvasCtx.drawImage(earringImg, leftEar.x - ew/2, leftEar.y, ew, eh);
        canvasCtx.drawImage(earringImg, rightEar.x - ew/2, rightEar.y, ew, eh);
    }
    if (necklaceImg && necklaceImg.complete) {
        let nw = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y) * 0.85;
        canvasCtx.drawImage(necklaceImg, neck.x - nw/2, neck.y + 20, nw, (necklaceImg.height/necklaceImg.width)*nw);
    }
  }
  canvasCtx.restore();
});

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1 });
hands.onResults((results) => {
  const ringImg = window.JewelsState.active.rings;
  const bangleImg = window.JewelsState.active.bangles;
  if (!ringImg && !bangleImg) return;

  const w = videoElement.videoWidth; const h = videoElement.videoHeight;
  canvasCtx.save();
  if (currentCameraMode !== 'environment') {
      canvasCtx.translate(w, 0); canvasCtx.scale(-1, 1);
  }

  if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
    const lm = results.multiHandLandmarks[0];
    const ringFinger = { x: lm[13].x * w, y: lm[13].y * h };
    const wrist = { x: lm[0].x * w, y: lm[0].y * h };

    if (ringImg && ringImg.complete) {
      let rw = 40; let rh = (ringImg.height/ringImg.width) * rw;
      canvasCtx.drawImage(ringImg, ringFinger.x - rw/2, ringFinger.y - rh/2, rw, rh);
    }
    if (bangleImg && bangleImg.complete) {
      let bw = 100; let bh = (bangleImg.height/bangleImg.width) * bw;
      canvasCtx.drawImage(bangleImg, wrist.x - bw/2, wrist.y - bh/2, bw, bh);
    }
  }
  canvasCtx.restore();
});

/* --- 6. UTILS --- */
function takeSnapshot() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoElement.videoWidth; tempCanvas.height = videoElement.videoHeight;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(canvasElement, 0, 0);
    const dataUrl = tempCanvas.toDataURL('image/png');
    const preview = document.getElementById('preview-image');
    if(preview) {
        preview.src = dataUrl;
        document.getElementById('preview-modal').style.display = 'flex';
    }
}

// Exports
window.selectJewelryType = selectJewelryType;
window.takeSnapshot = takeSnapshot;
window.changeProduct = changeProduct;