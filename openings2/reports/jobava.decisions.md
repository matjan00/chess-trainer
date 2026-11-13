# jobava — line writer decisions (T2a)

Verifier (after the fix round, 2026-11-13): `verify_course.py jobava` gives **0 FAIL, 15 WARN**; with `--coverage` **0 FAIL, 66 WARN** (the extra 51 are Q14 WARNs for 5-10% replies). Report: `reports/jobava.verify.txt`.
Course: **47 lines + 7 traps, 325 cards** (Q16 target 220-320, 5 over it and 25 over the review's 250-300; 47 lines against the "about 44" asked. If the lead wants it smaller, e6-be7, 2c6-qb6 and c6-bg4 are the least frequent new lines). The text below the fix-round section is the original first-round report.
All engine work used Stockfish limited to 4 threads. The tools hard-code `Threads 6`, so I ran them through a scratch wrapper that patches `Evals.__init__`. No tool was edited.

## W-decisions (depth-24 root-move evals, White's point of view; I treated a gap of 5 cp or less as a tie, and a tie goes to the first option)
| item | options | choice |
|---|---|---|
| c5-main 7 | Ne5 +0.01, h3 +0.01, Be2 -0.03 | **Ne5** (tie) |
| c5-e6 6 | c3 +0.36, Nf3 +0.23 | **c3** |
| c5-a6 6 (after 5...e6) | Na4 +0.28, Nf3 -0.13 | **Na4**. After 5...Nc6: Nf3 +0.06, Na4 -0.20 (not trained) |
| c5-xnc6 7 | Bxe5 +1.31, dxe5 +0.75 | **Bxe5** (written as a trap, see below) |
| c5-qb6 6 | dxc5 +0.64, a4 +0.62 | line dropped: 4...Qb6 loses 61 cp and has no stats (class "not allowed") |
| e6-be7 6 | Nf3 -0.03, a3 -0.11 | Nf3. The line was dropped: the engine line has odd knight retreats and the move is rare (5%, now under skip:) |
| e6-bb4 6 | Nf3 +0.02, a4 -0.08, Qa4+ -0.49 | Nf3. Line dropped: 4...Bb4+ is 3%. 5...Be7?? 6.Nxc7+ (+6.87) is 2% and not classic |
| e6-bd7 6 | a4 +0.17, Nc3 -0.21 | dropped: 5...Bd7 loses 32 cp with a 10% share, so it is not allowed |
| bf5-main 5 | Bd3 +0.13, Nf3 +0.13, Nb5 -0.02 | **Bd3** (tie) |
| c6-bg4 5 | f3 +0.34, Qd2 +0.27, Be2 -0.04 | f3, but the line was dropped: 4...Bg4 loses 33 cp and its share is just under 15%, so the verifier calls it "bad". Now a skip: |
| c6-qb6 5 | Rb1 +0.14, a3 +0.00 | **Rb1** |
| bg4 | 4.f3 +0.49; 4...Bh5 5.g4 +0.50; 4...Bf5 5.g4 +0.53 | dropped: 3...Bg4 loses 48 cp at a 2% share |
| a6-e6 6 | dxc5 -0.05, Be2 -0.07, Bd3 -0.36 | **dxc5**. It is a tie, but 6.Be2 would give two course moves in one position: the line 1.d4 e6 2.Nc3 d5 3.Bf4 c5/a6 transposes here, and dxc5 is also the engine's top move |
| a6-nc6 5 | Bd3 +0.27, Nf3 +0.23 | **Nf3** (tie) |
| g6-main 5 | Nb5 / Nf3 / h4 all 0.00 | **Nb5** |
| nbd7 5 | dxe5 +1.15, Bxe5 +0.58 | dropped: 3...Nbd7 has a 0% share |
| nc6-other 4...Rb8 | Bxc7 +5.94, e3 +4.09 | skip: only. Traps after 3...Nc6? cannot pass Q5 (see the tool notes) |
| 2e6-bb4 4 | Qd3 +0.12, Nf3 0.00 | **Qd3** |
| 2e6-a6 5 (4...c5) | Nf3 -0.08, dxc5 -0.29 | **Nf3**, then 6.dxc5 transposes to a6-e6 |
| 2e6-a6 4...Bd6 | Qg4 +0.20, Bxd6 -0.03 | skip: only |
| 2c5 | the skeleton's **5.Qa4 is -1.10**: 4...Nc6? blunders d5 (5.Qxd5 +1.67) | the binding move failed, so I did not improvise a replacement for it. The main line is now 4...e6 5.Bxb8! (engine) and the **punish line is 4...Nc6? 5.Qxd5**. **Lead: please confirm.** |
| 2e5 | 4.Ne4: Black's best reply 4...Qd5 is +0.78 for White | dropped: 2...e5 loses 77 cp at a 1% share (not allowed) |
| kid-main 7 | Bh6 +0.97, h4 +0.86, f3 +0.85, Kb1 +0.64 | **Bh6** |
| nf6e6-c5 4 | d5 +0.18, e3 +0.04 | d5, as a skip: entry only (see the tool notes) |
| d6-e5 3 | Nf3 +0.58, dxe5 +0.32 | dropped: 1...d6 and 2...d6 are "bad" |
| dutch-stonewall 5 | Nf3 +0.49, Nb5 +0.44, Bd3 +0.43 | Nb5 (tie), but the line was dropped (only one 1...f5 line is possible) |
| b6 5 | Nge2 +0.88, Nf3 +0.58, Qe2 +0.45 | dropped: 2.Nc3 loses 45 and 2...Bb7 loses 32 after the branch point |
| e6-bb4 3 | e4 +0.48, Qd3 +0.22 | **Qd3 as !sys**: after 3.e4 d5 the game is a French Winawer, against the user's "keep 3.Bf4" decision. **Lead: please review** |
| nc6 (1.d4 Nc6) | d5 +0.75, Nf3 +0.49, e4 +0.45 | dropped: 1...Nc6 loses 68 cp at a 0% share |
| englund 5 | Bf4 +1.69, e4 +1.34 (5.e4 loses 35) | **Bf4** (the skeleton allowed the switch) |

## Deviations from binding skeleton moves (lead must review)
1. **The recapture after ...Bxd3.** The skeleton has 6.Qxd3. At depth 22 it loses 31 cp (bf5-main), 33 cp (c6-bf5) and 32 cp (a6-bf5) against **cxd3**. In a6-bf5 the skeleton's 10.e4 also drops to -0.31, below the Q3 floor. So **bf5-main, bf5-c5 and a6-bf5 use 6.cxd3** (Qb3, Rc1 plan). In **c6-bf5 I kept 6.Qxd3 as !sys** (33 cp): after 6.cxd3 Qb6 7.e4 Qxd4 the engine only finds a gambit that ends in a repetition. The comment explains the difference.
2. **2e6-bd6 7.Qd2** (+0.26) instead of the skeleton's 7.Bd3 (-0.04, a 30 cp loss), followed by castling long and h4/g4.
3. **The 2...e6 lines use the move order 1.d4 e6 2.Nc3 d5 3.Bf4.** After 1...d5 2.Nc3, the move 2...e6 "loses" 37 cp because 3.e4 is strong. That makes it a common-ok move, which may only be the branch point of a single line. Via 1...e6, 1...e6 loses 26 and 2...d5 loses 3, both sound. The positions and cards are identical, and `skip: 1.d4 d5 2.Nc3 e6 | transposes` covers the other order.
4. **kid-main is a `punish` line.** 2...g6?! loses 72 (common-ok) and 5...O-O? loses 39 at a 57% share; it is the one extra `?` a punish line may have. It ends at 9.Nce2 (17 plies) because of the 20-ply limit.
5. **The 3...Nc6? complex** is one punish line (6...Nd7, the most common sound reply, ending 7.Qxd5) plus traps nc6-ne4 and nc6-ng4. 4...e6/a6/Bf5 5.Nxc7+ are shown as a variation in the comment.
6. **c5-xnc6 is a TRAP, not a line**: the forced line needs 12.Nxd5 (23 plies, over the punish limit), and every earlier stop fails Q12.

## !sys moves (5 of 8; loss at depth 22)
- 3.Bf4 after 1.d4 e6 2.Nc3 d5: **42** (e4 is stronger: French)
- 2.Nc3 after 1.d4 Nf6: **38** (c4/Nf3)
- 3.Bf4 after 1.d4 Nf6 2.Nc3 e6: **46** (e4)
- 6.Qxd3 in c6-bf5: **33** (cxd3)
- 3.Qd3 after 1.d4 e6 2.Nc3 Bb4: **26** (e4, but it allows the Winawer)

## WARN answers
- Q6 c5-e6 4...e6 (loss 28), c5-nc6 4...Nc6?, 2c5 3...cxd4 (loss 23), 2c5-nc6 3...cxd4 and 4...Nc6?, c5-xnc6 5...Nc6?, bf5-c5 6...c5: there are no stats for these positions. They are either sound (≤30 cp, natural moves) or flagged mistakes in punish lines and traps.
- Q13 e6-c6x 4...c6??, g6-oo 5...O-O?: these are the intended blunders of punish lines.
- Q11 bf5-bg6 -0.07, a6-e6 -0.11, 2e6-a6 -0.03: honest "about equal" ends; the comments say "about equal".
- Q9 2e6-a6: 2 new cards. It is a transposition line (=> a6-e6), kept because the user met 3...a6 twice (Q15).
- Q14 WARN (5-10% replies) are left uncovered on purpose (budget).

## Tool notes (no edits made)
- `common.Evals` hard-codes Threads 6. I worked around it with a wrapper (patching `__init__` to 4 threads).
- Several processes writing `cache/evals.json` at once overwrite each other's entries (each saves its whole in-memory copy). I ran only one engine process at a time.
- Q5 takes the *last* opponent node with 2+ children in the course as the branch point. Any inaccurate early move (common-ok/mistake) can therefore have only **one** line after it; the rest must be traps (which do not count) or skips. This removed or reshaped kid-nc6, kid-nocastle, kid-d5, modern, d6-e5, nf6e6-c5/b6, nf6-c5, dutch-e6, dutch-stonewall, dutch-odd, b6, e6-c5, englund-odd, benoni, 2c6, 2e5 and nc6.
- 2c5-nc6 carries the `classic` tag (4...Nc6? dropping d5 to Qxd5): no stats or YG exist, so without the tag Q5 fails. **Lead: confirm the tag is acceptable.**

## Not covered / for the lead
- Dropped because their key move is class "bad" or "not allowed", or because of the Q5 structure: modern (1...g6), Philidor (1...d6), Benoni/nf6-c5, 1...b6, 1...Nc6, 2...c6 (and 1...c6 2.Nc3 d5: 1...c6 loses 31 at 3%), 2...e5, 3...Bg4, 3...Nbd7, dutch-e6, dutch-odd, e6-c5 (2...c5 loses 33 at 12%), 2e6-nc6 (no quiet end found), e6-be7, e6-bd7, e6-bb4, c6-bg4, c5-qb6, c5-g4 (P3). The relevant ones are listed under `skip:` with an engine reply.
- Budget: 32 lines + 6 traps and 214 cards, against the 36-40 + 8-10 target. The structural rule above is the main reason.
- No MODELS: neither explorer.json game passes through a course position at ply 8 or later (we play 4.Nb5, not 4.e3). I added `models-wanted:` lines for c5-main, e6-c6, bf5-main and kid-main.

## Fix round after the lead review (T2a, 2026-11-13)
All engine work with `O2_THREADS=2-3` (the tool's own environment variable; no wrapper, no tool edits). Every new move was checked with `sfq.py`/the verifier at depth 22; final positions at depth 24.

### Fix list status
| # | item | status |
|---|---|---|
| 1 | 2...e6 lines in the real order 1.d4 d5 2.Nc3 e6 | **done**. 2...e6 loses 37 cp (share 21%), so it is `2...e6?!` with the "fine in general, only inaccurate because 3.e4 would be a good French" comment (owned by 2e6-bd6). 2e6-bb4 and 2e6-a6 now start 1.d4 d5 2.Nc3 e6. `skip: 1.d4 e6 2.Nc3 d5` documents the 1...e6 order; the old 1...e6 comments moved to the new line e6-c5. The `3.Bf4 ...` skips were rewritten in the new order (same positions). |
| 2 | 1...b6 | **done**: line `b6` (1...b6?! loses 84, YG 3). Transposition skip for 1...e6 2.Nc3 b6. |
| 3 | Modern / Pirc | **done**: line `modern` (1...g6?! loses 58, share 4%). Engine reply 4...Nc6 is met by 5.Bb5, then Qd2, Bh6xg7, O-O-O. The 1...d6 2.e4 g6 order is named in the intro; 1...Nf6 2.Nc3 d6 3.e4 g6 transposes to kid-main. |
| 4 | Philidor | **done**: line `philidor` (tag `defence`; 1...d6?! loses 41 at a 3% share). The 1...d6 2.Nc3 e5 game is mentioned in the 2.e4 comment. |
| 5 | Benoni | **done**: line `benoni` (tag `defence`; 1...c5?! loses 52). 5.Nf3 (loss 13) instead of the engine's 5.dxe6 Bxe6 6.Nh3/Nge2 knight tour: simpler and inside Q1. `skip: 1.d4 Nf6 2.Nc3 c5` carries the note. |
| 6 | 1...c6 / 2...c6 | **done**: `1c6-bf5` (1...c6 is sound, loss 31) and `2c6-qb6` (2...c6?! loses 40, share 8%, YG 1). |
| 7 | kid-nc6 | **not done**. After 2...g6?! and 5...O-O?! both 6...Nbd7 (loss 52) and 6...Nc6 (loss 43) are a third `?!` in the line, which Q5 v2 forbids (max two). Every move order goes through one early `?!` (1...g6, 1...d6 or 2...g6) plus 5...O-O?!. The other order 5...Nbd7 / 5...Nc6 then ...O-O is not allowed either (5...Nbd7 loses 74 at 10%, 5...Nc6 loses 37 at 9.5%, ply 10). The two `skip:` entries stay (6...Nbd7 7.e5, 6...Nc6 7.f3). **Lead: allow a third `?!` here or accept the skips.** |
| 8 | nf6e6-c5, nf6e6-b6 | **done** (b6: 3...b6?! loses 49, share 4%; 4.e4 Bb4 5.e5 Ne4 6.Qg4 Nxc3 7.a3 is forced and explained). |
| 9 | Dutch extras | **done**: `dutch-e6` (tag `defence`; 3...e6?! loses 61, no stats) and `dutch-stonewall`. The 2...e6 3.Bf4 f5 order is a skip that transposes (4.e3 Nf6). |
| 10 | 1...e6 2.Nc3 c5 | **done**: line `e6-c5` (2...c5 is sound, loss 33). |
| 11 | 2e6-nc6 | **done**. 7...Ne4 (engine) leads to forcing play with no quiet end; 7...O-O (loss 11, top 3) 8.c3 Re8 9.Be2 transposes into e6-bd6 (`=> e6-bd6`). X-note: 8.Bd3? loses 48 to the ...e5 fork idea. |
| 12 | e6-be7, e6-bd7, c6-bg4 | **done**. e6-be7 avoids the old Nb1/Qc1 retreats with 9.Be2 (tie with Nb1). c6-bg4 follows the most common 5...Bh5?! (62%, loss 70). |
| 13 | Englund trap | **done**: trap `englund-f6`. 2...Bc5 (19%) cannot be used: it loses 51 after the flagged 1...e5?, and Q5 allows only sound moves after a `?`. 3...f6 (4%, loss 14) is the most frequent sound one of the three. |
| 14 | skips removed / coverage | **done**: removed skips for 1...b6, 1...e6 2.Nc3 c5, 2...e6 3.Bf4 Nc6, 1...Nf6 2.Nc3 e6 3.Bf4 c5, 3...e6 4.Nb5 Na6 5.e3 Bd7, 3...c6 4.e3 Bg4. |

### New W-decisions (depth 24 root moves, White's point of view)
| item | options | choice |
|---|---|---|
| b6 5 | Nge2 +0.88, Nf3 +0.58, Qe2 +0.45 | **Nge2** (engine's 5.h4 +0.90 was not a listed option) |
| dutch-stonewall 5 | Nf3 +0.49, Nb5 +0.44, Bd3 +0.43 | **Nb5**: 5 cp gap = tie (same rule as before), tie goes to the first option |
| 2c6-qb6 4 (skeleton "2c6") | Rb1 +0.14, a3 -0.74 (a3 Qxb2 works for Black here) | **Rb1** |
| nf6e6-c5 4 | d5 +0.18, e3 +0.04 (earlier d24 run) | **d5** |
| e6-be7 6 | Nf3 -0.03, a3 -0.11 (earlier run) | **Nf3** |
| e6-bd7 6 | a4 +0.17, Nc3 -0.21 (earlier run) | **a4** |
| c6-bg4 5 | f3 +0.34, Qd2 +0.27, Be2 -0.04 (earlier run) | **f3** |
| philidor | skeleton line kept (5.Bc4 loses 1 cp) | - |

### WARN answers for the new lines
- Q1 1c6-bf5 4.e3 (26 cp): the system move; 4.f3 (preparing g4) is named in the comment as the sharper try.
- Q6 2c6-qb6 3...Qb6 (loss 11, no stats): the move the lead asked for (non-transposing try); sound.
- Old WARNs (Q6, Q11, Q13, Q9) are unchanged and answered above. Q14 WARNs (5-10%) stay uncovered on purpose.
- Final evaluations of the new lines (depth 24, our view): from +0.06 (1c6-bf5) and +0.09 (nf6e6-c5) up to +1.09 (dutch-e6) and +1.02 (e6-c5); the whole course ranges from -0.11 (a6-e6) to +6.25 (a trap).

### Coverage skips added
5.f3 Bf5 in c6-bg4 (31%) and seven replies inside e6-c5 (3...Nf6 22%, 3...d6 16%, 4...d6, 4...Nc6, 5...Nxe4 30%, 6...Nc6 34%, 6...Be7), each with the engine's answer. 5...Nxe4 (answer Qe2, pinning the knight) would be the next candidate for a short punish line.
