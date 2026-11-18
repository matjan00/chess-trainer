"""Assemble the publishable app in dist/ (Claude artifact) and docs/ (installed app on GitHub Pages).

Usage:  python build.py [--skip-drills]
(--skip-drills is accepted for old scripts and does nothing: the "Fix my mistakes" drills are now Train cards from
 train2/tools/build_mine2.py, data/mine2.json.)
"""
import argparse, hashlib, json, shutil
from pathlib import Path

ROOT = Path(__file__).parent
DATA, DIST = ROOT / "data", ROOT / "dist"


O2_UI = ROOT / "openings2" / "ui"


def inline_o2(html):
    """The Openings tab (openings2/ui, BLUEPRINT section 6) goes into the page at three placeholders:
    o2.css at /*O2_CSS*/, o2.html at <!--O2_HTML-->, o2core.js + o2stats.js at /*O2_JS*/ (inside the module script)."""
    parts = {"/*O2_CSS*/": (O2_UI / "o2.css").read_text(encoding="utf-8"),
             "<!--O2_HTML-->": (O2_UI / "o2.html").read_text(encoding="utf-8"),
             "/*O2_JS*/": (O2_UI / "o2core.js").read_text(encoding="utf-8") + "\n" + (O2_UI / "o2stats.js").read_text(encoding="utf-8")}
    for k, v in parts.items():
        assert html.count(k) == 1, f"app.html must contain {k} exactly once"
        assert "</script" not in v.lower(), f"{k}: the inlined file must not contain </script>"
        html = html.replace(k, v)
    return html


T2_UI = ROOT / "train2" / "ui"


def inline_t2(html):
    """The Train tab (train2/ui, train2/BLUEPRINT.md section 7) at three placeholders, like the Openings tab:
    t2.css at /*T2_CSS*/, t2.html at <!--T2_HTML-->, t2core.js + t2play.js + t2stats.js at /*T2_JS*/ (inside the module script)."""
    parts = {"/*T2_CSS*/": (T2_UI / "t2.css").read_text(encoding="utf-8"),
             "<!--T2_HTML-->": (T2_UI / "t2.html").read_text(encoding="utf-8"),
             "/*T2_JS*/": "\n".join((T2_UI / f).read_text(encoding="utf-8") for f in ("t2core.js", "t2play.js", "t2stats.js"))}
    for k, v in parts.items():
        assert html.count(k) == 1, f"app.html must contain {k} exactly once"
        assert "</script" not in v.lower(), f"{k}: the inlined file must not contain </script>"
        html = html.replace(k, v)
    return html


S2_UI = ROOT / "stats2" / "ui"


def inline_s2(html):
    """The Stats tab (stats2/ui) at three placeholders, like Openings and Train:
    s2.css at /*S2_CSS*/, s2.html at <!--S2_HTML-->, s2core.js at /*S2_JS*/ (inside the module script)."""
    parts = {"/*S2_CSS*/": (S2_UI / "s2.css").read_text(encoding="utf-8"),
             "<!--S2_HTML-->": (S2_UI / "s2.html").read_text(encoding="utf-8"),
             "/*S2_JS*/": (S2_UI / "s2core.js").read_text(encoding="utf-8")}
    for k, v in parts.items():
        assert html.count(k) == 1, f"app.html must contain {k} exactly once"
        assert "</script" not in v.lower(), f"{k}: the inlined file must not contain </script>"
        html = html.replace(k, v)
    return html


G2_UI = ROOT / "games2" / "ui"


def inline_g2(html):
    """The Games tab (games2/ui) at three placeholders, like Openings and Train:
    g2.css at /*G2_CSS*/, g2.html at <!--G2_HTML-->, g2core.js at /*G2_JS*/ (inside the module script)."""
    parts = {"/*G2_CSS*/": (G2_UI / "g2.css").read_text(encoding="utf-8"),
             "<!--G2_HTML-->": (G2_UI / "g2.html").read_text(encoding="utf-8"),
             "/*G2_JS*/": (G2_UI / "g2core.js").read_text(encoding="utf-8")}
    for k, v in parts.items():
        assert html.count(k) == 1, f"app.html must contain {k} exactly once"
        assert "</script" not in v.lower(), f"{k}: the inlined file must not contain </script>"
        html = html.replace(k, v)
    return html


W2_UI = ROOT / "watch2" / "ui"


def inline_w2(html):
    """The Watch tab (watch2/ui) at three placeholders, like Openings and Train:
    w2.css at /*W2_CSS*/, w2.html at <!--W2_HTML-->, w2core.js at /*W2_JS*/ (inside the module script)."""
    parts = {"/*W2_CSS*/": (W2_UI / "w2.css").read_text(encoding="utf-8"),
             "<!--W2_HTML-->": (W2_UI / "w2.html").read_text(encoding="utf-8"),
             "/*W2_JS*/": (W2_UI / "w2core.js").read_text(encoding="utf-8")}
    for k, v in parts.items():
        assert html.count(k) == 1, f"app.html must contain {k} exactly once"
        assert "</script" not in v.lower(), f"{k}: the inlined file must not contain </script>"
        html = html.replace(k, v)
    return html


