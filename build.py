"""Build drill positions from the analysis and assemble the publishable app in dist/.

Usage:  python build.py [--skip-drills]
"""
import argparse, hashlib, json, math, shutil, threading
from pathlib import Path
import chess, chess.engine

ROOT = Path(__file__).parent
DATA, DIST = ROOT / "data", ROOT / "dist"
ENGINE = next((ROOT / "engine").rglob("stockfish*.exe"))


def win_pct(score, pov):
    s = score.pov(pov)
    if s.is_mate():
        return 100.0 if s.mate() > 0 else 0.0
    cp = max(-1000, min(1000, s.score()))
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def build_drills(games, depth=16, workers=7):
    """Every blunder/mistake of mine becomes a 'find the better move' position.
    Moves within 3% win chance of the engine's best are accepted too."""
    todo = []
    for g in games:
        me_white = g["color"] == "white"
        board = chess.Board()
        for i, p in enumerate(g["plies"]):
            mine = (i % 2 == 0) == me_white
            if mine and p.get("lab") in ("blunder", "mistake") and p.get("fen"):
                last = board.peek() if board.move_stack else None
                todo.append({
                    "id": f'{g["url"].rsplit("/", 1)[-1]}-{i}', "url": g["url"], "fen": p["fen"], "ph": p["ph"], "lab": p["lab"],
                    "played": p["san"], "pv": p.get("pv", ""), "refute": p.get("refute"), "e": p["e"],
                    "moveNo": f'{i // 2 + 1}{"." if i % 2 == 0 else "..."}',
                    "last": [chess.square_name(last.from_square), chess.square_name(last.to_square)] if last else None,
                })
            board.push_san(p["san"])

    lock, out = threading.Lock(), []

    def worker():
        eng = chess.engine.SimpleEngine.popen_uci(str(ENGINE))
        eng.configure({"Threads": 1, "Hash": 64})
        while True:
            with lock:
                if not todo: break
                d = todo.pop()
            b = chess.Board(d["fen"])
            infos = eng.analyse(b, chess.engine.Limit(depth=depth), multipv=4)
            best = win_pct(infos[0]["score"], b.turn)
            ok = [b.san(i["pv"][0]) for i in infos if "pv" in i and (best - win_pct(i["score"], b.turn) <= 3 or win_pct(i["score"], b.turn) >= 97)]
            if d["played"] in ok:  # deeper search says the game move was fine after all
                continue
            d["ok"] = ok
            d["pv"] = b.variation_san(infos[0]["pv"][:8])
            with lock:
                out.append(d)
        eng.quit()

    ts = [threading.Thread(target=worker) for _ in range(workers)]
    for t in ts: t.start()
    for t in ts: t.join()
    out.sort(key=lambda d: d["id"])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-drills", action="store_true")
    args = ap.parse_args()
    games = json.loads((DATA / "analysis.json").read_text(encoding="utf-8"))
    if not args.skip_drills:
        drills = build_drills(games)
        (DATA / "drills.json").write_text(json.dumps(drills), encoding="utf-8")
        print(f"{len(drills)} drill positions")

    DIST.mkdir(exist_ok=True)
    css = "\n".join((ROOT / "vendor" / f).read_text(encoding="utf-8") for f in ("chessground.base.css", "chessground.brown.css", "chessground.cburnett.css"))
    html = (ROOT / "app.html").read_text(encoding="utf-8").replace("/*CG_CSS*/", css)
    notes = ROOT / "notes.html"
    if notes.exists():
        html = html.replace("<!--NOTES-->", notes.read_text(encoding="utf-8"))
    (DIST / "index.html").write_text(html, encoding="utf-8")
    # local preview copy with the skeleton the artifact host would add
    (DIST / "preview.html").write_text('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + html + "</body></html>", encoding="utf-8")
    # the page doesn't need the per-move FEN strings, the drills carry their own
    slim = [{**g, "plies": [{k: v for k, v in p.items() if k != "fen"} for p in g["plies"]]} for g in games]
    (DIST / "analysis.json").write_text(json.dumps(slim, separators=(",", ":")), encoding="utf-8")
    for f in ("drills.json", "courses.json", "puzzles.json", "punish.json", "check.json", "convert.json", "technique.json", "endgames.json", "essentials.json"):
        if (DATA / f).exists(): shutil.copy(DATA / f, DIST / f)
    shutil.copy(ROOT / "vendor" / "sf" / "stockfish.wasm", DIST / "stockfish.wasm")
    print("built", DIST / "index.html")
    build_app(html)


# ---------------------------------------------------------------------------------------------------
# The installable phone/laptop app (GitHub Pages, served from docs/). Same page as the Claude version,
# but it carries every library and the engine itself, so it also works offline, and it syncs progress
# through the Supabase table chess_progress instead of Claude's database.
APP = ROOT / "docs"
SUPABASE = {"url": "https://txhcnqwrdazgaxjwabln.supabase.co", "key": "sb_publishable_kNZA54ZHzYbJpL7yfqsA3w_vKejTXp3"}
DATA_FILES = ["analysis.json", "drills.json", "courses.json", "puzzles.json", "punish.json", "check.json",
              "convert.json", "technique.json", "endgames.json", "essentials.json"]
VENDOR = ["chess.min.js", "chessground.min.js", "supabase.js", "stockfish.wasm.js", "stockfish.wasm", "stockfish.js"]

MANIFEST = {
    "name": "Chess Trainer", "short_name": "Chess", "start_url": "./", "scope": "./", "display": "standalone",
    "orientation": "any", "background_color": "#e9eeec", "theme_color": "#16201d",
    "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
              {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}],
}

