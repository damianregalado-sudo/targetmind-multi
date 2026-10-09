const ArucoDetect = (() => {
  let detector = null;

  function detect(data, width, height) {
    if (!detector) detector = new AR.Detector({ dictionaryName: MARKER_DICT, maxHammingDistance: MARKER_MAX_HAMMING });
    return detector.detect({ data, width, height });
  }

  // → { targetNum: { k: corners[4] } }, keeping one detection per marker id
  // (nested contours can report the same marker twice).
  function groupByTarget(markers) {
    const groups = {};
    for (const m of markers) {
      const t = Math.floor(m.id / MARKERS_PER_TARGET) + 1;
      if (t < 1 || t > TARGETS_MAX) continue;
      const k = m.id % MARKERS_PER_TARGET;
      (groups[t] = groups[t] || {})[k] = m.corners;
    }
    return groups;
  }

  return { detect, groupByTarget };
})();
