# Essential endgames: text lint (T4, 2026-11-15)

Verifier: `verify_lessons.py endgames --pool data/puzzles2.json` (O2_THREADS=4). No course text changed.

| check | result |
|---|---|
| verify_lessons (L1-L12, X1-X6) | 0 FAIL, 0 WARN, 26 lessons, 156 items, 593 tablebase probes |
| UTF-8 decode of courses/endgames.txt | ok |
| Spelling and typos (full read of explanation text, misspelling list, rare-word scan) | 0 typos found, 0 fixed |
| Doubled words, stray spaces, spacing before punctuation | none |
| Overlong text (X1) | 0 FAIL, 0 WARN |
| Engine / advanced jargon (X2 list plus scan) | 1 issue (see below), otherwise none |
| Numbers in learner text (X5) | none |
| Broken references: theme= on CHAPTER/PLAY/SET, glossary, src ids | none (themes mate2, pawnEndgame, promotion, rookEndgame all exist in the pool) |
| Duplicate posKey inside course (L1) | 0 |
| Duplicate posKey vs data/puzzles2.json (R2) | 0 |
| Duplicate posKey vs data/mine2.json (R2) | 0 |

## Non-typo issues (for T5b / the lead)

1. **Engine/tool jargon in the course summary:** `sub:` reads "checked move by move with the tablebase". A 1400 player does not know what a tablebase is. Suggest: "checked move by move with a perfect-play database". Not changed (content is T5b's).
2. **Term used before it is explained:** the chapter intro for `kp` (line 142) names "key squares" and "the opposition", but both are only defined in the lessons that follow (lines 188 and 225). X2 checks only the first use inside a lesson, so it does not catch this. Suggest a short gloss in the chapter intro.
