# Stats 2 (S2): integration notes for the lead

Files (all new, in `stats2/ui/`): `s2core.js` (the module, object `S2`), `s2.css`, `s2.html`, `dev.html` (test page, real data from `../../data`).
No fixtures needed. No build-step (Python) change: everything is worked out in the page from `analysis.json` plus `mine2.json`.

## 1. build.py
Add next to `inline_t2` (same pattern), and call `html = inline_s2(html)` where `inline_t2(html)` is called:

```python
S2_UI = ROOT / "stats2" / "ui"


def inline_s2(html):
    """The Stats tab (stats2/ui, stats2/PLAN.md) at three placeholders, like Openings and Train:
    s2.css at /*S2_CSS*/, s2.html at <!--S2_HTML-->, s2core.js at /*S2_JS*/ (inside the module script)."""
    parts = {"/*S2_CSS*/": (S2_UI / "s2.css").read_text(encoding="utf-8"),
             "<!--S2_HTML-->": (S2_UI / "s2.html").read_text(encoding="utf-8"),
             "/*S2_JS*/": (S2_UI / "s2core.js").read_text(encoding="utf-8")}
    for k, v in parts.items():
        assert html.count(k) == 1, f"app.html must contain {k} exactly once"
        assert "</script" not in v.lower(), f"{k}: the inlined file must not contain </script>"
        html = html.replace(k, v)
    return html
```
(If a service worker or docs copy lists source files for cache busting, add the three S2 files the way T2's are.)

## 2. app.html placeholders
- CSS: add `/*S2_CSS*/` on its own line right after `/*T2_CSS*/` (~l.471).
- HTML: replace the whole content of `<section class="view" id="view-report" hidden> ... </section>` (l.570 to the "Your openings" card ending ~l.601) with `<!--S2_HTML-->`. Keep the section tag and id (`show()` and the nav use it):
  `<section class="view" id="view-report" hidden><!--S2_HTML--></section>`
- JS: add `/*S2_JS*/` after `/*T2_JS*/` (~l.687), with a comment line like the others.

## 3. S2.init call (after T2.init, ~l.1966; replaces `renderReport(); renderCoachNotes();`)
```js
// Stats (S2): every button goes to another tab through these hooks
S2.init({ root: $('#s2'), data: { mine: MINE2 }, hooks: { games: GAMES, progress,
  goToday: () => show('today'),
  openCourse: id => { show('train'); T2.show('course', id); },                       // 'convert' (Win the won game), 'think' (Think first)
  practiseTheme: gid => { show('train'); const i = T2.groups().findIndex(g => g.id === gid); if (i >= 0) T2.startPuzzles(i); },
  canPractise: gid => !!T2.puzzles() && T2.groups().some(g => g.id === gid),
  playOut: id => { show('train'); const p = T2.mine()?.playById.get(id); if (p) T2.startPlayout(p, { mine: true, back: () => show('train') }); },
  openGame: url => openGameUrl(url),
  seeGames: ({ color, family }) => { filters.color = color || 'all'; filters.result = 'all'; filters.opening = family || 'all'; syncFilterUI(); renderList(); closeGame(); show('games'); },
  openingCourses: () => O2.courses().map(c => ({ id: c.id, title: c.title, side: c.side,
    games: O2.stats.analyse(c).games.map(x => ({ g: x.pg.g, devBy: x.dev ? x.dev.by : null, devPly: x.dev ? x.dev.ply : null })) })),
  studyCourse: id => { show('openings'); O2.show('course', id); },
  fixCourse: id => { store.set('o2tab.' + id, 'games'); show('openings'); O2.show('course', id); } } });
```
Check: `T2.startPlayout` is exported by the T2 api and `T2.mine().playById` exists (the core's `pplay` action uses it). If `T2.mine()` is null the "Play it out" buttons turn into "See game".
Redraw: S2 draws only when asked (nothing at startup; the old code replayed all plies at startup).
- In `show(v)`: add `if (v === 'report') S2.refresh();` next to the `today` and `watch` lines.
- In `onProgressChanged`: replace `if (!$('#view-report').hidden) renderCoachNotes();` with `if (!$('#view-report').hidden) S2.refresh();`.
- Boot line: `renderReport(); renderCoachNotes(); setupFilters(); ...` becomes `setupFilters(); renderList(); sync.start();`.
- Glossary (l.917): delete the old `'acpl'` row (S2.GLOSSARY has the renamed "Average mistake size (ACPL)") and merge S2's rows: `for (const row of [...O2.GLOSSARY, ...T2.GLOSSARY, ...S2.GLOSSARY])`. S2 adds `slip` (Serious slip) and `tense` (Tense moment). The old double full stop was in the removed Winning positions card text.
- KINDS: none. S2 stores nothing (no goal feature, per the decision).

## 4. Delete from app.html (Stats-only)
- `renderReport()` (l.982 to ~1068) including its `renderAcpl()` call and the `#op-white, #op-black` click handler.
- `renderAcpl()` (l.1071 to ~1133).
- `renderCoachNotes()` (l.1518 to ~1567) and the comment above it.
- KEEP: `myWhy`, `WINNING`, `WINNING_WON`, `courseGames`, `watchNeeds` (Watch and Today use them) and the GAMES enrichment (S2 uses `myWin`, `nb`, `nm`, `acc`, `acpl`, `family`, `plies[].cpl` when present and fills them itself otherwise).
- CSS used only by the old Stats (grep each before deleting; the game viewer still uses `.tp-row .tp-mv .tp-who .tp-list`, `.card.inner`, `.table-scroll`, `.chart`): `.notes`, `.notes ol/li/h4`, `.goodnews`, `.score-bar`, `.grid2`, and `.bars/.bar-row/.bar-track/.legend` if nothing else uses them.

## 5. train2/ui/t2stats.js removals (not done here)
In `T2.setScreen('stats', ...)` the template renders `${weakBlock(st)}${wonBlock(st)}${slowBlock(st)}${beforeAfter(st)}${trainingBlock()}`. Keep only `trainingBlock()` and add a short card linking to the Stats tab ("Your weak spots, won positions and clock now live in the Stats tab", button calling a hook such as `T2.hooks.openStats?.()` = `() => show('report')`). Remove: functions `weakBlock`, `wonBlock`, `slowBlock`, `beforeAfter` and helpers only they use (`trendOf`, `groupIdx`, `monthLabel`, `dayLabel` if unused), and the "Based on N of your games" sub line. The `themes` screen stays. Train home's weak-spots card ("All stats" button) can stay.
Note: the plan says Train Stats "loses ... beforeAfter (or shows a short card)". S2 does not reproduce "Before and after training"; decide whether to keep it in Train.

## 6. Things the lead should know
- Winning-position rule: S2 counts a game as having reached a winning position like mine2 and Train (win chance 85% or more before one of the moves; the final position alone does not count): 74 of 108. The app's old `WINNING` (Watch, Today) also counts the final position and gives 109. Optional: change `WINNING` to `Math.max(...g.myWin.slice(0, g.plies.length)) >= 85` so everything says 108.
- Verdict window: last 30 days if that window and the 30 days before each have at least 10 games, otherwise the last 15 games against the 15 before (needs 8); the card says which. With the current data (few games in Oct) it uses 15 games.
- Quick moves in tense moments are computed in the page from plies (`t`, `san`, `e`): tense = your opponent just gave check or their move changed the score by a pawn or more, not in the opening. No build-step change.
- Finding: in this data fast moves are NOT the problem. 31% of serious slips take under 5 s, but 53% of ordinary moves do; in tense moments moves under 5 s are a serious slip 8% of the time vs 14% for slower moves; median slip 7.4 s vs 4.5 s for other moves. The card is worded from these numbers (it only says "quick moves cost you" when fast is at least 1.25x slow) and is titled "Thinking time", not "Playing too fast".
- Openings block (F): calls `O2.stats.analyse` per course (replays games with chess.js; the old coach's notes already did this at startup). S2 draws it in a `setTimeout` after the rest is on screen.
- Quiet months (under 5 games) are grouped in one row "Other" (the plan said "Earlier"; here the quiet months are mid-year).
