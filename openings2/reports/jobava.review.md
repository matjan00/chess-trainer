# jobava — lead review (T4), 2026-11-13

**Status: quality signed off, coverage NOT yet.** The 32 lines and 6 traps that exist are approved: 0 FAIL under the revised verifier, writing and plan notes are good, and a depth-26 sample (5 `!sys` + 34 random own moves) found no own move losing more than 17 cp apart from the two `3.Bf4!sys` moves (49 cp, inside the 60 limit).

## Decisions on the worker's six points
1. `cxd3` in bf5-main / bf5-c5 / a6-bf5 and `Qxd3!sys` in c6-bf5: **approved** (the chapter intro states the rule).
2. 2c5: the skeleton's 5.Qa4 was wrong. Main line 4...e6 5.Bxb8 and punish line 4...Nc6? 5.Qxd5: **approved**.
3. 2e6-bd6 7.Qd2: **approved**.
4. 2...e6 lines written via 1.d4 e6 2.Nc3 d5: **change back** (fix 1 below).
5. `classic` tags on c5-nc6, e6-c6x, 2c5-nc6, c5-xnc6: **approved**. kid-main: I changed it to a `main` line (5...O-O is now `?!`, extra plan note added).
6. 3.Qd3!sys against 1...e6 2.Nc3 Bb4: **approved**.

## Rule change (already in BLUEPRINT §1.2 and verify_course.py)
Q5 v2: a flagged `?!` move may be shared by many lines; sound is loss <= 35; an early defence (first 6 plies) qualifies with share >= 3%, one game of the user, or the line tag `defence`. So the dropped defences can and must come back.

## Fix list for the T2a worker (Opus) — add about 12 lines, change nothing that is approved
1. Write the 2e6-* lines in the user's real move order **1.d4 d5 2.Nc3 e6** (he met it 8 times). If 2...e6 measures 36+ cp, flag it `?!` with a comment like "fine in general; only inaccurate because 3.e4 would now be a good French for White, which we do not play". Keep a `skip:` note for the 1...e6 order.
2. **1...b6** (3 of his games): 1.d4 b6 2.e4 Bb7 3.Nc3 e6 4.Bd3 Nf6 5.Nge2 (W: or Qe2/Nf3). Note the transposition from 1...e6 2.Nc3 b6 3.e4.
3. **Modern / Pirc**: 1.d4 g6 2.e4 Bg7 3.Nc3 d6 4.Bf4 and Qd2, O-O-O (same set-up as kid-main; transposition notes for 1...d6 2.e4 g6 and 1...Nf6 2.Nc3 d6 3.e4 g6).
4. **Philidor set-up**: 1.d4 d6 2.e4 Nf6 3.Nc3 e5 4.Nf3 Nbd7 5.Bc4 Be7 6.O-O (he met 1...d6 2.Nc3 e5: add a note or short line for 2.e4 e5).
5. **Benoni**: 1.d4 c5 2.d5 and 1.d4 Nf6 2.Nc3 c5 3.d5, then e4 (one line carries the content, the other a note).
6. **1...c6 / 2...c6** (2 of his games): 1.d4 c6 2.Nc3 d5 3.Bf4, non-transposing tries (3...Qb6, 3...Bf5 4.e3 e6 5.Bd3 → c6-bf5).
7. **kid-nc6**: 6.O-O-O Nbd7 (23%) and 6...Nc6 (18%): one or two lines instead of the `skip:` entries.
8. **nf6e6-c5** (2 of his games) and **nf6e6-b6** (4.e4).
9. **Dutch**: dutch-e6 (3...e6 4.e4!) and dutch-stonewall (2...d5 3.Bf4; also from 2...e6 3.Bf4 f5, 1 of his games).
10. **1...e6 2.Nc3 c5** (12%): 3.d5.
11. **2e6-nc6** (2 of his games, both lost): 1.d4 d5 2.Nc3 e6 3.Bf4 Nc6 4.e3 Nf6 5.Nb5 Bd6 6.Nxd6+ cxd6 — find a quiet end (try 7.Nf3 O-O 8.Be2 … or 8.c3).
12. **e6-be7** (4.Nb5 Na6 5.e3 Be7): now sound under the 35 cp limit; add if a clean line exists. Same for e6-bd7 (10%) and c6-bg4 (just under 15%).
13. Englund: one more short trap for the most frequent of 3...f6 / 2...Bc5 / 3...Nge7.
14. Remove the `skip:` entries that the new lines replace; re-run `verify_course.py jobava --coverage` (target 0 FAIL, about 44 lines, 250-300 cards).

Small edits the lead already made in jobava.txt: kid-main kind `main`, `5...O-O?!`, one plan note after 6.O-O-O.

Model games: none yet (the two verified games do not reach the new tree) — phase 2 as agreed.

## Final sign-off (lead, 2026-11-13, after the fix round)
**Signed off.** 47 lines, 7 traps, 325 cards, 0 FAIL. The 15 new lines were read in full: moves, comments and plan notes are sound and consistent with the system rules. New W-decisions approved (b6 5.Nge2, dutch-stonewall 5.Nb5, 2c6-qb6 4.Rb1). Item 7 (kid-nc6) stays as `skip:` advice: accepted; revisit in phase 2 if his games show 6...Nbd7 / 6...Nc6. The card count is 5 over the target: accepted.
