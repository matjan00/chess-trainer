# Caro-Kann Defence (Black vs 1.e4) — repertoire skeleton

Course id `caro`, side black. Same conventions as jobava.md (**W:** = worker decides by depth-24 eval; evals are Stockfish d~20 from **White's** point of view, so smaller is better for us; `LI` = Lichess 1200-1600 share; `YG` = user's games).

## The system in 8 rules
1. 1...c6 and 2...d5 against everything.
2. **Bishop out first, then ...e6**: the c8-bishop goes to f5 (or g4 when a knight is on f3 and e5 has been played / in the Two Knights) before the e-pawn closes it in.
3. Advance (pawn on e5): ...Bf5, ...e6, then attack d4 with **...c5, ...Nc6, ...Qb6**, knight to e7-f5 or e7-g6. A French where the bad bishop is already outside.
4. When White attacks the f5-bishop with pawns (g4/h4): **...h5 against h4; ...Be4! against an early g4**; otherwise retreat to g6 and hit back with ...c5 / ...h5.
5. Exchange structures (exd5 cxd5): knights to c6 and f6, bishop to g4 (or f5), ...e6, ...Bd6; **against a check on b5 play ...Bd7**; watch the b7 pawn when the bishop has left c8 (…Qc7/…Qd7).
6. After ...dxe4 (Classical): ...Bf5, ...Bg6, ...h6 (a home for the bishop), ...Nd7, ...Ngf6, ...e6, ...Be7/…Bd6, castle (usually short).
7. If White gives you the centre for free (2.Bc4, 2.Qf3, 2.d3 …): take it with ...d5 and, where possible, ...e5.
8. Endgames are good for the Caro: the structure has no weaknesses; don't be afraid of queen trades.

Pawn structures: (a) Advance chain d4-e5 vs c6/d5/e6 → ...c5 lever; (b) Carlsbad (Exchange): minority-attack ideas for Black with ...b5-b4, e-file outpost for White; (c) Caro "small centre" after ...dxe4 (c6+e6 vs d4); (d) IQP (Panov); (e) Two Knights: bishop pair vs solid structure.

## Chapter 1 — `adv-short` Advance: quiet set-ups 3.e5 Bf5 (3.e5 YG 19 of 53; LI after 3...Bf5: Nf3 32%, Bd3 22%, Nc3 9%, f4 9%, c3 6%, h4 5%)
Choice: **3...Bf5** [+0.30] (not 3...c5 [+0.36]: he already plays ...Bf5, it follows rule 2, and the resulting plans are the easiest to explain). Against the Short system **5...c5** [+0.40→ after 6.Be3 +0.36, 6.O-O +0.24].
| id | P | moves | notes |
|---|---|---|---|
| short-main | 1 | 1.e4 c6 2.d4 d5 3.e5 Bf5 4.Nf3 e6 5.Be2 c5 6.O-O Nc6 7.c3 Bg4 (W: or 7...cxd4 8.cxd4 Nge7) 8.**…** | [+0.24]; plan ...Bxf3, ...cxd4, ...Nge7-f5, ...Qb6 |
| short-be3 | 1 | … 5.Be2 c5 6.Be3 cxd4 7.Nxd4 Ne7 8.**W** (8.O-O / 8.c4 / 8.Nd2) Nbc6 | [+0.33]; the critical test, keep it to the safest path |
| short-c3 | 1 | … 4.Nf3 e6 5.c3 (or 4.c3 e6 5.Nf3; LI 6%) c5 6.Be2/Bd3 Nc6 7.O-O **W** | |
| nf3-bd3 | 1 | … 4.Nf3 e6 5.Bd3 Bxd3 6.Qxd3 Qa5+ (W: or 6...c5 / 6...Ne7) 7.**…** | [+0.06] |
| bd3 | 1 | 1.e4 c6 2.d4 d5 3.e5 Bf5 4.Bd3 (YG 4, LI 22%) Bxd3 5.Qxd3 e6 6.Nf3 (6.f4 / 6.Ne2) Qa5+ 7.c3 (7.Bd2 / 7.Nbd2) Qa6 | [+0.22]; trade queens or win the light squares; he lost the sample game here |
| f4 | 1 | … 3.e5 Bf5 4.f4 (LI 9%) e6 5.Nf3 c5 6.c3 (6.Be3 Qb6) Nc6 7.**W** | [-0.02] |
| nd2 | 2 | … 4.Nd2 e6 5.Nb3 Nd7 6.Nf3 **W** (…Ne7, …h6, …Bg6 slow plan) | [+0.26] |
| h3 | 2 | … 4.h3 (YG 3) e6 5.g4 Bg6 6.**…** / 5.Nf3 c5 | [-0.03] |

