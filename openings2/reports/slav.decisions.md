# slav — worker decisions (T2c), 2026-11-14

Result: `verify_course.py slav --coverage` → **0 FAIL, 42 WARN** (report: `reports/slav.verify.txt`).
48 lines in all (after the lead review: + signpost nc3-nf3, + bg5, bg5-bxf6, nc3-bf4): 44 main/side lines plus 4 punish items (pin-e4, bdg-qxf3 and ne4 are `punish`; e4-a4-e5 is a `side` line with a `?!` move). 272 cards. 68 `skip:` entries. No traps, no model games.
**No `!sys` moves.** Worst own-move loss: 27 cp (reti 2...c6, the system move; see the WARN answers). Every other own move loses 25 cp or less.
Final evals (our point of view, depth 24): main/side lines run from −0.36 (krause, reti) to +1.03 (nc3-bg5-bxf6). Punish lines end at +1.87 (pin-e4), +2.09 (bdg-qxf3) and +5.52 (ne4). e4-a4-e5 ends at +0.67.
Evals below are Stockfish depth 22 from **White's** point of view (the skeleton's convention), taken from the shared cache or from new `sfq.py` runs.

## Fixes in this pass (the previous worker stopped before the final verify)
| finding | fix |
|---|---|
| Q14 FAIL dutch-main ply 7: 4.Bg5 (10%) not covered | I wrote a line `bg5` (4...dxc4 5.e3 b5 6.a4 h6 7.Bh4 e6 8.Nc3 Bb4 9.Bxf6 Qxf6 10.Ne5 Bb7 11.Be2 Qe7, every move engine-checked, ends +0.23 for us), but the verifier rejected it: **4.Bg5 loses 48 cp** at 10% share and 0 of your games, so Q5 v2 does not allow it in any line. Replaced it with a `skip:` that gives the checked answer: 4...dxc4 (−0.24); after 5.e3 b5 6.a4 h6 7.Bh4 e6 8.Nc3 Bb4; after 5.Bxf6 exf6 (−0.96, 85% of games); after 5.Nc3 h6 (−0.37). I also added a skip for 4.Bf4 (6%): 4...dxc4 (−0.22; ...g6 / ...e6 lose 56-63). |
| Q17 FAIL reti: only 1 plan note | Added a plan note after 3...Nf6. |
| Q12 FAIL reti: ended at 5...b5 in the middle of an exchange (b3 Bg4 a4 bxc4) | Extended the line: 6.b3 Bg4 7.a4 bxc4 8.bxc4 Nbd7 => nc3-a6-b3. These are the same moves and positions as line nc3-a6-b3, so there is no new decision. It is now 16 plies, ends −0.36 (WARN). |
| Q19 WARN text | Removed move names written outside `(( ))` in reti 4...a6, veresov 5...e6 and bdg-qxf3 6...Qh4+ (now said in words). |
| Verifier hang (the cause of the earlier 3-hour stall) | It is in line **e4-a4-e5**, at the position after 8...cxb2. With 6 threads, the multipv-3 depth-22 search reaches depth 22 in about 60 s and then **never finishes**: the third PV is a promotion race (fxg7 bxa1=Q). With `O2_THREADS=1` the same search finishes in 41 s (Bxb2 −0.91, fxg7 −6.08, Rb1 −6.61), and it is now in the cache. Nothing in the tools was changed. **Lead: worth a time cap or a thread fallback in `Evals._search`.** |

