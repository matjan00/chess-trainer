// Offline support: every app file is saved on the device when the app is installed or updated, and served
// from there (so it opens with no signal). A new version gets a new cache and only takes over once it is
// completely saved. Anything missing is fetched and saved the next time there is a connection, and the app
// asks for a check on every start ('warm'), so the offline copy repairs itself. Sign-in and sync calls to
// Supabase always go to the network. version.json is never cached, so the app can tell when an update exists.
const VERSION = 'chess-v23';
const CORE = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "analysis.json", "drills.json", "courses.json", "puzzles.json", "punish.json", "check.json", "convert.json", "technique.json", "endgames.json", "essentials.json", "openings.json", "explorer.json", "structures.json", "vendor/chess.min.js", "vendor/chessground.min.js", "vendor/supabase.js", "vendor/stockfish.wasm.js", "vendor/stockfish.wasm", "vendor/stockfish.js", "vendor/fonts/f0-latin-ext.woff2", "vendor/fonts/f1-latin.woff2", "vendor/fonts/f2-latin-ext.woff2", "vendor/fonts/f3-latin.woff2", "vendor/fonts/f4-latin-ext.woff2", "vendor/fonts/f5-latin.woff2", "vendor/fonts/f6-latin-ext.woff2", "vendor/fonts/f7-latin.woff2", "vendor/fonts/f8-latin-ext.woff2", "vendor/fonts/f9-latin.woff2", "vendor/fonts/fonts.css"];
async function warm() {
  const c = await caches.open(VERSION);
  for (const u of CORE) {
    if (await c.match(u, { ignoreSearch: true })) continue;
    try { const res = await fetch(new Request(u, { cache: 'reload' })); if (res.ok) await c.put(u, res); } catch (e) { return; }   // offline: try next time
  }
}
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('chess-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'warm') e.waitUntil(warm()); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // Supabase sync and links: straight to the network
  if (url.pathname.endsWith('/version.json')) return;
  // the install file always comes fresh from the website when online, so Chrome sees the current app identity
  if (url.pathname.endsWith('/manifest.webmanifest')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);                            // not saved yet: fetch it and save it for next time
    if (res.ok) c.put(req.mode === 'navigate' ? 'index.html' : req, res.clone());
    return res;
  }));
});
