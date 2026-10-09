const VisionMulti = (() => {
  const DETECT_W = 720;
  const LOCK_FRAMES = 6;
  const LOCK_JITTER = 8;
  const LOCK_MIN_MARKERS = 3;
  const TRACK_MIN_MARKERS = 2;
  const SMOOTH_SNAP = 3;
  const SHOT_GAP_FRAMES = 2;
  const SHOT_MIN_INTERVAL = 150;
  const LOCKED_DETECT_EVERY = 4;
  const ROI_SLACK = 6;

  let stream = null, videoEl = null, rafId = null;
  let state = 'IDLE';
  let frameCanvas = null, frameCtx = null;
  let required = [], laserColor = 'red';
  let cbs = {};
  let tracks = {};
  let lockProgress = 0, prevCentroids = {};
  let frameNo = 0, markerCount = 0, fps = 0, lastLoopAt = 0;
  let laserState = {}, lastShotAt = 0;
  let diag = { shake: 0, tooBig: 0, lastLogAt: 0 };
  let shakeRate = 0;

  // One callback per decoded camera frame when supported: no duplicate work
  // on 60Hz displays and no silently skipped camera frames.
  function schedule() {
    if (videoEl && videoEl.requestVideoFrameCallback) rafId = { v: videoEl.requestVideoFrameCallback(loop) };
    else rafId = { r: requestAnimationFrame(loop) };
  }
  function cancelSchedule() {
    if (!rafId) return;
    if (rafId.v != null && videoEl && videoEl.cancelVideoFrameCallback) videoEl.cancelVideoFrameCallback(rafId.v);
    if (rafId.r != null) cancelAnimationFrame(rafId.r);
    rafId = null;
  }

  function setState(s) {
    if (s === state) return;
    state = s;
    if (typeof AppLog !== 'undefined') AppLog.add('VISION', s);
    if (cbs.onState) cbs.onState(s);
  }

  function ready(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function poll() {
        if (typeof cv !== 'undefined' && cv.Mat && cv.findHomography) return resolve();
        if (Date.now() - t0 > timeoutMs) return reject(new Error('El motor de visión (OpenCV) no terminó de cargar.'));
        setTimeout(poll, 200);
      })();
    });
  }

  async function start(video) {
    videoEl = video;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    frameCanvas = document.createElement('canvas');
    frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
    if (typeof AppLog !== 'undefined') AppLog.add('CAM', `Cámara ${video.videoWidth}x${video.videoHeight}`);
  }

  function stop() {
    cancelSchedule();
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (videoEl) videoEl.srcObject = null;
    tracks = {}; prevCentroids = {}; lockProgress = 0;
    laserState = {};
    if (typeof cv !== 'undefined' && cv.Mat) Laser.reset();
    state = 'IDLE';
  }

  function isRunning() { return !!stream; }

  function track(targets, opts) {
    required = targets.slice();
    laserColor = opts.laserColor || 'red';
    cbs = { onFrame: opts.onFrame, onState: opts.onState, onShot: opts.onShot };
    relock();
    if (!rafId) schedule();
  }

  function relock() {
    tracks = {}; prevCentroids = {}; lockProgress = 0;
    laserState = {}; shakeRate = 0;
    Laser.reset();
    state = 'IDLE';
    setState('SEARCHING');
  }

  function loop() {
    schedule();
    if (!videoEl || videoEl.readyState < 2) return;
    const w = videoEl.videoWidth, h = videoEl.videoHeight;
    if (!w || !h) return;
    frameNo++;
    const now = performance.now();
    if (lastLoopAt) fps = fps * 0.9 + (1000 / Math.max(1, now - lastLoopAt)) * 0.1;
    lastLoopAt = now;
    if (frameCanvas.width !== w || frameCanvas.height !== h) { frameCanvas.width = w; frameCanvas.height = h; }
    frameCtx.drawImage(videoEl, 0, 0, w, h);
    const src = cv.imread(frameCanvas);
    try {
      if (state !== 'LOCKED' || frameNo % LOCKED_DETECT_EVERY === 0) detectMarkers(src, w, h);
      if (state === 'SEARCHING') updateLock();
      if (state === 'LOCKED') processLasers(src);
    } finally {
      src.delete();
    }
    if (cbs.onFrame) cbs.onFrame(frameInfo(w, h));
  }

  function detectMarkers(src, w, h) {
    const dw = DETECT_W, dh = Math.round(h * dw / w);
    const small = new cv.Mat();
    cv.resize(src, small, new cv.Size(dw, dh), 0, 0, cv.INTER_AREA);
    const markers = ArucoDetect.detect(small.data, dw, dh);
    small.delete();
    markerCount = markers.length;
    const s = w / dw;
    const groups = ArucoDetect.groupByTarget(markers);

    for (let t = 1; t <= TARGETS_MAX; t++) {
      const g = groups[t];
      const tr = tracks[t] || (tracks[t] = { corners: {}, seen: [], H: null, Hinv: null });
      tr.seen = g ? Object.keys(g).map(Number) : [];
      if (!g) continue;
      for (const k of tr.seen) {
        const fresh = g[k].map(p => ({ x: p.x * s, y: p.y * s }));
        const old = tr.corners[k];
        tr.corners[k] = old ? fresh.map((p, i) => {
          const q = old[i];
          return Math.hypot(p.x - q.x, p.y - q.y) < SMOOTH_SNAP ? { x: q.x * 0.7 + p.x * 0.3, y: q.y * 0.7 + p.y * 0.3 } : p;
        }) : fresh;
      }
      if (tr.seen.length >= TRACK_MIN_MARKERS) updateHomography(tr);
    }
  }

  function updateHomography(tr) {
    const srcPts = [], dstPts = [];
    for (const k of tr.seen) {
      const mm = markerCornersMM(k);
      tr.corners[k].forEach((p, i) => {
        srcPts.push(p.x, p.y);
        dstPts.push(mm[i].x * WARP_SCALE, mm[i].y * WARP_SCALE);
      });
    }
    const n = srcPts.length / 2;
    const sM = cv.matFromArray(n, 1, cv.CV_32FC2, srcPts);
    const dM = cv.matFromArray(n, 1, cv.CV_32FC2, dstPts);
    const Hm = cv.findHomography(sM, dM);
    sM.delete(); dM.delete();
    if (Hm.rows === 3 && Hm.cols === 3) {
      const H = Array.from(Hm.data64F);
      const Hinv = invert3(H);
      if (H.every(Number.isFinite) && Hinv) { tr.H = H; tr.Hinv = Hinv; }
    }
    Hm.delete();
  }

  function invert3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
      B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
      C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }

  function apply(H, x, y) {
    const z = H[6] * x + H[7] * y + H[8];
    return { x: (H[0] * x + H[1] * y + H[2]) / z, y: (H[3] * x + H[4] * y + H[5]) / z };
  }

  // page mm → full-res frame px
  function mmToFrame(t, x, y) {
    const tr = tracks[t];
    if (!tr || !tr.Hinv) return null;
    return apply(tr.Hinv, x * WARP_SCALE, y * WARP_SCALE);
  }

  function updateLock() {
    const ok = required.every(t => tracks[t] && tracks[t].seen.length >= LOCK_MIN_MARKERS && tracks[t].H);
    if (!ok) { lockProgress = 0; prevCentroids = {}; return; }
    const centers = {};
    let stable = true;
    for (const t of required) {
      centers[t] = mmToFrame(t, PAGE_W / 2, PAGE_H / 2);
      const p = prevCentroids[t];
      if (!p || Math.hypot(p.x - centers[t].x, p.y - centers[t].y) > LOCK_JITTER) stable = false;
    }
    prevCentroids = centers;
    lockProgress = stable ? lockProgress + 1 : 1;
    if (lockProgress >= LOCK_FRAMES) setState('LOCKED');
  }

  // Page bounding box in frame px. Kept fixed until the target really moves,
  // because the laser background model is tied to the ROI's exact size.
  function updateRoi(tr, w, h) {
    const pts = [[0, 0], [PAGE_W, 0], [PAGE_W, PAGE_H], [0, PAGE_H]].map(([x, y]) => apply(tr.Hinv, x * WARP_SCALE, y * WARP_SCALE));
    const x0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p.x)))), y0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p.y))));
    const x1 = Math.min(w, Math.ceil(Math.max(...pts.map(p => p.x)))), y1 = Math.min(h, Math.ceil(Math.max(...pts.map(p => p.y))));
    if (x1 - x0 < 20 || y1 - y0 < 20) return;
    const r = tr.roi;
    if (r && Math.abs(r.x - x0) < ROI_SLACK && Math.abs(r.y - y0) < ROI_SLACK && Math.abs(r.x + r.width - x1) < ROI_SLACK && Math.abs(r.y + r.height - y1) < ROI_SLACK) return;
    tr.roi = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  // Edge-triggered per target: a dot fires once when it appears, then that
  // target re-arms after a few dot-free frames. Per target so a stuck blob on
  // one sheet can never block shots on the others.
  function processLasers(src) {
    const now = performance.now();
    let shookThisFrame = false;
    for (const t of required) {
      const tr = tracks[t];
      if (!tr || !tr.H) continue;
      updateRoi(tr, src.cols, src.rows);
      if (!tr.roi) continue;
      const ls = laserState[t] || (laserState[t] = { on: false, gap: 0 });
      const view = src.roi(new cv.Rect(tr.roi.x, tr.roi.y, tr.roi.width, tr.roi.height));
      const dots = Laser.detect(view, laserColor, t);
      view.delete();
      const info = Laser.last;
      if (info.status === 'shake') { diag.shake++; shookThisFrame = true; }
      else if (info.status === 'too-big') diag.tooBig++;

      let hit = null;
      for (const d of dots) {
        const p = apply(tr.H, d.x + tr.roi.x, d.y + tr.roi.y);
        const x = p.x / WARP_SCALE, y = p.y / WARP_SCALE;
        if (Zones.inArt(t, x, y) && !Zones.inMarkerArea(x, y)) { hit = { target: t, x, y, area: d.area }; break; }
      }
      if (!hit) {
        if (++ls.gap >= SHOT_GAP_FRAMES) ls.on = false;
        continue;
      }
      ls.gap = 0;
      if (ls.on) continue;
      ls.on = true;
      if (now - lastShotAt < SHOT_MIN_INTERVAL) continue;
      lastShotAt = now;
      hit.at = now;
      log('SHOT', `B${t} (${hit.x.toFixed(0)},${hit.y.toFixed(0)})mm área ${Math.round(hit.area)}px fps ${Math.round(fps)}`);
      if (cbs.onShot) cbs.onShot(hit);
    }
    shakeRate = shakeRate * 0.95 + (shookThisFrame ? 0.05 : 0);
    if (now - diag.lastLogAt > 2000 && (diag.shake || diag.tooBig)) {
      log('LASER', `últimos 2s: ${diag.shake} frames con movimiento de cámara, ${diag.tooBig} manchas grandes descartadas · fps ${Math.round(fps)}`);
      diag.shake = 0; diag.tooBig = 0; diag.lastLogAt = now;
    }
  }

  function log(tag, msg) { if (typeof AppLog !== 'undefined') AppLog.add(tag, msg); }

  function frameInfo(w, h) {
    const targets = {};
    for (const t of required) {
      const tr = tracks[t];
      const c = tr && tr.Hinv ? mmToFrame(t, PAGE_W / 2, PAGE_H / 2) : null;
      targets[t] = { markers: tr ? tr.seen.length : 0, fx: c ? c.x / w : null, fy: c ? c.y / h : null };
    }
    return { state, targets, progress: Math.min(1, lockProgress / LOCK_FRAMES), markerCount, fps, unstable: shakeRate > 0.3, frameW: w, frameH: h };
  }

  return {
    ready, start, stop, track, relock, isRunning, mmToFrame,
    get state() { return state; },
  };
})();
