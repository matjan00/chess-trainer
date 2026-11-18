# W2 (Watch tab) integration, for the lead

Files: `watch2/ui/w2core.js`, `w2.css`, `w2.html`, `dev.html` (test: serve repo root, open /watch2/ui/dev.html). All CRLF like the rest.
Player and progress tracking moved INTO W2 (the YouTube message listener, 30 s saves, 90% = watched, resume, playlist index).
Progress kind `vid` is unchanged (w, l, o, p, d, v, vi); one new optional field `k` (the key-idea line). No new KINDS: `W2.KINDS = ['vid']`, already in app KINDS.

## 1. build.py (copy of the O2/T2 pattern)
```python
W2_UI = ROOT / "watch2" / "ui"

def inline_w2(html):
    parts = {"/*W2_CSS*/": (W2_UI / "w2.css").read_text(encoding="utf-8"),
             "<!--W2_HTML-->": (W2_UI / "w2.html").read_text(encoding="utf-8"),
             "/*W2_JS*/": (W2_UI / "w2core.js").read_text(encoding="utf-8")}
    for k, v in parts.items():
        assert html.count(k) == 1, f"app.html must contain {k} exactly once"
        assert "</script" not in v.lower(), f"{k}: the inlined file must not contain </script>"
        html = html.replace(k, v)
    return html
```
Call `inline_w2` wherever `inline_t2` is called.

## 2. app.html placeholders
- CSS: add `/*W2_CSS*/` next to `/*T2_CSS*/`.
- Markup: replace the WHOLE old `<section class="view" id="view-watch">` body (h2, intro, `.w-filters`, `#w-body`) with `<section class="view" id="view-watch" hidden>` + `<!--W2_HTML-->` + `</section>`. DELETE the old `<div class="overlay" id="player">...</div>` (w2.html carries the new player `#w2-player`; W2.init moves it to `<body>`).
- JS: `/*W2_JS*/` next to `/*T2_JS*/`, BEFORE the old watch code location, and after `record/progress/store` exist.

## 3. Init (after T2.init; TUBE is already fetched)
```js
W2.init({ root: $('#w2'), data: { tube: TUBE }, hooks: { record, progress, store,
  needs: watchNeeds,                                   // keep watchNeeds() in app.html (uses GAMES/WINNING)
  courses: () => O2.courses(),
  courseGames: id => courseGames(id).length,
  goTrain: id => { show('train'); T2.show('course', id); },
  goOpenings: id => { show('openings'); O2.show('course', id); },
  agoWords,                                            // optional, existing helper (takes seconds)
  onChange: () => { if (!$('#view-today').hidden) renderToday(); } } });
```
Check T2.show('course', id) takes the Train course ids `convert think tactics endgames` (it does in t2core) and that `show()` is the app tab switcher.

## 4. Other app.html edits
- `show()`: `if (v === 'watch') renderWatch();` -> `W2.refresh();`
- `onProgressChanged`: `if (!$('#view-watch').hidden && $('#player').hidden) renderWatch();` -> `if (!$('#view-watch').hidden) W2.refresh();` (refresh skips while the player is open)
- Key handler ~l.1382: `if (!$('#player').hidden) return;` -> `if (W2.isOpen()) return;`
- Today: `renderTodayWatch();` -> `W2.renderToday($('#today-watch'));` (box id and `.today-watch` CSS stay in app.html; it shows Continue watching, else the new Watch next pick: up to 20 min, level 2, never a course/playlist). `W2.todayPick()` returns `{kind, id, v, need}` if you want the data instead.
- Debug object: add `W2` to `window.__ct`.

## 5. Delete from app.html
- CSS block "watch: chess videos Reddit recommends" (`.w-filters` ... `.player-acts a.btn`, incl. `.vc .vth .vlen .vkind .vbar .w-resume .vt .vm .w-chips .w-empty .shelf .shelf-h .vgrid`, `.player-*`). KEEP `.btn[aria-pressed="true"]` (used by others? w2.css re-declares it only inside the player) and `.today-watch*` rules; `.today-watch` needs `.w2-vth` thumbnails: w2.css supplies them. `.seg`, `.overlay`, `.eyebrow` stay.
- JS: the whole "watch" section: VIDS, VID_BY, KIND_NAME, `watch` object, fmtLen, lenWords, vidSeen/vidLater/vidWhen/vidUnfinished/vidHistory/vidResume, vidBar, vidStopped, vidScore, vidPick, vidCard, shelf, renderWatch, the `#w-kind/#w-hide/#w-body` handlers, openVideo, playerButtons, vidRecord, setVid, listenToPlayer, savePos, the youtube `message` listener, `#pl-*` handlers, closePlayer, the visibilitychange and Escape listeners, renderTodayWatch. KEEP `watchNeeds` and `TUBE`. If fmtLen/lenWords/agoWords are used elsewhere, keep them.
- `onProgressChanged` / `show` lines as in section 4.

## 6. Behaviour notes
- Watch next needs `lvl 2`, no playlist (len 0 playlists are "long"), 20 min max, not a course, first matching need in watchNeeds order.
- "Now practise" in the player: opening course (O2) if the video's `op` matches, else the Train course for its first topic (convert, thinking->think, tactics, endgame->endgames). Strategy-only videos get no button. Coming back to Watch is the normal tab tap (no auto return).
- New videos in data/tube.json need nothing. Optional new field `cnt` (playlist size) turns on "video 4 of 22" and the series bar.
- Store keys: `wlen2` (short/long/all), `whide2` (default true). Old `wkind`/`whide` are ignored.