## Chapter 2 — `adv-sharp` Advance: White attacks the bishop
| id | P | moves | notes |
|---|---|---|---|
| nc3-g4 | 1 | 1.e4 c6 2.d4 d5 3.e5 Bf5 4.Nc3 e6 5.g4 Bg6 6.Nge2 c5 7.h4 h5 8.Nf4 Bh7 9.Nxh5 Nc6 (W: confirm 9...Nc6 vs 9...cxd4) | [+0.04]; the sharpest line of the course: every move explained; (4.Nc3 YG 2) |
| nc3-quiet | 2 | … 4.Nc3 e6 5.Nf3 / 5.Be3 / 5.Bd3 **W** (most frequent non-g4 move) | |
| h4 | 1 | … 4.h4 (LI 5%) h5! 5.c4 (5.Bd3 Bxd3 6.Qxd3 e6 7.Bg5 Qb6) e6 6.Nc3 **W** | [+0.17..0.23]; X-note: 4...e6?? 5.g4 traps the bishop |
| g4 | 1 | … 4.g4 (YG 1) Be4! 5.f3 Bg6 6.h4 h5 7.**W** | [+0.07] |
| c4 | 1 | … 4.c4 (YG 2) e6 5.Nc3 **W:** Ne7 / dxc4 / Bb4 | [+0.22] |
| ne2 | 2 | … 4.Ne2 e6 5.Ng3 Bg6 6.h4 h5 (W: or h6) 7.**…** | [0.00] |
| be3 | 3 | … 4.Be3 e6 (W: or 4...Qb6) 5.Nd2 Nd7 … | [+0.2] |
| 3c5-note | – | no line: a comment in short-main says 3...c5 exists and is fine, but is not our repertoire | |

