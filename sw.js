// Network-first for app files (redeploys show up on next load), cache as the
// offline fallback. OpenCV.js is large and versioned, so it's cache-first.
const CACHE = 'tm-multi-v6';
const SHELL = [
  './', './index.html', './manifest.json', './css/style.css',
  './vendor/aruco-cv.js', './vendor/aruco.js', './vendor/dictionaries/apriltag_16h5.js',
  './js/utils.js', './js/constants.js', './js/zones.js', './js/target-design.js',
  './js/aruco-detect.js', './js/laser.js', './js/vision-multi.js', './js/drill-multi.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png', './art/ipsc-pistol.jpg', './art/knife.jpg', './art/hostage.jpg', './art/civilian.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all([
    cache.addAll(SHELL).catch(() => {}),
    cache.add('./vendor/opencv.js').catch(() => {}),
  ])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const put = (res) => {
    if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  };
  if (req.url.endsWith('/vendor/opencv.js')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(put)));
    return;
  }
  event.respondWith(fetch(req).then(put).catch(() => caches.match(req)));
});
