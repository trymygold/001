/* core.js - Jewels-Ai: Master Engine (v11.7 - Clean Version) */

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
const voiceBtn = document.getElementById('voice-btn');

/* Physics & Tracking State */
let isProcessingHand = false, isProcessingFace = false;
let currentAssetName = "Select a Design"; 
let currentAssetIndex = 0; 
let physics = { earringAngle: 0, earringVelocity: 0, swayOffset: 0, lastHeadX: 0 };
let currentCameraMode = 'user'; 

/* Auto Try & Gallery State */
let autoTryRunning = false; 
let autoTryIndex = 0; 
let autoTryTimeout = null;
let autoSnapshots = [];
let currentPreviewData = { url: null, name: '' };
let currentLightboxIndex = 0;

/* Voice State */
let recognition = null;
let voiceEnabled = false;
let isRecognizing = false;

/* GESTURE VARIABLES */
let lastGestureTime = 0;
const GESTURE_COOLDOWN = 800; 
let previousHandX = null;

const SMOOTH_FACTOR = 0.8; 
let handSmoother = {
    active: false,
    ring: { x: 0, y: 0, angle: 0, size: 0 },
    bangle: { x: 0, y: 0, angle: 0, size: 0 }
};

/* --- 1. CORE NAVIGATION --- */
function changeProduct(direction) { 
    if (!JEWELRY_ASSETS[window.JewelsState.currentType]) return; 
    const list = JEWELRY_ASSETS[window.JewelsState.currentType]; 
    let newIndex = currentAssetIndex + direction; 
    if (newIndex >= list.length) newIndex = 0; 
    if (newIndex < 0) newIndex = list.length - 1; 
    applyAssetInstantly(list[newIndex], newIndex, true); 
}

function triggerVisualFeedback(text) { 
    const feedback = document.createElement('div'); 
    feedback.innerText = text; 
    feedback.style.cssText = 'position:fixed; top:20%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.7); color:#fff; padding:10px 20px; border-radius:20px; z-index:1000; pointer-events:none; font-family:sans-serif; font-size:18px;'; 
    document.body.appendChild(feedback); 
    setTimeout(() => { feedback.remove(); }, 1000); 
}

/* --- 2. CO-SHOPPING ENGINE --- */
const coShop = {
    peer: null, conn: null, myId: null, active: false, isHost: false, 
    init: function() {
        this.peer = new Peer(null, { debug: 2 });
        this.peer.on('open', (id) => { this.myId = id; this.checkForInvite(); });
        this.peer.on('connection', (c) => { this.handleConnection(c); showToast("Friend Connected!"); this.activateUI(); if (this.isHost) setTimeout(() => this.callGuest(c.peer), 1000); });
        this.peer.on('call', (call) => { call.answer(); call.on('stream', (remoteStream) => { remoteVideo.srcObject = remoteStream; remoteVideo.style.display = 'block'; videoElement.style.display = 'none'; canvasElement.style.display = 'none'; }); });
    },
    checkForInvite: function() { const urlParams = new URLSearchParams(window.location.search); const roomId = urlParams.get('room'); if (roomId) { this.isHost = false; this.connectToHost(roomId); } else { this.isHost = true; } },
    connectToHost: function(hostId) { this.conn = this.peer.connect(hostId); this.conn.on('open', () => { showToast("Connected!"); this.activateUI(); }); },
    handleConnection: function(c) { this.conn = c; },
    callGuest: function(guestId) { const stream = canvasElement.captureStream(30); this.peer.call(guestId, stream); },
    sendUpdate: function(category, index) { if (this.conn && this.conn.open) this.conn.send({ type: 'SYNC_ITEM', cat: category, idx: index }); },
    activateUI: function() { this.active = true; document.getElementById('coshop-btn').style.color = '#00ff00'; }
};

/* --- 3. ASSET LOADING --- */
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
            if (category === 'earrings') setTimeout(prepareDailyDrop, 2000);
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

/* --- 4. APP INIT --- */
window.onload = async () => {
    initBackgroundFetch();
    coShop.init(); 
    
    // Bind buttons
    document.querySelector('.close-preview').onclick = closePreview;
    document.querySelector('.close-gallery').onclick = closeGallery;

    await startCameraFast('user');
    setTimeout(() => { loadingStatus.style.display = 'none'; }, 2000);
    await selectJewelryType('earrings');
};

/* --- 5. SELECTION & STACKING --- */
function toggleStacking() {
    window.JewelsState.stackingEnabled = !window.JewelsState.stackingEnabled;
    const btn = document.getElementById('stacking-btn');
    if (window.JewelsState.stackingEnabled) {
        if(btn) btn.classList.add('active');
        showToast("Mix & Match: ON");
    } else {
        if(btn) btn.classList.remove('active');
        showToast("Mix & Match: OFF");
        const current = window.JewelsState.currentType;
        Object.keys(window.JewelsState.active).forEach(key => {
            if (key !== current) window.JewelsState.active[key] = null;
        });
    }
}

async function selectJewelryType(type) {
  if (window.JewelsState.currentType === type) return;
  window.JewelsState.currentType = type;
  
  const targetMode = (type === 'rings' || type === 'bangles') ? 'environment' : 'user';
  startCameraFast(targetMode); 
  
  if (!window.JewelsState.stackingEnabled) {
      window.JewelsState.active = { earrings: null, chains: null, rings: null, bangles: null };
  }

  const container = document.getElementById('jewelry-options'); 
  container.innerHTML = ''; 
  container.style.display = 'flex';
  
  let assets = JEWELRY_ASSETS[type] || await fetchCategoryData(type);
  assets.forEach((asset, i) => {
    const btnImg = new Image(); 
    btnImg.src = asset.thumbSrc; btnImg.className = "thumb-btn"; 
    btnImg.onclick = () => { applyAssetInstantly(asset, i, true); };
    container.appendChild(btnImg);
  });
  applyAssetInstantly(assets[0], 0, false);
}

