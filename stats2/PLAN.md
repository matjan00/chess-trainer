# Stats tab rebuild ("stats2") - plan only, nothing built yet

Reviewed 2026-11-18. Files read: app.html (view-report ~l.571-600, renderReport l.982, renderAcpl l.1071, renderCoachNotes l.1518,
watchNeeds l.1755, GLOSSARY l.916), train2/ui/t2stats.js, openings2/ui/o2stats.js (header), data/games.json, analysis.json, mine2.json.
The tab's internal id is `view-report`; the nav label is "Stats".

## 1. What it shows today and what is wrong

Top to bottom (renderReport, then renderAcpl, then renderCoachNotes): 5 headline numbers (rating, score, opponents, accuracy, blunders/game) ->
Coach's notes (up to 4 "going well" + up to 6 "work on") -> 6 cards (Rating line, Phase, Kinds of mistake, Clock, Winning positions, Accuracy by result) ->
a big ACPL card (5 numbers, a dot chart, then 9 more mini-cards) -> two opening tables (As White / As Black). About 22 blocks on one long scroll.

Real data available: 176 rapid games (168 at 10 min, 8 at 15+10), Dec 2025 - Nov 2026. Per move: san, eval, best move, phase, loss, label
(inaccuracy/mistake/blunder), "why" tags, think time `t`, clock `clk`, fen. mine2.json "stats" already has tags (per10, last30 vs prev30, Train group),
months (games, mist, blun, fast share, wonReached/wonKept, tags), clock (31% of mistakes under 5 s; bad move 7.4 s vs 4.5 s), and won (108 reached, 74 kept, 34 thrown list).

Problems:
- **Too many numbers, no verdict.** "Am I improving?" is never answered. The rating line spans all 176 games with no months. The headline measure
  (ACPL, "centipawns") is jargon. Accuracy by result, ACPL by result / colour / opponent rating, "how big your slips are", "cleanest and messiest" are
  curiosities, not decisions.
- **Duplicates inside the tab.** Phase appears 3 times (rep-phase, ACPL "By phase", "Early game or late game?"). Clock appears 3 times (rep-clock, "How much
  time you had", "How fast you moved"). Accuracy and ACPL both appear by result.
- **Duplicates with other tabs.** Train has its own Stats screen (t2stats.js: weakBlock, wonBlock with month bars, slowBlock, beforeAfter, trainingBlock).
  Openings has its own Statistics and "Your games vs the course" (o2stats.js). Today and Watch re-derive the same "what you need" list (coach's notes,
  watchNeeds). "Won positions" is shown in 3 places with different wording.
- **Numbers that disagree.** Kinds-of-mistakes counts "threw away win" as 91 move events, while the won-position count is by game (108 reached, 74 kept,
  34 thrown). Nobody can tell 91 from 34. The coach's notes compute "slipAt" and the win count in app.html; Train uses mine2 `won.thrown`. Two code paths.
- **Does not lead to action.** Only the coach's notes mention Train, as plain text ("Train -> Win the won game"), no button. The cards are dead ends.
  Opening rows jump to the Games list, not to the Openings course.
- **Stale or confusing.** Glossary text for winchance ends with a double full stop. "Opening" phase is first 12 moves in one card and moves 1-10 in another.
  Games are bursty: Dec 15, Jan 37, Feb 30, Mar 36, Apr 20, then May-Oct only 19, Nov 19. Month views must handle thin months.
  Everything (about 15 passes over all plies) renders at startup (l.1967).
- **No goals and no "since last time".**

## 2. Goal
Stats answers two questions: **"Am I getting better?"** and **"What should I train next?"** - and every answer has a button.

## 3. Proposed structure (7 sections, in priority order)

**A. Verdict header ("Your last 30 days").** One generated sentence + 3 tiles, each with an arrow vs the period before (or "not enough games yet").
Tiles: Rating (now, change), Serious slips per game (blunders + mistakes), Winning positions kept (e.g. 9 of 12). Sentence example: "Better than before:
3 fewer serious slips per game. Still weak: winning positions." Window: last 30 days if >= 10 games, else last 15 games (label says which).
Under it 1-2 lines of "Good news" (rating up, no time losses, punished opponent blunders) taken from today's "What's going well".
Source: games.json + mine2.stats.months. Button: "Start the session" (goes to Today). Size: small.

**B. Progress by month.** One compact table with mini-bars, one row per month with >= 5 games (quiet months merged into one "Earlier" row):
games, rating at month end, serious slips per game, winning positions kept (x of y), fast mistakes %. Replaces the Rating card, the ACPL trend,
and the month bars hidden in Train Stats. Source: mine2.stats.months has most of it; add endRating (and optional acpl) in the stats build. Size: small-medium.

**C. Won positions thrown away (the main weakness).** Big "74 of 108 kept (69%)", month trend, the last 5 thrown games (opponent, date, move number, result)
each with "Play it out" (T2 plays `cv/<gid>-...` exist), and one primary button "Win the won game" (Train course `convert`). One line: "It usually goes wrong around move N".
Source: mine2.stats.won (+ plays). Becomes the only place for this stat; Train's wonBlock links here. Size: small.

**D. Playing too fast.** Two plain facts: "31% of your mistakes took under 5 seconds" (mine2 clock.fastShare, monthly trend in months[].fast) and "your mistakes take
7.4 s, normal moves 4.5 s". Add the useful missing number: **quick moves in tense moments** = moves under 5 s when the position was sharp (eval swing >= 1 pawn
around it, or a capture/check on the board). Fields t, clk, loss, e, fen exist per ply so no new Stockfish run. Button: "Practise Think first" (Train course `think`).
Replaces the Clock card and 2 ACPL clock cells. Size: medium (needs a clear one-line definition).

