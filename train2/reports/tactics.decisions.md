# Tactics ABC (T5a) — decisions

Course file: `train2/courses/tactics.txt`. Verifier: `verify_lessons.py tactics` (report `train2/reports/tactics.verify.txt`).

## What is in it

16 lessons in 15 chapters, in the outline's order (fork has two lessons, `fork-knight` and `fork-other`), plus the exam lesson
`tactics-check` in its own chapter `review`.

| | count |
|---|---|
| lessons | 17 (15 motif chapters + 1 extra fork lesson + exam) |
| examples (`EX`) | 49: 16 lessons x 3, exam 1 |
| cards (`CARD`) | 84 (5 per lesson; `between` 6; `defend` and `promote` 4; exam 5); 10 tagged `hold` |
| practice sets (`SET`) | 17 x 20 pool puzzles, 1-2 solver moves (mate in two: exactly 2) |
| `MINE` blocks | 7 (own-game cards pulled in at run time) |

Sources: every card and 34 examples are verified pool puzzles (`lichess:<id>`, FEN = the puzzle start after the opponent's set-up
move, `last=` = that move); 2 examples are composed (`count-a` 11 men, `pin-a` 12 men); 13 examples come from his own games (`game:<id>-<ply>`, ply =
number of moves played, the same convention as think.txt). Nothing is typed from memory: every position was taken from the pool,
`data/mine2.json` or `data/analysis.json`, pre-screened with Stockfish and then passed through the verifier.

Card selection: rating 700-1300 (holds up to 1500), no puzzle with an `alt` (second accepted mate), not in any SET of this course
(the SET picks were simulated in the same order the compiler uses and excluded), at least 8 men (so no card is decided by the
tablebase), solution end quiet by the L6 rule.

## Own-game examples (13)

| lesson | game | what it shows |
|---|---|---|
| loose-b | Caro-6, 3 Mar 2026 | he took a knight left loose by a pawn move (Qxb6) |
| loose-c | laleta34, 18 May 2026 | he missed a free bishop (cxb3; played Nb7) |
| count-c | Baterdene_Bachka, 25 Mar 2026 | a defender that cannot take back does not count (Nc6; played Nf5) |
| mate1-b | toehats, 2 Feb 2026 | two-rook mate, found (Rh6#) |
| mate1-c | albert_sebastian, 20 Feb 2026 | mate with a pinned defender, found (Qxh6#) |
| backrank-b | matteoperugia, 23 Dec 2025 | free rook missed, then back-rank mate (Qxe4; played Nd5) |
| backrank-c | hazemalassaf, 26 Mar 2026 | guard the back rank (Re8; played Rf7) |
| fork-knight-b | ant-lop8, 16 Aug 2026 | knight fork, found (Nxc7+) |
| fork-knight-c | AintGenius, 23 Mar 2026 | knight fork, found (Nc2+) |
| fork-other-c | benjonas27, 16 Jan 2026 | queen fork missed (Qxc6+; played Qc2) |
| mate2-c | easyyyy04, 10 Nov 2026 | back-rank mate in two, found (Ra1+) |
| defend-b | martfabr, 25 Mar 2026 | step out of the checks first (Kg7; played Qxh3) |
| defend-c | aegontargeryann, 7 Jan 2026 | choose the king square (Kh1; played Kh2) |


Chapters 1, 2, 4, 5 and 14 (his most frequent mistakes) have at least two own-game examples, except `count` (one): none of his
"lost material" cards shows a clean string of captures; the other candidates were tangled middlegame lines.
For pin, skewer, discovered, removal, deflect, trapped, between and promote, `mine2.json` has no cards in those groups (or, for
`removal`, none that shows the motif cleanly), so all three examples come from the pool.

## Deviations from the outline (lead please confirm)

1. **Exam lesson shape.** The outline says "no new content: a 20-puzzle mixed SET". The verifier (L10) requires `rule:`, at least one
   `EX` and at least 4 `CARD` in every Tactics ABC lesson, so `tactics-check` has a rule (the checks-captures-threats scan), one
   example and 5 mixed cards before the SET. It sits in its own chapter `review` (needs a `theme=`; `hanging` is used as a label).
   The SET has an empty `theme=` (no filter = all groups), rating 900-1500.
2. **`count` SET uses `theme=removal`.** The outline wants hanging/removal puzzles whose target is defended (`defended=1` from
   pick.py), but `select_set` (verifier and compiler) only knows theme, rating, moves and n. Removal (capturing the defender) is
   the closest pool group. The compiler excludes ids already used, so `count-set` and `removal-set` do not overlap.
   If the lead wants the real `defended=1` filter, `select_set` needs that parameter (tool change, not mine).
3. **Hold cards (`tag=hold`) are missing in 6 chapters**: count, mate1, backrank, skewer, removal, deflect (and the exam).
   The pool's defensive puzzles that match these motifs either failed the L6 quiet-end rule (`mate1`: x4f2j, removed after the
   verifier failed it) or did not exist in range; composed hold positions could not be made unique (L4) in reasonable time.
   Pin has two holds; defend has one (its second hold, `defend-2`, and `promote-3` were removed because the verifier failed
   their solution end on L6, quiet end). Several non-hold cards are still "his threat first" positions (e.g. `count-2`,
   `count-4` wrong lines show the trap aimed at him).
4. **"Motif not the first idea" cards**: covered by cards whose solution starts with a different move than the capture he expects
   (e.g. `fork-knight-2` takes a bishop first, `backrank-1` sacrifices the queen, `between-*`, `count-*` trade first).
5. **mate1 lists four patterns, not five by name**: queen next to the king (mate1-2, mate1-3), two rooks (mate1-b, mate1-4),
   knight in the corner with the bishop (mate1-1), rook and knight (mate1-5), open-file queen (mate1-a). The back-rank mate is
   its own chapter next.
6. `MINE` blocks use `tags=` filters (as think.txt does): hung piece, lost material, missed mate, allowed mate, fork,
   walked into check (two lessons) and `thr`. No filter by theme group, because think.txt only uses tag filters.

## Notes for the lead / T6

- **Own-game example positions equal mine2 cards.** Every `game:` example is the same position as a card in `data/mine2.json`
  (fix, pun or tq). Examples are not served as cards, so R2 is not broken, but a `MINE` block in the same lesson may later serve that
  position as a review card. Either accept it as reinforcement or have the app skip mine cards whose posKey equals a lesson example.
- Pool puzzles used as lesson cards are still in `puzzles2.json`; the stream should treat `ls/tactics.*` card positions as seen
  (or the compiler could exclude them), otherwise he may meet the same position as a pool puzzle.
- Cross-course check (all four course files as of this run): no shared posKey.
- Test compile (`compile_train2.py tactics --out <scratch>`, scratch lock file): not draft, 84 cards, 17 sets = 340 distinct ids,
  none of them is a puzzle used as a lesson card. `data/train2.json` and `sets.lock.json` were not written.

## Verifier result and WARN answers

`verify_lessons.py tactics`: **0 FAIL, 30 WARN**. All 30 WARN are L7 "the engine's best alternative is not among the wrong: lines".
Answer: each card's `wrong:` line is the move a club player is most likely to play (the natural recapture, the greedy capture, the
quiet developing move), not the engine's second choice, which is often a move nobody would consider (e.g. `deflect-2` g1=R,
`tactics-check-3` Bd1). Every `wrong:` move was checked by L7 (at least 12 win-% worse, variation legal and losing). Any other
wrong move still gets the generic "Not this one" plus the refutation in the app.
