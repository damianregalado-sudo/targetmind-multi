const TargetDesign = (() => {
  const A4_W = 210, A4_H = 297;
  const MARKER_SIZE = 30;
  const MARKER_INSET = 12;
  const MARKER_GRID = 7;

  const ARUCO_CODES = AR.DICTIONARIES.ARUCO.codeList;

  function markerBits(id) {
    const code = ARUCO_CODES[id];
    const bits = [];
    for (let i = 24; i >= 0; i--) bits.push((code >> i) & 1);
    const grid = [];
    for (let r = 0; r < 5; r++) grid.push(bits.slice(r * 5, r * 5 + 5));
    return grid;
  }

  function renderMarkerSVG(id, x, y, size) {
    const cell = size / MARKER_GRID;
    const bits = markerBits(id);
    let svg = `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="black"/>`;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (bits[r][c]) {
          svg += `<rect x="${x + (c + 1) * cell}" y="${y + (r + 1) * cell}" width="${cell}" height="${cell}" fill="white"/>`;
        }
      }
    }
    return svg;
  }

  const SILHOUETTES = {
    pistol: `<g transform="translate(105,70)">
      <ellipse cx="0" cy="0" rx="18" ry="22" fill="#1a1a1a"/>
      <rect x="-22" y="22" width="44" height="80" rx="8" fill="#1a1a1a"/>
      <rect x="-18" y="102" width="16" height="70" rx="4" fill="#1a1a1a"/>
      <rect x="2" y="102" width="16" height="70" rx="4" fill="#1a1a1a"/>
      <rect x="22" y="40" width="60" height="10" rx="3" fill="#1a1a1a"/>
      <rect x="75" y="36" width="22" height="8" rx="2" fill="#333"/>
      <rect x="-40" y="36" width="20" height="10" rx="3" fill="#1a1a1a"/>
    </g>`,
    knife: `<g transform="translate(105,70)">
      <ellipse cx="0" cy="0" rx="18" ry="22" fill="#1a1a1a"/>
      <rect x="-22" y="22" width="44" height="80" rx="8" fill="#1a1a1a"/>
      <rect x="-18" y="102" width="16" height="70" rx="4" fill="#1a1a1a"/>
      <rect x="2" y="102" width="16" height="70" rx="4" fill="#1a1a1a"/>
      <rect x="18" y="10" width="10" height="40" rx="3" fill="#1a1a1a" transform="rotate(-30,23,30)"/>
      <rect x="20" y="-25" width="6" height="35" rx="1" fill="#666" transform="rotate(-30,23,30)"/>
      <rect x="-40" y="50" width="20" height="10" rx="3" fill="#1a1a1a"/>
    </g>`,
    hostage: `<g transform="translate(105,70)">
      <ellipse cx="12" cy="0" rx="18" ry="22" fill="#1a1a1a"/>
      <rect x="-10" y="22" width="44" height="80" rx="8" fill="#1a1a1a"/>
      <rect x="-6" y="102" width="16" height="70" rx="4" fill="#1a1a1a"/>
      <rect x="14" y="102" width="16" height="70" rx="4" fill="#1a1a1a"/>
      <ellipse cx="-12" cy="5" rx="16" ry="20" fill="#888" stroke="#444" stroke-width="1"/>
      <rect x="-30" y="25" width="40" height="75" rx="8" fill="#aaa" stroke="#888" stroke-width="1"/>
      <rect x="-26" y="100" width="14" height="65" rx="4" fill="#aaa"/>
      <rect x="-10" y="100" width="14" height="65" rx="4" fill="#aaa"/>
      <line x1="-28" y1="35" x2="-28" y2="5" stroke="#aaa" stroke-width="6" stroke-linecap="round"/>
      <line x1="8" y1="35" x2="8" y2="5" stroke="#aaa" stroke-width="6" stroke-linecap="round"/>
    </g>`,
    civilian: `<g transform="translate(105,70)">
      <ellipse cx="0" cy="0" rx="18" ry="22" fill="#1a1a1a"/>
      <rect x="-22" y="22" width="44" height="80" rx="8" fill="#1a1a1a"/>
      <rect x="-18" y="102" width="16" height="70" rx="4" fill="#1a1a1a"/>
      <rect x="2" y="102" width="16" height="70" rx="4" fill="#1a1a1a"/>
      <line x1="-22" y1="40" x2="-35" y2="-15" stroke="#1a1a1a" stroke-width="10" stroke-linecap="round"/>
      <line x1="22" y1="40" x2="35" y2="-15" stroke="#1a1a1a" stroke-width="10" stroke-linecap="round"/>
      <circle cx="-38" cy="-20" r="8" fill="none" stroke="#1a1a1a" stroke-width="3"/>
      <circle cx="38" cy="-20" r="8" fill="none" stroke="#1a1a1a" stroke-width="3"/>
    </g>`,
  };

  const ZONE_OVERLAYS = {
    shoot: `
      <rect x="42" y="48" width="126" height="156" rx="6" fill="none" stroke="#e53935" stroke-width="0.8" stroke-dasharray="3,2" opacity="0.6"/>
      <text x="105" y="230" text-anchor="middle" fill="#e53935" font-size="6" opacity="0.5">D</text>
      <rect x="58" y="60" width="94" height="120" rx="4" fill="none" stroke="#ff9800" stroke-width="0.8" stroke-dasharray="3,2" opacity="0.6"/>
      <text x="105" y="195" text-anchor="middle" fill="#ff9800" font-size="6" opacity="0.5">C</text>
      <rect x="72" y="82" width="66" height="60" rx="3" fill="none" stroke="#4caf50" stroke-width="1" opacity="0.7"/>
      <text x="105" y="148" text-anchor="middle" fill="#4caf50" font-size="5" font-weight="bold" opacity="0.7">A</text>
      <ellipse cx="105" cy="68" rx="22" ry="18" fill="none" stroke="#2196f3" stroke-width="1" opacity="0.7"/>
      <text x="105" y="56" text-anchor="middle" fill="#2196f3" font-size="5" font-weight="bold" opacity="0.7">A</text>
    `,
    'shoot-head': `
      <ellipse cx="117" cy="73" rx="22" ry="20" fill="none" stroke="#f44336" stroke-width="1.5" opacity="0.8"/>
      <text x="117" y="58" text-anchor="middle" fill="#f44336" font-size="6" font-weight="bold" opacity="0.8">ZONA VÁLIDA</text>
      <text x="105" y="230" text-anchor="middle" fill="#f44336" font-size="7" opacity="0.5">NO DISPARAR AL REHÉN</text>
    `,
    'no-shoot': `
      <line x1="40" y1="40" x2="170" y2="210" stroke="#43a047" stroke-width="3" opacity="0.4"/>
      <line x1="170" y1="40" x2="40" y2="210" stroke="#43a047" stroke-width="3" opacity="0.4"/>
      <text x="105" y="235" text-anchor="middle" fill="#43a047" font-size="8" font-weight="bold" opacity="0.7">NO DISPARAR</text>
    `,
  };

  function generateTargetSVG(targetNum) {
    const info = TARGET_TYPES[targetNum];
    if (!info) return null;
    const markers = MARKER_ASSIGNMENTS[targetNum];
    const ms = MARKER_SIZE;
    const mi = MARKER_INSET;

    const positions = [
      { id: markers[0], x: mi, y: mi },
      { id: markers[1], x: A4_W - mi - ms, y: mi },
      { id: markers[2], x: A4_W - mi - ms, y: A4_H - mi - ms },
      { id: markers[3], x: mi, y: A4_H - mi - ms },
    ];

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${A4_W} ${A4_H}" width="${A4_W}mm" height="${A4_H}mm">`;
    svg += `<rect width="${A4_W}" height="${A4_H}" fill="white"/>`;
    svg += `<rect x="2" y="2" width="${A4_W - 4}" height="${A4_H - 4}" fill="none" stroke="${info.color}" stroke-width="3" rx="4"/>`;

    for (const p of positions) svg += renderMarkerSVG(p.id, p.x, p.y, ms);

    svg += `<text x="${A4_W / 2}" y="32" text-anchor="middle" font-family="Impact,sans-serif" font-size="28" fill="${info.color}" font-weight="bold">${targetNum}</text>`;

    svg += `<g transform="translate(0,28)">`;
    svg += SILHOUETTES[info.icon];
    svg += ZONE_OVERLAYS[info.type];
    svg += `</g>`;

    svg += `<text x="${A4_W / 2}" y="${A4_H - 18}" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" fill="#333">${info.name.toUpperCase()}</text>`;
    svg += `<text x="${A4_W / 2}" y="${A4_H - 10}" text-anchor="middle" font-family="Arial,sans-serif" font-size="5" fill="#999">TARGETMIND MULTI</text>`;

    if (info.type === 'no-shoot') {
      svg += `<text x="${A4_W / 2}" y="${A4_H - 50}" text-anchor="middle" font-family="Impact,sans-serif" font-size="14" fill="${info.color}" opacity="0.8">⚠ CIVIL - NO DISPARAR ⚠</text>`;
    }

    svg += `</svg>`;
    return svg;
  }

  function downloadTarget(targetNum) {
    const svg = generateTargetSVG(targetNum);
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `targetmind-multi-blanco-${targetNum}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAll() {
    for (let i = 1; i <= TARGETS_MAX; i++) downloadTarget(i);
  }

  return { generateTargetSVG, downloadTarget, downloadAll };
})();