## Chapter 3 — `classical` 3.Nc3 / 3.Nd2 dxe4 4.Nxe4 Bf5 (3.Nc3/Nd2 YG 4; LI after 4...Bf5: Ng3 56%, Bd3 16%, f3 8%, Nc3 6%, Ng5 6%, Nc5 3%)
Choice: **4...Bf5** [+0.16, the engine's top] (not 4...Nf6 [+0.28] or 4...Nd7 [+0.29]): rule 2 again, the most reliable line.
| id | P | moves | notes |
|---|---|---|---|
| cl-main | 1 | 1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Bf5 5.Ng3 Bg6 6.h4 h6 7.Nf3 Nd7 8.h5 Bh7 9.Bd3 Bxd3 10.Qxd3 e6 11.Bd2 (11.Bf4) Ngf6 12.O-O-O Be7 **W** (…O-O plan) | [+0.27]; the tabiya: plan card on castling short + ...c5 |
| cl-bf4 | 2 | … 10.Qxd3 e6 11.Bf4 Qa5+ 12.Bd2 Bb4 (W: or Qc7) | |
| cl-nf3 | 1 | … 5.Ng3 Bg6 6.Nf3 Nd7 7.Bd3 (7.Bc4 / 7.h4 → main) Bxd3 8.Qxd3 e6 9.O-O Ngf6 | no-h4 club-level line; note 6...Nd7! stops Ne5 |
| cl-bc4 | 1 | … 5.Ng3 Bg6 6.Bc4 e6 7.N1e2 Nf6 8.Nf4 (8.O-O / 8.h4) Bd6 **W** | [-0.03]; X-notes on the Nxe6 / Bxe6 sacrifices: when they work and when they do not |
| cl-bd3 (punish) | 1 | … 4.Nxe4 Bf5 5.Bd3?! (LI 16%) Qxd4! 6.Nf3 Qd8 (W: best retreat) 7.**…** | [-0.29] a clean extra pawn; (LI: only 21% take it) |
| cl-qf3 | 2 | … 5.Qf3 e6 6.**W** ; 5.Nc5 (LI 3%) b6 / e5 **W** | [+0.11] |
| cl-f3 (punish) | 2 | … 4.Nxe4 Bf5 5.f3? / 5.Nc3 / 5.Ng5 (LI 6-8% each) **W** shows the simplest good reply to the two most frequent | |
| bdg-caro (punish) | 2 | 1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.f3?! exf3 5.Nxf3 Bf5 (W: or Nf6) ; 4.Bc4?! Nf6 5.f3 | [-0.57]; same structure as the Blackmar-Diemer line in the Slav course |

## Chapter 4 — `exchange` Exchange and Panov: 3.exd5 cxd5 (YG: 2.d4+3.exd5 7, and via 2.Nf3 another 11; LI after 3...cxd5: Nf3 31%, Nc3 29%, c4 15%, Bd3 13%, Bb5+ 4%)
Choices: vs 4.Bd3 Nc6 5.c3 → **5...Qc7** [+0.16] (stops Bf4, prepares ...Bg4/...e5; model game Carlsen–So 2017 is already in the repo). vs 4.Nf3 → **4...Nf6** [+0.17] then ...Nc6, ...Bg4. Panov → **5...e6 and 6...Bb4** [+0.16] (no c4-c5 clamp to learn; IQP play).
| id | P | moves | notes |
|---|---|---|---|
| ex-main | 1 | 1.e4 c6 2.d4 d5 3.exd5 cxd5 4.Bd3 Nc6 5.c3 Qc7 6.Ne2 (6.h3 / 6.Nf3 / 6.Bg5) Bg4 7.**…** e6, Bd6 | [+0.16] |
| ex-h3 | 2 | … 5.c3 Qc7 6.h3 Nf6 7.Nf3 g6 (W: or e6/Bd7) … | Black's bishop problem solved by ...g6 & ...Bf5 |
| ex-nf3 | 1 | … 3.exd5 cxd5 4.Nf3 (= 2.Nf3 d5 3.exd5 cxd5 4.d4, YG 13!) Nf6 5.Bd3 (5.Nc3 / 5.Bf4 / 5.c4 → Panov / 5.Bb5+ Bd7) Nc6 6.c3 Bg4 7.**…** | the user's single most frequent Black position: two lines (this + next) |
| ex-nf3-nc3 | 1 | … 4.Nf3 Nf6 5.Nc3 (LI 35%) Bg4 (W: or Nc6 / a6) 6.**…** ; 5.Bb5+ Bd7 | |
| ex-nc3 | 1 | … 3.exd5 cxd5 4.Nc3 (LI 29%) Nf6 (W: or Nc6 [-0.04]) 5.Nf3 (5.Bf4 / 5.Bb5+ / 5.Bg5) … | [0.00]; must not contradict ex-nf3-nc3 (same position by transposition → same move) |
| ex-bf4 | 2 | … 4.Bf4 Nc6 5.c3 (5.Nf3) Bf5 (W: or Qb6) … | [+0.05] London-style Exchange |
| panov-main | 1 | … 3.exd5 cxd5 4.c4 Nf6 5.Nc3 e6 6.Nf3 Bb4 7.cxd5 Nxd5 8.Bd2 (8.Qc2) Nc6 9.Bd3 O-O (W: Be7 retreat timing) | [+0.28]; IQP plan card: blockade d5, trade minor pieces |
| panov-c5/bd3 | 2 | … 6.Nf3 Bb4 7.Bd3 dxc4 8.Bxc4 O-O 9.O-O **W** ; 6.c5?! ; 6.Bg5 | most frequent sidelines only |

## Chapter 5 — `knights` 2.Nf3 and 2.Nc3: Two Knights and friends (2.Nf3 YG 21 of 53!)
Choices: Two Knights **3...Bg4** [+0.19]. After 2.Nf3 d5 3.e5 → **3...Bg4** [+0.20, top; he already plays it] (3...Bf5 4.d4 would transpose to the Short system but is [+0.44]). 3.exd5 cxd5 4.Bb5+ → **4...Bd7** [0.00] (rule 5).
| id | P | moves | notes |
|---|---|---|---|
| tk-main | 1 | 1.e4 c6 2.Nc3 d5 3.Nf3 (or 2.Nf3 d5 3.Nc3) Bg4 4.h3 Bxf3 5.Qxf3 e6 6.d4 (6.d3 / 6.g3 / 6.Be2) Nf6 7.**…** | [+0.23]; X-note: 4...Bh5?! 5.exd5 cxd5 6.Bb5+ Nc6 7.g4 is the famous trap [+0.75] (LI: 44% fall for Bh5) |
| tk-d3 | 2 | … 5.Qxf3 e6 6.d3 Nd7 7.Bd2 (g3) … | slow set-up; ...Bd6/…Ne7 |
| tk-be2 | 2 | … 3.Nf3 Bg4 4.Be2 e6 5.d4 (5.O-O) Nf6 (W) | [+0.24] |
| nf3-e5 | 1 | 1.e4 c6 2.Nf3 d5 3.e5 (YG 5) Bg4 4.d4 (LI 69%) e6 5.Be2 (5.h3 Bxf3 6.Qxf3 c5) c5 6.**…** Nc6 | [+0.13..0.23]; improved French: the bishop is outside |
| nf3-bb5 | 1 | 1.e4 c6 2.Nf3 d5 3.exd5 cxd5 4.Bb5+ (YG 3) Bd7 5.Bxd7+ Nxd7 (W: or Qxd7) 6.d4 (6.O-O) Ngf6 … | [0.00] |
| nf3-ne5 | 2 | … 3.exd5 cxd5 4.Ne5 Nc6 5.d4 (5.Bb5 / 5.Nxc6) **W** | [0.00] |
| nf3-d3 | 2 | 1.e4 c6 2.Nf3 d5 3.d3 (KIA-ish) dxe4 4.dxe4 Qxd1+ 5.Kxd1 Nf6 (W: or keep queens with 3...Bg4 / 3...Nd7) | [+0.16]; rule 8 |
| nf3-c3 (punish) | 2 | 1.e4 c6 2.Nf3 d5 3.c3? dxe4 4.Ng5 (YG 1) Nf6 5.**…** | [-1.32] |
| nc3-qf3 | 3 | 1.e4 c6 2.Nc3 d5 3.Qf3 dxe4 (W: or d4) 4.Nxe4 Nd7 … | [+0.04] |
(2.Nc3 d5 3.d4 dxe4 → chapter 3. 2.Nf3 d5 3.exd5 cxd5 4.d4 → `ex-nf3`.)

## Chapter 6 — `side` Sidelines: Fantasy, 2.Bc4, 2.c4, King's Indian Attack, 2.f4, 2.Qf3 (YG: 2.Bc4 5, 2.Qf3 2, 2.f4 2)
| id | P | moves | notes |
|---|---|---|---|
| fantasy | 1 | 1.e4 c6 2.d4 d5 3.f3 e6 4.Nc3 Bb4 (W: or Nf6) 5.**…** (5.Bf4 / 5.a3 / 5.Bd2) | [+0.08]; solid choice, not 3...dxe4 4.fxe4 e5 (sharper, [+0.32]) |
| fantasy-be3 | 2 | … 3.f3 e6 4.Be3 (4.Bd3) **W** | |
| bc4 | 1 | 1.e4 c6 2.Bc4 d5 3.exd5 cxd5 4.Bb3 (YG 3) Nc6 5.**…** Nf6, Bf5/Bg4, e6 (W: is ...e5 big centre sound here? use it if ≤ 35 cp loss) | [-0.35] |
| bc4-bb5 | 1 | … 2.Bc4 d5 3.exd5 cxd5 4.Bb5+ (YG 2) Bd7 5.Bxd7+ Qxd7 (W) … | [-0.37] |
| bc4-bb3 (punish) | 2 | … 2.Bc4 d5 3.Bb3?! dxe4 4.Qh5 e6! (W: verify; 4...g6?? / 4...Nf6?? lose to Qxf7#/Bxf7+) | [-0.9]; avoid-trap |
| qf3 | 2 | 1.e4 c6 2.Qf3 (YG 2) d5 3.exd5 cxd5 4.d4 (4.Bb5+ Bd7) Nc6 … | [-0.33] |
| f4 | 2 | 1.e4 c6 2.f4 (YG 2) d5 3.e5 Bf5 4.Nf3 e6 5.d4 c5 → note: same plans as `f4` in chapter 1 (transposes after 6.c3) | [-0.14] |
| c4-accel | 1 | 1.e4 c6 2.c4 d5 3.exd5 cxd5 4.cxd5 (4.d4 → Panov) Nf6 5.Nc3 (5.Bb5+ Nbd7 / 5.Qa4+) Nxd5 6.Nf3 (6.Bc4) **W** | [+0.09]; also reached from 1.c4 c6 2.e4 (cross-link from the Slav course) |
| kia | 2 | 1.e4 c6 2.d3 d5 3.Nd2 e5 4.Ngf3 Bd6 5.g3 Nf6 6.Bg2 O-O | rule 7 |
| bd3-be3 (punish) | 3 | 1.e4 c6 2.d4 d5 3.Bd3?! dxe4 4.Bxe4 Nf6 ; 3.Be3?! dxe4 4.Nd2 … | [-0.06 / -0.53] |
| ne2 | 3 | 1.e4 c6 2.Ne2 d5 3.e5 c5 (W: or Bf5) … | |

## Budget
Target **36-40 full lines + 6-10 short punish items**. P1 = 24, P2 ≈ 18, P3 as space allows.

## Traps list (verify each)
- avoid: Two Knights 4...Bh5?! 5.exd5 cxd5 6.Bb5+ Nc6 7.g4 Bg6 8.Ne5.
- avoid: Advance 4.h4 e6?? 5.g4 (bishop trapped after ...Be4 6.f3 Bg6 7.h5).
- avoid: Classical 5.Ng3 Bg6 6.h4 — forgetting ...h6 (h5 traps the bishop).
- avoid: Classical 6.Bc4/N1e2/Nf4: the sacrifices on e6 (when they work, when they don't).
- avoid: Classical 6.h4 h6 7.Nf3 — play 7...Nd7! first (7...Nf6?! 8.Ne5 Bh7 9.Bc4 e6 10.Qe2 with Nxf7 ideas: verify and show).
- avoid: Exchange — ...Bf5/…Bg4 followed by Qb3 hitting b7 and d5: when ...Qd7 / ...Qc7 / ...Na5 is the answer.
- avoid: 2.Bc4 d5 3.Bb3 dxe4 4.Qh5 (f7).
- set: 4...Bf5 5.Bd3 Qxd4; 2.Nf3 d5 3.c3 dxe4; Fantasy 3.f3 e6 4.Nc3 Bb4 5.e5?! c5; Advance ...Qb6 hitting b2 + d4 when White has played Be3 carelessly.
- from explorer.json `courses.caro.traps` those still on the new tree.
