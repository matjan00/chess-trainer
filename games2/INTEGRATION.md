# Games 2 (G2): how to put it into app.html

Module files: `games2/ui/g2core.js`, `g2.css`, `g2.html` (dev harness: `games2/ui/dev.html`, serve the repo root and open `/games2/ui/dev.html`).
Same pattern as O2 / T2: build.py inlines the three files at three placeholders. Line numbers below are for app.html at commit 6c9c8ab (v71).

## 1. build.py

Add after `inline_t2` (copy of it):

```python
G2_UI = ROOT / "games2" / "ui"


def inline_g2(html):
    """The Games tab (games2/ui, games2/PLAN.md) at three placeholders, like the Openings and Train tabs:
    g2.css at /*G2_CSS*/, g2.html at <!--G2_HTML-->, g2core.js at /*G2_JS*/ (inside the module script)."""
    parts = {"/*G2_CSS*/": (G2_UI / "g2.css").read_text(encoding="utf-8"),
             "<!--G2_HTML-->": (G2_UI / "g2.html").read_text(encoding="utf-8"),
             "/*G2_JS*/": (G2_UI / "g2core.js").read_text(encoding="utf-8")}
    for k, v in parts.items():
        assert html.count(k) == 1, f"app.html must contain {k} exactly once"
        assert "</script" not in v.lower(), f"{k}: the inlined file must not contain </script>"
        html = html.replace(k, v)
    return html
```

and in `main()` after `html = inline_t2(html)`: `html = inline_g2(html)`. No new data file (G2 reads `analysis.json` and `mine2.json`, already shipped).

## 2. app.html placeholders

- CSS: after line 471 `/*T2_CSS*/` add a line `/*G2_CSS*/`.
- HTML: replace the whole inside of `<section class="view" id="view-games" hidden>` (lines 606-649: `#games-list-wrap` and `#game-viewer`) with one line `<!--G2_HTML-->`, and change the comment above it to `<!-- GAMES: the G2 tab (games2/ui/g2.html, inlined by build.py) -->`.
- JS: after line 687 `/*T2_JS*/` add
  ```js
  /* ---------- the Games tab (G2): plain script inlined here by build.py (g2core.js) ---------- */
  /*G2_JS*/
  ```

## 3. KINDS and glossary

- Line 701: `const KINDS = [... 'vid', ...O2.KINDS, ...T2.KINDS, ...G2.KINDS];` (G2.KINDS = `['gr']`: game reviewed, id = chess.com game id, value `{d: 1|0}`). Add `gr: games reviewed (Games tab)` to the comment.
- Line 932: `for (const row of [...O2.GLOSSARY, ...T2.GLOSSARY, ...G2.GLOSSARY]) ...` (adds the term `keymoment`).

## 4. Old Games code to delete

CSS (all only used by the old Games tab; `.tp-row`/`.tp-list`, `.stats`, `.seg`, `select`, `.viewer`, `.board*`, `.evalbar`, `.actionbar`, `.player`, `.controls`, `.pill`, `.dot` stay, other tabs use them):
- lines 108-115: `.game-report` … `.q-best … .q-blunder` (report boxes, `.gr-top`, `.big-n`, `.gr-table`, `.qdot`, `.q-*`).
- line 121: drop `.gr-top { grid-template-columns: repeat(2, 1fr); }` from that media query (keep the `.tp-row` parts).
- lines 156-157: `.marks`, `.marks .b/.m`.
- line 160: `.filters { … }` (not `.w-filters`).
- lines 201-217: `.game-head`, `.game-head a`, `.comment*`, `.tag`, `.movelist*`, `.lb.*`, `.evalgraph` (g2.css carries its own copies of `.comment` / `.movelist` / `.lb`, scoped to `.g2`).

