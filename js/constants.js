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

// Each target is photo art placed on the page (mm) with zones on the figure's
// anatomy (boxes measured on the art with Gemini, converted to page mm). Art
// stays inside y ≤ 233 so the corner markers keep their white quiet zone.
// Zones are tested in array order; the first one containing the hit wins, so
// list inner/frontmost zones first.
const PHOTO_PISTOL_D = [[77, 49], [109, 49], [111, 86], [124, 82], [147, 83], [147, 116], [139, 128], [139, 186], [66, 186], [58, 128], [58, 96], [76, 88]];
const TARGET_TYPES = {
  1: {
    name: 'Atacante con pistola', color: '#e53935', noShoot: false,
    art: { src: 'art/ipsc-pistol.jpg', x: 46.2, y: 40, w: 117.7, h: 193 },
    zones: [
      { label: 'A', points: 5, shape: 'ellipse', cx: 94.2, cy: 77.4, rx: 11.7, ry: 13.3 },
      { label: 'A', points: 5, shape: 'rect', x: 79.9, y: 99.4, w: 42.8, h: 45 },
      { label: 'C', points: 3, shape: 'ellipse', cx: 92.4, cy: 73.8, rx: 15.3, ry: 23.8 },
      { label: 'C', points: 3, shape: 'rect', x: 67.3, y: 88.2, w: 70.6, h: 96.5 },
      { label: 'D', points: 1, shape: 'poly', pts: PHOTO_PISTOL_D },
    ],
  },
  2: {
    name: 'Atacante con cuchillo', color: '#e53935', noShoot: false,
    art: { src: 'art/knife.jpg', x: 40.1, y: 40, w: 129.8, h: 193 },
    zones: [
      { label: 'A', points: 5, shape: 'ellipse', cx: 109.4, cy: 77.2, rx: 12, ry: 10.1 },
      { label: 'A', points: 5, shape: 'rect', x: 84.1, y: 84, w: 40, h: 78.9 },
      { label: 'C', points: 3, shape: 'ellipse', cx: 109.4, cy: 71.9, rx: 16.4, ry: 26.1 },
      { label: 'C', points: 3, shape: 'rect', x: 64.2, y: 84, w: 79.7, h: 105.4 },
      { label: 'D', points: 1, shape: 'poly', pts: [[92, 45.8], [125.8, 45.8], [125.8, 78.6], [146.5, 86.3], [163.4, 117.2], [169.9, 159.7], [150.4, 189.6], [64.8, 189.6], [62.2, 121.1], [42.7, 113.3], [47.9, 63.2], [68.7, 53.5], [79, 82.5], [92, 78.6]] },
    ],
  },
  // The hostage is in front of the attacker, so her zones are tested first.
  3: {
    name: 'Rehén', color: '#f9a825', noShoot: false,
    art: { src: 'art/hostage.jpg', x: 38.3, y: 40, w: 133.4, h: 193 },
    zones: [
      { label: 'REHÉN', penalty: true, shape: 'ellipse', cx: 103.6, cy: 72.2, rx: 18.5, ry: 24.3 },
      { label: 'REHÉN', penalty: true, shape: 'poly', pts: [[58.3, 101.8], [89, 90.2], [118.3, 92.1], [138.4, 105.6], [138.4, 233], [58.3, 233]] },
      { label: 'A', points: 5, shape: 'ellipse', cx: 130.4, cy: 89.8, rx: 9.4, ry: 10.2 },
      { label: 'C', points: 3, shape: 'ellipse', cx: 133.7, cy: 83, rx: 13.2, ry: 21.2 },
      { label: 'D', points: 1, shape: 'rect', x: 138.4, y: 91.1, w: 32, h: 74.2 },
    ],
  },
  4: {
    name: 'Civil inocente', color: '#43a047', noShoot: true,
    art: { src: 'art/civilian.jpg', x: 40.3, y: 40, w: 129.5, h: 193 },
    zones: [
      { label: 'CIVIL', penalty: true, shape: 'ellipse', cx: 105.5, cy: 78.3, rx: 13.8, ry: 20 },
      { label: 'CIVIL', penalty: true, shape: 'rect', x: 75, y: 95, w: 56.2, h: 81.6 },
      { label: 'CIVIL', penalty: true, shape: 'rect', x: 60.5, y: 97.9, w: 18.7, h: 50.2 },
      { label: 'CIVIL', penalty: true, shape: 'rect', x: 129.7, y: 96, w: 18.1, h: 65.6 },
      { label: 'CIVIL', penalty: true, shape: 'rect', x: 75.3, y: 176.6, w: 58.3, h: 56.4 },
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
