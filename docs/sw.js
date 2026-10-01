// Offline support: every app file is saved on the device when the app is installed or updated, and served
// from there (so it opens with no signal). A new version gets a new cache. Sign-in and sync calls to
// Supabase always go to the network. version.json is never cached, so the app can tell when an update exists.
const VERSION = 'chess-v1';
const CORE = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "analysis.json", "drills.json", "courses.json", "puzzles.json", "punish.json", "check.json", "convert.json", "technique.json", "endgames.json", "essentials.json", "vendor/chess.min.js", "vendor/chessground.min.js", "vendor/supabase.js", "vendor/stockfish.wasm.js", "vendor/stockfish.wasm", "vendor/stockfish.js"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'chess-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('/version.json')) return;
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
    return;
  }
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open('chess-fonts').then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
  }
});
