// Laser dot = a small blob that just changed vs the target's own recent
// background: either much brighter (dot on a dark/mid surface) or much more
// laser-coloured (dot on light paper, where brightness barely moves but R−G
// jumps). Printed elements never change, so they can't trigger regardless of
// their colour.
const Laser = (() => {
  const BRIGHTEN_MIN = 20;    // gray levels above the background's local max
  const CHROMA_MIN = 25;      // (primary − other) increase over the background
  const PRIMARY_MIN = 150;    // laser channel must be bright either way
  const COLOR_MARGIN = 8;     // brightening branch: hue sanity check
  const HALO_PX = 9;          // saturated cores are white; hue lives in the halo
  // Each pixel is compared with the brightest (and darkest) background pixel
  // within ±3px, so a phone trembling on a desk doesn't light up every
  // printed edge, while a laser still out-shines its whole neighbourhood.
  const JITTER_PX = 7;
  const MIN_AREA = 2, MAX_AREA = 900;
  // Always keep learning so a lasting change (lighting, a nudged phone) fades
  // into the background instead of reading as a laser that never turns off.
  // Slow enough that a ~100ms pulse barely leaks in.
  const BG_RATE = 0.06;
  // A shaken camera changes edges all over the target at once; a laser dot
  // changes a tiny area. Above this fraction the frame is treated as motion.
  const SHAKE_DIFF = 30;
  const SHAKE_FRAC = 0.015;
  const SHAKE_BG_RATE = 0.5;

  // The ±3px max/min envelopes only move as fast as the background learns,
  // so they're rebuilt every few frames instead of every frame (they were the
  // most expensive part, and on a phone every saved ms is a frame not skipped).
  const ENVELOPE_EVERY = 6;

  const bgs = new Map();
  let last = {};

  function freeEnvelope(b) {
    if (b.grayMax) { b.grayMax.delete(); b.grayMin.delete(); b.chromaMax.delete(); }
    b.grayMax = b.grayMin = b.chromaMax = null;
  }

  function reset() {
    bgs.forEach(b => { freeEnvelope(b); b.gray.delete(); b.chroma.delete(); });
    bgs.clear();
  }

  function refreshEnvelope(b) {
    freeEnvelope(b);
    b.grayMax = neighbourhood(b.gray, 'max');
    b.grayMin = neighbourhood(b.gray, 'min');
    b.chromaMax = neighbourhood(b.chroma, 'max');
    b.age = 0;
  }

  function neighbourhood(bg, op) {
    const out = new cv.Mat();
    const k = cv.Mat.ones(JITTER_PX, JITTER_PX, cv.CV_8U);
    if (op === 'max') cv.dilate(bg, out, k); else cv.erode(bg, out, k);
    k.delete();
    return out;
  }

  // cur − bgMax > min, as a binary mask
  function increaseOver(cur, bgMax, min) {
    const out = new cv.Mat();
    cv.subtract(cur, bgMax, out);
    cv.threshold(out, out, min, 255, cv.THRESH_BINARY);
    return out;
  }

  function learn(bg, gray, chroma, rate) {
    cv.addWeighted(bg.gray, 1 - rate, gray, rate, 0, bg.gray);
    cv.addWeighted(bg.chroma, 1 - rate, chroma, rate, 0, bg.chroma);
  }

  // Blending is the costliest op per frame, so the steady-state background
  // learns every LEARN_EVERY frames at the equivalent compounded rate.
  const LEARN_EVERY = 3;
  const LEARN_RATE = 1 - Math.pow(1 - BG_RATE, LEARN_EVERY);
  function learnSlowly(bg, gray, chroma) {
    if (++bg.learnTick % LEARN_EVERY) return;
    learn(bg, gray, chroma, LEARN_RATE);
  }

  // rgbaMat: camera region covering one target; key: that target's background.
  // Returns candidate dots [{x, y, area}] in rgbaMat px, largest first (empty
  // when nothing qualifies). Laser.last explains the outcome.
  function detect(rgbaMat, colorId, key) {
    const planes = new cv.MatVector();
    cv.split(rgbaMat, planes);
    const chans = [];
    for (let i = 0; i < planes.size(); i++) chans.push(planes.get(i));
    planes.delete();
    const primary = colorId === 'green' ? chans[1] : chans[0];
    const other = colorId === 'green' ? chans[0] : chans[1];

    const gray = new cv.Mat();
    cv.cvtColor(rgbaMat, gray, cv.COLOR_RGBA2GRAY);
    const chroma = new cv.Mat();
    cv.subtract(primary, other, chroma);

    const bg = bgs.get(key);
    if (!bg || bg.gray.rows !== gray.rows || bg.gray.cols !== gray.cols) {
      if (bg) { freeEnvelope(bg); bg.gray.delete(); bg.chroma.delete(); }
      const fresh = { gray, chroma, age: 0, learnTick: 0 };
      refreshEnvelope(fresh);
      bgs.set(key, fresh);
      chans.forEach(m => m.delete());
      last = { status: 'init' };
      return [];
    }
    if (bg.age++ >= ENVELOPE_EVERY) refreshEnvelope(bg);
    const area = gray.rows * gray.cols;

    // Shake check: a moved camera lights up (and darkens) edges everywhere.
    // Darkening is only measured when brightening already looks widespread.
    const lighter = increaseOver(gray, bg.grayMax, SHAKE_DIFF);
    let changedFrac = cv.countNonZero(lighter) / area;
    lighter.delete();
    if (changedFrac > SHAKE_FRAC / 2) {
      const darker = increaseOver(bg.grayMin, gray, SHAKE_DIFF);
      changedFrac += cv.countNonZero(darker) / area;
      darker.delete();
    }
    if (changedFrac > SHAKE_FRAC) {
      learn(bg, gray, chroma, SHAKE_BG_RATE);
      refreshEnvelope(bg);
      gray.delete(); chroma.delete(); chans.forEach(m => m.delete());
      last = { status: 'shake', changedFrac };
      return [];
    }

    const mBright = increaseOver(gray, bg.grayMax, BRIGHTEN_MIN);
    const mChroma = increaseOver(chroma, bg.chromaMax, CHROMA_MIN);
    // Fast exit — the common case: nothing got brighter or redder anywhere.
    if (!cv.countNonZero(mBright) && !cv.countNonZero(mChroma)) {
      mBright.delete(); mChroma.delete(); chans.forEach(m => m.delete());
      learnSlowly(bg, gray, chroma);
      gray.delete(); chroma.delete();
      last = { status: 'none', changedFrac };
      return [];
    }
    if (cv.countNonZero(mBright)) {
      const hue = new cv.Mat();
      cv.threshold(chroma, hue, COLOR_MARGIN, 255, cv.THRESH_BINARY);
      const hk = cv.Mat.ones(HALO_PX, HALO_PX, cv.CV_8U);
      cv.dilate(hue, hue, hk);
      hk.delete();
      cv.bitwise_and(mBright, hue, mBright);
      hue.delete();
    }
    const mask = new cv.Mat();
    cv.bitwise_or(mBright, mChroma, mask);
    mBright.delete(); mChroma.delete();

    const mPrimary = new cv.Mat();
    cv.threshold(primary, mPrimary, PRIMARY_MIN, 255, cv.THRESH_BINARY);
    cv.bitwise_and(mask, mPrimary, mask);
    mPrimary.delete();
    chans.forEach(m => m.delete());

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const dots = [];
    let rejected = 0, biggest = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const r = cv.boundingRect(c);
      const area = Math.max(cv.contourArea(c), r.width * r.height * 0.5);
      biggest = Math.max(biggest, area);
      if (area >= MIN_AREA && area < MAX_AREA) {
        const mo = cv.moments(c);
        dots.push(mo.m00 > 0 ? { x: mo.m10 / mo.m00, y: mo.m01 / mo.m00, area } : { x: r.x + r.width / 2, y: r.y + r.height / 2, area });
      } else if (area >= MAX_AREA) rejected++;
      c.delete();
    }
    mask.delete(); contours.delete(); hierarchy.delete();

    learnSlowly(bg, gray, chroma);
    gray.delete(); chroma.delete();
    dots.sort((a, b) => b.area - a.area);
    last = dots.length ? { status: 'dot', changedFrac } : { status: rejected ? 'too-big' : 'none', biggest, changedFrac };
    return dots;
  }

  return { detect, reset, get last() { return last; } };
})();
