# slav: R2 restructure report

No move was changed and no line was added or deleted. Changes: chapters regrouped and reordered (lines moved between chapters), trunks marked, family stories rewritten, `start:`, `## RULES` (15 rules, at the end of the file because this course has no `## TRAPS` section) and 87 `{T: ...}` triggers. Two sets of comments were moved to the first line that owns the move (5.e4 5...b5 now sit in e4-e5); `skip:` texts that named "chapter systems" were reworded.

Result: verify_course.py slav --no-engine = 0 FAIL, 18 WARN. compile_courses2.py slav --no-engine compiles (48 lines, 549 nodes, 272 cards, not a draft). triggers_needed.py slav: 9 places left (all intentional, see below), 86 already have a trigger.

## Families (chapter -> trunk)
- main: Main line 4...dxc4 5.a4 Bf5 -> dutch-main (+ dutch-nh4, dutch-h3, krause, nh4)
- gambits: 5.e4 / 5.e3 and ...b5 -> e4-e5 (+ e4-quiet, e4-a4, e4-a3, e3-na2, e3-nb1). e4-e5 has the highest reach of the 5.e4 lines (0.00057) and 6.e5 is the most common reply; it was moved to the front (before e4-quiet).
- nc3: 3.Nc3 (4.Nf3 main line, against 4.e3 play ...a6) -> nc3-a6-b3 (+ nc3-nf3, nc3-a6-c5). nc3-nf3 was moved here from main (it is only a 4-move stub that transposes).
- pins (NEW, split out of gambits and nc3): early Bg5/Bf4, take c4 and hold it -> nc3-bg5 (reach 0.0038, highest) (+ nc3-bg5-e3, nc3-bg5-bxf6, nc3-bf4, bg5, bg5-bxf6)
- slow: Slow Slav 4.e3 -> slow-nh4 (+ slow-bd3, slow-be2, slow-qb3, slow-cxd5, slow-bd3-early, e3-bf5). Tie at reach 0.00105 between nh4/bd3/be2; kept the one written first.
- other4: 4.Qc2 / 4.g3 -> `mixed` (qc2, g3: unrelated tries; split out of slow)
- exchange: -> ex-main (+ ex-rc1, ex-bf4-early, ex-quiet). Reach says ex-bf4-early (0.00103) > ex-main (0.0006), but reach is a product over the whole line and 5.Nf3 then 6.Bf4 is the common path; ex-main kept (doubt, see below).
- colle (NEW, split out of systems): e3 set-ups, bishop at home -> colle (+ stonewall)
- london (NEW, split out of systems): bishop on f4, ...c5 -> london-main (+ london-nf3, jobava)
- knightpin (NEW, split out of systems): Bg5 on move 3 -> veresov (reach 0.0005 vs torre 0.00039) (+ torre)
- bdg (NEW, split out of systems and punish): Blackmar-Diemer -> bdg (+ bdg-qxf3, moved from punish)
- flank: first moves other than 1.d4 -> `mixed` (reti, kia-g3, english)
- punish: -> `mixed` (pin-e4, ne4, e4-a4-e5)

Chapter order: main, gambits, nc3, pins, slow, other4, exchange, colle, london, knightpin, bdg, flank, punish. nc3 comes before pins and colle before london so that the line that already holds a shared comment is the first line (no F2 warnings).

