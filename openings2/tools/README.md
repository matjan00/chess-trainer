# openings2 tools

Python 3.12 with `python-chess`; Stockfish is found with `engine_path.find_engine`. Run from anywhere
(`PY=$LOCALAPPDATA/Programs/Python/Python312/python.exe`). Nothing here changes app.html or the skeletons.

| file | purpose |
|---|---|
| `course_format.py` | parser for `openings2/courses/<id>.txt` (BLUEPRINT section 2); no engine |
| `verify_course.py` | all checks Q1-Q20 of BLUEPRINT section 1; writes `openings2/reports/<id>.verify.txt` |
| `compile_courses2.py` | verifier + `data/courses2.json` (section 3) |
| `sfq.py` | quick engine look-up for writers (top moves, loss, Lichess share, your games) |
| `game_probe.py` | what you and your opponents played in a course's positions |
| `common.py` | shared: cached Stockfish (`Evals`), posKey, explorer stats, games index |
| `tests/` | `python -m unittest discover -s openings2/tools/tests -v` (fixture + seeded faults) |

## Commands

```
verify_course.py <courseId|path.txt> [--line LINEID] [--coverage] [--no-engine]
                 [--depth 22] [--final-depth 24] [--out FILE] [--cache FILE]
compile_courses2.py [courseId|path.txt ...] [--out data/courses2.json] [--force] [--no-engine]
sfq.py "<1.d4 d5 2.Nc3 | FEN>" [more ...] [--mpv 3] [--depth 22] [--move SAN] [--course white|black] [--pv 6]
game_probe.py <courseId|path.txt> [--line ID] [--json]      or      game_probe.py "<moves|FEN>" [--color white|black] [--json]
```
A course id means `openings2/courses/<id>.txt`. Exit code 1 on any FAIL. Progress goes to stderr.

## Engine cache

`openings2/cache/evals.json`, key `posKey|depth|multipv|rootmove` (`-` = no root move), values = score (centipawns
for the side to move, mate = +-10000) and the first 12 plies of the PV. A request is answered by the exact key or by
**any entry with depth >= and multipv >=** the request, so raising `--depth` only searches what is new and a
depth-24 result also serves a depth-22 question. Written in batches (every 25 searches) and at exit; commit it.
Engine: Threads 6, Hash 1024. Cold: roughly 5-12 s per position at depth 22 / multipv 3; cached: seconds.

## Choices where the blueprint was open (simplest reading)

- **Node / card id** = first 8 hex of md5(`courseId|posKey|san`), `san` canonical (python-chess). Comments belong to the *first*
  line (file order) that contains the move; a later *different* comment/annotation on the same position+move is `F1 FAIL`;
  a comment first added in a later line is adopted with an `F2 WARN`.
- **Loss of a move** uses the multipv-3 list when the move is one of the top 3 (not only the top one), otherwise a `root_moves`
  search. Both are depth 22.
- **Branch-defining opponent move** (Q5): for a line = the last opponent move whose position has 2+ different opponent replies
  anywhere in the course's lines (else the first opponent move the line owns); for a trap = the first opponent move
  marked `?`/`?!`. Before it every opponent move must be sound (loss <= 30); at it the class table of 1.2 applies
  (common-ok needs `?!` + comment; mistake needs `?` + comment and a `punish` line/trap); after it: sound and (top 3 or share >= 10%);
  one further `?` in a punish line only with share >= 25%. `avoid` traps skip Q5/Q11/Q12.
- **tag `classic`**: 4th header field, `### LINE id | title | punish | classic`.
- **Share** only where the position has n >= 1000 in `explorer.json` `stats` (a move missing from the stored top-10 then has share 0).
  **YG** counts the user's games where he had the course's colour and the opponent played that move there (`data/games.json`,
  transpositions included; no `analysis.json` needed).
- **Q4**: when best >= +3.00 the Q1 limit is replaced by "loses <= 120 and stays >= +2.50".
- **Q2**: the comment must contain a word like stronger/better/best/more accurate and a move or square.
- **Q12 quiet**: the final position is checked at depth 24; flagged when the side to move is in check, when material differs
  from the start after ply 1 or ply 4 of the principal variation (an exchange or hanging piece is pending), or |eval d14 - eval d24| > 50
  (our point of view). Skipped for punish lines when we are >= +3.00.
- **Q13** uses the first 6 plies of the played move's PV (the move included).
- **Q18 jargon**: a built-in watch-list (zugzwang, prophylaxis, desperado, ...) must be explained in its sentence
  (a colon, dash, brackets, "means", "which", "so" ...). Not a full dictionary: Haiku/lead still read the text.
- **Q19 variation check**: it starts at the position given by the first move number/side *inside the current line* (the line may
  be at most as long as the position needs; the legal-move replay is a FAIL if not), and the *last mover* is taken as the
  side the variation favours; FAIL if that side ends > 80 cp (depth 18) worse than the best-play value at the variation's start.
  Variations written on a `?`/`?!` move are exempt. Move names outside `(( ))` in a comment or X-note give a WARN (plan notes are exempt).
- **Models**: header `### GAME id | White | Black | year | result | source`. `explorer.json:<courseId>` must exist in `data/explorer.json`
  with this id and the same names/year/result (`M1 FAIL` otherwise; moves are copied from there); `lichess-masters:<8-char id>`
  is accepted (moves filled in later by T8); any other source is `M1 FAIL`. At least one course position at ply >= 8
  (`hits`) is required for explorer models.
- **Coverage (`--coverage`)**: Q14 uses `explorer.json` replies with share >= 10% (WARN 5-10%) at opponent-to-move
  positions of the lines with opponent ply <= 16; Q15 uses games.json. `skip:` entries: `skip: <moves> | reason`.
- Traps contribute nodes (and Q10 / Q17-Q19 checks) but not cards.
- Compiled shapes are strings `"g:b5-c7"` / `"r:c7"` (colour g default). `modelsWanted` (extra key) carries `models-wanted:` lines.
- A forced draft (`--force`) sets `"draft": true` on that course; courses already in the output file are kept when
  other courses are compiled.
- Finding ids besides Q1-Q20: `F0` format error, `F1` conflicting duplicate annotation, `F2` late comment, `M1` model source.

## Changes by the lead (2026-11-13)
- **Q5 v2** (BLUEPRINT §1.2): flagged opponent moves may be shared by any number of lines; sound = loss <= 35; common-ok also for early defence choices (ply <= 6: share >= 3%, YG >= 1 or line tag `defence`); max two `?!` per line; mistakes only in punish lines/traps; after a `?` only sound defence. The "branch-defining move" now only matters for the top-3-or-10% rule. Lines 42-46 above describe the old rule.
- **Q12**: the depth-14 vs depth-24 difference is not checked when both say we are >= +1.50.
- **Threads/Hash**: `O2_THREADS`, `O2_HASH` environment variables.
- **Cache**: `Evals.save()` takes `cache/evals.lock`, re-reads the file and merges before writing.