async function applyAssetInstantly(asset, index, shouldBroadcast = true) {
    currentAssetIndex = index; 
    currentAssetName = asset.name; 
    highlightButtonByIndex(index);
    const thumbImg = new Image(); thumbImg.src = asset.thumbSrc; thumbImg.crossOrigin = 'anonymous'; 
    setActiveARImage(thumbImg);
    if (shouldBroadcast && coShop.active && coShop.isHost) coShop.sendUpdate(window.JewelsState.currentType, index);
    const highResImg = await loadAsset(asset.fullSrc, asset.id);
    if (currentAssetName === asset.name && highResImg) setActiveARImage(highResImg);
}

function highlightButtonByIndex(index) {
    const children = document.getElementById('jewelry-options').children;
    for (let i = 0; i < children.length; i++) {
        children[i].style.borderColor = (i === index) ? "var(--accent)" : "rgba(255,255,255,0.2)"; 
        if(i===index) children[i].scrollIntoView({ behavior: "smooth", inline: "center" });
    }
}

/* --- 6. CAMERA & RENDERING --- */
async function startCameraFast(mode = 'user') {
    if (videoElement.srcObject && currentCameraMode === mode) return;
    currentCameraMode = mode;
    if (videoElement.srcObject) videoElement.srcObject.getTracks().forEach(track => track.stop());
    mode === 'environment' ? videoElement.classList.add('no-mirror') : videoElement.classList.remove('no-mirror');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
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
  if (!earringImg && !necklaceImg) return;
  const w = videoElement.videoWidth; const h = videoElement.videoHeight;
  canvasElement.width = w; canvasElement.height = h;
  canvasCtx.save();
  currentCameraMode === 'environment' ? canvasCtx.setTransform(1,0,0,1,0,0) : (canvasCtx.translate(w, 0), canvasCtx.scale(-1, 1));
  canvasCtx.drawImage(videoElement, 0, 0, w, h);
  if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
    const lm = results.multiFaceLandmarks[0];
    const leftEar = { x: lm[132].x * w, y: lm[132].y * h };
    const rightEar = { x: lm[361].x * w, y: lm[361].y * h };
    const neck = { x: lm[152].x * w, y: lm[152].y * h };
    if (earringImg) {
        let ew = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y) * 0.25;
        let eh = (earringImg.height/earringImg.width) * ew;
        canvasCtx.drawImage(earringImg, leftEar.x - ew/2, leftEar.y, ew, eh);
        canvasCtx.drawImage(earringImg, rightEar.x - ew/2, rightEar.y, ew, eh);
    }
    if (necklaceImg) {
        let nw = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y) * 0.85;
        canvasCtx.drawImage(necklaceImg, neck.x - nw/2, neck.y + 20, nw, (necklaceImg.height/necklaceImg.width)*nw);
    }
  }
  canvasCtx.restore();
});

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1 });
hands.onResults((results) => {
  const ringImg = window.JewelsState.active.rings;
  const bangleImg = window.JewelsState.active.bangles;
  if (!ringImg && !bangleImg) return;

  const w = videoElement.videoWidth; const h = videoElement.videoHeight;
  canvasCtx.save();
  currentCameraMode === 'environment' ? canvasCtx.setTransform(1,0,0,1,0,0) : (canvasCtx.translate(w, 0), canvasCtx.scale(-1, 1));

  if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
    const lm = results.multiHandLandmarks[0];
    const ringFinger = { x: lm[13].x * w, y: lm[13].y * h };
    const wrist = { x: lm[0].x * w, y: lm[0].y * h };

    if (ringImg) {
      let rw = 30; let rh = (ringImg.height/ringImg.width) * rw;
      canvasCtx.drawImage(ringImg, ringFinger.x - rw/2, ringFinger.y, rw, rh);
    }
    if (bangleImg) {
      let bw = 80; let bh = (bangleImg.height/bangleImg.width) * bw;
      canvasCtx.drawImage(bangleImg, wrist.x - bw/2, wrist.y, bw, bh);
    }
  }
  canvasCtx.restore();
});

/* --- 7. CAPTURE & UTILS --- */
function takeSnapshot() {
    triggerFlash(); 
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoElement.videoWidth; tempCanvas.height = videoElement.videoHeight;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0);
    ctx.drawImage(canvasElement, 0, 0);
    const dataUrl = tempCanvas.toDataURL('image/png');
    document.getElementById('preview-image').src = dataUrl;
    document.getElementById('preview-modal').style.display = 'flex';
}

function showToast(msg) { 
    const x = document.getElementById("toast-notification"); 
    if(x) {
        x.innerText = msg; x.className = "show"; 
        setTimeout(() => x.className = "", 3000); 
    }
}

function triggerFlash() { 
    if(flashOverlay) {
        flashOverlay.classList.add('flash-active'); 
        setTimeout(() => flashOverlay.classList.remove('flash-active'), 300); 
    }
}

function closePreview() { document.getElementById('preview-modal').style.display = 'none'; }
function closeGallery() { document.getElementById('gallery-modal').style.display = 'none'; }
function prepareDailyDrop() {}

// Exports
window.selectJewelryType = selectJewelryType;
window.toggleStacking = toggleStacking;
window.takeSnapshot = takeSnapshot;
window.lerp = (start, end, amt) => (1 - amt) * start + amt * end;