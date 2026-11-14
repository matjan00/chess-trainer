# T9 end-to-end test, Openings tab (built app v61, docs/, localhost:8799)

Script: openings2/tools/tests/e2e_check.js (node openings2/tools/tests/e2e_check.js)

## 1. Script check
- [x] PASS jobava: 47 lines, 889 plies, 468 own-move nodes, 325 cards, 714 nodes, 7 traps, 0 models: all legal, every own-move node has a card, all line/trap refs resolve
- [x] PASS caro: 42 lines, 944 plies, 472 own moves, 338 cards, 683 nodes, 3 traps, 2 models: all legal
- [x] PASS slav: 48 lines, 900 plies, 450 own moves, 272 cards, 549 nodes, 0 traps, 0 models: all legal
- Note: slav has no traps/models, jobava has no models (UI shows a friendly empty state, OK)

## 2. Browser flow (real board clicks)
- [x] Openings home lists 3 courses (Jobava W, Caro B, Slav B), Start-here banner, recent games strip
- [x] Learn one line per course (jobava c5-main, caro short-main, slav dutch-main): walk-through, plan cards + Continue, from-memory step, summary card "12 new moves added"
- [x] Wrong move in learn/from-memory: rejected, comment+arrow shown, line repeated ("Once more: 1 move to fix"), no scheduling penalty
- [x] After learning: 12 cards per course at L1, due = now+24h, o2l done, o2d new=36; 0 due today
- [x] Time travel (localStorage ct.o2now +1 day): 36 due, home banner "36 moves to review", Today task "Daily review: 36 due", Today Start opens the daily review
- [x] Wrong answer: lv1, due +1 day, w=1, streak 0, card returns at end of session
- [x] Correct: lv2, due +3 d. Hint: level stays, due +1 d. Alternative move (e4 vs d4): "good move too", no penalty
- [x] Review queue count 36 -> 33 after 3 cards
- [ ] NOT DONE: finishing all 33 cards through clicks and the end-of-session summary / Today task completion
- [x] Course tabs Learn/Review/Ideas/Traps/Model games/Your games/Stats render for all 3 courses, no "undefined"/NaN; empty states for slav traps/models and jobava models; a trap opens with a board; a Caro model game opens and steps

## 3. Layout
- [x] 375x812: no horizontal page scroll on home, all 7 course tabs, trainer; board 343px; action bar (y691-752) sits above the nav (753+), comment card scrollable clear of the bar (long plan card ended at 630 < 691). Tab row overflows by design (scrolls inside)
- [x] 1280: board left (560px), panel right, bar under the board, scrollWidth ok
- Screenshots used: 2

## 4. Console / sync
- [x] No console errors, no window errors or unhandled rejections during the session
- [x] progress record has o2c o2l o2g o2t o2m o2d; app KINDS spreads O2.KINDS (docs/index.html line 2947), sync/count code iterates KINDS. App was not signed in: nothing was synced. (o2g/o2t/o2m not exercised: 0 entries)

## 5. Other tabs
- [x] Today, Games, Openings, Train, Watch, Stats open, no errors, no horizontal scroll

## Bugs / notes
1. LOW  o2core.js (feedback/toast): stale feedback text persists in the DOM: after the "e4 is a good move too" message on card 1, the same text was still inside the live region on card 2 (innerText); also the toast text "The circled piece moves." stays in the view text on other screens. Not visibly harmful in screenshots.
2. LOW  "Start with / Learn next" proposals: Jobava starts with the 4...cxd4 line (chapter 3...c5) rather than the first chapter's first line; confirm intended ordering ("P1 lines first").
3. INFO Today tab header uses the real date while the Openings clock honours ct.o2now (expected when time-travelling).
4. INFO Slav has 0 traps and 0 models; Jobava 0 models.
Cleanup: ct.o2* keys removed, o2 kinds emptied in ct.progress (localhost origin only).
