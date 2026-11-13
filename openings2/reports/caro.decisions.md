# caro — worker decisions (T2b), 2026-11-13

Result: `verify_course.py caro --coverage` → **0 FAIL, 44 WARN** (report: `reports/caro.verify.txt`).
39 main/side lines + 3 punish lines + 3 avoid traps (= 6 punish items), 338 cards, 2 model games
(Carlsen–So 2017, Caruana–Ding 2019, both `explorer.json:caro`, both pass through ex-main/ex-h3 positions), 62 `skip:` entries.
No `!sys` moves. Worst own-move loss: 21 cp (ex-h3 6...Nf6, skeleton-binding move). All other own moves ≤ 17 cp (17 = 1...c6 itself).
Final evals (our point of view, depth 24): main/side lines −0.30 (c4) to +0.40 (qf3); punish lines +0.67 / +1.28 / +1.70.
Evals below: Stockfish d22, White's point of view (as in the skeleton).

## W-decisions
| line | decision | evals |
|---|---|---|
| short-main | 7.c3 **cxd4** 8.cxd4 Nge7 (then ...Bg4) | cxd4 +0.29, Bg4 +0.35 (Nh6 +0.23 is the engine top, not in the skeleton) |
| short-be3 | 8.c4 (engine top) Nbc6 9.Qa4 **a6** | a6 +0.44 / Bxb1 +0.42 — the Bxb1 path ended −0.47 for us at d24 and not quiet; a6 ends −0.24 |
| short-c3 | 6.**Be3** (6.Be2 transposes to short-main, 6.Bd3 to nf3-bd3) Qb6 | Be3 +0.26, Qb6 +0.18 |
| nf3-bd3 | 6...**c5** | c5 +0.06, Ne7 +0.24, Qa5+ +0.29. Then 7...Nd7 (+0.09); the ...Nc6/...Qb6 plan of bd3 was tested here and fails (8...Qb6 loses 35, ends +0.5) |
| bd3 | 5...e6 6.Ne2 c5 ...Qb6-a6 | 6.Nf3 would transpose to nf3-bd3, so bd3 uses 6.Ne2 (engine top, +0.11) |
| f4 | written via **2.f4** (4.f4 after 3...Bf5 is "bad" class: −43 cp, 8.5%, no YG; skip says it transposes); 7.Be3 Qb6 8.Qd2 **h5** | h5 −0.15 vs a6 −0.17 (a6 led to a piece sacrifice; h5 to a quiet queenless game) |
| nd2 | 6...**c5** | c5 +0.19, h6 +0.26 |
| h3 | 5.Nf3 (your 2 games) c5; 5.g4 (−80 cp, no stats) only as a comment | |
| nc3-g4 | 9...**Nc6** | Nc6 0.00, cxd4 +0.13. Line runs to 14...Bxc2 (28 plies) because every earlier stop was mid-tactics |
| nc3-quiet | 5...**Nd7** | Nd7 +0.12, Bg4 +0.13 |
| h4 | 5.c4 e6 6.Nc3 **Ne7** | Ne7 +0.23, dxc4 +0.22 (Ne7 = same plan as line c4) |
| c4 | 5...**Ne7** | Ne7 +0.22, Bb4 +0.29, dxc4 +0.44 (you played dxc4 twice) |
| ne2 | no line: 4.Ne2 loses 47 cp with no stats / games → skip | |
| cl-main | 12...Be7 13.Ne4 O-O | Be7 +0.17 |
| cl-bf4 | 12...**Bb4** | Bb4 +0.05, Qc7 +0.42 |
| cl-bc4 | skeleton's 7.N1e2 is not engine top-3 (Q5) → **7.Nf3** Nd7 8.Qe2 Ngf6 | e6-sacrifices checked: 9.Nxe6 −4.98, Bxe6 −5.71 after 8.Nf4 Bd6 |
| cl-bd3 | 6...**Qd8**; side line with best defence 7.Qe2 (+0.00 for us) | Qd8 −0.20, Qb6 0.00. Not a punish line: against best defence the extra pawn is only worth ~0.15 |
| cl-bd3-oo (punish) | 7.O-O?! (59%) Bxe4 8.Bxe4 Qxd1 | −0.78 |
| cl-qf3, 5.Nc3, 5.Ng5, 5.Nc5 | skips: 5.Qf3 2.6%; 5.Nc3 loses 36 cp at 6% (just "bad" class) | |
| cl-f3 | 5.f3 is not allowed in a line (−51 cp, 8%) → avoid trap 5...Nf6 / X ...Bxe4 | Nf6 −0.16, e6 −0.08 |
| bdg-caro | 4.f3 loses 86 cp at 5.7%: below the 90-cp mistake threshold, so not allowed anywhere → skip (4...exf3 5.Nxf3 **Nf6**) | Nf6 −0.64, Bf5 −0.37 |
| ex-h3 | 7...**g6** (tie, first option) 8.Qc2 Bg7, ...Nh5-f4 | g6 +0.30, e6 +0.29 |
| ex-nf3 | written in your order 2.Nf3 d5 3.exd5 cxd5 4.d4 | |
| ex-nf3-nc3 | 5...**Bg4** | Bg4 −0.01, Nc6 +0.05, a6 +0.06 |
| ex-nc3 | 4...**Nf6** (first option; transposes to ex-nf3-nc3 after 5.Nf3) | Nf6 +0.04, Nc6 −0.07 (11 cp) |
| ex-bf4 | no line (1.4%) → skip with 5...**Bf5** | Bf5 −0.01, Qb6 +0.17 |
| panov-main | 9...**O-O** | O-O +0.24, Be7 +0.35 |
| panov-bd3 | 9...b6 (engine top) | |
| tk-main / tk-be2 / tk-exd5 | 6.d4 Nf6 / 5.d4 **Nd7** (Nf6 not top 3) / 4.exd5 line added (27%) | Nd7 +0.28 |
| tk-d3 | dropped (no stats), tk-exd5 took its place | |
| nf3-bb5 | 5...**Nxd7** | Nxd7 −0.08, Qxd7 −0.04 |
| nf3-ne5 | dropped (move not in the 1200-1600 top list) | |
| nf3-d3 | 3...**dxe4** queen trade | dxe4 +0.20, e6 +0.23 |
| nf3-c3 (punish) | 4.Ne5 is the best defence and is the line; your game's 4.Ng5 is in the comment. After 4.Ng5 the course move is **Qd5** (−2.12), not your 4...Nf6 (−1.23, loses 89) | |
| nf3-e5-h3p (punish, new) | 5.Be2 c5 6.h3? (14%, −116 cp) Bxf3 — you found it in your game | |
| fantasy | 4...**Bb4** 5.Bd2 **Nd7** | Bb4 +0.17, Nf6 +0.43; 5...Ne7 led to a pawn storm against castling (ended −0.39) |
| fantasy-be3 | dropped (no stats) | |
| bc4 | 4...**Nc6** (skeleton) 5.d4 Bf5. "...e5 big centre": never in the engine top 3, not used | Nc6 −0.24, Bf5 −0.26 |
| bc4-bb5 | 5...**Qxd7** | Qxd7 −0.34, Nxd7 −0.23 |
| bc4-bb3 (avoid trap) | 4...**e6** (skeleton) | e6 −0.75, g6 −0.81 (6 cp); the blunder is 4...Nf6? 5.Qxf7+ (+2.93) |
| qf3 / qf3-d4 | 3.exd5 is not engine top 3, so a second line 3.d4 dxe4 makes 2...d5 a branch | |
| c4-accel | 6...**Nc6** | Nc6 +0.07, e6 +0.19 |
| kia | dropped: 3.Nd2 is not top 3 after the branch; 3.Nf3 transposes to nf3-d3 → skip | |
| bd3-be3 (punish) | not allowed: 3.Bd3 (1%) / 3.Be3 (loses 85 < 90) → skips | |

