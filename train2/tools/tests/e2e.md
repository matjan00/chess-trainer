# T10/T11 end-to-end test, Train tab (built app v64, docs/, localhost:8799)

Script: train2/tools/tests/e2e_check.js (node train2/tools/tests/e2e_check.js)
Method note: the browser pane was often hidden, so chessground DOM only repainted after a tiny zoom screenshot; screenshots were replaced by JS measurements (rects, scrollWidth).

## 1. Script check
- [x] PASS train2.json: 4 courses, 23 chapters, 56 lessons, 388 steps, 98 examples (550 moves legal, SAN matches), 189 cards (all solutions, ok/also/wrong/slow moves legal, side to move consistent), 30 judges (mv + refute legal), 27 play-outs (start FEN legal, not game over)
- [x] PASS ids unique per course; all chapter->lesson, step->card/judge/play refs resolve; no orphan lessons; no unreferenced cards/judges/plays; all 17 set steps resolve into puzzles2 ids
- [x] PASS puzzles2.json: 11793 puzzles, ids unique, every move sequence legal, `alt` moves legal, 16 groups all referenced validly
- [x] PASS mine2.json: 331 cards (all sol legal), 609 judges, 154 plays; ids unique across all three lists; group refs valid
- Note: endgames oppwin-p / oppdraw-p start with the engine to move (side differs from turn): intended (engineFirst).

## 2. Browser flow (real clicks on the board)
- [x] Train home: banner, 4 course cards, quick starts, weak spots, rating 1378
- [x] Tactics (loose): learn with key moves, wrong try -> "NOT NE4" + arrow, right -> continue; practise cards; "Show me" requires playing the arrow move
- [ ] PARTIAL Tactics practise not finished (11 positions: 5 cards + own-game cards): left midway, only t2l st:1. Re-entering Practise restarts at 1 of 11 although the header said "6 OF 11" (BUG 3)
- [x] Endgames (qmate): learn, 3 cards (one missed -> "comes back at end of session", served again "once more"), cards enter L1 due +24h exactly when practise finishes, t2l st:2, Test screen
- [x] Think (check3): learn, 4 judgements; safe/blunder + punishment on board; wrong judgement -> t2k ok:0 due +3 d; right -> ok:1 no due
- [x] Convert (stillgame): learn, 2 judgements, own-game card first try right -> L2 due +3 d, "Open the game" shown (rest of practise not finished)
- [x] Puzzles mixed: clean solve -> t2p id, rating +15, no card; missed (wrong move, retry right) -> "MISSED", card pz/ at L1 due exactly +24 h, rating -17
- [x] Play-out (endgames qmate, Qe4+ blunder): "The win slipped away after Qe4+", 50%, "Take back and try again" works
- [x] Play-out from own games (Play out a win, Rd6 blunder): win slipped (25%), Leave -> t2x fail, due +3 d
- [x] Today tab: block list, ticks, "Today you did" summary; after +1 day banner "7 reviews · 10 puzzles · 5 Think-first · about 15 min" (3 lesson cards + 1 puzzle + 3 new own-game cards), course card "3 due"
- [x] Daily session opens as 3-step bar (Reviews 1 of 7 / 10 new puzzles / 5 Think-first)
- [x] Time travel (ct.t2now +25 h): puzzle card right -> L2 due +3.00 d; lesson card wrong (stalemate move shows targeted "wrong" text) -> L1 due +1.00 d, w=1, returns at end of session
- [x] Stats: weak spots (8 rows), won positions by month + thrown list, slow-down 31%, before/after ("needs 20 more games"), training, cards by level; no NaN/undefined
- [x] Themes grid: 16 themes with description, his-games line, unseen counts; tap Forks opens a stream
- [x] My mistakes (own-game cards): opens with source chip "Your game vs ..., 13 Nov"
- [ ] NOT DONE: finishing a whole daily session to the end summary; "What is the threat?" variant; Retire (L4) path; 20-puzzle Tactics set

## 3. Console / NaN arrows
- [x] REPRODUCED the NaN arrow error: cause below (BUG 1). 4 errors per arrow; the earlier 8 = two arrows drawn while the pane was 0x0 (hidden Browser pane at load: first load had innerWidth 0).
- [x] No console errors during normal use at 1024, 1280, 375 widths, rapid tab switching, resize events, Today<->Train switching during a lesson.

## 4. Layout
- [x] 375x812: scrollWidth 375 on home, stats, themes, course, lesson; board 343px; action bar y691-752, feedback card ends 692, nav from 753, last course button ends 682; smallest text 9px = board coordinates only
- [x] 1280x800: board 560 left, panel right, action bar under board (y759-796), no horizontal scroll (1265 + scrollbar)

## 5. Other tabs
- [x] Today, Games, Openings, Train, Watch, Stats all render, no NaN/undefined, no horizontal scroll, no console errors

## 6. T11 sweep
- [x] Sizes: train2.json 251 KB, puzzles2.json 2.30 MB (blueprint said ~1.5 MB: fine), mine2.json 431 KB, index.html 471 KB; all three in sw.js; version.json v64 matches CHESS_APP_VERSION
- [x] No dead ids (see 1); no "undefined/NaN/TODO", double spaces or common typos in train2.json
- [x] Cleanup: localStorage cleared (localhost:8799 only); not signed in, nothing synced

## Bugs
1. MEDIUM train2/ui/t2core.js `draw()` (line ~802): passes P.shapes as autoShapes to chessground even when #t2board is hidden (0x0): Chessground renders arrow lines with NaN coordinates -> 4 console errors per arrow ("<line> attribute x1: Expected length, "NaN""). Repro: open a lesson/card with an arrow (e.g. Tactics lesson Practise, press "Show me" = arrow), hide the Train view (display:none, or a hidden/0x0 Browser pane / app loaded in background) and trigger draw(). Cosmetic (no visible break) but noisy. Fix: in draw() use autoShapes [] when the board has zero width, redraw on show/resize.
2. LOW t2core play-out (`playResult` path, core line ~1413-1416) + t2play.js "Give up": Give up (and slip then Give up in lesson play-outs) returns {aborted:true}, so nothing is recorded in t2x and the lesson still shows "LESSON FINISHED". Spec says a failed lesson play-out comes back in 3 d. (Own-game play-outs: Leave after a slip does record the fail.)
3. LOW Tactics lesson Practise: leaving at position 6 of 11 and re-entering restarts at 1 (intro says "6 OF 11"); t2l.n stayed 0.
4. LOW Stats says "Based on 176 games" while course texts say "175 analysed games".
5. LOW Puzzle source chip shows only the first group ("Pins") inside the Forks theme stream.
6. INFO Lesson judgements count toward the daily "5 Think-first" block (6 done after a 4-judge lesson + 2), so the block tick may appear without daily practice.
7. INFO One em dash in train2.json: convert lesson title "Take what is free — after a check for the catch" (3 more in t2 UI code comments/strings); change if house style forbids.
8. INFO Hidden-pane testing: chessground DOM updates need a repaint; not an app bug.
