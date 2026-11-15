# Tactics ABC: text lint (T4, 2026-11-15)

Verifier: `verify_lessons.py tactics --pool data/puzzles2.json` (O2_THREADS=4). No course text changed.

| check | result |
|---|---|
| verify_lessons (L1-L12, X1-X6) | 0 FAIL, 30 WARN (all L7), 17 lessons, 157 items |
| UTF-8 decode of courses/tactics.txt | ok |
| Spelling and typos (full read of explanation text, misspelling list, rare-word scan) | 0 typos found, 0 fixed |
| Doubled words, stray spaces, spacing before punctuation | none |
| Overlong text (X1) | 0 FAIL, 0 WARN |
| Engine / advanced jargon (X2 list plus scan) | none unexplained (outflanking, deflection, intermezzo, in-between move all explained at first use) |
| Numbers in learner text (X5) | none |
| Broken references: theme= on CHAPTER/SET, MINE filters, glossary, src=lichess ids | 1 broken: `SET tactics-check-set | theme= ` (empty theme) |
| Duplicate posKey inside course (L1) | 0 |
| Duplicate posKey vs data/puzzles2.json (R2, PZ6) | 118 of 133 course positions are also pool puzzles (see issues) |
| Duplicate posKey vs data/mine2.json (R2, M7) | 13 course positions also in mine2 |
| Duplicate posKey puzzles2 vs mine2 | 0 |

## WARN answers (L7: most tempting wrong move not among the `wrong:` lines)

Not changed (content is T5a's). Each needs a `wrong:` line or a note that the move is not tempting:
loose-1 Qc4; loose-3 Ke7; count-2 Nc6; count-3 Nc3; count-4 Qg3; mate1-5 Rb3+; backrank-2 Qd6; backrank-4 Qd7; fork-knight-5 Kf1; fork-other-1 Rfd1; fork-other-3 bxc6; fork-other-5 Kb1; pin-4 Kh6; pin-5 Qc7; deflect-2 g1=R; deflect-3 Ra5; deflect-4 Re8; trapped-1 Qc1; trapped-2 Bg5; between-5 Rxf2; between-6 Kh1; mate2-4 Rf2; mate2-5 Rfb8; defend-1 Kg8; defend-3 Ke2; defend-4 Rf1; promote-5 Ke2; tactics-check-1 b4; tactics-check-3 Bd1; tactics-check-5 Rde8.

## Non-typo issues (for the lead / T5a / T3)

1. **Pool overlap (R2):** 118 of 133 tactics positions are the same positions as `puzzles2.json` (the cards cite `src=lichess:<id>`). A learner meets them in the lesson and again in the puzzle stream, which R3/R4 forbid. Decision needed: re-source the cards or exclude them from the stream.
2. **Own-game overlap (R2):** 13 tactics positions are also in `mine2.json`.
3. **Broken SET filter:** `#### SET tactics-check-set | theme= | rating=900-1500`. The theme is empty. The "Course exam" chapter header says `theme=hanging`. Fix the filter (T5a).
4. **Thin MINE filter:** `#### MINE fix | tags=missed mate | n=4`. `mine2.json` holds only 2 cards with that tag.
5. **mine2.json (T3):** 79 posKeys hold 2 or more cards of type `fix/pun/tq/thr` and 3 each for judges and plays. M7 requires one item per posKey and type.
