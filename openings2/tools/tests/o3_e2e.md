# R6 end-to-end test, rebuilt Openings tab (app v91 -> v92 after one fix)

How: `docs/` served with python http.server (port 8811), headless Edge driven over CDP (fresh profile), real Input.dispatchMouseEvent
clicks on the chessground board, Input.dispatchTouchEvent + mobile emulation (375x812) for the phone run, time travel with
localStorage `ct.o2now`. Not signed in (local mode). Scripts: `openings2/tools/tests/o3_e2e/cdp.js`, `lib2.js` (drivers). Screenshots: `openings2/tools/tests/o3_e2e/*.png`.
Course used for the flows: Caro-Kann (trunks `bd3`, `g4`, `ex-nf3`, `cl-main`; branch `short-main`).

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Old-style progress (`caro/<id>` in o2c/o2l/o2d, 60 cards due, 5 lines learned) is ignored | PASS | Openings home: 0/47, 0/42, 0/48 lines, "0 due"; Today "Opening reviews: Nothing due". o2t trap entry untouched, Traps / Model games / Your games / Stats / Today / Games / Train / Watch open, no undefined/NaN. 01_*.png, 09_*.png |
| 2 | Course screens (3) | PASS | Every chapter has a MAIN LINE badge on top (jobava 12, caro 7, slav 10; the rest are "mixed" chapters without trunk, as designed), branches indented, "leaves X at 4.Nf3" on every branch (29/28/36 = number of lines with a parent), locked lines show "Opens when ... has had its first review" + "Learn anyway", exactly one NEXT UP, = first start line (jobava e6-c6, caro bd3, slav dutch-main). 02_*.png |
| 3 | Learn a trunk with triggers (caro `bd3`, also `g4`, `ex-nf3`, `cl-main`, `panov-main` on phone) | PASS | Q1 wrong tap (c8): "Not c8: look here" with circled squares, no penalty; right tap passes straight to Q2; Q2 wrong choice shows "Not quite. The rule is ..."; right choice "Right, the rule is"; step 2 from memory; end card "Line learned - 12 new moves added". Progress keys `caro@3/<cardId>` (12) and `caro@3/bd3`; day points `3:2026-11-23`; old keys untouched. 03_*.png |
| 4 | Next day (ct.o2now +25h) | PASS | Today: "Opening reviews: Daily review: 12 due" (the 60 old cards not counted), "Start the session" opens the review. Trigger card on its first review: Q1 "What changed?" came BEFORE the move, once for the line (3 trigger nodes, only 1 question). Closed mid-way after 7 right: Today/Openings say 5 due and "7 reviews in the next 6 days"; finishing says "5 of 5 right"; all 12 cards box 2 (nothing lost or counted twice). Replay from move 1 with "Skip to the question". Daily cap 15 respected (Today = Openings home = course = 15). 04_*.png |
| 5 | Branch unlock + branch learn | PASS | After the trunk reached box 2 its branches turned from locked to "Learn"; a twin line shows "Opens when ... is solid - it looks a lot like it". `short-main`: shared start auto-played at ~270 ms/move, pause card "Same as 4.Bd3 ... until here. Now White plays 4.Nf3 instead of 4.Bd3." with mini board (parent position) and marked squares, then Q1/Q2 at the 3 trigger moves, from memory ("known moves played for you"), "Line learned - 9 new moves". 05_*.png |
| 6 | Twin move in review | PASS | In the `bd3` review the move 4...e6 (the `short-main` move) gave "e6 is not the course move / e6 is the move from another line", rule name + text, two mini boards "here -> 4...Bxd3 / there -> 4...e6 (Short system ...)" and the course move. 06_rulecard.png |
| 7 | Ideas tab, Rule book | PASS | All 3 courses: "Rule book" with rules, each case a mini board with arrow/circles + move + sentence (91/91/92 mini boards, all drawn), no horizontal overflow. 07_*.png |
| 8 | Phone 375x812 with touch taps | PASS after fix | Touch taps work for the board (Q1, moves), Q2 buttons, Continue/Start. No horizontal scroll on home, course, learn, Q1, Q2, "Don't mix it up", end card; action bar (691-752) above the nav. Found BUG 1 (below), fixed. 08_*.png |
| 9 | Console errors | PASS | Zero console errors, exceptions or error log entries in all runs (desktop and phone). |

## Bugs fixed
1. Phone, Q1 "What changed?": the caption "Tap the square where you should look" was hidden behind the fixed action bar (board used the full width, caption y 689-741 under the bar at 691), so the user saw only a "Show me" button. Fix in `openings2/ui/o2core.js` (`clueQuestion`): after showing the caption call `capFit([caption])` (the existing phone helper that shrinks the board a little). Verified: caption now y 631-683 above the bar, touch tap on the (smaller) board still works. CRLF kept (1576/1576). `o3_check.js` 79/79, rebuilt with `build.py --skip-drills` (v92). 08_phone_q1b.png (before), 08_phone_q1_after.png (after).

## Open / notes (nothing blocking)
- INFO Headless phone emulation: while the shrunk board is shown at Q1 `innerWidth` reads 378 vs 375 (no element is wider, `scrollX` cannot move); looks like an emulation scrollbar artefact, not seen on a real phone. Worth a glance on the real phone.
- INFO `replay_check.js`, `srs_check.js`, `lapse_check.js` fail on HEAD as well (they test the old v2 data; unchanged by this work). `o3_check.js` is the current suite.
- INFO Twin lock: a branch whose twin IS its parent only needs the parent in box 2 (as documented in o2core); the "is solid (box 3)" lock applies to other twins (seen once on caro).
- INFO Stray blank line after `capFit(...)` in `clueQuestion` (cosmetic).
- NOT TESTED by clicking: a missed card in review triggering Q1 again (covered by o3_check), Jobava/Slav lines end to end (only Caro was driven; their course screens, rule books and data checks were opened).
- Cleanup: Edge and http.server stopped; temp profile only held localStorage.
