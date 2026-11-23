# caro: R3 review

Result: `verify_course.py caro --no-engine` = 0 FAIL, 14 WARN (same as R2). Compiles, not a draft, 42 lines / 338 cards.
`triggers_needed.py caro`: 9 places, all the intentional ones from R2 (7x 2...d5, nf3-bb5/bc4-bb5 recapture pair).
No move changed, no line added or deleted.

## Trunks and start
- **Exchange trunk stays ex-nf3** (orchestrator suggested ex-main). Game data in caro.md: the ex-nf3 position
  (2.Nf3 d5 3.exd5 cxd5 4.d4) is in 13 of the user's games, all of 2.d4 + 3.exd5 only 7. 4.Bd3 is 13% at club level.
  It also shows the family plan (...Nf6, ...Nc6, ...Bg4, ...e6, ...Bd6).
- **Exchange parents fixed**: ex-main, ex-nc3 and ex-nf3-nc3 had panov-main (another chapter) as parent. Now:
  `ex-nf3-nc3 <- ex-nf3` (4.Nf3 Nf6 is the trunk position, reached by 2.d4; split shows "2.d4 instead of 2.Nf3"),
  `ex-main <- ex-nf3-nc3` and `ex-nc3 <- ex-nf3-nc3` (real shared start up to 3...cxd5). ex-h3 <- ex-main unchanged.
- **Advance trunk stays bd3**, not the Short system: 4.Bd3 is 22% at club level and the user met it 4 times; 4.Nf3 e6 5.Be2
  is a small share. bd3 shows the whole family plan (...e6, ...c5, ...Nc6, ...Qb6, ...Ne7). short-main stays the first branch.
- **nc3-bd3 <- bd3** is now written as `parent:` (before, the compiler only fell back to it). It makes sense: same Advance
  start up to 3...Bf5, and the point of the line is the contrast with bd3 (here ...Ne7 first, there ...Bxd3 at once).
- `start: bd3, ex-nf3, nf3-e5, cl-main` (was bd3, cl-main, ex-nf3): ordered by the user's games (Advance 19, Exchange 18,
  2.Nf3 3.e5 5, Classical 4).

## Rules changed
- bishop-out: now says where the bishop goes: f5 if that square is safe, g4 if a knight on f3/e2 can be pinned or a White
  bishop on d3 covers f5. The old text (f5 with knight on g1, g4 with knight on f3) did not cover the Classical,
  ex-main (...Qc7 then ...Bg4) or bc4 uses.
- e4-pawn: old text said "guarded: ..." only for f3, but it was used where a knight (cl-main) or queen (qf3-d4) guards e4
  and where we play ...Nf6 instead of taking (tk-main). New: f3 pawn -> ...e6; otherwise ...dxe4, or ...Nf6 if your
  light-squared bishop is already gone.
- c5-or-knight: added "against an early g4 attack, hit back with ...c5 at once". Without it the rule (knight on c3 -> knight
  first) contradicted nc3-g4 6...c5.

## Triggers fixed
- cl-main 11...Ngf6: claimed "...Qa5+ can be met by c3". With the bishop on d2, ...Qa5 is not even check (checked with python-chess).
- panov-main 5...e6: "nothing to pin" was wrong (we pin Nc3 next move); now "...Bg4 has nothing to pin, ...e6 opens the way for ...Bb4".
- tk-main 6...Nf6: now says why we don't take on e4 (bishop gone, e4 guarded twice).
- nc3-bd3 5...Ne7: dropped the "so the knight can jump to f5" reason; that does not follow from the knight on c3.
- All other 80 triggers checked against the board: here-facts true, clue squares fine.

## Still doubtful
- The nf3-bd3 / nc3-bd3 pair: "knight on b1 -> ...Bxd3 now, knight on c3 -> ...Ne7 first" follows the engine moves, but I
  know no general reason for it. 5...Bxd3 against 4.Nc3 e6 5.Bd3 is probably fine too. Check with the engine if possible.
- nf3-bd3 7...Nd7 ("Nf3 guards e5, so ...Nd7") against bd3 7...Nc6 ("only d4 guards e5"): true on the board, but the
  "so" is weak. 7...Nc6 is also normal after 4.Nf3 e6 5.Bd3 Bxd3 6.Qxd3 c5 7.c3.
- h3-pin is named by family (Two Knights/Advance take, Exchange ...Bh5), not by a board clue. It matches the course and the
  tk-bh5 trap.
- tk-be2 5...Nd7 uses c5-or-knight, but ...c5 is not really the other choice there. Acceptable, slightly stretched.
- The ex-nf3-nc3 split at move 2 (2.d4 instead of 2.Nf3) is a transposition, so the "same as until here" pause shows
  only 1.e4 c6. Correct, but not much of a lesson.