## W-decisions (made by the previous worker, re-checked from the cache)
| line | decision | evals |
|---|---|---|
| dutch-main | 9.Qe2 **Bg6** (engine top) 10.Nh4 **Bh5** instead of the skeleton's 10.e4 Bg6 11.Bd3 Bh5 | 9...Bg6 +0.20 / h6 +0.28; 10...Bh5 +0.02 / Nbd7 +0.20 |
| dutch-nh4 | 9...**Bg6** 10.Nxg6 hxg6 | Bg6 +0.23 / Nbd7 +0.22 (1 cp, same plan as slow-nh4) |
| dutch-h3 | new side line in place of dutch-qb3 (9.Qb3 has no stats) | ends −0.14 |
| krause | 8.Ne5 **a5** 9.f3 Nfd7 | a5 +0.39; e6 +0.83 (loses 44, given as an X-note) |
| nh4 | 6...**e6** (skeleton option) 7.Nxf5 exf5 8.e3 **Bb4** | e6 +0.23, Bg6 +0.23, Bd7 +0.15 (8 cp; e6 keeps the course plan) |
| e4-e5 | written as 6.e5?! Nd5 7.a4 e6 8.Be2; the skeleton's Geller line 8.axb5 Nxc3 ... 11.Qh5 g6 is a checked `(( ))` variation in a comment | ends +0.33 |
| e4-quiet / e4-a4 / e4-a3 | 6.Be2 e6 7.O-O Bb7; 6.a4 b4 7.Na2 Nxe4; 6.a3 e6 | |
| e3-na2 / e3-nb1 | 7.Na2 **e6** (engine top); 7.Nb1 **Ba6** | 7...e6 −0.18 / a5 −0.04 |
| slow-nh4 | 6...**Bg6** | Bg6 +0.27 / Be4 +0.29 |
| slow-be2 | 7...**Bd6** | Ne4 −0.03 (top), h6 +0.06, Bd6 +0.07 (10 cp; Bd6 is the course set-up) |
| slow-qb3 / slow-cxd5 | both written (5.Qb3 Qc7 transposes into slow-cxd5) | |
| nc3-a6-c5 | 6...**g6** | g6 +0.34 / Nbd7 +0.38 |
| nc3 4.e3 | **4...a6** (binding) | a6 +0.23, Nbd7 +0.17, e6 +0.20 (6 cp) |
| nc3-bg5 | three lines: 5.e4, 5.e3, 5.Bxf6?! | |
| e3-bf5 | 5.Nf3 **Nf6** => slow-nh4 (the skeleton allowed Nf6) | Be7 +0.05, Nd7 +0.09; Nf6 is not in the top 3 but loses ≤ 25 (Q1 clean) |
| ex-main | 9.O-O **Bd6** | Rc8 +0.18 / Bd6 +0.19 |
| ex-rc1 | 7...Bf5 8.e3 **Rc8** | |
| london-nf3 | 5.c3 **e6** => london-main | Qb6 +0.00 / e6 +0.15 (15 cp); one set-up against both London move orders |
| colle | 4.Bd3 **e6** (skeleton's first option) | Bxd3 +0.08 / e6 +0.10 |
| torre | 5.e3 **cxd4** (skeleton suggested Qb6) | Qb6 −0.09 / Nc6 +0.00 / cxd4 +0.11 (20 cp, sound). It keeps the plain ...Nc6/...Bf5 plan. **Lead: Qb6 is the engine's top move.** |
| jobava | 6.Nf3 **Nc6** | Nc6 −0.01 / Bg4 +0.09 |
| kia-g3 | 6.Nbd2 **e5** | e5 +0.10 / e6 +0.11 |
| reti | 3.**e3** line (not the skeleton's 3.b3); 3.b3 and 3.g3 are skips | |
| english | 2.Nc3 d5 3.d4 Nf6 => nc3-a6-b3 (signpost line, 6 plies) | |
| not written | dutch-qb3, e4-geller (as its own line), bg5-dxc4, 5.g3, nc3-bf4, nc3-a6-other, e3-qb3, ex-qb3, london-dxc5, london-qb6, 2.Bg5, g3-system, b3-f4 | No stats and not flagged by coverage, or covered by a `skip:` with an engine move. |

## `!sys` list
None.

## WARN answers
- **Q11 krause −0.36, reti −0.36**: 1 cp under the −0.35 warning line, far above the −0.50 fail line. Krause 8...a5 is the engine's top move and every later move is top-3. Reti ends in the nc3-a6-b3 position.
- **Q1 reti 2...c6 (27 cp; engine 2...d4)**: this is the system move. It keeps the user in Slav structures, and the comment says ...d4 is also good.
- **Q6 reti 2.c4**: White's second move in the Reti. It is not in the top 3 and has no stats in the repo, but it is a main opening move and loses ≤ 35.
- **Q6 pin-e4 8.e4?**: this is the flagged mistake itself (punish line, classic).
- **Q13 ne4 7.Ne4?**: this is the blunder the line punishes (it hangs a knight). Expected.
- **Q9 slow-qb3 (2 new cards), english (2)**: both are short transposition lines (=> slow-cxd5, => nc3-a6-b3).
- **Q14 WARN (32 replies at 5-10%)**: the brief requires a skip only at ≥ 10%. The two replies at exactly 10% have checked skips: slow-bd3-early 7.c5 (answer Be7, −0.17) and ex-quiet 5.Bg5 (answer Ne4, −0.13). Others: dutch-main 4.cxd5; e4-a4 7.Ne2; e3-na2 9.b3/a3/Ne5 and 11.Bd2; slow-nh4 8.Be2; slow-cxd5 7.Be2; slow-bd3-early 8.Nbd2, 9.b3/a3; e3-bf5 4.c5/Bd3; ex-main 4.Bf4/e3, 5.g3, 6.g3; ex-quiet 5.g3; london-main 3.Nc3, 4.dxc5, 5.Bb5; jobava 3.e4/e3; colle 3.g3; london-nf3 4.dxc5, 5.c4/Nbd2; stonewall 3.Nc3, 4.Nf3; torre 4.Nbd2/Nc3, 5.Nbd2. Phase-2 candidates.

## Chapter coverage check (task 2)
All skeleton chapters have lines: main line 4...dxc4 5.a4 Bf5 (dutch-main, dutch-nh4, dutch-h3, krause, nh4, pin-e4); 5.e4/5.e3 ...b5 (e4-quiet, e4-a4, e4-e5, e4-a3, e4-a4-e5, e3-na2, e3-nb1, ne4); Slow Slav (6 lines + qc2, g3); 4.e3 ...a6 (nc3-a6-b3, nc3-a6-c5); Exchange (4 lines); London/Torre/Jobava ...c5 (london-main, london-nf3, torre, jobava); Colle; Stonewall; Veresov; Blackmar-Diemer (bdg, bdg-qxf3); 1.Nf3/1.c4 (reti, kia-g3, english). The only frequent uncovered reply was 4.Bg5 (10%), now a skip (see the first table).

## For the lead
- Verifier hang in e4-a4-e5 (above): a time cap or a 1-thread retry would stop it happening again on cold runs.
- Torre 5...cxd4 instead of the engine's 5...Qb6 (20 cp) is a W-call to confirm.
- 4.Bg5 in the Slav (10%, loses 48 cp) can only be a skip under Q5 v2. If you want a line for it, the checked `bg5` line text is in the first table.
- No model games (`### GAME`) and no `models-wanted:` lines in the course.

## Fix list from the lead review (worker pass, 2026-11-14)
Q5 common-ok threshold is now 10%, so 4.Bg5 and 4.Bf4 get lines. Every ply checked with `sfq.py --mpv 3` (depth 22, White's point of view below); final evals depth 24, our point of view.

| line | moves | checks |
|---|---|---|
| **bg5** (side, 22 plies) | 3.Nf3 Nf6 4.Bg5?! dxc4 5.e3 b5 6.a4 h6 7.Bh4 e6 8.Nc3 Bb4 9.Bxf6 Qxf6 10.Ne5 Bb7 11.Be2 Qe7 | the moves from the earlier skip, all re-run. 4.Bg5 loses 48 (10%, `?!`). White: 5.e3 top (48%), 6.a4 loss 21 (62%), later White moves engine top. Ours: all top 1 except 11...Qe7 (tied with ...a6). Ends **+0.23**. |
| **bg5-bxf6** (side, 20 plies) | 4.Bg5?! dxc4 5.Bxf6?! exf6 6.Nc3 Bb4 7.g3 Nd7 8.Bg2 Nb6 9.O-O O-O 10.a3 Be7 | 5.Bxf6 loses 75 at 20% → common-ok `?!` (second `?!` of the line). 5...exf6 85% of games. No stats after 5...exf6: White = engine first choice. 7...Nd7 loses 12, 9...O-O 9 (simpler than ...g6). Ends **+0.91**. |
| **nc3-bf4** (side, 18 plies) | 3.Nc3 Nf6 4.Bf4?! dxc4 5.e3 b5 6.a4 Qb6 7.Nf3 e6 8.Be2 a5 9.O-O Nbd7 | 4.Bf4 loses 51 (10%, the user's own game: he played 4...Bf5 and lost; said in the comment). 5.e3 = most frequent (50%, loss 30, sound). No stats after 5...b5: engine first choices. 6...Qb6 is forced-ish (…e6/…Nd5 lose 43). Ended after 9...Nbd7 because ending after 10.Ne5 Nxe5 11.Bxe5 or 10...Be7 leaves a capture pending (Q12). Ends **+0.38**. |

Skips: removed `4.Bg5` (3.Nf3 order) and `3.Nc3 Nf6 4.Bf4`; added, one ply deeper, `4.Bg5 dxc4 5.Nc3` (22%; answer h6 −0.37, as in nc3-bg5), `4.Bg5 dxc4 5.e3 b5 6.Nc3` (20%; answer h6 −0.66, Bxf6 exf6 then ...Bb4) and `4.Bf4 dxc4 5.e4` (30%; answer b5 −0.47, then ...e6, ...Be7, ...a5). The `3.Nf3 Nf6 4.Bf4` skip stays (6%).
New WARNs (Q14, 5-10% replies): **bg5 5.a4 (5%)** and **nc3-bf4 5.Nf3 (7%)**: 5-10% replies, no skip needed under the brief. 0 FAIL, 42 WARN; 48 lines, 272 cards.