## Start lines
`start: dutch-main, london-main, nc3-a6-b3, slow-nh4` (the why: text has no game counts; chosen by reach among trunks: nc3-a6-b3 0.00296, london-main 0.00286, slow-nh4 0.00105 and the course's main line dutch-main 0.00137. nc3-bg5 has the highest reach but is a rare mistake (4.Bg5?!) so it is not a start line).

## Rule book (15 rules; places = triggered nodes)
- c6-vs-c4 "...c6 answers a pawn on c4": 11 (dutch-main 1...d5 / 2...c6, london-main / london-nf3 / jobava / stonewall 2...Nf6, reti 1...d5 / 2...c6 / 3...Nf6, kia-g3, english)
- bishop-first "Bishop out before ...e6": 12
- keep-c4 "Hold the c4 pawn": 9
- free-material "Take what White leaves loose": 8 (includes dutch-main 8...O-O as the "pin is over, nothing to take" contrast)
- f5-threat "Is your f5 bishop attacked?": 7
- c5-centre "Without c4: hit d4 with ...c5": 7
- grab-c4 "Take c4 unless e3 is played": 6
- retake-pawn "Retake with a pawn": 5
- a4-hits-b5 "a4 hits b5: ...b4 or ...Qb6": 4
- knight-h4 "Knight h4 hits your f5 bishop": 4
- a6-first "...a6 first, then ...b5": 4
- guard-b4 "A b4 pawn needs a guard": 3
- g5-pin "Bishop on g5 against your knight": 3
- knight-jump "Knight attacked: jump to the centre": 2
- guard-b7 "Qb3 hits b7: guard with queen": 2 (one extra trigger at slow-cxd5 6...Qc7, not in the worklist)

## Counts
- Places in the worklist: 95 (T-SPLIT 70, T-SISTER 87, both 62).
- Triggers written: 87 (86 worklist places + 1 extra for guard-b7). Skipped: 9 places (below). Every clue and every "here X" fact was asserted with python-chess on the position before our move (pieces on squares; "unguarded" checked with is_attacked_by).

## Skipped T-* WARNs (9 places, 5 groups)
1. Our move is the same against every opponent choice (not required by the brief): ex-main 4...Nf6, ex-main 5...Nc6, ex-quiet 4...Nf6.
2. Late development pairs where only a pawn move (a6 vs a5) and the bishop square (g5 vs f4) differ and no general rule exists: nc3-bg5-e3 9...Bb4 <-> nc3-bf4 9...Nbd7.
3. Same kind of late pair after Bxf6 exf6: nc3-bg5-bxf6 6...Be6 <-> bg5-bxf6 6...Bb4 (Be6 guards c4 when e3 is played; Bb4 stops Ne4 when Nc3 is played). A sentence is possible but would need a 16th rule ("one move-order detail").
4. nc3-a6-c5 6...g6 (SPLIT+SISTER of nc3-a6-b3 6...Bg4): closed queenside after c5 leads to the g6/Bg7 plan; one-off, no rule shared with another place.
5. ex-bf4-early 5...Nc6 (SPLIT+SISTER with jobava 5...a6): the pairing is between two different openings; only a move-order difference (the e3 push) separates them.

## Other remaining WARNs (all already there before R2)
Q11 krause / reti (final eval -0.36), Q1 reti 4...c6 (27 cp), Q6 pin-e4 8...e4 (known trap move), Q13 ne4 (a free knight, expected), Q9 slow-qb3 and english have 2 new cards (they are short transposition lines). No T-RULE / T-CLUE / TRUNK / RULES / F1 / F2 warnings are left (rule names are at most 6 words).

## Q3 candidates (near-copies, listed only, nothing applied)
- slow-bd3-early: ends with `=> slow-bd3`, same position after 5.Bd3 Bxd3 6.Qxd3 e6 (differs only in move order).
- nc3-nf3, e3-bf5, london-nf3, reti, english: stubs that end with `=>` into another line (transpositions).
- bg5-bxf6 vs nc3-bg5-bxf6: same idea (Bxf6 exf6, two bishops); differ only in the knight on f3 or c3.
- bg5 vs nc3-bg5-e3: both 5.e3 b5 6.a4 and then h6/Qb6 plus Be2 and ...e6; differ in the knight that is out.
- e3-nb1 vs e3-na2: same ...b4 pawn push, differ only in where the knight retreats (b1 or a2).
- ex-bf4-early vs ex-quiet: same plan ...Nc6, ...a6, ...Bg4, ...e6, ...Bd6; differ in Nc3 or Nf3.
- slow-qb3 vs slow-cxd5: transposition after Qb3 Qc7 cxd5 cxd5.
- dutch-h3 is close to dutch-main (White waits with h3 instead of Qe2); could be an idea note.

## Doubts (chess claims to check)
- Trunk choice by reach is rough: reach is a product over the whole line, so long lines are penalised (ex-main vs ex-bf4-early, slow-nh4 vs others).
- "Take c4 unless e3 is played" (grab-c4): the rule text names Nc3, Bg5, Bf4 and Qc2. Against 4.g3 we do not take (g3 uses bishop-first instead), so the rule is not meant for every position with a pawn on e2.
- dutch-main 8...O-O sits under free-material only as the contrast to pin-e4 8...Bxe4. Say if you want it moved to a rule of its own.
- jobava 5...a6 (a6-first): in the Exchange Slav the same ...a6 also stops Nb5, but it comes after ...Nc6 there; the pair is only a move-order difference.
- london-nf3 4...Nc6 and london-main 4...Nc6 both state facts (no pawn on c3 yet / pawn on c3 supports d4) but the engine choice is the same move; the sentence is true, the "why" is soft.
- keep-c4 is used at e4-quiet 6...e6 / e4-a3 6...e6 as "b5 is not attacked, so just develop"; the rule text says "if White has not played a4 hold the pawn", slightly stretched for these two.
