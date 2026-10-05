const Laser = (() => {
  const BRIGHTNESS_MIN = 200;
  const CONTRAST_MIN = 38;
  const COLOR_MARGIN = 8;
  const MIN_AREA = 3, MAX_AREA = 800;
  const BLUR_KERNEL = 31;

  function detect(rgbaMat, colorId) {
    const rgb = new cv.Mat();
    cv.cvtColor(rgbaMat, rgb, cv.COLOR_RGBA2RGB);
    const planes = new cv.MatVector();
    cv.split(rgb, planes);
    const R = planes.get(0), G = planes.get(1), B = planes.get(2);
    const primary = colorId === 'green' ? G : R;
    const other1 = colorId === 'green' ? R : G;

    const diff1 = new cv.Mat();
    cv.subtract(primary, other1, diff1);

    const gray = new cv.Mat();
    cv.cvtColor(rgbaMat, gray, cv.COLOR_RGBA2GRAY);
    const mBright = new cv.Mat();
    cv.threshold(gray, mBright, BRIGHTNESS_MIN, 255, cv.THRESH_BINARY);
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(BLUR_KERNEL, BLUR_KERNEL), 0);
    const contrast = new cv.Mat();
    cv.subtract(gray, blurred, contrast);
    const mContrast = new cv.Mat();
    cv.threshold(contrast, mContrast, CONTRAST_MIN, 255, cv.THRESH_BINARY);
    const mDestello = new cv.Mat();
    cv.bitwise_and(mBright, mContrast, mDestello);

    const mColor = new cv.Mat();
    cv.threshold(diff1, mColor, COLOR_MARGIN, 255, cv.THRESH_BINARY);

    const mask = new cv.Mat();
    cv.bitwise_and(mDestello, mColor, mask);

    diff1.delete(); gray.delete(); mBright.delete(); blurred.delete();
    contrast.delete(); mContrast.delete(); mDestello.delete(); mColor.delete();
    R.delete(); G.delete(); B.delete(); planes.delete(); rgb.delete();

    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(mask, mask, kernel);
    kernel.delete();

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let best = null, bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area > MIN_AREA && area < MAX_AREA && area > bestArea) {
        const mo = cv.moments(c);
        if (mo.m00 > 0) { best = { x: mo.m10 / mo.m00, y: mo.m01 / mo.m00 }; bestArea = area; }
      }
      c.delete();
    }
    mask.delete(); contours.delete(); hierarchy.delete();

    if (!best) return null;
    return { gx: best.x * (GRID / WARP_SIZE), gy: best.y * (GRID / WARP_SIZE), px: best.x, py: best.y };
  }

  return { detect };
})();
