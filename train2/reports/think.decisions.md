# Think first — decisions (T5c)

Course file `train2/courses/think.txt`, verified with `verify_lessons.py think`: **6 lessons, 38 items, 0 FAIL, 0 WARN**
(depth 20, multipv 4, 3 engine threads; 54 searches cold, about 15 min).

The first draft (6 lessons) came from a previous worker who was stopped before the report. This pass checked it against
`outline/habits.md`, re-verified it and fact-checked every game reference against `data/analysis.json`
(FEN = the position before ply N, opponent, date, the move played, seconds spent): all 29 game references match.

## Counts

| lesson | EX | JUDGE (safe / blunder) | MINE blocks | notes |
|---|---|---|---|---|
| check3 | 2 (his hung-piece blunders) | 4 (2 / 2) | chk who=me n=10 | as outline |
| hismove | 2 | 2 (0 / 2) | thr n=8 | as outline + 2 judges |
| loose | 2 (fork / hung piece) | 1 (0 / 1) | fix tags=hung piece n=4, fix tags=fork n=4 | outline's `tags=hung piece,fork n=8` written as two blocks of 4 (the filter is resolved by the app; one tag per block is unambiguous) |
| checks | 2 (walked into check) | 4 (2 / 2) | fix tags=walked into check n=8 | as outline |
| gift | 1 (punish: his opponent's blunder he missed) | 3 (1 / 2, opponent's moves) | pun n=8, chk who=opp n=8 | as outline + 3 judges |
| clock | 1 | 6 (3 / 3), all moves he played in under 3 s (0.5-2.6 s) | chk who=me verdict=blunder n=6 | as outline |
| **total** | **10** | **20 (8 safe / 12 blunder)** | 9 blocks, up to 70 own-game items | 0 CARD, 0 PLAY (habit course) |

His own games: all 10 examples and all 20 judgements come from his games (`src=game:`); nothing composed, no Lichess positions.

## Changes in this pass

- `loose-b`: the example ended on 36.Qc4, where the best line starts with a capture (L6 FAIL). Now ends on 35...Kh7.
- `clock-j1`: the text said his rook "had just landed on d8"; the last move was 21.Nxf7. Rewritten to what is true
  (his knight had just taken on f7, the rook on d8 was there for the bishop on g5 to take; best was ...Bxd8 per the game analysis).

## Numbers quoted (all from `t2stats.py`)

31% of mistakes in under 5 s · median 7.4 s on a mistake vs 4.5 s on other moves · walked into check 50 · hung piece 49 · 175 games.
Outline lesson 6 also mentions "mistakes by time left": `t2stats.py` does not print that number, so it is not quoted.

## For the lead

- Three examples start on a position that is also an item in `mine2.json` (`loose-a` = chk/166323068860-12,
  `loose-b` = fix + chk/164202216696-67, `clock-a` = chk/170619095640-47). Examples are not served as cards, but the
  MINE blocks may later show him the same position as a judgement or card: good repetition, or exclude by posKey in the app (R4).
- No JUDGE or other servable item in think.txt shares a posKey with `mine2.json`.
- MINE filters are not checked by the verifier: `chk who= verdict=`, `thr`, `fix tags=`, `pun` use field names of `mine2.json`
  (`who`, `verdict`, `tags`), so the app's filter must match them.
