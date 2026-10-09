const TargetDesign = (() => {
  let dict = null;
  function dictionary() { return dict || (dict = new AR.Dictionary(MARKER_DICT)); }

  function markerSVG(id, x, y, s) {
    const code = dictionary().codeList[id];
    const n = Math.sqrt(code.length);
    const cell = s / (n + 2);
    let svg = `<rect x="${x - MARKER_CLEARANCE}" y="${y - MARKER_CLEARANCE}" width="${s + 2 * MARKER_CLEARANCE}" height="${s + 2 * MARKER_CLEARANCE}" fill="white"/>`;
    svg += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="black"/>`;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (code[r * n + c] === '1') {
          // slight overlap avoids hairline seams between adjacent white cells
          svg += `<rect x="${x + (c + 1) * cell}" y="${y + (r + 1) * cell}" width="${cell + 0.05}" height="${cell + 0.05}" fill="white"/>`;
        }
      }
    }
    return svg;
  }

  // Every zone gets a light halo so it reads on any photo tone. Scoring zones
  // are dark dashed; penalty (no-shoot) zones are green and labelled NO.
  function zonesSVG(def) {
    let svg = '';
    for (const z of def.zones) {
      const ink = z.penalty ? '#1b5e20' : '#222';
      svg += Zones.zoneSVG(z, '#ffffff', 1, null).replace('/>', ' opacity="0.55"/>');
      svg += Zones.zoneSVG(z, ink, z.penalty ? 0.6 : 0.45, z.penalty ? '0.8,1.2' : '2,1.2');
      const p = Zones.labelPos(z);
      svg += `<text x="${p.x}" y="${p.y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="4.5" font-weight="bold" fill="${ink}" stroke="#fff" stroke-width="0.6" paint-order="stroke" opacity="0.85">${z.penalty ? 'NO' : z.label}</text>`;
    }
    return svg;
  }

  function artHref(src) {
    return new URL(src, document.baseURI).href;
  }

  // opts.art overrides def.art ({ href } instead of { src }, e.g. a data URI).
  // Markers and their white quiet zone are drawn last so art can't break detection.
  function generateTargetSVG(targetNum, opts = {}) {
    const def = TARGET_TYPES[targetNum];
    if (!def) return null;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}mm" height="${PAGE_H}mm">`;
    svg += `<rect width="${PAGE_W}" height="${PAGE_H}" fill="white"/>`;
    const art = opts.art || def.art;
    svg += `<image href="${art.href || artHref(art.src)}" x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" preserveAspectRatio="xMidYMid slice"/>`;
    if (opts.showZones !== false) svg += zonesSVG(def);
    for (let k = 0; k < 4; k++) {
      const o = MARKER_ORIGINS[k];
      svg += markerSVG(markerIdFor(targetNum, k), o.x, o.y, MARKER_MM);
    }
    svg += `<text x="${PAGE_W / 2}" y="30" text-anchor="middle" font-family="Impact,Arial Black,sans-serif" font-size="22" fill="${def.color}">${targetNum}</text>`;
    svg += `<text x="${PAGE_W / 2}" y="${PAGE_H - 22}" text-anchor="middle" font-family="Arial,sans-serif" font-size="5" font-weight="bold" fill="${def.noShoot ? '#2e7d32' : '#333'}">${def.noShoot ? 'NO DISPARAR · ' : ''}${def.name.toUpperCase()}</text>`;
    svg += `<text x="${PAGE_W / 2}" y="${PAGE_H - 14}" text-anchor="middle" font-family="Arial,sans-serif" font-size="4" fill="#999">TARGETMIND MULTI · imprimir al 100% en A4</text>`;
    svg += `</svg>`;
    return svg;
  }

  function printTargets(nums, opts = {}) {
    const pages = nums.map(n => `<div class="page">${generateTargetSVG(n, opts)}</div>`).join('');
    const w = window.open('', '_blank');
    if (!w) { alert('Permití ventanas emergentes para imprimir los blancos.'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Blancos TargetMind Multi</title>
      <style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0}.page{width:210mm;height:297mm;page-break-after:always;overflow:hidden}.page svg{width:210mm;height:297mm;display:block}</style>
      </head><body>${pages}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  }

  return { generateTargetSVG, printTargets };
})();
