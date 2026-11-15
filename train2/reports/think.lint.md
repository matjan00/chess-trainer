# Think first: text lint (T4, 2026-11-15)

Verifier: `verify_lessons.py think --pool data/puzzles2.json` (O2_THREADS=4). No course text changed.

| check | result |
|---|---|
| verify_lessons (L1-L12, X1-X6) | 0 FAIL, 0 WARN, 6 lessons, 38 items |
| UTF-8 decode of courses/think.txt | ok |
| Spelling and typos (full read of explanation text, misspelling list, rare-word scan) | 0 typos found, 0 fixed |
| Doubled words, stray spaces, spacing before punctuation | none |
| Overlong text (X1) | 0 FAIL, 0 WARN |
| Engine / advanced jargon (X2 list plus scan) | none (deflection and intermezzo are not used here) |
| Numbers in learner text (X5) | none |
| Broken references: theme=, MINE filters (chk, fix, pun, thr), src ids | none; all MINE filter values exist in mine2.json |
| Duplicate posKey inside course (L1) | 0 |
| Duplicate posKey vs data/puzzles2.json (R2) | 0 |
| Duplicate posKey vs data/mine2.json (R2) | 3 course positions also in mine2 (cards/judges, same game positions) |

## Non-typo issues

1. **Own-game overlap (R2):** 3 course positions also appear in `mine2.json`. Lead to decide whether the MINE pull should skip them.
2. **Statistics in the course text not re-checked:** the `why:` line (31% of mistakes under 5 seconds, 50 checks, 49 hanging) and the clock lesson figures (7.4 s and 4.5 s) are not in T4 scope. T5c should confirm them against `t2stats.py` output.
