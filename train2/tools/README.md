# train2 tools (T1: foundation)

Python 3.12 + `python-chess`; Stockfish is found with `engine_path.find_engine`.
`PY=$LOCALAPPDATA/Programs/Python/Python312/python.exe`. Nothing here touches `app.html`, `openings2/` or `data/`
(the compiler writes `data/train2.json` only when you run it without `--out`).

| file | purpose |
|---|---|
| `t2common.py` | win %, `SafeEngine` (watchdog), `T2Evals` (cached content search), `bulk()` + JSONL cache, `LockedJson`, paths. Imports `openings2/tools/common.py` (credit: Openings 2 tools) |
| `tb.py` | Lichess tablebase via `curl`, cached in `cache/tb.json`; mover's-view results; self-test |
| `lesson_format.py` | parser of `train2/courses/<id>.txt` (BLUEPRINT 3.1); no engine |
| `verify_lessons.py` | checks L1-L12, X1-X6; report `reports/<id>.verify.txt` |
| `compile_train2.py` | verifier + `data/train2.json` (BLUEPRINT 4); `courses/sets.lock.json` for SET ids |
| `tests/` | `python -m unittest discover -s train2/tools/tests -v` (fixture course + seeded faults) |

## Commands

```
verify_lessons.py <courseId|path.txt> [--lesson ID] [--no-engine] [--out FILE] [--pool data/puzzles2.json]
compile_train2.py [courseId|path.txt ...] [--out data/train2.json] [--force] [--no-engine] [--pool FILE] [--lock FILE]
tb.py --selftest              tb.py "<FEN>"        (prints every legal move with win/draw/loss for the mover and DTM)
```
Exit code 1 on any FAIL. Progress goes to stderr. A course id means `train2/courses/<id>.txt`.
Writers: run `verify_lessons.py <course> --lesson <id>` after each lesson. Warm runs are seconds, cold runs about
10-15 s per new position (depth 20, multipv 4).

## Engine, watchdog, caches

* **No uncapped search.** `SafeEngine.analyse()` refuses a `Limit` without `time=`, and a timer kills the engine process when no
  answer comes within cap + 15 s (`EngineTimeout`; the next call starts a fresh process). Content searches use `O2_MAXTIME`
  (default 60 s here), `O2_THREADS` (6), `O2_HASH` (1024) exactly as in Openings 2.
* **Content cache** `cache/evals.json` = openings2 `Evals` format (key `posKey|depth|multipv|root`, any deeper/wider entry serves a
  shallower request, merge-on-save under `evals.lock`). Commit it.
* **Tablebase cache** `cache/tb.json`: the raw service answer per position (first 4 FEN fields), merge-on-save under a lock. Commit it.
  `curl`, 1 request per 1.1 s, back-off 5, 10, 20 ... s on 429/5xx, generic user agent. > 7 men or castling rights are refused.
  The service labels a move from the point of view of the side to move AFTER it; `tb.probe()` returns the mover's view.
  `dtm` is in plies from the probed position (a mating move = 1). `move_classes()` gives ok / slow / worse (slow = keeps the result but
  more than 4 full moves behind the quickest).
* **Self-play cache** `cache/selfplay.json` (play-out checks, key posKey|side|finish|time per move).
* **Bulk search** `t2common.bulk(fens, cache.jsonl, depth=16, time_cap=4, multipv=3, workers=5, max_minutes=45)`: N processes with a
  one-thread watchdog engine each; appends `{"k": "<fen>|<depth>|<multipv>", "r": [...] | "timeout"}` lines (lock-safe, a half
  last line after a crash is ignored); positions already cached (same or deeper/wider, or a recorded timeout) are skipped, so a
  restart continues. Stops cleanly at `max_minutes`. Returns `{results, searched, cached, timeouts, left, stopped_by_time}`.
  `T2_WORKERS` sets the default workers.

## Lesson file details the blueprint left open (simplest reading)

* **Our side in an example** (`EX`): `side=white|black` in the header, else the mover of the first `!` move, else the opponent
  of the first `?` move, else the side to move. Opponent mistakes are flagged `?` (at most one per example).
* **Variation start**: a `(( ))` variation starts from the line position whose move number and side match its first move
  (`((1.Kc5 Kd7))`); without a number, from the position before the commented move. In a card: from the card FEN.
* **Card `sol:`** has 1-3 solver moves (odd number of plies). L4 is applied at every solver step. `also:` names a second good
  move (any step); `wrong:` is about the first move. `goal=win|draw` in a card header is the tablebase pay-off (default: the result at the start).
* **Win-% units**: every threshold is in win-% points (blueprint 2.1). Engine L2 loss <= 3, L3 sound = top 2 or <= 5, L4 gap >= 12 (hold: 15).
* **Tablebase classes** (positions <= 7 men, no castling): ok = keeps the best result and, in a win, is at most 4 full moves slower than the
  quickest (for the defender: at most 4 behind the longest defence); slow = keeps the result but slower; worse = changes it.
  Drawn positions: every drawing move is ok (so a hold card needs a position with only 1-2 drawing moves).
* **L11**: `composed` is allowed on `EX` and `CARD` (<= 12 men). `book` with more than 7 men is a WARN (engine rule applies).
  `lichess:<id>` needs `data/puzzles2.json`; while the pool does not exist yet this is a WARN, not a FAIL (T2 builds it).
* **L9 SET** is checked only when the pool exists; the compiler freezes ids (sorted by rating, spread evenly) into the output and the lock file.
* **L10 habit courses** (`think`, `convert`): instead of >= 3 CARD, >= 3 practice items among CARD/JUDGE/MINE; examples still required.
* **X2** jargon is checked per lesson at first use in reading order (goal, rule, intro, then items). `{gl:term}` counts as explained;
  otherwise the same sentence needs a colon, dash, brackets, "means", "which", "called" ...
* **X3**: a move inside `(( ))` that is illegal is FAIL; a move written outside is WARN; "the knight on e5" with no knight on e5 is WARN.
* **X4**: "wins the queen / a rook / a piece / the exchange / a pawn" needs a matching capture and net material gain in the rest of the line
  (plus the first 4 plies of the engine's line); "checkmate / mate in N" needs a mating line. Either side may be the winner (wrong-line texts).
* **L8 self-play** finish rules: `mate`; `promote` = promotion and the new piece still there after the reply; `hold:<n>` = n solver moves
  without being mated and eval above -150; `eval:<cp>` = engine eval for the solver reaches cp. `max >= ceil(1.5 x moves needed)`.
* `T2Evals` result for a position that timed out raises `EngineTimeout`; the verifier reports it as `L0 FAIL` for that item and goes on.