**E. What your mistakes are (kinds and phase merged).** One ranked list of the top 5 causes: plain name, per-10-games count with a trend arrow (mine2 tags: per10,
last30 vs prev30), the phase where it mostly happens, and a "Practise" button to the matching Train theme (groups already mapped: hanging, fork, defend, removal,
backrank, mate1). "Threw away win" is removed from this list (it lives in C) so it is not counted twice. Replaces rep-types, rep-phase, 3 ACPL phase cells,
and Train Stats' weakBlock (Train home keeps a "See all stats" link). Source: mine2.stats.tags; add per-tag phase split in the build. Size: small-medium.

**F. Openings: results vs your courses.** Up to 4 rows: Jobava, Caro-Kann, Slav, Other. Each: games, score %, winning chance after 10 moves, how early you
leave the book (O2.stats.analyse already computes this; courseStat() in renderCoachNotes does a version), and buttons "Study this course" / "Fix lines from your games"
(O2.show). The two full opening tables move under "All openings" (collapsed; rows still open the Games list). Size: small (wiring).

**G. More numbers (collapsed).** For the curious: ACPL renamed "Average mistake size" with its 10-game average chart, accuracy, by colour, by opponent rating,
cleanest and messiest games. Moved, not rewritten. Size: small.

Optional goal line in A: "Aim: keep 3 of every 4 winning positions - now 69%." (see questions).

## 4. Remove or merge
- Coach's notes: removed as a block. Its logic is split into A (verdict + good news) and C/D/E (each with a button). Keep helpers `myWhy`, `WINNING`, `WINNING_WON`
  because Watch and Today use them.
- Removed outright: accuracy by result, ACPL by result / colour / opponent rating / slip size / move block / how-fast-you-moved (kept ones go to G), duplicate
  phase and clock cards, the five old tiles ("opponents' average rating" is dropped).
- Merge across tabs: Train Stats loses weakBlock, wonBlock, slowBlock, beforeAfter (or shows a short card linking here). It keeps its own Training block
  (puzzle rating, cards by level). Opening-by-course details stay in Openings.
- One counting rule everywhere: winning position = win chance >= 85% (mine2 won.reached); serious slip = blunder or mistake.

## 5. Code and data touched
| Item | Files | Size |
|---|---|---|
| New renderStats2 (A-G) replacing renderReport, renderAcpl, renderCoachNotes; inlined by build.py like T2/O2 if put in stats2/ui/s2.js | app.html, build.py | medium-large |
| Month rows add endRating (+acpl), per-tag phase split | stats part of mine2 build (t2stats.py / update.py), mine2.json "stats" | small-medium |
| Tense-moment fast-move count for D | same build step reading analysis.json plies | medium |
| Period-compare helper + verdict sentence | new JS | small |
| Buttons into Train theme / course / playwin and O2 course | existing T2 data-act hooks, O2.show | small |
| Remove duplicates in Train Stats | train2/ui/t2stats.js | small |
| Glossary: rename ACPL, fix the double full stop, add "serious slip" | app.html GLOSSARY | small |
| Progress kinds | none needed; optional `st2g` for a chosen goal, synced like other kinds | small |
| Dev page with the 176-game data for checking | stats2/dev.html | small |
Build: `python build.py` after code, data refresh via update.bat. No new Stockfish passes.

## 6. Open questions (recommended answer first)
1. Open on one verdict sentence plus 3 tiles, rest below? **Yes.**
2. Compare "last 30 days" or "last 20 games"? **Last 30 days if >= 10 games, else last 15 games, labelled** (play is bursty: 19 games in Nov, 3 in Oct).
3. Add one goal (e.g. keep 3 of 4 winning positions)? **Yes, one goal, app suggests it, you can change it.**
4. Keep ACPL and accuracy? **Yes, hidden under "More numbers" with a plain-English name.**
5. Should Train's Stats screen lose its weak spots / won / slow blocks and link here? **Yes: one place per stat; Train keeps only training progress.**
6. Opening rows: open your Games list (today) or the Openings course? **Course, plus a small "See games" link.**
7. Weekly summary or monthly only? **Monthly only**; weeks hold about 6 games, too noisy.

## Decisions (user, 2026-11-18)
Plan approved. All open questions: the recommended answer, EXCEPT question 3: no goal. Do not build any goal feature.