JS:
- lines 1141-1171: "games list" (`filters`, `syncFilterUI`, `setupFilters`, `renderList`, `#games-body` click) and `let gameCg = null, cur = null, ply = 0, flipped = false;` and `toDests`.
- **keep** `prepGame` (lines 1172-1184): passed to G2 as a hook (and `analysePosition` uses it).
- lines 1185-1379: `openGame`, `closeGame`, `#back-to-list`, `renderGameReport`, `renderMoveList`, `drawEvalGraph`, `goto`, `renderComment`, explore (`explore`, `exploreGen`, `exploreLineText`, `exploreComment`, `exploreBoard`, `startExplore`, `endExplore`, `onExploreMove`, `#b-explore`) and the `#b-*` button handlers.
- In the keydown handler (1380-1393) delete the last three lines (1390-1392: `if ($('#view-games').hidden || !cur …` and the two ArrowLeft/ArrowRight lines). G2 handles ← → itself; its letter shortcuts (S show me, N next moment, M next mistake) use the existing `data-key` mechanism.
- Line 1394 becomes `window.addEventListener('resize', () => { boards().forEach(cg => visibleBoard(cg) && cg.redrawAll()); });` (G2 sizes its own eval bar).
- `evalWords` (line 881) is then unused; it may stay or go.

## 5. Calls that change

- Line 949: `const boards = () => [G2.cg].filter(Boolean);`
- Line 968: `if (v === 'games') G2.refresh();   // its board was hidden: redraw, put the arrows back`
- Line 975: `if (t === 'games' && !$('#view-games').hidden) G2.show('list');`
- Lines 1065-1066 (Stats → "Your openings" row): `G2.filter({ color: tr.dataset.color, opening: tr.dataset.fam }); show('games');`
- Line 1138 (Stats ACPL "cleanest / messiest"): `if (g) { show('games'); G2.open(g); }`
- Line 1717 (Today "Open the game"): `if (b.dataset.lg === 'open') { show('games'); G2.open(g); }`
- `openGameUrl` (1948-1952): `show('games'); G2.open(g);` instead of `openGame(g)`.
- `analysePosition` (1960): `if (k >= 0) { show('games'); G2.open(g, { ply: k, explore: true }); return; }`
- `onProgressChanged` (1928-1934): add `if (!$('#view-games').hidden) G2.refresh();`
- Line 1967: `renderReport(); renderCoachNotes(); sync.start();` (`setupFilters(); renderList();` are gone; G2.init renders the list).
- Line 1971 (`window.__ct`): `get game() { return G2.cg; }, G2` instead of `gameCg` / `explore`.

Always call `show('games')` **before** `G2.open(...)` (arrows need a visible board; `G2.refresh()` in `show` puts them back anyway).

## 6. G2.init (after T2.init, before `renderReport()` at line 1967)

```js
// Games (G2): "you left your course" for one game (the same rule as Today's bookAlerts, any date)
function bookDev(g) {
  if (!O2.stats) return null;
  for (const c of O2.courses()) {
    const x = O2.stats.analyse(c).games.find(x => x.pg.g === g || x.pg.g?.url === g.url);
    if (x && x.dev && x.dev.by === 'me' && !x.dev.fine) return { id: c.id, title: c.title, ply: x.dev.ply, san: x.dev.san, courseSans: x.dev.courseSans };
  }
  return null;
}
G2.init({ root: $('#g2'), data: { games: GAMES }, hooks: { Chessground, record, progress, store, sfx, engine,
  prepGame, standWords, openingName, fmtDate, evalText,
  mine: () => T2.mine(),                                                        // mine2.json "fix" cards
  practise: (id, back) => { show('train'); T2.startOne(id, () => { T2.show('home'); show('games'); back(); }); },
  practised: id => !!T2.srs.get(id),
  bookDev,
  openCourse: id => { store.set('o2tab.' + id, 'games'); show('openings'); O2.show('course', id); },
  onChange: () => { if (!$('#view-today').hidden) renderToday(); } } });
```

## 7. Optional (not needed for the tab to work)

- PLAN G4/G7 "shared facts": Today's "Since your last game" (`renderLastGame`) can use `G2.facts(g)` (key moments, `threw`, `fast`, …), `G2.headline(g)` for the one-sentence summary, and `G2.gameOfWeek()` ("Your most expensive game this week"). Left to the lead; Today works unchanged.
- PLAN G6 second bullet (Stats: time per move in winning positions) is not built.

## 8. Check after integrating

`python build.py`, open dist/preview.html: Games list (Next to review card, chips, filters), open a game (Review: make a move or "Show me", Next moment, Finish → "Review done", tick in the list), Whole game (graph tap, ← →, Next mistake, Numbers, Try your own move), "Practise this" → Train card → back in Games, Stats "Your openings" row → filtered list, Train card "Analyse" → Whole game with Try your own move. Test at 375 px.