SW = """// Offline support: every app file is saved on the device when the app is installed or updated, and served
// from there (so it opens with no signal). A new version gets a new cache. Sign-in and sync calls to
// Supabase always go to the network. version.json is never cached, so the app can tell when an update exists.
const VERSION = 'chess-v__V__';
const CORE = __CORE__;
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
"""

BOOT = """<script>
// installed app: offline support + "new version" notice
(() => {
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  }
  fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(({ v }) => {
    if (v <= window.CHESS_APP_VERSION) return;
    const bar = document.createElement('div');
    bar.className = 'card update-bar';
    bar.innerHTML = '<span><strong>A new version is ready.</strong> <span class="small muted">Update to get the latest courses and fixes.</span></span><button class="btn primary">Update</button>';
    bar.querySelector('button').onclick = async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.update()));
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== 'chess-fonts').map(k => caches.delete(k)));
      } catch (e) { /* reload anyway */ }
      location.reload();
    };
    document.querySelector('main').prepend(bar);
  }).catch(() => { /* offline */ });
})();
</script>"""


def build_app(html):
    (APP / "vendor").mkdir(parents=True, exist_ok=True)
    cdn_chess = '<script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"></script>'
    cdn_cg = "from 'https://cdn.jsdelivr.net/npm/chessground@9.2.1/dist/chessground.min.js'"
    assert cdn_chess in html and cdn_cg in html, "library tags changed: update build_app"
    page = html.replace(cdn_chess, '<script src="vendor/chess.min.js"></script>\n<script src="vendor/supabase.js"></script>')
    page = page.replace(cdn_cg, "from './vendor/chessground.min.js'")
    title_end = page.index("</title>") + len("</title>")
    title, body = page[:title_end], page[title_end:]

    for f in VENDOR:
        shutil.copy(ROOT / "vendor" / "pwa" / f, APP / "vendor" / f)
    for f in ("icon-180.png", "icon-192.png", "icon-512.png"):
        shutil.copy(ROOT / "vendor" / "pwa" / "icons" / f, APP / f)
    for f in DATA_FILES:
        shutil.copy(DIST / f, APP / f)
    (APP / "manifest.webmanifest").write_text(json.dumps(MANIFEST, indent=1), encoding="utf-8")

    # the version only goes up when something the phone downloads has changed
    h = hashlib.sha256(page.encode("utf-8"))
    for f in sorted(DATA_FILES + [f"vendor/{v}" for v in VENDOR] + ["icon-192.png", "icon-512.png", "manifest.webmanifest"]):
        h.update((APP / f).read_bytes())
    digest = h.hexdigest()[:16]
    vfile = APP / "version.json"
    old = json.loads(vfile.read_text(encoding="utf-8")) if vfile.exists() else {"v": 0, "h": ""}
    v = old["v"] + 1 if old.get("h") != digest else old["v"]
    vfile.write_text(json.dumps({"v": v, "h": digest}), encoding="utf-8")

    head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            '<meta name="theme-color" content="#16201d">\n<link rel="manifest" href="manifest.webmanifest">\n'
            '<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-180.png">\n'
            + title + '\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}img{max-width:100%}</style>\n'
            f'<script>window.CHESS_SUPABASE = {json.dumps(SUPABASE)}; window.CHESS_LOCAL_ENGINE = "vendor/"; window.CHESS_APP_VERSION = {v};</script>\n'
            '</head>\n<body>\n')
    (APP / "index.html").write_text(head + body + "\n" + BOOT + "\n</body>\n</html>\n", encoding="utf-8")
    core = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"] + DATA_FILES + [f"vendor/{x}" for x in VENDOR]
    (APP / "sw.js").write_text(SW.replace("__V__", str(v)).replace("__CORE__", json.dumps(core)), encoding="utf-8")
    print(f"built app version {v}{' (unchanged)' if v == old['v'] else ''} in", APP)


if __name__ == "__main__":
    main()
