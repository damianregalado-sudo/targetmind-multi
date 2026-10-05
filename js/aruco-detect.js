const ArucoDetect = (() => {
  let detector = null;
  let dictionary = null;

  function init() {
    dictionary = new AR.Dictionary('ARUCO');
    detector = new AR.Detector();
    detector.dictionary = dictionary;
  }

  function detect(imageData, width, height) {
    if (!detector) init();
    const markers = detector.detect({ data: imageData, width, height });
    return markers;
  }

  function groupByTarget(markers) {
    const groups = {};
    for (const m of markers) {
      const targetIdx = Math.floor(m.id / MARKERS_PER_TARGET) + 1;
      if (targetIdx < 1 || targetIdx > TARGETS_MAX) continue;
      if (!groups[targetIdx]) groups[targetIdx] = [];
      const cornerIdx = m.id % MARKERS_PER_TARGET;
      groups[targetIdx].push({
        id: m.id,
        cornerIdx,
        cornerName: MARKER_CORNER_MAP[cornerIdx],
        corners: m.corners,
        center: {
          x: (m.corners[0].x + m.corners[1].x + m.corners[2].x + m.corners[3].x) / 4,
          y: (m.corners[0].y + m.corners[1].y + m.corners[2].y + m.corners[3].y) / 4,
        },
      });
    }
    return groups;
  }

  function getTargetCorners(group) {
    if (!group || group.length < 4) return null;
    const byCorner = {};
    for (const m of group) byCorner[m.cornerIdx] = m;
    if (!byCorner[0] || !byCorner[1] || !byCorner[2] || !byCorner[3]) return null;
    return [
      byCorner[0].center,
      byCorner[1].center,
      byCorner[3].center,
      byCorner[2].center,
    ];
  }

  return { init, detect, groupByTarget, getTargetCorners };
})();
