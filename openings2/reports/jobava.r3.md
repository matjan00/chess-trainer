# jobava R3 review

Result: verify_course --no-engine 0 FAIL, 16 WARN (one fewer than R2). Compile OK (47 lines, not a draft).
triggers_needed: 8 places left (T-SPLIT 6 = same move against every reply; T-SISTER 2: 1c6-bf5 9.Ne2, 2nc6 4.Nf3). 84 triggers, 14 rules.
No move, line or chapter changed.

## Structure (checked, unchanged)
- Trunks fine as chosen: c5-main (real main line cxd4 exd4 a6; c5-nc6 has more reach but is a mistake line), 2e6-bd6, c6-bf5, modern (1...g6 is met far more than the KID move order).
- start: e6-c6, bf5-main, nc6-e5 = the three highest-reach trunks (bf5 .026, e6 .014, nc6 .012). OK.
- a6-bf5 (bf5 chapter) with parent a6-nc6: sensible. Real shared start (3...a6 4.e3) and the split is the real decision (4...Nc6 -> Nf3, 4...Bf5 -> Bd3). The UI shows a branch whose parent is in another chapter at the top of its chapter, so it displays fine.
- No parent for kid-main, benoni, philidor, b6, e6-c5, englund-main: sensible. They share only 1.d4 (or 1.d4 Nf6 2.Nc3) with anything else, so a "same as X until here" card would be empty. kid-main's look-alike with nf6e6-bb4 (3.e4 vs 3.Bf4) is still covered by twin gating.

## Changes
- Rule d5-or-e4: removed the Dutch exception; now "...d5 still possible -> system; pawn on g6/d6/b6 instead -> e4" (true in all 13 uses). Name: "...d5 coming? System. Else e4".
- Rule dutch-bishop: now covers the follow-up (on ...e6 break with e4, on ...d5 take Bxf6). dutch-main 4.Bxf6 and dutch-e6 4.e4 retagged to it (they were stretched d5-or-e4 uses).
- Rule hit-c7: renamed "Nb5 when no pawn covers b5". The old text "when ...a6 cannot throw it out" was false (...a6 is always possible; it is just too slow against Nc7+). Added the ...Bd7 -> a4 case, used by e6-bd7 6.a4.
- Rule c5-pawn: rewritten. The old "take when the bishop needs a whole move" was empty (Bxc5 is always one move) and "hold it with Na4" contradicted a6-e6 (where you let ...Bxc5 happen).
- Rule d3-retake: "pawn still on c7" instead of "has not played ...c6"; queen retake now "and aim for e4".
- 2e6-bd6 3.Bf4: was tagged pin-qd3 ("no pin to meet" before any bishop move); retagged to d5-or-e4.
- False trigger facts fixed: c5-nc6 6.dxe5 "the c7 threat stays" (false: e5 pawn blocks the f4 bishop, c7 hit once only); nc6-e5 4.Nb5 "nothing guards c7" (queen d8 guards it); nc6-e5 5.Bxe5 "the pawn lands on e5" (garbled); nf6e6-c5 4.d5 "d5 gains space" (the pawn is traded at once; the point is the queen reaching d5).
- Wording/clues: c5-main 3.Bf4 (dropped the irrelevant g6/f5 clause and g7 clue), c5-nc6 5.Nb5 (clue a6), a6-bf5 6.cxd3 (clue c7 a6: the c7 pawn decides, not a6), c6-bf5 6.Qxd3 (real reason, not "...Qb6 hits d4": d4 is guarded by e3), a6-e6 6.dxc5, dutch-e6 4.e4 ("nothing holds e4" was wrong: f5 and Nf6 hit it; the point is no d5 pawn and the f6 knight is pinned, checked).
- New trigger c6-bf5 9.e4 (d3-retake, clue d3 f5): queen on d3 backs e4 and no pawn on f5, vs 1c6-bf5 where ...exf5 put a pawn on f5.

## Writer's doubts checked
- g6-main 5.Nb5 "...c6 loses to Nc7+": true (Nc7+ Qxc7 Bxc7 wins the queen for a knight).
- g6-oo 6.Nxc7 "c7 hit twice": true (b5, f4; only Qd8 guards).
- 2c5-nc6 5.Qxd5 "attacked twice, guarded once": true (Qd4, Nc3 vs Qd8).
- e6-jump "(or ...g6) e3 first": fine as a simplification; g6-main jumps one move later after ...Bg7, consistent with hit-c7.

## Still doubtful
- a6-e6 6.dxc5: taking is fine but not forced; the trigger now says only "Nb5 is off, Black spends a move on ...Bxc5, develop with Bd3".
- nf6e6-b6 4.e4 with ...e6 on the board sits at the edge of d5-or-e4 (Black could still go ...d5); kept, since ...b6 is the listed "no ...d5" signal.
- 1c6-bf5 9.Ne2 and 2nc6 4.Nf3 have no trigger (no short true rule found).
