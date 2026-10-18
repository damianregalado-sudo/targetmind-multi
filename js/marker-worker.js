// Corner-tag detection off the main thread, so re-checking the tags while
// locked never stalls laser detection (on a phone one pass takes ~0.1s, long
// enough to miss a short laser pulse).
importScripts('../vendor/aruco-cv.js', '../vendor/aruco.js', '../vendor/dictionaries/apriltag_16h5.js');

let detector = null;
self.onmessage = (e) => {
  const { seq, width, height, buffer, dict, maxHamming } = e.data;
  if (!detector) detector = new AR.Detector({ dictionaryName: dict, maxHammingDistance: maxHamming });
  const markers = detector.detect({ data: new Uint8ClampedArray(buffer), width, height });
  self.postMessage({ seq, markers: markers.map(m => ({ id: m.id, corners: m.corners })) });
};
