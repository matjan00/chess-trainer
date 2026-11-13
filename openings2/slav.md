# Slav Defence (Black vs 1.d4 and flank openings) — repertoire skeleton

Course id `slav`, side black. Same conventions as jobava.md (**W:** = worker decides by depth-24 eval; evals are Stockfish d~20 from **White's** point of view; `LI` = Lichess 1200-1600 share; `YG` = user's games — few here, he played the King's Indian until now, so explorer data and soundness drive coverage).

Scope decision: 1.d4 d5 2.c4 c6 in full; all "d4 without c4" systems (London, Colle, Torre, Jobava, Veresov, 2.Bg5, Stonewall, Blackmar-Diemer); and one universal set-up against 1.Nf3 / 1.c4 / 1.g3 / 1.b3 (…d5, …c6, …Nf6, bishop out, …e6). 1.c4 c6 2.e4 d5 is the Caro-Kann 2.c4 line → cross-link to `caro/c4-accel`, no duplicate.

## The system in 8 rules
1. **...d5, ...c6, ...Nf6**, and the c8-bishop comes out **before ...e6** — the same idea as in the Caro-Kann course.
2. Main line (White has Nf3 **and** Nc3): **take on c4** (4...dxc4). After 5.a4 the bishop comes to **f5**, then ...e6, ...Bb4, ...O-O, ...Nbd7. If White does not play a4, keep the pawn with **...b5**.
3. If White plays **e3 before Nc3** (Slow Slav): **...Bf5** at once, then ...e6, ...Nbd7, ...Be7/…Bd6.
4. **Qb3 → ...Qc7** (covers b7; never ...b6). With the bishop still on c8, Qb3 is harmless.
5. **3.Nc3 Nf6 4.e3** is the one position where ...Bf5 is inaccurate (5.cxd5 cxd5 6.Qb3!): play **4...a6!** first, then ...b5 or ...Bf5/…Bg4.
6. White develops the c1-bishop early (**Bf4/Bg5 with c4**) → **...dxc4!** and hold with ...b5.
7. Exchange Slav: knights out, **...a6**, bishop to g4/f5, ...e6: symmetrical and safe.
8. No c4 (London/Colle/Torre…): **...Nf6 and ...c5!** (London, Torre, Jobava), **...Bf5** (Colle). Against a **g3 fianchetto: ...Bg4** set-up.

Pawn structures: (a) Slav "small centre" after ...dxc4 (c6+e6 vs d4+e3/e4): breaks ...c5 and ...e5; (b) Carlsbad-symmetrical (Exchange); (c) Chebanenko ...a6/...b5 wall; (d) London structure with ...c5/...Nc6/...Bd6; (e) extra c4-pawn gambits (…b5 chain).

## Chapter 1 — `main` Main line: 3.Nf3 Nf6 4.Nc3 dxc4 5.a4 Bf5 (LI after 4...dxc4: e4 42%, a4 20%, e3 17%, Bg5 13%, Bf4 5%)
Choice: **4...dxc4** [+0.42] (not 4...a6 [+0.43] / 4...e6 Semi-Slav [+0.29, but shuts the bishop in and is the most theory-heavy opening in chess]). Dutch variation with **8...O-O** [+0.30] (8...Nbd7 is +0.45). Krause 6.Ne5 → **6...Nbd7 7.Nxc4 Nb6** [+0.27..0.40] (not the 6...e6 7.f3 Bb4 piece-sacrifice theory).
| id | P | moves | notes |
|---|---|---|---|
| dutch-main | 1 | 1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3 dxc4 5.a4 Bf5 6.e3 e6 7.Bxc4 Bb4 8.O-O O-O 9.Qe2 Nbd7 10.e4 Bg6 11.Bd3 Bh5 (W: verify 11...Bh5 vs 11...h6) | [+0.32]; plan card: ...Qa5/…c5/…e5 breaks, the b4-bishop restrains e4 |
| dutch-nh4 | 1 | … 8.O-O O-O 9.Nh4 Nbd7 (W: or Bg4 10.f3 Bh5) 10.Nxf5 exf5 … | e-file + e4 outpost for Black |
| dutch-qb3 | 2 | … 7.Bxc4 Bb4 8.O-O O-O 9.Qb3 Qe7 (W) … | |
| krause | 1 | … 5.a4 Bf5 6.Ne5 Nbd7 7.Nxc4 Nb6 8.Ne5 a5 9.**…** (f3 / g3 / e3) | [+0.27]; 8.Ne3 Bg6 |
| nh4 | 2 | … 5.a4 Bf5 6.Nh4 e6 (W: or Bc8) 7.Nxf5 exf5 8.e3 Bd6 (W) | [+0.15] |
| a4-other | 3 | … 5.a4 Bf5 6.g3 / 6.Bg5 **W** (only if stats ≥ 8%) | |

## Chapter 2 — `gambits` White does not play 5.a4: we keep the pawn
| id | P | moves | notes |
|---|---|---|---|
| e4-geller | 1 | 1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.Nc3 dxc4 5.e4 (LI 42%: the move he will meet most) b5 6.e5 Nd5 7.a4 e6 8.axb5 Nxc3 9.bxc3 cxb5 10.Ng5 Bb7 11.Qh5 g6 (W: verify to a quiet end) | [-0.40]; X-note 5...Bg4?/5...e6? [+0.9/+1.4] are what most people play |
| e4-quiet | 1 | … 5.e4 b5 6.Be2 (6.a4 b4 / 6.Bg5 / 6.Qc2) e6 7.O-O Bb7 (W: order by frequency) | consolidate: ...Nbd7, ...a6, ...c5 |
| e3-b5 | 1 | … 4...dxc4 5.e3 b5 6.a4 b4 7.Nb1 (7.Na2 LI 63%) Ba6 (W: or e6) 8.**…** | [-0.01..-0.16] |
| bg5-dxc4 | 2 | … 4...dxc4 5.Bg5 (LI 13%) b5 (W: or h6 [-0.54]) 6.**…** | |
| g3 | 3 | … 4...dxc4 5.g3 b5 (W) | |

## Chapter 3 — `slow` Slow Slav and other 4th moves: 3.Nf3 Nf6 4.e3 Bf5 (LI after 4.e3 Bf5: Nc3 50%, Bd3 12%, cxd5 11%, Be2 7%)
| id | P | moves | notes |
|---|---|---|---|
| slow-nh4 | 1 | 1.d4 d5 2.c4 c6 3.Nf3 Nf6 4.e3 Bf5 5.Nc3 e6 6.Nh4 Bg6 (W: or Be4 [+0.19]) 7.Nxg6 hxg6 8.**…** Nbd7, Bd6 | h-file + solid; bishop pair for White but nothing to attack |
| slow-bd3 | 1 | … 5.Nc3 e6 6.Bd3 Bxd3 7.Qxd3 Nbd7 8.O-O Be7 (W: or Bb4) 9.e4 dxe4 10.Nxe4 Nxe4 11.Qxe4 … | [+0.11]; Caro-like |
| slow-be2 | 2 | … 5.Nc3 e6 6.Be2 Nbd7 7.O-O Bd6 (W) 8.**…** | |
| slow-qb3 | 1 | … 4.e3 Bf5 5.Qb3 Qc7 (rule 4) 6.**…** ; and 5.cxd5 cxd5 6.Qb3 Qc7 7.Bb5+ (7.Nc3 e6) Nc6 (W) | [+0.07 / +0.15] two lines if both are ≥ 8% |
| slow-bd3-early | 2 | … 4.e3 Bf5 5.Bd3 Bxd3 6.Qxd3 e6 7.O-O Nbd7 8.Nc3 → slow-bd3 (note) / 8.Nbd2 | |
| qc2 | 1 | … 3.Nf3 Nf6 4.Qc2 (or 4.Qb3) dxc4 5.Qxc4 Bf5 6.Nc3 (6.g3) e6 7.**…** Nbd7, Be7 | [+0.17] |
| g3 | 2 | … 3.Nf3 Nf6 4.g3 Bg4 (rule 8; [+0.11], the engine's top) 5.Bg2 e6 6.O-O Nbd7 … | Catalan-style |
| nbd2 | 3 | … 4.Nbd2 Bf5 5.**…** | [0.00] |
| bf4-bg5 | 2 | … 3.Nf3 Nf6 4.Bf4?! (4.Bg5) dxc4! 5.**…** b5 | [-0.27 / -0.38] rule 6 |

## Chapter 4 — `nc3` 3.Nc3 (LI 52%: White's most common third move) and 3.e3
Choices: 3.Nc3 Nf6 4.Nf3 → chapter 1. 4.e3 → **4...a6** [+0.23] then 5.Nf3 **b5** [+0.33] (not 4...Bf5?! 5.cxd5 cxd5 6.Qb3; not 4...g6 [+0.44]). 4.Bf4 / 4.Bg5 → **4...dxc4** [-0.33 / -0.20]. 3.e3 → **3...Bf5** [+0.18].
| id | P | moves | notes |
|---|---|---|---|
| nc3-a6-b3 | 1 | 1.d4 d5 2.c4 c6 3.Nc3 Nf6 4.e3 a6 5.Nf3 b5 6.b3 Bg4 7.**…** (Be2 / h3 / Bd2) e6, Nbd7, Bd6 | [+0.3] |
| nc3-a6-c5 | 1 | … 5.Nf3 b5 6.c5 g6 (W: or Nbd7 / Bg4) 7.**…** ; plan ...Bg7, ...O-O, ...Nbd7, ...e5 break | [+0.36] |
| nc3-a6-other | 2 | … 4.e3 a6 5.Qc2 (5.Bd3 / 5.a4 / 5.cxd5 cxd5) **W** → most frequent | after 5.cxd5 cxd5 it is an Exchange Slav with ...a6 already in: note |
| nc3-bf4 | 1 | … 3.Nc3 Nf6 4.Bf4 (YG 1) dxc4 5.e3 (5.e4 / 5.a4) b5 6.**…** | [-0.33] |
| nc3-bg5 | 1 | … 3.Nc3 Nf6 4.Bg5 dxc4 5.a4 (5.e4 LI 37% / 5.e3 / 5.Bxf6) **W** (5.e4 b5; 5.a4 Qa5) | [-0.28]; two lines if needed |
| e3-bf5 | 1 | 1.d4 d5 2.c4 c6 3.e3 (LI 12%) Bf5 4.Nc3 (LI 42%) e6 5.Nf3 (5.Qb3 Qc7 / Qb6 **W**) Nd7 (W: or Nf6 → slow-*) … | [+0.12] |
| e3-qb3 | 2 | … 3.e3 Bf5 4.cxd5 cxd5 5.Qb3 Qc7 6.**…** (Bb5+ / Nc3 / Bd2) | rule 4 |
| nc3-e4?! | 3 | … 3.Nc3 Nf6 4.e4?! dxe4 / 3.Nc3 Nf6 4.cxd5 → chapter 5 (note) | |

## Chapter 5 — `exchange` Exchange Slav 3.cxd5 cxd5 (LI 12% at move 3, more by transposition)
Choice: the **...a6 system** [+0.22..0.26] (6...Bf5 is equally good [+0.18] but needs the Qb3 Na5 / Bb5 details).
| id | P | moves | notes |
|---|---|---|---|
| ex-main | 1 | 1.d4 d5 2.c4 c6 3.cxd5 cxd5 4.Nc3 Nf6 5.Nf3 Nc6 6.Bf4 a6 7.e3 Bg4 8.Be2 e6 9.O-O Bd6 (W) … | [+0.21] |
| ex-rc1 | 2 | … 6.Bf4 a6 7.Rc1 Bf5 8.e3 Rc8 (W) ; 7.Ne5 | |
| ex-bf4-early | 1 | … 4.Nc3 Nf6 5.Bf4 Nc6 6.e3 a6 7.Bd3 (7.Nf3 → ex-main / 7.Rc1) Bg4 8.Nge2 e6 … | |
| ex-quiet | 2 | … 3.cxd5 cxd5 4.Nf3 Nf6 5.Bf4 / 5.e3 / 5.g3 (no Nc3) Nc6 6.**…** | |
| ex-qb3 | 2 | … 4.Nc3 Nf6 5.Qb3?! / 5.Bg5 **W** (most frequent) | |

## Chapter 6 — `systems` White plays d4 without c4 (London LI: the most played system at this level; YG: London/Bf4 4, Colle/e3 2, Torre-ish 1, Jobava-ish 2)
| id | P | moves | notes |
|---|---|---|---|
| london-main | 1 | 1.d4 d5 2.Bf4 Nf6 3.e3 c5 4.c3 Nc6 5.Nd2 e6 6.Ngf3 Bd6 7.Bg3 O-O 8.Bd3 b6 9.**…** (Ne5 Bb7 10.f4 Ne7!) | [+0.24]; the standard equaliser: trade/neutralise the f4-bishop |
| london-nf3 | 1 | 1.d4 d5 2.Nf3 Nf6 3.Bf4 c5 4.e3 Nc6 5.c3 (5.Nbd2) e6 (W: 5...Qb6 is the active option: use it only if it also passes for 5.Nbd2) 6.Nbd2 Bd6 → london-main (note) ; 4.dxc5 / 4.c3 | [+0.09] |
| london-dxc5 | 2 | … 2.Bf4 Nf6 3.e3 c5 4.dxc5 (4.Nc3 = Jobava reversed / 4.Bxb8) e6 (W) … | |
| london-qb6 | 2 | … 3.e3 c5 4.c3 Nc6 5.Nf3 (instead of Nd2) Qb6 6.Qb3 c4 7.Qxb6 axb6 (W: verify; else 5...e6) | the famous queenside clamp: only if it passes the thresholds |
| colle | 1 | 1.d4 d5 2.Nf3 Nf6 3.e3 Bf5 4.Bd3 (4.c4 c6 → chapter 3, note) e6 (W: or Bxd3 / Bg6) 5.O-O (5.Bxf5 exf5) Nbd7 … | [+0.08] |
| stonewall | 2 | 1.d4 d5 2.e3 Nf6 3.Bd3 c5 4.c3 Nc6 5.f4 Bg4 6.Nf3 e6 7.**…** | [-0.8] |
| torre | 1 | 1.d4 d5 2.Nf3 Nf6 3.Bg5 Ne4 4.Bf4 (4.Bh4 LI 32%) c5 5.e3 Qb6 (W) … | [-0.12] |
| bg5 | 2 | 1.d4 d5 2.Bg5 h6 3.Bh4 c6 4.e3 (4.Nf3) Qb6 5.**…** (b3 / Qc1) Bf5 | [-0.10] |
| jobava | 1 | 1.d4 d5 2.Nc3 Nf6 3.Bf4 c5 4.e3 cxd4 5.exd4 a6 6.Nf3 (6.Bd3 / 6.Be2) Nc6 (W: or Bg4) … ; 4.e4!? / 4.Nb5 Na6 as X-notes or a second line | [-0.05]; "you know this from the other side": cross-link to `jobava/c5-main` |
| veresov | 2 | 1.d4 d5 2.Nc3 Nf6 3.Bg5 Nbd7 4.Nf3 (4.f3 c6 / 4.Qd3) h6 5.Bh4 e6 (W) | [-0.09] |
| bdg | 1 | 1.d4 d5 2.e4 dxe4 3.Nc3 Nf6 4.f3 exf3 5.Nxf3 (5.Qxf3 Qxd4) c6 6.Bc4 Bf5 7.O-O e6 8.**…** (Ne5 / Ng5 / Bg5) | [-0.7] Ziegler set-up = our usual c6/Bf5/e6; also from 1.d4 d5 2.Nc3 Nf6 3.e4 dxe4 4.f3. Comment: "2...c6 is also fine and is simply your Caro-Kann" |
| g3-system | 3 | 1.d4 d5 2.Nf3 Nf6 3.g3 c6 4.Bg2 Bg4 (W: Bf5 is [+0.07] too; keep rule 8) 5.O-O Nbd7 6.**…** e6 | |

## Chapter 7 — `flank` 1.Nf3, 1.c4 and friends: one set-up (YG: 1.c4 3, 1.Nf3 5, 1.b3 1, 1.f4 1)
| id | P | moves | notes |
|---|---|---|---|
| reti | 1 | 1.Nf3 d5 2.c4 c6 3.b3 (3.g3 → kia-g3; 3.e3 Nf6 4.Nc3 a6/…; 3.d4 → Slav) Nf6 4.Bb2 Bf5 5.g3 (5.e3) e6 6.Bg2 Nbd7 7.O-O h6 (W) … Be7, O-O | [+0.02]; "London reversed" |
| kia-g3 | 1 | 1.Nf3 d5 2.g3 c6 3.Bg2 Bg4 (YG 2 reached 3.Bg2) 4.O-O Nd7 5.d3 (5.d4 / 5.c4) Ngf6 6.Nbd2 e5 (W: or e6) … | [+0.18]; rule 8 |
| english | 2 | 1.c4 c6 2.Nf3 (2.d4 d5 → Slav; 2.e4 d5 → Caro `c4-accel`; 2.g3 d5 3.Bg2 …; 2.Nc3 d5 3.cxd5 cxd5 4.d4 → Exchange) d5 3.b3 (3.e3 / 3.g3) Bf5 (W) … | [-0.09]; mostly a signpost line with transposition notes |
| b3-f4 | 3 | 1.b3 d5 2.Bb2 Bg4 (W: or Nf6/Bf5) … ; 1.f4 d5 2.Nf3 Bg4 (W) … | [0.0 / -0.24] |

## Budget
Target **36-40 full lines + 6-8 short punish items**. P1 = 24, P2 ≈ 18, P3 as space allows.

## Traps list (verify each)
- avoid: 3.Nc3 Nf6 4.e3 Bf5?! 5.cxd5 cxd5 6.Qb3 (b7 and d5) — the reason for rule 5.
- avoid: Qb3 answered by ...b6?/…Qb6 at the wrong moment; Exchange Slav symmetrical ...Bf5 and Nb5/Qb3/Bb5 ideas.
- avoid: main line — grabbing with ...b5 after 5.a4 (5...b5? 6.axb5 cxb5 7.Nxb5).
- avoid: 5.e4 b5 6.e5 Nd5 7.a4 — 7...Nxc3?/7...b4? vs 7...e6!; and the Ng5/Qh5/Qf3 threats against f7.
- avoid: 5.e3 b5 6.a4 — 6...a6? 7.axb5 cxb5 8.Nxb5! (pin on the a-file); play 6...b4.
- set: 4.Bf4/4.Bg5 dxc4 and White cannot win the pawn back; London 5.Nf3 Qb6 6.Qb3 c4; Stonewall 5.f4 Bg4; BDG — the Halosar trap for White's side (5.Qxf3 Qxd4 6.Be3 Qg4! not ...Qb4?) : verify.
- set: Krause 6.Ne5 e6?! 7.f3 is NOT our line: X-note only.
- from explorer.json `courses.slav.traps` those still on the new tree.
