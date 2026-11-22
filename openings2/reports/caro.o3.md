# caro: R2 restructure report

Result: `verify_course.py caro --no-engine` = 0 FAIL, 14 WARN. `compile_courses2.py caro --no-engine` compiles (42 lines, 683 nodes, 338 cards, ver 3, not a draft).
No move was changed, no line added or deleted. CRLF line endings kept.

## Families (chapter -> trunk)
| chapter | trunk | why |
|---|---|---|
| adv-short Advance: calm set-ups | bd3 | highest reach (0.026); 4.Bd3 is 22% vs 4.Nf3 e6 5.Be2 only 9% of 4.Nf3 |
| adv-sharp Advance: other fourth moves (retitled, intro rewritten) | g4 | highest reach (0.0046); shows "bishop dodges the pawns" |
| classical | cl-main | reach tie (cl-bf4/nf3/bc4 are branches of the same node); cl-main shows the ...h6 home-for-the-bishop plan |
| exchange Exchange Variation (split from "Exchange and Panov") | ex-nf3 | highest reach (0.014); also covers 2.Nf3 (18 games), where 3.exd5 is 61% |
| panov Panov Attack (new, split off: isolated d4 pawn) | panov-main | reach .00059 vs .00055, plan |
| knights Two Knights (2.Nc3, split) | tk-main | highest reach |
| nf3-adv 2.Nf3 d5 3.e5 (new, split from "knights") | nf3-e5 | highest reach |
| nf3-odd 2.Nf3: Bb5+, d3, c3 | none (mixed) | unrelated odds |
| side Sidelines | none (mixed) | grab-bag |

Reordered: bd3 moved before short-main, g4 before h4/nc3-*, ex-nf3 before ex-main. Because bd3 now owns the shared first moves (1.e4 ... 3...Bf5), the comments of those moves were moved from short-main to bd3 (text unchanged; no F2 warning).
`start: bd3, cl-main, ex-nf3` (Advance 49% of 2.d4, Classical, Exchange incl. 2.Nf3).

## Rule book (id, name, places used)
bishop-out Bishop out before ...e6 (18) | c5-or-knight ...c5 now, or knight first (13) | e4-pawn Look at White's e4 pawn (10) | d4-count Count the guards of d4 (8) | h3-pin h3 against your g4 bishop (6) | ex-knights Exchange: knights before bishop (6) | b5-square The b5 square (4) | d5-retake Retake on d5: pawn or knight (4) | h4-bishop h4 against your bishop (3) | bishop-chased Bishop chased: e4 or g6 (3) | bishop-trade Bishop on d3: trade it (3) | qb6-b2 Bishop left c1: ...Qb6 (3) | queen-trade Queens face each other: trade (3) | qa5-check ...Qa5+ only if d2 is empty (2). Total 14 rules, 86 uses.

## Counts
Triggers written: 86. Places skipped: 9 (list below). Worklist was 95 places (62 split, 82 sister). Re-run of `triggers_needed.py caro`: 9 places left, all intentional.

## Skipped WARNs (intentional)
- T-SPLIT x7, "2...d5" in bd3, ex-nf3, tk-main, f4, bc4-bb5, qf3, c4-accel: we play ...d5 against every second move, so no trigger needed (brief).
- T-SISTER x2: nf3-bb5 5...Nxd7 and bc4-bb5 5...Qxd7. Both recaptures are fine; I could not find a true, concrete "here X so Y" difference between the two positions (only the knight on f3 vs g1), so I did not invent one.
- Q13 x4 / Q6 x1: existing warnings on punish/avoid lines and cl-bc4, not caused by this work.

## Q3 candidates (near-copies, NOT applied)
- cl-bf4: same 10 moves as cl-main, differs only at 11.Bf4; one idea (...Qa5+ and trade).
- cl-bd3-oo: same as cl-bd3, differs only at move 7 (O-O vs Qe2).
- nf3-e5-h3p: leaves nf3-e5 at move 6 (6.h3? instead of 6.c3); short punish line.
- nf3-bb5 and bc4-bb5: same idea (Bb5+ Bd7 Bxd7), differ only in the recapture.
- nc3-quiet: transposes to the same position as 4.Nf3 e6 5.Nc3 and differs from nf3-bd3 mainly in move order.
- h3 (4.h3?!): ordinary Advance play after ...e6, ...c5, little new.
- f4 (2.f4): becomes the Advance structure of short-c3.
- qf3-d4 and nf3-c3: very rare (reach below 0.0001).

## Unsure / please check (chess claims)
- Trunk of adv-short: I followed reach (bd3). Trunk of exchange: ex-nf3 (2.Nf3 path) by reach; ex-main (2.d4) is the alternative, and start would then also need ex-nf3 only if 2.Nf3 matters.
- h3-pin rule: "Two Knights and Advance take on f3, Exchange keep ...Bh5". It follows the course's own comments (and the tk-bh5 trap) but is a pattern, not a proven law.
- c5-or-knight: "knight on c3/b3 -> develop first" is the course's own advice (Stockfish-checked moves); I did not prove the alternative is bad.
- ex-main 5...Qc7 ("Bd3 controls f5 so ...Qc7 first") and bd3 7...Nc6 ("only d4 guards e5") are board-true but the "so" part is plan, not forced.
- Chapter ids `panov`, `nf3-adv`, `nf3-odd` are new; nothing else in the course referred to chapter ids.
- compile/verify rewrote `reports/caro.verify.txt` (tool output).
