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
  const JITTER_PX = 3;        // tolerate ±1px jitter on printed edges
  const MIN_AREA = 2, MAX_AREA = 900;
  const BG_RATE = 0.1;

  const bgs = new Map();

  function reset() {
    bgs.forEach(b => { b.gray.delete(); b.chroma.delete(); });
    bgs.clear();
  }

  function increaseOver(cur, bg, min) {
    const bgMax = new cv.Mat();
    const k = cv.Mat.ones(JITTER_PX, JITTER_PX, cv.CV_8U);
    cv.dilate(bg, bgMax, k);
    k.delete();
    const out = new cv.Mat();
    cv.subtract(cur, bgMax, out);
    bgMax.delete();
    cv.threshold(out, out, min, 255, cv.THRESH_BINARY);
    return out;
  }

  // rgbaMat: camera region covering one target; key: that target's background.
  // Returns {x, y} in rgbaMat px, or null.
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
      if (bg) { bg.gray.delete(); bg.chroma.delete(); }
      bgs.set(key, { gray, chroma });
      chans.forEach(m => m.delete());
      return null;
    }

    const mBright = increaseOver(gray, bg.gray, BRIGHTEN_MIN);
    const hue = new cv.Mat();
    cv.threshold(chroma, hue, COLOR_MARGIN, 255, cv.THRESH_BINARY);
    const hk = cv.Mat.ones(HALO_PX, HALO_PX, cv.CV_8U);
    cv.dilate(hue, hue, hk);
    hk.delete();
    cv.bitwise_and(mBright, hue, mBright);
    hue.delete();

    const mChroma = increaseOver(chroma, bg.chroma, CHROMA_MIN);
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
    let best = null, bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const r = cv.boundingRect(c);
      const area = Math.max(cv.contourArea(c), r.width * r.height * 0.5);
      if (area >= MIN_AREA && area < MAX_AREA && area > bestArea) {
        const mo = cv.moments(c);
        best = mo.m00 > 0 ? { x: mo.m10 / mo.m00, y: mo.m01 / mo.m00 } : { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        bestArea = area;
      }
      c.delete();
    }
    mask.delete(); contours.delete(); hierarchy.delete();

    // learn the background only from frames without a dot, so a held laser
    // isn't absorbed into it
    if (!best) {
      cv.addWeighted(bg.gray, 1 - BG_RATE, gray, BG_RATE, 0, bg.gray);
      cv.addWeighted(bg.chroma, 1 - BG_RATE, chroma, BG_RATE, 0, bg.chroma);
    }
    gray.delete(); chroma.delete();
    return best;
  }

  return { detect, reset };
})();
