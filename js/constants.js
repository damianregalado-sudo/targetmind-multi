const GRID = 1000;
const TARGETS_MAX = 4;
const MARKERS_PER_TARGET = 4;

const MARKER_ASSIGNMENTS = {
  1: [0, 1, 2, 3],
  2: [4, 5, 6, 7],
  3: [8, 9, 10, 11],
  4: [12, 13, 14, 15],
};

const MARKER_CORNER_MAP = { 0: 'TL', 1: 'TR', 2: 'BR', 3: 'BL' };

const WARP_SIZE = 400;

const TARGET_TYPES = {
  1: {
    name: 'Atacante con pistola',
    type: 'shoot',
    color: '#e53935',
    icon: 'pistol',
    penalty: false,
  },
  2: {
    name: 'Atacante con cuchillo',
    type: 'shoot',
    color: '#e53935',
    icon: 'knife',
    penalty: false,
  },
  3: {
    name: 'Rehén',
    type: 'shoot-head',
    color: '#fdd835',
    icon: 'hostage',
    penalty: false,
  },
  4: {
    name: 'Civil inocente',
    type: 'no-shoot',
    color: '#43a047',
    icon: 'civilian',
    penalty: true,
  },
};

const SCORING_ZONES = {
  head:       { x: 440, y: 60,  w: 120, h: 100, label: 'A (cabeza)', points: 5 },
  centerMass: { x: 380, y: 200, w: 240, h: 250, label: 'A (centro)',  points: 5 },
  cZone:      { x: 320, y: 160, w: 360, h: 380, label: 'C',           points: 3 },
  dZone:      { x: 260, y: 100, w: 480, h: 520, label: 'D',           points: 1 },
};

const DRILL_DEFAULTS = {
  rounds: 10,
  transitionTimeMs: 2000,
  promptDelayMs: [800, 2500],
  voiceEnabled: true,
  voiceLang: 'es-AR',
};
