# Jobava London (White) — repertoire skeleton

Course id `jobava`, side white. Lead architect's decisions; the line-writing worker extends each branch to 8-14 moves, verifies with Stockfish (BLUEPRINT §1) and may only change a decision marked **W:** (worker decides between the listed options by depth-24 eval, tie → the first option).
Evals in brackets are Stockfish 19, depth ~20, White's point of view, from the lead's sanity check. `LI x%` = share among Lichess 1200-1600 (data/explorer.json). `YG n` = seen n times in the user's own games.

## The system in 8 rules (course "key ideas" — the worker turns these into `idea:` entries)
1. Moves 1-3 are always **d4, Nc3, Bf4** against ...d5 set-ups. Then e3.
2. **Nb5** is the Jobava move: play it whenever c7 can only be defended by the ugly ...Na6, or when it wins something (…Nc6 blocks the c-pawn → Nb5 is strong). If Black can answer ...c6 comfortably and nothing is gained, don't.
3. Against **...e6 before ...Bf5/…c5**: Nb5 at once (4.Nb5!), before Black gets ...Bd6 or ...Bb4 in comfortably.
4. Against **...Bf5** (with or without ...c6/...a6): **e3 and Bd3** — trade Black's best bishop, then Nf3, O-O and the e4 break.
5. Against **...c5**: e3, recapture exd4, and take dxc5 when Black's f8-bishop would have to move twice.
6. Against an early **...Bb4** pin: **Qd3** (unpins, eyes b5/e4, prepares a3 and O-O-O).
7. If Black does **not** put a pawn on d5 (…g6/…d6/…b6): take the whole centre with **e4**, then Bf4, Qd2, O-O-O and Bh6/h4 ("the big-centre attack").
8. Typical middlegame plans: Ne5 + f-pawn/kingside attack; e3-e4 break after development; bishop pair after Nxd6; queenside castling + pawn storm when Black fianchettoes.

Pawn structures to teach (`structure:` entries): (a) Carlsbad-reversed after ...c5xd4 exd4; (b) f4-clamp after ...Bxf4 exf4; (c) e4 big centre vs ...g6/...d6; (d) Stonewall-Dutch with Nb5/Ne5; (e) IQP-free "d4 vs d5 symmetrical" after Bd3xBd3.

## Chapter 1 — `c5` Black hits the centre: 3...c5 (LI 5%, but the engine's first choice [0.00])
Choice: **4.e3** [-0.01] (not the 4.e4 gambit: more theory, same eval).
| id | P | moves | notes |
|---|---|---|---|
| c5-main | 1 | 1.d4 d5 2.Nc3 Nf6 3.Bf4 c5 4.e3 cxd4 5.exd4 a6 6.Nf3 Nc6 7.**W:** Ne5 / h3 / Be2 | [≈0.00] Carlsbad-reversed: Bd3, O-O, Re1, Ne5, Ne2-g3. This is Black's most accurate line: tell the user honestly it is "equal but easy to play". |
| c5-bg4 | 1 | … 5.exd4 a6 6.Nf3 Bg4 7.h3 Bxf3 8.Qxf3 | [+0.21] bishop pair, O-O-O or Bd3/O-O |
| c5-e6 | 1 | … 3...c5 4.e3 e6 5.Nb5! Na6 6.**W:** c3 / Nf3 | [+0.36]; same position as 3...e6 4.Nb5 Na6 5.e3 c5 (LI: Nb5 36%) |
| c5-a6 | 2 | … 3...c5 4.e3 a6 5.dxc5! e6 (5...Nc6) 6.**W:** Na4 / Nf3 | [+0.22] rule 5; hold or return the pawn for development |
| c5-nc6 (punish) | 1 | … 3...c5 4.e3 Nc6? 5.Nb5! e5 6.dxe5 (6.Bxe5) Ne4 … | [+2.1] the Nc7+ fork trick; show 5...Qa5+ 6.c3 too |
| c5-xnc6 (punish) | 1 | … 4...cxd4 5.exd4 Nc6? 6.Nb5! e5 7.**W:** dxe5 / Bxe5 | [+1.1] "why Black needs ...a6" |
| c5-qb6 (punish) | 3 | … 3...c5 4.e3 Qb6?! 5.Nb5 Na6 6.**W:** dxc5 / a4 | [+0.7] |
| c5-g4 | 3 | … 3...c5 4.e3 Bg4 5.f3 Bd7/Bh5 6.**W** | [+0.2] only if stats ≥ 5% at that node once fetched |

