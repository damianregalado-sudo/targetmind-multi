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

  const TAN = '#d9c4a0', TAN_STROKE = '#8d6e4a';
  const pts = p => p.map(q => q.join(',')).join(' ');

  const PISTOL = `<g fill="#3a3a3a"><rect x="138" y="122" width="30" height="8" rx="1"/><rect x="140" y="128" width="8" height="14" rx="1.5" transform="rotate(12,144,128)"/></g>`;
  const KNIFE = `<g><polygon points="140,128 168,112 170,115 146,134" fill="#9e9e9e" stroke="#555" stroke-width="0.4"/><rect x="132" y="128" width="12" height="6" rx="1.5" fill="#3a3a3a" transform="rotate(-30,138,131)"/></g>`;

  const FIGURES = {
    pistol: () => `<polygon points="${pts(IPSC_OUTLINE)}" fill="${TAN}" stroke="${TAN_STROKE}" stroke-width="0.8"/>${PISTOL}`,
    knife: () => `<polygon points="${pts(IPSC_OUTLINE)}" fill="${TAN}" stroke="${TAN_STROKE}" stroke-width="0.8"/>${KNIFE}`,
    hostage: () => {
      const z = TARGET_TYPES[3].zones;
      return `<circle cx="134" cy="74" r="22" fill="${TAN}" stroke="${TAN_STROKE}" stroke-width="0.8"/>
        <polygon points="120,100 160,104 166,130 166,200 150,200 150,132" fill="${TAN}" stroke="${TAN_STROKE}" stroke-width="0.8"/>
        <polygon points="${pts(z[1].pts)}" fill="#e3e9ec" stroke="#607d8b" stroke-width="0.8"/>
        <ellipse cx="96" cy="84" rx="20" ry="24" fill="#e3e9ec" stroke="#607d8b" stroke-width="0.8"/>
        <g fill="#3a3a3a"><rect x="112" y="92" width="22" height="7" rx="1"/><rect x="128" y="96" width="7" height="12" rx="1.5"/></g>`;
    },
    civilian: () => `<polygon points="${pts(IPSC_OUTLINE.slice(2))}" fill="#dcedc8" stroke="#2e7d32" stroke-width="0.8"/>
      <ellipse cx="105" cy="72" rx="20" ry="24" fill="#dcedc8" stroke="#2e7d32" stroke-width="0.8"/>
      <g stroke="#2e7d32" stroke-width="5" stroke-linecap="round" fill="none"><line x1="58" y1="104" x2="70" y2="74"/><line x1="152" y1="104" x2="140" y2="74"/></g>
      <circle cx="70" cy="70" r="6" fill="#dcedc8" stroke="#2e7d32" stroke-width="0.8"/><circle cx="140" cy="70" r="6" fill="#dcedc8" stroke="#2e7d32" stroke-width="0.8"/>`,
  };

  function zonesSVG(def) {
    let svg = '';
    for (const z of def.zones) {
      if (z.penalty) continue;
      if (z.label === 'D') continue;
      svg += Zones.zoneSVG(z, '#6d4c41', 0.5, '2,1.2');
      const p = Zones.labelPos(z);
      svg += `<text x="${p.x}" y="${p.y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="4.5" font-weight="bold" fill="#6d4c41" opacity="0.8">${z.label}</text>`;
    }
    return svg;
  }

  // opts.art: { href, x, y, w, h } — optional background artwork (mm). Markers
  // and their white quiet zone are always drawn on top so art can't break detection.
  function generateTargetSVG(targetNum, opts = {}) {
    const def = TARGET_TYPES[targetNum];
    if (!def) return null;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}mm" height="${PAGE_H}mm">`;
    svg += `<rect width="${PAGE_W}" height="${PAGE_H}" fill="white"/>`;
    const art = opts.art || def.art;
    if (art) svg += `<image href="${art.href}" x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" preserveAspectRatio="xMidYMid slice"/>`;
    else svg += FIGURES[def.figure]();
    svg += zonesSVG(def);
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

  function printTargets(nums) {
    const pages = nums.map(n => `<div class="page">${generateTargetSVG(n)}</div>`).join('');
    const w = window.open('', '_blank');
    if (!w) { alert('Permití ventanas emergentes para imprimir los blancos.'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Blancos TargetMind Multi</title>
      <style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0}.page{width:210mm;height:297mm;page-break-after:always;overflow:hidden}.page svg{width:210mm;height:297mm;display:block}</style>
      </head><body>${pages}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  }

  function downloadTarget(targetNum) {
    const svg = generateTargetSVG(targetNum);
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `targetmind-multi-blanco-${targetNum}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return { generateTargetSVG, printTargets, downloadTarget };
})();
