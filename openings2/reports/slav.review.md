# slav — lead review (T4), 2026-11-14

**Status: quality signed off; two lines to add (small worker job), then final.** 45 lines (incl. the new signpost), 252 cards, 0 FAIL / 40 WARN. Lines read: dutch-main, krause, e4-quiet, nc3-a6-b3, london-main, reti, english — moves, comments and plan notes are good. Depth-25 re-check of every own move in krause, e4-quiet, e4-a4-e5, torre plus a random sample: nothing above 12 cp except Torre 5...cxd4 (20 cp).

## Decisions
- **Torre 5...cxd4** (20 cp behind 5...Qb6): approved; it keeps the simple ...Nc6/...Bf5 plan.
- W-decisions rebuilt from the cache: approved (dutch-main 9...Bg6 10.Nh4 Bh5; krause 8...a5; london-main 8...Be7; reti via 3.e3).
- No model games: accepted (phase 2). No `## TRAPS` section: accepted — the skeleton's "avoid" traps are all present as X-notes (5...b5?, 6...a6?, 4...Bf5?! Qb3, ...b6?, 8...e6 in the Krause) and three punish lines.
- **Rule change:** common-ok share threshold lowered from 15% to **10%** (BLUEPRINT §1.2, verify_course.py). 4.Bg5 and 4.Bf4 now qualify for lines.
- **Skips (67):** almost all are deep side branches with an engine-checked answer or transpositions. Two hide moves he will really meet — see the fix list.

## Edits made by the lead
- New signpost line **nc3-nf3** (1.d4 d5 2.c4 c6 3.Nc3 Nf6 4.Nf3 dxc4 => dutch-main): this is the most common move order at 1200-1600 (37% after 3.Nc3 Nf6) and was only a `skip:`.
- Tools: engine time cap + 1-thread retry (`O2_MAXTIME`), signpost lines exempt from the Q9 fail.

## Fix list for a worker (Opus, about an hour)
1. **bg5** — 1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Bg5?! (10%) dxc4. Use the already-checked moves from slav.decisions.md (5.e3 b5 6.a4 h6 7.Bh4 e6 8.Nc3 Bb4 9.Bxf6 Qxf6 10.Ne5 Bb7 11.Be2 Qe7), write comments and plan notes, flag 4.Bg5 `?!` ("lets you take on c4 and keep the pawn"). Keep the existing skip advice for 5.Bxf6 / 5.Nc3 as `skip:` entries one ply deeper, or as a second short line if 5.Bxf6 exf6 (85% of games) passes — preferred.
2. **nc3-bf4** — 1.d4 d5 2.c4 c6 3.Nc3 Nf6 4.Bf4?! (10%, and one of his own games) dxc4, then the most frequent sound White move (5.e3 or 5.e4 or 5.a4), holding the pawn with ...b5. One line, 8-10 moves.
3. Remove the `skip:` entries these lines replace; re-run `verify_course.py slav --coverage` (0 FAIL).

## Note for the UI owner (not a course issue)
"Left the course" detection must treat a move as a course move when the **position after it** is a course position (posKey), not only when the move is listed from the current position. Otherwise every move-order transposition (3.Nc3 Nf6 4.Nf3 here, 1.d4 e6 2.Nc3 d5 in the Jobava) is reported as the opponent leaving the course. `game_probe.py` has the same blind spot.