## Chapter 2 — `e6` The solid 3...e6 (LI 23%, the most common reply)
Choice: **4.Nb5!** [+0.02] (4.e3? Bb4! is [-0.24] — this was a soft spot of the old course).
| id | P | moves | notes |
|---|---|---|---|
| e6-c6 | 1 | 1.d4 d5 2.Nc3 Nf6 3.Bf4 e6 4.Nb5 Na6 5.e3 c6 6.Nc3 (LI 68% play 5...c6) then …Qb6/…Bd6/…Nc7 | [≈0.0] a6-knight is offside: Nf3, Bd3 (or a3 first vs ...Nb4), O-O, Ne5, e4 |
| e6-be7 | 1 | … 4.Nb5 Na6 5.e3 Be7 6.**W:** Nf3 / a3 … O-O, c6, Nc3 | [0.00] |
| e6-bd6 | 1 | … 4.Nb5 Bd6?! (LI 49%!) 5.Nxd6+ cxd6 (5...Qxd6?? 6.Bxd6) 6.e3 | [+0.32] bishop pair for free: Nf3, Bd3, O-O, c4/c3; common-and-OK class |
| e6-bb4 | 2 | … 4.Nb5 Bb4+ 5.c3 Ba5 (5...Be7 6.Nxc7+?? check!) 6.**W:** a4 / Nf3 / Qa4+ | [+0.10] verify 5...Be7 line concretely |
| e6-bd7 | 2 | … 4.Nb5 Na6 5.e3 Bd7 (LI 10%) 6.**W:** a4 / Nc3 | |
| e6-c6?? (punish) | 2 | … 4.Nb5 c6?? 5.Nc7+ | wins the exchange; 1 short item, also 4...Nh5/4...Bd7? if stats show ≥ 8% |
(3...e6 4.Nb5 Na6 5.e3 c5 transposes to `c5-e6`: add a transposition note, no separate line.)

## Chapter 3 — `bf5` Black develops the bishop: ...Bf5 / ...Bg4 set-ups (3...Bf5 LI 20%, YG 5; 3...c6 LI 7%; 3...a6+Bf5 YG 3)
Choice: **4.e3 and 5.Bd3** (rule 4). Not the 4.f3/g4/h4 main line: [-0.18] at depth 19 and far more to learn. With ...c6 included 5.f3 is the engine's top by ~10 cp, but Bd3 keeps one rule for all move orders.
| id | P | moves | notes |
|---|---|---|---|
| bf5-main | 1 | 1.d4 d5 2.Nc3 Nf6 3.Bf4 Bf5 4.e3 e6 5.**W:** Bd3 / Nf3 / Nb5 (all within 15 cp) Bxd3 6.Qxd3 c5/Bd6/Be7 7.Nf3 … O-O, e4 | if W picks Nb5: 5...Na6 6.Nf3. Keep whatever is picked consistent with c6-bf5 and a6-bf5 |
| bf5-bg6 | 2 | … 5.Bd3 Bg6 6.Nf3 Bd6/c5 7.**W** | Ne5 ideas |
| bf5-bd6 | 2 | … 4.e3 e6 5.Bd3 Bxd3 6.Qxd3 Bd6 7.Bxd6 / Nb5 **W** | |
| c6-bf5 | 1 | 1.d4 d5 2.Nc3 Nf6 3.Bf4 c6 4.e3 Bf5 5.Bd3 Bxd3 6.Qxd3 e6 7.Nf3 Nbd7 8.O-O Be7 9.e4 | Caro-like structure; e4 break is the plan |
| c6-bg4 | 2 | … 3...c6 4.e3 Bg4 5.**W:** f3 / Be2 / Qd2 | |
| c6-qb6 | 2 | … 3...c6 4.e3 Qb6 5.**W:** Rb1 / a3 | b2 must be safe; check 5.a3 Qxb2?? 6.Na4 |
| a6-bf5 | 1 | 1.d4 d5 2.Nc3 Nf6 3.Bf4 a6 4.e3 Bf5 5.Bd3 Bxd3 6.Qxd3 e6 7.Nf3 c5 8.dxc5 Bxc5 9.O-O Nc6 10.e4 | [+0.13..0.20] his real games: won with 5.Bd3, lost twice with 5.Nf3 |
| bg4 | 2 | … 3...Bg4 4.f3 Bh5 (4...Bf5 5.g4/e4 **W**) 5.**W** | [+0.52] |
| 2bf5 | 1 | 1.d4 d5 2.Nc3 Bf5 (LI common, 47% of White replies are Bf4) 3.Bf4 e6 4.e3 then …Nf6 (→bf5-main) / …Bd6 / …c6 / …Bb4 | cover the non-transposing tries in one line (W picks the most frequent) |

