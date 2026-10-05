const VisionMulti = (() => {
  let stream = null, videoEl = null;
  let state = 'IDLE';
  let rafId = null;
  let onFrameCb = null, onStateCb = null;
  let detectedTargets = {};
  let activeTarget = null;
  let warpCanvases = {};
  let stableCount = 0;
  let lastCorners = {};
  const STABLE_FRAMES = 4;
  const JITTER_TOL = 20;

  let searchCanvas = null, searchCtx = null;

  function setState(s) { state = s; if (onStateCb) onStateCb(s); }

  async function start(video) {
    videoEl = video;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    searchCanvas = document.createElement('canvas');
    searchCtx = searchCanvas.getContext('2d', { willReadFrequently: true });
    for (let i = 1; i <= TARGETS_MAX; i++) {
      const c = document.createElement('canvas');
      c.width = WARP_SIZE; c.height = WARP_SIZE;
      warpCanvases[i] = c;
    }
    if (typeof AppLog !== 'undefined') AppLog.add('CAM', 'Cámara iniciada');
    startPreview();
  }

  let previewRaf = null;
  function startPreview() {
    function step() {
      previewRaf = requestAnimationFrame(step);
      if (!videoEl || videoEl.readyState < 2) return;
      const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
      if (!vw) return;
      const sw = 640, sh = Math.round(640 * vh / vw);
      searchCanvas.width = sw; searchCanvas.height = sh;
      searchCtx.drawImage(videoEl, 0, 0, sw, sh);
      if (onFrameCb && state === 'IDLE') {
        onFrameCb({ state: 'IDLE', previewCanvas: searchCanvas, targets: {} });
      }
    }
    if (previewRaf) cancelAnimationFrame(previewRaf);
    step();
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    if (previewRaf) cancelAnimationFrame(previewRaf);
    rafId = null; previewRaf = null;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    state = 'IDLE'; detectedTargets = {}; activeTarget = null;
    stableCount = 0; lastCorners = {};
  }

  function cornersStable(prev, curr) {
    if (!prev || !curr) return false;
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(prev[i].x - curr[i].x, prev[i].y - curr[i].y) > JITTER_TOL) return false;
    }
    return true;
  }

  function frameLoop() {
    if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = null; }
    rafId = requestAnimationFrame(frameLoop);
    if (!videoEl || videoEl.readyState < 2) return;

    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (!vw) return;
    const sw = 640, sh = Math.round(640 * vh / vw);
    searchCanvas.width = sw; searchCanvas.height = sh;
    searchCtx.drawImage(videoEl, 0, 0, sw, sh);

    const imageData = searchCtx.getImageData(0, 0, sw, sh);
    const markers = ArucoDetect.detect(imageData.data, sw, sh);
    const groups = ArucoDetect.groupByTarget(markers);

    const targetsFound = {};
    let fullTargets = 0;
    for (const [tNum, group] of Object.entries(groups)) {
      const corners = ArucoDetect.getTargetCorners(group);
      if (corners) {
        targetsFound[tNum] = { corners, markers: group };
        fullTargets++;
      }
    }

    detectedTargets = targetsFound;

    if (state === 'SEARCHING') {
      let allStable = true;
      for (const [tNum, t] of Object.entries(targetsFound)) {
        if (!lastCorners[tNum] || !cornersStable(lastCorners[tNum], t.corners)) {
          allStable = false;
        }
        lastCorners[tNum] = t.corners;
      }

      if (fullTargets >= 2 && allStable) {
        stableCount++;
      } else {
        stableCount = Math.max(0, stableCount - 1);
      }

      if (stableCount >= STABLE_FRAMES && fullTargets >= 2) {
        warpAllTargets(vw, vh, sw, sh);
        setState('LOCKED');
        if (typeof AppLog !== 'undefined') AppLog.add('LOCK', `${fullTargets} blancos lockeados`);
      }

      if (onFrameCb) onFrameCb({
        state: 'SEARCHING',
        previewCanvas: searchCanvas,
        targets: targetsFound,
        progress: stableCount / STABLE_FRAMES,
        markerCount: markers.length,
      });
      return;
    }

    if (state === 'LOCKED') {
      for (const [tNum, t] of Object.entries(targetsFound)) {
        lastCorners[tNum] = t.corners;
      }
      warpAllTargets(vw, vh, sw, sh);

      if (onFrameCb) onFrameCb({
        state: 'LOCKED',
        targets: targetsFound,
        warpCanvases,
        activeTarget,
        previewCanvas: searchCanvas,
      });
    }
  }

  function warpAllTargets(vw, vh, sw, sh) {
    const scaleX = vw / sw, scaleY = vh / sh;
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = vw; fullCanvas.height = vh;
    const fullCtx = fullCanvas.getContext('2d');
    fullCtx.drawImage(videoEl, 0, 0, vw, vh);

    for (const [tNum, t] of Object.entries(detectedTargets)) {
      const canvas = warpCanvases[tNum];
      if (!canvas) continue;
      const ctx = canvas.getContext('2d');
      const scaled = t.corners.map(c => ({ x: c.x * scaleX, y: c.y * scaleY }));

      if (typeof cv !== 'undefined' && cv.Mat) {
        const src = cv.imread(fullCanvas);
        const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
          scaled[0].x, scaled[0].y, scaled[1].x, scaled[1].y,
          scaled[2].x, scaled[2].y, scaled[3].x, scaled[3].y,
        ]);
        const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0, WARP_SIZE, 0, 0, WARP_SIZE, WARP_SIZE, WARP_SIZE,
        ]);
        const M = cv.getPerspectiveTransform(srcTri, dstTri);
        const dst = new cv.Mat();
        cv.warpPerspective(src, dst, M, new cv.Size(WARP_SIZE, WARP_SIZE));
        cv.imshow(canvas, dst);
        src.delete(); srcTri.delete(); dstTri.delete(); M.delete(); dst.delete();
      }
    }
  }

  function startSearch(onFrame, onStateChange) {
    onFrameCb = onFrame; onStateCb = onStateChange;
    detectedTargets = {}; stableCount = 0; lastCorners = {};
    setState('SEARCHING');
    if (rafId) cancelAnimationFrame(rafId);
    frameLoop();
  }

  function setActiveTarget(tNum) { activeTarget = tNum; }
  function getActiveTarget() { return activeTarget; }
  function getDetectedTargets() { return detectedTargets; }
  function getWarpCanvas(tNum) { return warpCanvases[tNum] || null; }

  function relock() {
    detectedTargets = {}; stableCount = 0; lastCorners = {};
    setState('SEARCHING');
  }

  return {
    start, stop, startSearch, relock,
    setActiveTarget, getActiveTarget, getDetectedTargets, getWarpCanvas,
    get state() { return state; },
    get previewCanvas() { return searchCanvas; },
  };
})();
