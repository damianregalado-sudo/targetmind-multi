// All target geometry is in millimetres on an A4 portrait page (origin top-left).
// The same zone definitions drive both the printed SVG and hit scoring, so what
// the shooter sees on paper is exactly what gets scored.
const PAGE_W = 210;
const PAGE_H = 297;
const TARGETS_MAX = 4;
const MARKERS_PER_TARGET = 4;

const MARKER_DICT = 'APRILTAG_16h5';
// 16h5 has min Hamming distance 5; accepting up to 1 flipped bit keeps random
// textures (posters, keyboards) from decoding as a valid ID.
const MARKER_MAX_HAMMING = 2;
const MARKER_MM = 50;
const MARKER_INSET = 8;
const MARKER_CLEARANCE = 4;

// corner index k = id % 4 → 0 TL, 1 TR, 2 BR, 3 BL (printed orientation)
const MARKER_ORIGINS = [
  { x: MARKER_INSET, y: MARKER_INSET },
  { x: PAGE_W - MARKER_INSET - MARKER_MM, y: MARKER_INSET },
  { x: PAGE_W - MARKER_INSET - MARKER_MM, y: PAGE_H - MARKER_INSET - MARKER_MM },
  { x: MARKER_INSET, y: PAGE_H - MARKER_INSET - MARKER_MM },
];

function markerIdFor(targetNum, k) { return (targetNum - 1) * MARKERS_PER_TARGET + k; }

// js-aruco2 returns marker corners in printed order TL, TR, BR, BL.
function markerCornersMM(k) {
  const o = MARKER_ORIGINS[k], s = MARKER_MM;
  return [{ x: o.x, y: o.y }, { x: o.x + s, y: o.y }, { x: o.x + s, y: o.y + s }, { x: o.x, y: o.y + s }];
}

const WARP_SCALE = 2; // px per mm in the rectified target image
const WARP_W = PAGE_W * WARP_SCALE;
const WARP_H = PAGE_H * WARP_SCALE;

const PENALTY_POINTS = -10;
const WRONG_TARGET_POINTS = -5;

// IPSC-style silhouette, kept clear of the corner markers.
const IPSC_OUTLINE = [[83, 42], [127, 42], [127, 88], [158, 96], [170, 118], [170, 232], [40, 232], [40, 118], [52, 96], [83, 88]];
const IPSC_ZONES = [
  { label: 'A', points: 5, shape: 'rect', x: 91, y: 50, w: 28, h: 22 },
  { label: 'A', points: 5, shape: 'rect', x: 82, y: 104, w: 46, h: 78 },
  { label: 'C', points: 3, shape: 'rect', x: 83, y: 42, w: 44, h: 46 },
  { label: 'C', points: 3, shape: 'rect', x: 66, y: 96, w: 78, h: 118 },
  { label: 'D', points: 1, shape: 'poly', pts: IPSC_OUTLINE },
];

// Zones are tested in array order; the first one containing the hit wins, so
// list inner/frontmost zones first.
const TARGET_TYPES = {
  1: {
    name: 'Atacante con pistola', color: '#e53935', noShoot: false,
    figure: 'pistol', zones: IPSC_ZONES,
  },
  2: {
    name: 'Atacante con cuchillo', color: '#e53935', noShoot: false,
    figure: 'knife', zones: IPSC_ZONES,
  },
  3: {
    name: 'Rehén', color: '#f9a825', noShoot: false,
    figure: 'hostage',
    zones: [
      { label: 'REHÉN', penalty: true, shape: 'ellipse', cx: 96, cy: 84, rx: 20, ry: 24 },
      { label: 'REHÉN', penalty: true, shape: 'poly', pts: [[66, 110], [126, 110], [150, 132], [150, 232], [44, 232], [44, 132]] },
      { label: 'A', points: 5, shape: 'circle', cx: 134, cy: 74, r: 13 },
      { label: 'C', points: 3, shape: 'circle', cx: 134, cy: 74, r: 21 },
    ],
  },
  4: {
    name: 'Civil inocente', color: '#43a047', noShoot: true,
    figure: 'civilian',
    zones: [
      { label: 'CIVIL', penalty: true, shape: 'ellipse', cx: 105, cy: 72, rx: 20, ry: 24 },
      { label: 'CIVIL', penalty: true, shape: 'poly', pts: IPSC_OUTLINE.slice(2) },
    ],
  },
};

const DRILL_DEFAULTS = {
  rounds: 10,
  windowMs: 3000,
  delayMs: [1200, 3000],
  voiceEnabled: true,
  voiceLang: 'es-AR',
};