## WARN answers
- **Q6 cl-bc4 6.Bc4**: not top 3 and no stats; a classic system named in the skeleton; loses only 16 cp.
- **Q13 cl-bd3 5.Bd3, nf3-c3 3.c3, cl-f3 5.f3, f4 2.f4**: these are the flagged opponent mistakes/gambits themselves; the PV shows the material Black wins (2.f4 "9 points" is the 6-ply PV passing through a recapture). Expected.
- **Q14/Q15 WARN (39)**: replies with 5-10% share (e.g. 4.Nf3 e6 5.c4 / 5.h3, nc3-quiet 6.Bf4 / 6.Be2, ex-nf3 5.Nc3 / 5.c4, panov 6.c5). Not covered, by the brief (skip only if ≥10%). tk-main "3.d4 10%" is the classical transposition (2.Nc3 d5 3.d4 dxe4).

## For the lead
- **Card count 338** (target 220-320): 39 full lines; the 2.Nf3/2.Nc3 tree at 1200-1600 is very branchy. Candidates to cut if needed: nf3-d3, qf3-d4, ex-nc3.
- **Sharp lines to review**: nc3-g4 (ends 14...Bxc2 with White's knight on g7), nf3-e5-h3 (Black takes two gambit pawns, ends +0.38 for us), short-be3 (queenless, a pawn up).
- **Skeleton deviations**: cl-bc4 7.Nf3 instead of 7.N1e2 (Q5); nf3-c3 4.Ne5 instead of 4.Ng5 (best defence rule); bdg-caro, cl-f3 punish, bd3-be3 punish, ne2, be3, kia, tk-d3, nf3-ne5, fantasy-be3, ex-bf4, cl-qf3 replaced by skips or an avoid trap (class rules or rarity).
- 62 skip entries carry an engine-checked move for every ≥10% reply that has no line.
- Tool note: none blocking. `sfq.py --move` makes the whole position unreadable when the SAN is illegal there (one call per position needed).
