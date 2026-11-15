# Lead review T8 (2026-11-15)

## Method
- Read think.txt and convert.txt in full, tactics.txt about half in full plus every rule/key line, endgames.txt rules plus 4 lessons.
- Engine re-check at depth 22 (6 threads, time-capped): all 87 engine-judged lesson cards (every solver step), 30 random own-game cards, 100 random pool puzzles, all 30 JUDGE verdicts.
- Result: lesson cards 87/87 confirmed (solution best, gap >= 12); puzzles 100/100; own-game cards 30/30 solutions best (3 sit just under the M1 gap at this depth: engine noise); judgements 30/30 verdicts right.

## Sign-off
| item | verdict |
|---|---|
| tactics.txt | signed off |
| endgames.txt | signed off after my rewrite of `r7th` (below) |
| think.txt | signed off |
| convert.txt | signed off (one text fixed: `finish-1`) |
| puzzles2.json | signed off (rebuilt with corrected explanations) |
| mine2.json | signed off (rebuilt, 331 cards); explanation wording is a fix-list item |

## Changes made by the lead
1. `endgames.txt` `r7th`: example replaced (1.Re7! Kf8 2.Rh7! Kg8 3.Rd7, each the only winning move by tablebase); play-out replaced by `2r3k1/2p5/8/8/8/8/6PP/3R2K1 w` (only 1.Rd7 wins; self-play reaches eval:300 in 13 moves, max 40); rule reworded; subtitle no longer says "tablebase".
2. `convert.txt` `finish-1`: "mates on a2 or b1" was wrong (b1 is not mate) → "mates on a2".
3. `explain.py`: material now counts a recapture pending on the last square. 850 puzzle texts corrected; test case xthKI updated.
4. `build_mine2.py`: one card per position across types (thr > tq > pun > fix), tags merged: 432 → 331.
5. `t2core.js`: `reservedSet()` permanently reserves pool puzzles used by lesson cards/examples; `prepMine()` drops own-game cards on a lesson position.
6. `compile_train2.py`: `src` kept on example steps. `verify_puzzles.external_keys()`: ignores `src=lichess:` lesson items.
7. `data/train2.json` compiled for the first time (4 courses, 189 cards, 251 KB); `courses/sets.lock.json` written.
Decisions on the open items: BLUEPRINT.md, "Lead review decisions (T8)".

## Fix list for workers (non-blocking; one small Sonnet task)
1. **Own-game explanations** (`explain.py`, own-game part): "Your opponent answers X and you are much worse" is said even for small losses, and "It is the only good move here" says nothing. Scale the wording to the loss (lost a little / lost the advantage / losing) and add what the key move does when a fact exists (defends the attacked piece on X, moves the attacked piece away, attacks Y).
2. **mine2 judges/plays**: 3 positions each still hold two items; apply the same one-per-position rule.
3. **t2core dev check**: after change 5, confirm in dev.html that a lesson puzzle id is never served by the stream and that the R5 simulation still passes.
4. Optional wording: `count-a` key comment says "a pawn up" (true: you win a pawn); leave.
