# jobava R2 report (restructure)

Result: verify_course --no-engine: 0 FAIL, 17 WARN (8 of them are the intentional T- skips below, the rest are old engine/stat WARNs untouched). compile_courses2 --no-engine: OK (47 lines, ver 3, not a draft).
triggers_needed: 9 places left (all intentional skips). 83 triggers written. 14 rules.

## Families (chapter -> trunk)
c5 -> c5-main | e6 -> e6-c6 | bf5 -> bf5-main | c6 (new, Caro-style ...c6) -> c6-bf5 | a6 (new) -> a6-nc6 | g6 (new) -> g6-main | nc6 (new, incl. 2nc6) -> nc6-e5 | e62 (new, 2...e6) -> 2e6-bd6 | c52 (new, 2...c5) -> 2c5 | nf6e6 (new) -> nf6e6-bb4 | kid (new) -> modern | nod5 (mixed: benoni, philidor) | dutch (new) -> dutch-main | odd (mixed: b6, e6-c5, e6-bb4, englund-main)
Old chapters split: a6g6 -> a6 / g6 / nc6; second -> e62 / c52 (+ 2nc6 to nc6, 1c6-bf5 and 2c6-qb6 to c6); bf5 -> bf5 / c6; nod5 -> nf6e6 / kid / nod5 mixed; odd -> dutch / odd mixed. Only line order inside chapters changed (a6-nc6 before a6-e6, modern before kid-main); no move changed, no line added or deleted.
start: e6-c6, bf5-main, nc6-e5 (highest reach among trunks; the intro notes say 3...e6 is the most common and 3...Nc6 is met by 1 player in 5).

## Rule book (id - name - places used)
d5-or-e4 Pawn on d5? Develop; else e4 - 14 | c5-answer Meeting ...c5 - 7 | c5-pawn You took on c5 - 3 | e6-jump ...e6 and ...Nf6: jump at once - 7 | hit-c7 Nb5 only if nothing kicks it - 13 | fork-c7 c7 left alone: fork it - 4 | answer-piece Piece out: trade, kick, guard - 11 | d3-retake After Bxd3: pawn or queen? - 4 | pin-qd3 ...Bb4 pins the knight: Qd3 - 5 | bishop-d6 Bishop on d6: take or swap - 4 | dutch-bishop Dutch: Bg5 or Bf4? - 2 | fianchetto-plan ...g6 or ...e5: two plans - 4 | qd4-trick Queen on d4 after ...cxd4 - 2 | take-pawn Pawn offered on e5: take it - 3

## Skipped places (9, listed WARNs)
- T-SPLIT, same move against every reply (no trigger needed): 2bf5 3.Bf4, 2c6-qb6 3.Bf4, 2nc6 3.Bf4, 2c5 3.Bf4; bf5-main 7.Qb3 and bf5-c5 7.Qb3 (Qb3 against both ...Bd6 and ...c5).
- T-SISTER, late middlegame: c6-bf5 9.e4 vs 1c6-bf5 9.Ne2 (depends on structure after Bxf5 exf5; already explained in the notes, no short rule).
- T-SISTER 2nc6 4.Nf3 (after 3...f6): only the comment "stop ...e5"; I found no general rule I could verify.
Every other SPLIT / SISTER place has a trigger; every clue contains a differing square; all board facts in the sentences were checked with python-chess (piece/empty squares on the position before the move).

## Q3 candidates (not applied)
- nf6e6-bb4: note says it becomes the 2e6-bb4 position after 4.Qd3.
- e6-bb4: same Qd3 idea as 2e6-bb4 / nf6e6-bb4 via 1...e6.
- 2e6-a6: note says same game as a6-e6 (3...a6 4.e3 e6).
- 2c6-qb6: same Rb1 answer as c6-qb6.
- 1c6-bf5: transposes into the c6-bf5 Caro structure (differs from c6-bf5 only by Black's knight/queen move order).
- 2nc6: transposes into nc6-e5 after ...Nf6.
- bf5-c5: same as bf5-main except 6...c5; Qb3 plan identical.
- e6-be7 / e6-bd7: differ from the trunk e6-c6 only at move 5 and reuse the same plan.
- c5-a6q: continuation of c5-a6 after 5...Qa5.

## Doubts (please check)
- Trunks that differ from raw reach (reach punishes long lines): c5-main (c5-a6 has higher reach), 2e6-bd6 (2e6-a6 has higher reach; I took the f4-clamp line that shows the family plan), c6-bf5 (1c6-bf5 has higher reach; it is a different structure after Bxf5 exf5). kid chapter: trunk is modern by reach, but the family plan (Bf4, Qd2, Bh6) is first shown in kid-main, which is second there.
- Parents the compiler chose: kid-main parent = nf6e6-bb4, benoni / philidor / b6 / englund-main / e6-c5 parent = e6-c6 (they share only 1.d4 or 1.d4 Nf6 2.Nc3); a6-bf5 parent = a6-nc6. Maybe set `parent:` or accept.
- Chess claims worth a second look: g6-main 5.Nb5 "...c6 would lose to Nc7+" (fork of king and rook, true with Queen on d8); g6-oo 6.Nxc7 "c7 is hit twice" (knight b5 + bishop f4, guarded by the queen only); 2c5-nc6 5.Qxd5 "attacked twice (queen, knight), guarded once" (no ...e6, no knight on f6); rule e6-jump text "(or when Black plays ...g6 instead) e3 first" is a teaching simplification (nc6-e5 4.Nb5 jumps without ...e6, covered by hit-c7).
- d5-or-e4 is used both for "Nc3 not e4" and for e4 in the Dutch (3.Bg5 e6 4.e4), where the reason (no pawn on e4 guard) is slightly different.