# data files the page fetches (besides analysis.json, which is slimmed below); a missing optional file is skipped
# (the page hides that part). train2.json: Train courses (train2/tools/compile_train2.py); puzzles2.json: verified
# puzzle pool (build_puzzles2.py); mine2.json: cards from your own games (build_mine2.py, nightly).
SHIPPED = ["courses2.json", "explorer.json", "tube.json", "train2.json", "puzzles2.json", "mine2.json"]
# files of the old Train pages (Tactics, Middlegame, Endgames, Fix my mistakes) that are no longer shipped: removed from
# dist/ and docs/ so the installed app does not keep serving them (the copies in data/ are left alone)
DROPPED = ["drills.json", "puzzles.json", "punish.json", "check.json", "convert.json", "technique.json", "endgames.json", "essentials.json"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-drills", action="store_true", help="accepted for old scripts; does nothing")
    ap.parse_args()
    games = json.loads((DATA / "analysis.json").read_text(encoding="utf-8"))

    DIST.mkdir(exist_ok=True)
    css = "\n".join((ROOT / "vendor" / f).read_text(encoding="utf-8") for f in ("chessground.base.css", "chessground.brown.css", "chessground.cburnett.css"))
    html = (ROOT / "app.html").read_text(encoding="utf-8").replace("/*CG_CSS*/", css)
    html = inline_o2(html)
    html = inline_t2(html)
    html = inline_s2(html)
    html = inline_g2(html)
    html = inline_w2(html)
    notes = ROOT / "notes.html"
    if notes.exists():
        html = html.replace("<!--NOTES-->", notes.read_text(encoding="utf-8"))
    (DIST / "index.html").write_text(html, encoding="utf-8")
    # local preview copy with the skeleton the artifact host would add
    (DIST / "preview.html").write_text('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + html + "</body></html>", encoding="utf-8")
    # the page doesn't need the per-move FEN strings (the Train cards carry their own)
    slim = [{**g, "plies": [{k: v for k, v in p.items() if k != "fen"} for p in g["plies"]]} for g in games]
    (DIST / "analysis.json").write_text(json.dumps(slim, separators=(",", ":")), encoding="utf-8")
    for f in SHIPPED:
        if (DATA / f).exists(): shutil.copy(DATA / f, DIST / f)
        else: print(f"note: data/{f} is missing; that part of the page stays hidden")
    for f in DROPPED:
        (DIST / f).unlink(missing_ok=True)
    shutil.copy(ROOT / "vendor" / "sf" / "stockfish.wasm", DIST / "stockfish.wasm")
    print("built", DIST / "index.html")
    build_app(html)


# ---------------------------------------------------------------------------------------------------
# The installable phone/laptop app (GitHub Pages, served from docs/). Same page as the Claude version,
# but it carries every library and the engine itself, so it also works offline, and it syncs progress
# through the Supabase table chess_progress instead of Claude's database.
APP = ROOT / "docs"
SUPABASE = {"url": "https://txhcnqwrdazgaxjwabln.supabase.co", "key": "sb_publishable_kNZA54ZHzYbJpL7yfqsA3w_vKejTXp3"}
DATA_FILES = ["analysis.json", "courses2.json", "explorer.json", "tube.json", "train2.json", "puzzles2.json", "mine2.json"]
VENDOR = ["chess.min.js", "chessground.min.js", "supabase.js", "stockfish.wasm.js", "stockfish.wasm", "stockfish.js"]
# fonts travel with the app (no Google Fonts request, so nothing waits for the internet on a plane)
FONTS = sorted(f.name for f in (ROOT / "vendor" / "pwa" / "fonts").iterdir())

MANIFEST = {
    # "id" gives the app a fixed identity, so Chrome installs it as a proper app (not a shortcut)
    "id": "/chess-trainer/app", "name": "Chess Trainer", "short_name": "Chess",
    "start_url": "./?source=app", "scope": "./", "display": "standalone", "display_override": ["standalone"],
    "orientation": "any", "background_color": "#e9eeec", "theme_color": "#16201d",
    "description": "Personal chess trainer: openings, tactics, endgames and winning technique from your own games.",
    "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
              {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
              {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
              {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
}

SW = """// Offline support: every app file is saved on the device when the app is installed or updated, and served
// from there (so it opens with no signal). A new version gets a new cache and only takes over once it is
// completely saved. Anything missing is fetched and saved the next time there is a connection, and the app
// asks for a check on every start ('warm'), so the offline copy repairs itself. Sign-in and sync calls to
// Supabase always go to the network. version.json is never cached, so the app can tell when an update exists.
const VERSION = 'chess-v__V__';
const CORE = __CORE__;
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
"""

BOOT = """<script>
// installed app: offline support + "new version" notice + an "Install app" button when Chrome allows installing
(() => {
  let deferred = null;
  window.__installable = false;
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e; window.__installable = true;
    if (matchMedia('(display-mode: standalone)').matches || document.getElementById('install-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'install-bar'; bar.className = 'card update-bar';
    bar.innerHTML = '<span><strong>Install Chess Trainer</strong> <span class="small muted">Opens from your home screen, full screen, and works offline.</span></span><button class="btn primary">Install app</button>';
    bar.querySelector('button').onclick = async () => { deferred.prompt(); const r = await deferred.userChoice; if (r.outcome === 'accepted') bar.remove(); };
    document.querySelector('main').prepend(bar);
  });
  addEventListener('appinstalled', () => document.getElementById('install-bar')?.remove());
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready)
      .then(reg => reg.active && reg.active.postMessage('warm')).catch(() => {});   // make sure the offline copy is complete
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  }
  fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(({ v }) => {
    if (v <= window.CHESS_APP_VERSION) return;
    const bar = document.createElement('div');
    bar.className = 'card update-bar';
    bar.innerHTML = '<span><strong>A new version is ready.</strong> <span class="small muted">Update to get the latest courses and fixes.</span></span><button class="btn primary">Update</button>';
    bar.querySelector('button').onclick = async () => {
      // the new version saves itself completely, then takes over (the page reloads on controllerchange);
      // the current offline copy is never deleted first, so the app keeps working offline throughout
      bar.querySelector('button').disabled = true;
      bar.querySelector('strong').textContent = 'Updating…';
      try { const reg = await navigator.serviceWorker.getRegistration(); await reg?.update(); } catch (e) { /* offline */ }
      setTimeout(() => location.reload(), 8000);   // fallback if no new version took over
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
    google = ['<link rel="preconnect" href="https://fonts.googleapis.com">\n', '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n']
    for g in google: page = page.replace(g, "")
    gcss = page[page.index('<link rel="stylesheet" href="https://fonts.googleapis.com'):]
    gcss = gcss[:gcss.index(">") + 1]
    page = page.replace(gcss, '<link rel="stylesheet" href="vendor/fonts/fonts.css">')
    assert "fonts.googleapis" not in page, "a Google Fonts link is left in the page" 
    title_end = page.index("</title>") + len("</title>")
    title, body = page[:title_end], page[title_end:]

    for f in VENDOR:
        shutil.copy(ROOT / "vendor" / "pwa" / f, APP / "vendor" / f)
    (APP / "vendor" / "fonts").mkdir(exist_ok=True)
    for f in FONTS:
        data = (ROOT / "vendor" / "pwa" / "fonts" / f).read_bytes()
        if f == "fonts.css": data = data.replace(b"url(fonts/", b"url(")   # css sits next to the font files
        (APP / "vendor" / "fonts" / f).write_bytes(data)
    for f in ("icon-180.png", "icon-192.png", "icon-512.png"):
        shutil.copy(ROOT / "vendor" / "pwa" / "icons" / f, APP / f)
    if not (DATA / "courses2.json").exists():   # no course compiled yet (openings2/tools/compile_courses2.py)
        (DATA / "courses2.json").write_text('{"v":2,"courses":[]}', encoding="utf-8"); shutil.copy(DATA / "courses2.json", DIST / "courses2.json")
    if not (DATA / "explorer.json").exists():   # the weekly Lichess job hasn't run yet
        (DATA / "explorer.json").write_text('{"stats":{},"courses":{}}', encoding="utf-8"); shutil.copy(DATA / "explorer.json", DIST / "explorer.json")
    for f in DROPPED:
        (APP / f).unlink(missing_ok=True)
    for f in [x for x in DATA_FILES if not (DIST / x).exists()]:   # optional Train data not built yet: the app hides that part
        DATA_FILES.remove(f)
    for f in DATA_FILES:
        shutil.copy(DIST / f, APP / f)
    (APP / "manifest.webmanifest").write_text(json.dumps(MANIFEST, indent=1), encoding="utf-8")

    # the version only goes up when something the phone downloads has changed
    h = hashlib.sha256((page + BOOT + SW + json.dumps(MANIFEST) + json.dumps(SUPABASE)).encode("utf-8"))   # everything that ends up on the phone
    for f in sorted(DATA_FILES + [f"vendor/{v}" for v in VENDOR] + [f"vendor/fonts/{x}" for x in FONTS] + ["icon-192.png", "icon-512.png", "manifest.webmanifest"]):
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
    core = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"] + DATA_FILES + [f"vendor/{x}" for x in VENDOR] + [f"vendor/fonts/{x}" for x in FONTS]
    (APP / "sw.js").write_text(SW.replace("__V__", str(v)).replace("__CORE__", json.dumps(core)), encoding="utf-8")
    print(f"built app version {v}{' (unchanged)' if v == old['v'] else ''} in", APP)


if __name__ == "__main__":
    main()