## Chapter 4 — `a6g6` Waiting and fianchetto: 3...a6 (LI 16%, YG 5), 3...g6 (LI ~4%), 3...Nc6?! (LI 20%), 3...Nbd7?
| id | P | moves | notes |
|---|---|---|---|
| a6-e6 | 1 | 1.d4 d5 2.Nc3 Nf6 3.Bf4 a6 4.e3 e6 5.Nf3 c5 6.**W:** Be2 / Bd3 / dxc5 … O-O, dxc5, e4 | [-0.08] (5.g4!? is the engine's top [+0.16]: mention in a comment as an aggressive option, do not train it) |
| a6-c5 | 2 | … 3...a6 4.e3 c5 5.dxc5 | [+0.26] → note transposition to `c5-a6` |
| a6-nc6 | 2 | … 3...a6 4.e3 Nc6 5.**W:** Nf3 / Bd3 … | Nb5 is ruled out, so Ne5 plan |
| g6-main | 1 | 1.d4 d5 2.Nc3 Nf6 3.Bf4 g6 4.e3 Bg7 5.**W:** Nb5 Na6 6.Nf3 O-O 7.h3 c6 8.Nc3 / 5.Nf3 O-O 6.Be2 / 5.h4 | [+0.05, all equal] pick ONE; lead preference Nb5 (rule 2) |
| g6-c5 | 2 | … 3...g6 4.e3 Bg7 5.(as chosen) … ...c5 break: dxc5 Qa5 **W** | |
| nc6-e5 (common, bad) | 1 | 1.d4 d5 2.Nc3 Nf6 3.Bf4 Nc6?! 4.Nb5! e5 5.Bxe5 Nxe5 6.dxe5 Ne4 7.**W** | [+0.85] (LI: 20% play 3...Nc6, and 85% of Whites then play 5.dxe5?: Bxe5 is better [+0.84 vs +0.62]) |
| nc6-other (punish) | 1 | … 3...Nc6 4.Nb5 then 4...Bf5?/4...e6?/4...a6?? 5.Nxc7+ ; 4...Rb8 5.**W** ; 4...Bg4 | short items, pick the 2 most frequent |
| nbd7 (punish) | 2 | … 3...Nbd7? 4.Nb5 e5 5.**W:** dxe5 / Bxe5 | [+0.95] |

## Chapter 5 — `second` Move-two sidesteps after 1.d4 d5 2.Nc3 (2...e6 YG 8, 2...c6, 2...c5, 2...Nc6, 2...e5)
System rule: always **3.Bf4** [-0.01] even though 3.e4 is the engine's top after 2...e6 [+0.34] and 2...c6 [+0.21] (that would be a French / Caro for White: a different repertoire). These are `!sys` moves.
| id | P | moves | notes |
|---|---|---|---|
| 2e6-bd6 | 1 | 1.d4 d5 2.Nc3 e6 3.Bf4 Bd6 4.e3 Bxf4 5.exf4 Nf6 6.Nf3 O-O 7.Bd3 … Ne5, Qf3/Qe2 | [+0.18] f4-clamp structure (b); also 4...Nf6 5.Nb5! |
| 2e6-bb4 | 1 | … 2...e6 3.Bf4 Bb4 4.Qd3 (YG 2) Nf6 5.a3 Bxc3+ / Be7 **W** | [+0.02]; rule 6. If Qd3 fails the thresholds at depth 24 fall back to 4.Nf3 |
| 2e6-c5 | 1 | … 2...e6 3.Bf4 c5 4.e3 Nc6 (4...Nf6 5.Nb5 → c5-e6; 4...cxd4 5.exd4) 5.Nb5! | [-0.09 at move 4; 4.e4 +0.18 is an option not trained] |
| 2e6-a6 | 1 | … 2...e6 3.Bf4 a6 (YG 2) 4.e3 c5 (4...Nf6 → a6-e6; 4...Bd6 5.Bxd6/Qg4 **W**) 5.**W:** dxc5 / Nf3 | `!sys` (4.e4 is [+0.45]: say so in the comment: "if you know the French, 4.e4 is even better") |
| 2e6-nc6 | 2 | … 2...e6 3.Bf4 Nc6 (YG 2) 4.e3 Nf6 5.Nb5 Bd6 6.Nxd6+ cxd6 7.Nf3 | bishop pair; he lost twice here playing Bd3/Bg3 |
| 2c6 | 2 | … 2...c6 3.Bf4 Bf5 4.e3 e6 5.Bd3 (→ c6-bf5 when ...Nf6) ; 3...Qb6 4.**W:** Rb1 / a3 | one line on the non-transposing order |
| 2c5 | 1 | … 2...c5 3.Bf4 cxd4 4.Qxd4 Nc6 5.Qa4 **W** ; 3...Nc6 4.e3 (4...Nf6 5.Nb5 → c5-nc6) | [+0.47 after 3...cxd4]; 3.Bf4 is the engine's top [+0.04] |
| 2nc6 | 2 | … 2...Nc6 3.Bf4 Bf5 / a6 / Bg4 4.**W** (3...Nf6 4.Nb5 → nc6-e5) | [+0.18] |
| 2e5 (punish) | 2 | … 2...e5?! 3.dxe5 d4 4.Ne4 **W** | [+0.64] YG 1 |

## Chapter 6 — `nod5` Black keeps the d-pawn back: King's Indian / Pirc / Modern and 1...Nf6 2.Nc3 e6 / c5 / d6 (1...Nf6 2.Nc3: g6 LI 29%, e6 25%, d6 5%, c5 3%)
Choice vs ...g6: **3.e4!** [+0.71] then **Bf4, Qd2, O-O-O** [+1.05 after 6.O-O-O] (rule 7). 3.Bf4 Bg7 4.e4 reaches the same thing but allows 3...d5; so e4 first.
Choice vs 2...e6: **3.Bf4** [0.00] (system). 3.e4 is [+0.43] but means learning the French; see "Question for the user" in the BLUEPRINT.
| id | P | moves | notes |
|---|---|---|---|
| kid-main | 1 | 1.d4 Nf6 2.Nc3 g6 3.e4 d6 4.Bf4 Bg7 5.Qd2 O-O 6.O-O-O c6 7.**W:** Bh6 / f3 / h4 / Kb1 … b5 | opposite-side attack; he lost twice with 4.e3 |
| kid-nc6 | 1 | … 6.O-O-O Nbd7 (LI 23%) / Nc6 (18%) 7.**W** (e5 thrust / Bh6 / f3) | |
| kid-nocastle | 2 | … 4.Bf4 Bg7 5.Qd2 c6 / h6 / Nbd7 (Black delays castling) 6.**W** | Bh6 not possible yet → O-O-O, f3, g4 |
| kid-d5 | 2 | 1.d4 Nf6 2.Nc3 g6 3.e4 d5?! 4.e5 Ne4 5.Nxe4 dxe4 6.**W** | [+0.93] |
| modern | 2 | 1.d4 g6 2.Nc3 (or 2.e4: same position) Bg7 3.e4 d6 4.Bf4 a6/c6/Nd7 5.Qd2 | [+0.5]; also covers 1...d6 2.Nc3 g6 |
| d6-e5 | 2 | 1.d4 d6 2.Nc3 e5 (YG 1) / 2...Nf6 3.e4 e5 4.Nf3 Nbd7 5.Bc4 Be7 6.O-O | Philidor set-up [+0.5]; W decides 2.Nc3 e5 3.dxe5 vs 3.Nf3 |
| nf6e6-bb4 | 1 | 1.d4 Nf6 2.Nc3 e6 3.Bf4 Bb4 (YG 3 incl. via 1...e6) 4.Qd3 d5 5.a3 Bxc3+ 6.Qxc3 / 5...Be7 | [+0.14]; (3...d5 4.Nb5 → chapter 2) |
| nf6e6-c5 | 1 | … 2...e6 3.Bf4 c5 (YG 2) 4.**W:** e3 (4...d5 5.Nb5 → c5-e6) / d5 | |
| nf6e6-b6 | 2 | … 2...e6 3.Bf4 b6 4.e4! Bb7 5.Bd3 | [+0.40] |
| nf6-c5 | 2 | 1.d4 Nf6 2.Nc3 c5 3.d5! e6/g6/d6 4.e4 | [+0.66] |

## Chapter 7 — `odd` Dutch, ...b6, 1...e6 move orders, Englund, Benoni (YG: Englund 6, 1...b6 3, 1...e6 several, Dutch 1)
| id | P | moves | notes |
|---|---|---|---|
| dutch-main | 1 | 1.d4 f5 2.Nc3 Nf6 3.Bg5! d5 4.Bxf6 exf6 5.e3 Be6 / c6 6.Bd3 … Qf3, Nge2, h4, O-O-O | [+0.27] |
| dutch-e6 | 2 | … 2.Nc3 Nf6 3.Bg5 e6 4.e4! fxe4 5.Nxe4 Be7 6.Bxf6 Bxf6 7.**W** | [+0.69] |
| dutch-stonewall | 2 | 1.d4 f5 2.Nc3 d5 3.Bf4 Nf6 4.e3 e6 5.**W:** Nb5 / Bd3 / Nf3 ; also reached by 1.d4 d5 2.Nc3 f5 and 2...e6 3.Bf4 f5 (YG 1) | [+0.44] |
| dutch-odd (punish) | 3 | 1.d4 f5 2.Nc3 g6?! 3.h4! ; 1.d4 e6 2.Nc3 f5?! 3.e4! | [+1.3] |
| b6 | 1 | 1.d4 b6 2.Nc3 Bb7 3.e4 e6 4.Bd3 Nf6 5.**W:** Nge2 / Qe2 / Nf3 (= 1.d4 e6 2.Nc3 b6 3.e4) | [+0.66]; he lost with 3.Bf4 Bb4 here |
| e6-c5 | 2 | 1.d4 e6 2.Nc3 c5 (LI 12%) 3.d5! **W** | [+0.69] |
| e6-bb4 | 2 | 1.d4 e6 2.Nc3 Bb4 3.**W:** Qd3 (then e4) / e4 | [+0.37 / +0.61]; (2...d5 3.Bf4 → chapter 5; 2...Nf6 → chapter 6) |
| englund-main (punish) | 1 | 1.d4 e5 2.dxe5 Nc6 3.Nf3 Qe7 4.Nc3! Nxe5 5.e4 (5.Bf4/5.Nd5 also win: W may switch if clearly simpler) | [+1.3]; X-note on 4.Bf4 Qb4+ trap |
| englund-d6 (punish) | 1 | 1.d4 e5 2.dxe5 d6 3.Nf3! (LI: 73% take on d6) Bg4/Nc6 4.**W** | [+1.69] |
| englund-odd (punish) | 2 | 1.d4 e5 2.dxe5 Nc6 3.Nf3 f6 / Bc5 / Nge7 ; 2...Qe7 ; 2...Bc5 (YG 1 each) | pick the two most frequent in explorer |
| benoni | 2 | 1.d4 c5 2.d5 Nf6 3.Nc3 d6/e6/g6 4.e4 | [+0.67]; same as nf6-c5 by transposition: one of the two lines carries the content, the other a note |
| nc6 | 3 | 1.d4 Nc6 (YG 1) 2.**W:** Nf3 / d5 / e4 ; 1.d4 c6 2.Nc3 d5 3.Bf4 → 2c6 ; 1.d4 b5 (YG 1) 2.e4 | short |

## Budget
P1 = must (26 lines), P2 = should (≈ 24), P3 = only if space. Target: **36-40 full lines + 8-10 short punish items**. If over budget drop P3 first, then merge P2 lines that share 80% of their moves.

## Traps list (for the `## TRAPS` section; each must be engine-verified)
- set: 3...Nc6/…c5 & …Nc6 → Nb5 and Nc7+ forks (several forms); 4.Nb5 Bd6 5.Nxd6+ Qxd6?? 6.Bxd6.
- set: 3...e6 4.Nb5 c6?? 5.Nc7+.
- avoid: Englund 4.Bf4? Qb4+ 5.Bd2 Qxb2 6.Bc3?? Bb4!.
- avoid: with Nge2 played, Bd3 can be trapped by ...c5-c4 (old course note) — verify it still applies to a line in this course, else drop.
- avoid: ...Qb6 hitting b2 after Bf4 has left c1 (when Qxb2 is poisoned and when it is not).
- avoid: ...Bb4 + ...Ne4 pressure on c3 (why Qd3).
- set/avoid from explorer.json `courses.jobava.traps` that still lie on the new tree.
