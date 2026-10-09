const Zones = (() => {
  function inPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function contains(z, x, y) {
    switch (z.shape) {
      case 'rect': return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
      case 'circle': return Math.hypot(x - z.cx, y - z.cy) <= z.r;
      case 'ellipse': return ((x - z.cx) / z.rx) ** 2 + ((y - z.cy) / z.ry) ** 2 <= 1;
      case 'poly': return inPoly(z.pts, x, y);
      default: return false;
    }
  }

  function hitTest(targetNum, x, y) {
    const def = TARGET_TYPES[targetNum];
    if (!def) return null;
    for (const z of def.zones) {
      if (contains(z, x, y)) return { label: z.label, points: z.penalty ? PENALTY_POINTS : z.points, penalty: !!z.penalty };
    }
    return null;
  }

  function inMarkerArea(x, y) {
    const pad = MARKER_CLEARANCE;
    return MARKER_ORIGINS.some(o => x >= o.x - pad && x <= o.x + MARKER_MM + pad && y >= o.y - pad && y <= o.y + MARKER_MM + pad);
  }

  function zoneSVG(z, stroke, width, dash) {
    const a = `fill="none" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}`;
    switch (z.shape) {
      case 'rect': return `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="1.5" ${a}/>`;
      case 'circle': return `<circle cx="${z.cx}" cy="${z.cy}" r="${z.r}" ${a}/>`;
      case 'ellipse': return `<ellipse cx="${z.cx}" cy="${z.cy}" rx="${z.rx}" ry="${z.ry}" ${a}/>`;
      case 'poly': return `<polygon points="${z.pts.map(p => p.join(',')).join(' ')}" ${a}/>`;
      default: return '';
    }
  }

  function labelPos(z) {
    switch (z.shape) {
      case 'rect': return { x: z.x + z.w / 2, y: z.y + 5 };
      case 'circle': return { x: z.cx, y: z.cy - z.r + 5 };
      case 'ellipse': return { x: z.cx, y: z.cy };
      case 'poly': {
        const ys = z.pts.map(p => p[1]);
        return { x: z.pts.reduce((s, p) => s + p[0], 0) / z.pts.length, y: Math.max(...ys) - 4 };
      }
    }
    return { x: 0, y: 0 };
  }

  return { hitTest, contains, inMarkerArea, zoneSVG, labelPos };
})();
