# Train 2 — master blueprint

Rebuild of the **Train** tab (Tactics · Middlegame · Endgames, plus the separate "Fix my mistakes" view) of the chess trainer
(`C:\Users\mateu\chess-trainer`). Same method as Openings 2 (`openings2/BLUEPRINT.md`): checkable quality rules, a verifier,
source files plus a compiler, a self-contained UI module, card-based spaced repetition, statistics tied to his own games.

Reader: worker agents. The user is Janczu00, about 1400 chess.com rapid (10-minute games), no coding background.
Outlines (binding, items marked **W:** are the worker's call): `train2/outline/tactics.md`, `endgames.md`, `habits.md`.

Contents: 0 Facts · 1 Design decisions · 2 Quality rules and verifiers · 3 Source formats · 4 Compiled data · 5 SRS and progress ·
6 Stats tied to his games · 7 UI/UX · 8 Files, build, integration · 9 Work breakdown · 10 Open questions

---

## 0. Facts the design is built on (measured in the repo, 2026-11-14)

- 175 analysed rapid games (`data/analysis.json`; each ply has `san, e, best, loss` (win-% lost), `lab, pv, refute, why[], ph, clk, t` (seconds spent)).
- His 281 mistakes/blunders by tag (`why`): **threw away a win 91**, walked into check 50, hung piece 49, fork 35, lost material in a trade 34,
  missed capture 33, allowed mate 11, missed mate 5 (87 untagged). By phase: middlegame 149, endgame 80, opening 52.
- Speed: **31% of his mistakes are played in under 5 seconds** (median 7.4 s).
- Current data: `puzzles.json` 3,318 Lichess puzzles (repeats were a complaint), `drills.json` 278 (his mistakes), `punish.json` 92,
  `check.json` 412, `convert.json` 107, `technique.json` 251 (defend 138, take 71, finish 24, trade 18), `essentials.json` 19, `endgames.json` 53.
- In-page engine: Stockfish 10 wasm through `engine.go(fen, {movetime, skill})`. Build machine: Stockfish 19, python-chess, 7.7 GB free disk.
- Data files are separate JSON files fetched by the page (`build.py` copy list + `DATA_FILES`), so a 1-2 MB puzzle file is fine.
- The openings tools already give: `openings2/tools/common.py` (`Evals`: cached, **time-capped** Stockfish; `pos_key`; games index), `sfq.py`.

---

## 1. Design decisions (keep / merge / drop / add)

One tab **Train**, one home screen, four courses and one puzzle stream, all feeding **one daily session**.
Everything he can get wrong is a **card** with spaced repetition; everything is engine- or tablebase-checked; every card says *why* in plain English.

| area | decision |
|---|---|
| Sub-switch Tactics / Middlegame / Endgames, separate "Fix my mistakes" view | **Drop.** One Train home (§7 A). Old hashes `#tactics #middle #endgame #drills` open Train. |
| Lichess puzzles (3.3k, repeats) | **Replace** by a verified pool of about **12,000** (§2.2), each with a one-line explanation, never repeated after a clean solve. Missed puzzles become cards and come back (SRS). |
| Puzzle themes grid | **Keep**, as "Practise a theme" (secondary). Primary entry is the mixed, weakness-weighted stream. |
| — | **Add course "Tactics ABC"**: 15 motifs, each learn (explained examples) → practise (a fixed, graded 20-puzzle set) → review. |
| Blunder check + Punish the blunder | **Merge** into the course/drill **"Think first"** (the habit trainer against "plays too fast"): Safe or blunder? · Punish it or not? (with quiet decoys, so guessing "there is a tactic" fails) · **new** What is the threat? |
| Fix my mistakes (`drills.json`) | **Keep, as cards** ("My mistakes"): newest games first, SRS, tagged by motif; they are mixed into the daily reviews. |
| Winning technique (`technique.json`) + Convert the win (`convert.json`) | **Merge** into the course **"Win the won game"** (his number-one leak): 7 short rule lessons, his own positions as cards, play-outs against Stockfish. |
| 19 essential endings | **Rebuild as a real course "Essential endgames"**: 26 lessons in 5 chapters; lesson = explained model line → find-the-move cards → play it out → spaced re-tests. Tablebase-checked. Old lesson ids kept. |
| Your endgames (`endgames.json`) | **Keep** as play-outs inside the Endgames course ("From your games"). |
| Endgame puzzles | **Merge** into the puzzle pool (theme groups `pawnEndgame`, `rookEndgame`). |
| Puzzle rating (`tr`, `trh`) | **Keep** (same formula, same kinds, the history continues). |
| Speed / streak pressure of any kind | **Drop.** Nothing in Train rewards speed. A fast wrong answer gets a "slow down" nudge with his own numbers. |
| Today tab | Tasks come from `T2.todayTasks()`: Reviews · 10 new puzzles · 5 Think-first · Lesson or play-out of the day (plus the existing Openings review task). |

Principles
1. **Accuracy first.** Target success rate 75-85%: the stream serves puzzles about 50 points under his puzzle rating. Wrong answers cost more than right ones gain.
2. **Missed things come back, solved things do not.** A cleanly solved puzzle is never shown again while unseen ones remain.
3. **His games drive the plan.** Theme weights, lesson order hints and "you did this in your game against X" examples come from `analysis.json`.
4. **No invented chess.** Tactics examples come from the verified Lichess pool, his own games, or tiny composed positions that pass the verifier; endgame positions are tablebase-proved theory positions.
5. **Plain English.** Short sentences, no jargon without an explanation in the same sentence, one takeaway per example.
6. **One unit of progress: the card** (as in Openings 2). Lessons are for learning, cards are for remembering.

---

## 2. Quality rules and verifiers

### 2.1 Engine and tablebase protocol (all tools)

- **Win %** `W(cp) = 50 + 50*(2/(1+exp(-0.00368208*cp)) - 1)`, cp clamped to ±1000, mate = 100 / 0. Always from the point of view of the side that is being trained ("solver"). All thresholds below are in win-% points unless "cp" is written.
- **Content search** (lessons, a few hundred positions): `openings2/tools/common.Evals` with cache `train2/cache/evals.json`, depth **20**, multipv 4, `O2_MAXTIME=60`.
- **Bulk search** (puzzles, his games; tens of thousands of positions): `train2/tools/t2common.bulk()` — N worker processes, each a 1-thread Stockfish, `Limit(depth=16, time=4)` (mine: depth 18, time 8), multipv 3.
  Results appended line by line to a JSONL cache (`train2/cache/*.jsonl`, key = full FEN + depth + multipv); a restart skips what is in the file.
- **No search without a time cap.** Every `analyse` call has `time=` in its `Limit` **and** runs under a watchdog (cap + 15 s): on timeout the engine process is killed and restarted, the position is written to the cache as `"timeout"` and skipped (counted in the report). Every long tool takes `--max-minutes` (default 45), prints one progress line per 200 positions, saves as it goes and exits cleanly; running it again continues. (A background job once hung for 3 hours. Do not use `Limit(depth=…)` alone anywhere.)
- Run one engine-heavy job at a time; default 5 worker processes (`T2_WORKERS`).
- **Tablebase**: positions with ≤ 7 men are decided by the Lichess tablebase service, `https://tablebase.lichess.ovh/standard?fen=<fen>` (no token; called with `curl`, as `update.py` does, because Python's certificate store is outdated on this PC; generic user agent, no personal data; ≤ 1 request per second). One response lists every legal move with `category` and `dtm`/`dtz`. **A move's `category` is from the point of view of the side to move after it**: a move marked `loss` wins for the mover. `train2/tools/tb.py` hides this and returns `{wdl: win|draw|loss (side to move), dtm, moves: {uci: {wdl (mover's view), dtm}}}`; `cursed-win`/`blessed-loss` count as draw; cache `train2/cache/tb.json` (committed). The tool's self-test must confirm KQ v K = win and K v K+P stalemate-defence = draw before anything else trusts it. About 1,500 probes in total. No tablebase files are downloaded (decision; alternative in §10).
- Positions with > 7 men in the endgame course: Stockfish depth 28, cap 60 s: "win" needs ≥ +3.00, "draw" needs |cp| ≤ 0.60.
- `posKey` = `openings2/tools/common.pos_key` (first three FEN fields + `-`). Used for all duplicate checks.

Finding levels as in Openings 2: **FAIL** blocks the item (puzzles: the puzzle is dropped; lessons: the compiler refuses), **WARN** must be answered in the worker's report.

### 2.2 Puzzles (`verify_puzzles.py`)

Source: the Lichess puzzle database (CC0), streamed as today (`fetch_puzzles.py` pattern: nothing large on disk). Lichess convention: `moves[0]` is the opponent's move that creates the puzzle; the solver plays `moves[1], moves[3], …`.

Selection before the engine (cheap filters): Popularity ≥ 90, NbPlays ≥ 1000, RatingDeviation ≤ 80, rating 600-1999, 1-3 solver moves (`len(moves)` ∈ {2,4,6}), **at most one puzzle per game** (GameUrl), a theme of §4's theme table. Fetch 1.6× the wanted number per cell so that rejects are covered.
Wanted per theme group (16 groups): rating 600-899: 60 · 900-1099: 100 · 1100-1299: 150 · 1300-1499: 170 · 1500-1699: 150 · 1700-1999: 120 → 750 per group, **12,000** in total. A group that cannot fill a band takes what exists (report it).

Checks (every solver ply is searched once, multipv 3, bulk protocol):
- **PZ1 FAIL** FEN invalid (`board.is_valid()`), any move illegal, or after `moves[0]` the game is already over.
- **PZ2 FAIL** the solution move is not the engine's best move and is more than 2 below the best.
- **PZ3 FAIL — no second solution**: `W(solution) − W(best other move) < 12`. (In a position where another move also wins easily both are near 100, so the puzzle fails: this is the "my move also wins" complaint.) Exception: the **last** solver move when it is checkmate — then every mating move is stored as accepted (`alt`) and only non-mating alternatives are compared.
- **PZ4 FAIL** pay-off: after the whole solution the solver has < 75 (theme `defensiveMove`/`equality`: < 40), or the search hit the time cap.
- **PZ5 WARN → drop** the first solver move takes an undefended piece with the only capture on the board and the puzzle rating is ≥ 1300 (mis-rated triviality; keep below 1300).
- **PZ6 FAIL** duplicate id, duplicate `posKey` of the start position (after `moves[0]`) inside the pool or against any lesson card / own-game card.
- **PZ7 FAIL** explanation missing or failing §2.6 (see `explain.py`, §3.3).
- Opponent replies inside the solution are taken from Lichess as given (Lichess generates them as the best defence); not re-searched.
- Report `train2/reports/puzzles.verify.txt`: counts per rule, per theme × band, time-outs. A 2% random sample of accepted puzzles is re-searched at depth 22 (cap 20 s): if more than 2% of the sample now fails PZ2/PZ3, stop and report to the lead.

### 2.3 Lesson content (`verify_lessons.py`; source format §3.1)

- **L1 FAIL** FEN invalid, wrong side to move, game already over, or more than one item with the same id / same `posKey` (an example's start, every card and every play-out must be different positions; mirrored or shifted versions are welcome, identical ones are not).
- **L2 FAIL** an example (`EX`): one of *our* moves is more than 3 below the best (tablebase positions: the result category changes, or the move is slower than the quickest by more than 4 moves of DTM without a comment saying so).
- **L3 FAIL** an example: an opponent move that is not best defence (not in the engine's top 2 and more than 5 below best; tablebase: changes the category) and is not flagged `?` with a comment. At most one `?` per example. (Tablebase wins: the defender plays the longest defence or a move within 4 of it.)
- **L4 FAIL — card uniqueness.** `ok` = the solution move plus every move within 3 of the best (tablebase: every move that keeps the category and is at most 4 DTM-moves slower than the quickest). FAIL if `ok` holds more than **2** moves, or holds a second move that is not named in an `also:` line, or `W(best) − W(best move outside ok) < 12` (tablebase: no legal move changes the category — the position is not critical). Tablebase moves that keep the category but are slower are class `slow` (app: "still winning, but that wastes time — find the quickest way", no penalty, try again).
- **L5 FAIL** card pay-off: at the end of `sol:` the solver has < 75 (cards tagged `hold`: < 40 and the best alternative ≥ 15 worse; tablebase cards: category = the lesson goal).
- **L6 FAIL** the end of an example or a card solution is not quiet: side to move in check (unless mate), or material changes in the first 2 plies of the principal variation.
- **L7 FAIL** a `wrong:` move is illegal, is in `ok`/`slow`, or its `(( ))` variation is illegal or does not end worse for the solver than the solution by ≥ 12 (tablebase: a worse category). Every card needs at least one `wrong:` line (the most tempting mistake) — WARN if the engine's best non-ok move is not among them.
- **L8 FAIL** play-out (`PLAY`): the stated goal is not the true result (tablebase ≤ 7 men, else Stockfish rule of §2.1); or the self-play test fails: Stockfish (0.3 s/move, full strength) as the learner against Stockfish as the defender does not reach the finish condition within `max` moves. `max` must be ≥ 1.5 × the moves self-play needed (so that a human has room).
- **L9 FAIL** practice set (`SET`): fewer verified pool puzzles match than asked; sets of different lessons overlap. The compiler freezes the chosen ids (sorted by rating) into the output and into `train2/courses/sets.lock.json` so a re-compile does not reshuffle them.
- **L10 FAIL** shape: a lesson needs `rule:`, ≥ 1 `EX`, ≥ 3 `CARD` (Tactics ABC: ≥ 4, and each chapter ≥ 1 `SET`); an endgame lesson needs ≥ 1 `PLAY`; every `EX` ends with `key:`.
- **L11 FAIL** `src=` missing or not one of `lichess:<id>` (must be in the verified pool; moves are checked against it), `game:<gameId>-<ply>` (must exist in `analysis.json`), `book` (endgame theory: tablebase-proved), `composed` (allowed for tactics examples with ≤ 12 men; must pass L2-L6).
- **L12** text rules of §2.6 (FAIL) on every text field.

### 2.4 Cards and drills from his games (`build_mine2.py` applies these while building)

All re-searched with the bulk protocol at depth 18, multipv 4. An item that fails is silently not created (counts in the report).
- **M1 fix** (his mistake or blunder, `loss ≥ 10`): `ok` = moves within 3 of best; need `len(ok) ≤ 2`, `W(best) − W(best outside ok) ≥ 8`, `W(best) ≥ 30` (not already lost) and the 4th-best move < 90 (not "everything wins").
- **M2 punish** (position after an opponent blunder): `W(best) ≥ 75`, gap to the best move outside `ok` ≥ 10, `len(ok) ≤ 2`.
- **M3 quiet decoy** (for "Punish it or not?" and "Safe or blunder?"): the opponent's (or his) move lost < 2, the position is not check, and `W(best) − W(3rd best) ≤ 6` (nothing special to find). Sessions mix 60% real, 40% decoys.
- **M4 threat** (new): the position *before* one of his blunders. Search the position after a **null move** (skip if he is in check): the opponent's best move must gain ≥ 15 against the current evaluation and beat the opponent's second-best by ≥ 8 → that move is "the threat". Card = step 1: play the opponent's threat on the board; step 2: play a move from `ok` (M1 rule).
- **M5 technique** (he is ≥ +2.00 and the right idea matters; kinds `defend, take, finish, trade` as `build_middlegame.py` computes them): M1 rule with `W(best) ≥ 80`.
- **M6 play-outs**: convert (`W ≥ 85` for him at depth 18, ≥ 10 men on the board) and own endgames (as `build_endgame.py`).
- **M7** duplicates: one item per `posKey` and type (keep the newest game); a game position that equals a pool puzzle start removes the puzzle.
- **M8** every card carries the game link, opponent name, date, his move, the punishing line (`refute`) and a generated explanation (§3.3).
- Budget: only games not in the cache are searched; `--max-minutes 20` in the nightly job.

### 2.5 Repeats (compiler + app)

- **R1** ids unique per file; card id namespaces `pz/`, `ls/`, `mine/` never collide.
- **R2** no two servable positions share a `posKey` across `puzzles2.json`, `train2.json` and `mine2.json` (PZ6, L1, M7).
- **R3** app rule (unit-tested): the stream never serves a puzzle whose id is in the seen set (`t2p` days ∪ old `puz` ∪ `localStorage ct.puzseen`) or reserved by a not-yet-finished practice set, while an unseen puzzle exists in the wanted theme/rating window; the window widens (±150 → ±300 → any) before anything repeats; when a theme is truly exhausted the oldest clean solve is reused and the UI says "you have seen all of these — repeating the oldest".
- **R4** inside one session no position appears twice except the planned "again at the end" after a wrong answer.
- **R5** test: simulate 3,000 served puzzles with random results → 0 unplanned repeats.

### 2.6 Text rules (FAIL unless stated; `t2lint` inside `verify_lessons.py`, also run on generated explanations)

- **X1** sentence ≤ 25 words; move comment ≤ 60 words; lesson intro ≤ 90 words; `rule:` and `key:` one sentence ≤ 22 words; `why:` ≤ 45 words.
- **X2** jargon list (zugzwang, opposition, tempo, zwischenzug, intermezzo, deflection, decoy, battery, outflank, key squares, cut-off, prophylaxis, desperado, overloaded, x-ray, luft, fianchetto, exchange (as material)) must be explained in the same sentence or be a glossary button (`{gl:term}`); first use per lesson.
- **X3** every move written in a text is inside `(( ))` and legal from the position it refers to (as Q19 in Openings 2); every square named in a comment holds what the text says ("the knight on e5" → there is a knight on e5) — WARN level, checked for the patterns `the <piece> on <sq>`.
- **X4** a claim of material ("wins the queen", "wins a piece", "mate") must match the solution line (material difference before/after, or checkmate).
- **X5** no engine numbers in learner text ("+2.3"); say "you are a piece up". No "obviously", "simply", "of course". British spelling as in the app.
- **X6** WARN: a comment that only restates the move ("The knight goes to f7.").

---

## 3. Source formats

### 3.1 Lesson courses: `train2/courses/<id>.txt` (UTF-8), ids `tactics`, `think`, `convert`, `endgames`

Same dialect as the opening courses (comments `{…}`, arrows `[g:e3-d4]`, circles `[r:c7]`, variations `(( ))`, glossary `{gl:term}`), but positions start from a FEN.

```
# COURSE endgames | Essential endgames
sub: one-line subtitle
why: one paragraph; may quote his statistics (only numbers printed by t2stats.py)

## CHAPTER kp | King and pawn | theme=pawnEndgame
> chapter intro, 2-4 sentences.

### LESSON oppwin | The opposition: win
goal: Win with king and pawn when your king is in front.
rule: Kings face each other with one square between: whoever must move gives way.
> lesson intro (≤ 90 words): why it matters, where he met it ("in your game against X you had this and drew").

#### EX oppwin-a | 8/8/8/4k3/8/4K3/4P3/8 b - - 0 1 | src=book
> optional setting, one sentence
1... Kd5 {Black must step aside. [r:e5]} 2. Kf4! {Go round the other side: this is called outflanking. [g:e3-f4]} Ke6 3. Ke4 {…}
key: Take the opposition, then go round when the king steps aside.

#### CARD oppwin-1 | <FEN> | src=book | last=e7e6
sol: Kd5 Kd7 e5
why: Your king goes in front of the pawn first; the pawn follows.
also: Kf5 | The mirror image, just as good.
wrong: e5 | ((1.e5 Ke7)) Black takes the opposition and you cannot make progress.

#### PLAY oppwin-p | <FEN> | goal=win | finish=promote | max=30 | failBelow=150
> Play it out against the computer. Win = promote the pawn safely.

#### JUDGE think-2-j1 | <FEN> | move=Nxe5 | verdict=blunder | src=game:146621057066-33
refute: dxe5 Qxe5 Rxe5
why: The knight was pinned to the queen by the rook on e1.

#### SET fork-set | theme=fork | rating=700-1500 | n=20 | moves=1-2
```
- `EX`: moves with numbers from the FEN; `!` marks the key move (the app pauses and asks him to find it in "from memory" pass); opponent mistakes `?` (L3).
- `CARD` `sol:` = solver move, reply, solver move … (1-3 solver moves, ends on a solver move). `tag=hold` in the header for defensive cards. `last=` = the opponent's previous move (drawn on the board).
- `PLAY` `finish=` `mate | promote | hold:<n moves> | eval:<cp>`; `failBelow=<cp>` ends the attempt when the in-page engine says the win is gone (as `essentials.json` today).
- `JUDGE` (Think first only): `verdict=safe|blunder`; `refute:` required for blunders.
- `SET`: filter on the verified pool; ids are frozen by the compiler (L9).
- Cards built from his games are **not** typed here: lessons reference them with `#### MINE <type> | filter` (e.g. `#### MINE tq | kind=trade | n=6`), and the compiler pulls the newest matching items of `mine2.json` at build time (the nightly job refreshes them).

### 3.2 Compiler `train2/tools/compile_train2.py`

`compile_train2.py [courseId…] [--force] [--no-engine]` → `data/train2.json`. Runs `verify_lessons.py` first and refuses on FAIL (`--force` stamps `"draft": true`). Computes `ok`, `slow`, `alt`, win-% numbers, tablebase flags, set ids; resolves `MINE` blocks to filters (not ids). Second run with warm caches < 30 s.

### 3.3 Generated explanations `train2/tools/explain.py`

Every pool puzzle and every own-game card gets a `why` built from facts, never free text: theme sentence + what is won.
Facts computed with python-chess from the solution line: checkmate; material won (difference at the end of the line, in "a queen / a rook / a piece / the exchange (a rook for a minor piece) / a pawn"); for the key move: pieces it attacks (≥ 2 valuable targets → fork wording), a pinned piece and what it shields, the piece uncovered (discovered attack), the defender that was captured or lured away, promotion.
Template example: fork → "Fork: the knight on e7 checks the king and attacks the queen on c6. You win the queen for a knight."
If no template fits: "The key is {san}: {material sentence}." The sentences must pass X1, X4, X5. For own-game cards add: "You played {played}; {refute sentence}."
Unit tests with 30 hand-checked puzzles (at least one per theme group).

### 3.4 Puzzle and own-game pipelines

- `train2/tools/fetch_puzzles2.py` (stream → `train2/cache/pool_raw.jsonl`, resumable by row count) → `verify_puzzles.py` (→ `train2/cache/pz_evals.jsonl`, report) → `build_puzzles2.py` (→ `data/puzzles2.json`). One-off, plus a manual top-up when a theme runs low. **Needs the user's OK for the download (§10 Q1).**
- `train2/tools/build_mine2.py` → `data/mine2.json` (cards, judgements, play-outs, statistics of §6). Replaces `build_tactics.py`, `build_middlegame.py`, `build_endgame.py` and the drills step of `build.py` in `update.py` (nightly). Incremental cache `train2/cache/mine_evals.jsonl` (committed).
- `train2/tools/pick.py --theme fork --rating 700-1100 --moves 1 [--mine] [--n 30]`: prints candidates (ASCII board, solution in SAN, facts from `explain.py`) for lesson writers.
- `train2/tools/t2stats.py`: prints the numbers writers may quote (§6).

---

## 4. Compiled data

`data/puzzles2.json` (about 1.5 MB)
```
{ "v":1, "built":<unix>, "groups":[{"id":"fork","name":"Forks","ds":"…","tags":["fork"],"why":["fork"]}…],
  "rows":[[id, fen, "e2e4 d7d5 …", rating, [groupIdx…], why, "alt uci…"|0]] }      // moves[0] = opponent's set-up move
```
Theme groups (id → Lichess tags → his `why` tags): `hanging` hangingPiece → hung piece, missed capture · `fork` fork → fork · `pin` pin · `skewer` skewer · `discovered` discoveredAttack, doubleCheck · `removal` capturingDefender → lost material · `deflection` deflection, attraction · `trapped` trappedPiece · `intermezzo` intermezzo · `mate1` mateIn1 → missed mate · `mate2` mateIn2 → missed mate · `backrank` backRankMate → allowed mate · `defend` defensiveMove → allowed mate, walked into check · `promotion` promotion, advancedPawn · `pawnEndgame` pawnEndgame · `rookEndgame` rookEndgame. A puzzle is counted for the fetch quota in the first group that matches (this order) but lists every group it belongs to.

`data/train2.json`
```
{ "v":1, "built", "draft"?, "courses":[{ "id","title","sub","why",
   "chapters":[{"id","title","intro","theme","lessons":[lessonId…]}],
   "lessons":{ id:{"id","ch","title","goal","rule","intro",
       "steps":[ {"t":"ex","id","fen","side","setting","moves":[{"san","uci","mine","key","nag","c","shapes"}],"keyText"}
               | {"t":"card","id"} | {"t":"judge","id"} | {"t":"play","id"}
               | {"t":"set","id","theme","ids":[puzzleId…]} | {"t":"mine","type","filter":{…},"n"} ] } },
   "cards":{ id:{"fen","side","last","sol":[uci…],"ok":[uci…],"slow":[uci…],"also":{uci:text},"wrong":{uci:text},"why","tag","tb":bool,"src"} },
   "judges":{ id:{"fen","mv","san","verdict","refute":[san…],"why","src"} },
   "plays":{ id:{"fen","side","goal","finish","max","failBelow","text","tb":bool} } }] }
```
`data/mine2.json`
```
{ "v":1, "built",
  "cards":[{"id":"fix/<gid>-<ply>","type":"fix|pun|thr|tq","kind"?,"fen","side","last","sol":[uci],"ok":[uci],"threat"?:uci,
            "played","refute","why","tags":[why…],"group":themeGroupId|null,"ph","moveNo","url","opp","end","missed"?}],
  "judges":[{"id":"chk/<gid>-<ply>","who":"me|opp","fen","mv","san","verdict","refute","why","url","end"}],
  "plays":[{"id":"cv/<gid>-<ply>"|"eo/<gid>-<ply>","fen","side","goal","result","url","opp","end","moveNo"}],
  "stats":{ … §6 … } }
```
Card ids used by the SRS: `pz/<lichessId>`, `ls/<courseId>.<cardId>`, `mine/<type>/<gid>-<ply>`. Ids are stable across re-compiles (hand-written ids and game/ply ids), so progress survives edits.

---

## 5. Spaced repetition and progress

Same engine as Openings 2 (copy the scheduler from `openings2/ui/o2core.js`: levels in days, "due any time on its due day", time travel `?t2now=<ms>` / `ct.t2now`).

Levels: L1 **1 d**, L2 3 d, L3 7 d, L4 14 d, L5 30 d, L6 90 d, L7 180 d (stays).
- Correct at the first try → level +1. Wrong → L1, due tomorrow, `w`+1, asked again at the end of the session (not counted twice). Hint used → correct, no promotion. "Show me" → wrong.
- A move in `also`/`alt` → accepted. A `slow` move → "still winning, find the quickest way", stays, no penalty.
- **Lesson cards** (`ls/`) enter at L1 when the lesson's practise step is finished.
- **Puzzles** (`pz/`): clean first-try solve → not scheduled, id goes to the seen set. Wrong or hint → card at L1. A puzzle card **retires** after a correct answer at L4 (it has then been solved after 1, 3, 7 and 14 days): `{lv:9}`.
- **Own-game cards** (`mine/`): first attempt correct → L2 (due in 3 d); wrong → L1. They retire like puzzles but one level later (after L5).
- **Play-outs** have their own light schedule (`t2x`): fail → again in 3 d; pass → 7 d → 30 d → 90 d → done. Only lesson play-outs (endgames, convert) are re-tested; play-outs from his games are one-off (fail → 3 d).
- **Judgements** (`t2k`): wrong → again once after 3 d.
- "Mature" = level ≥ 4 or retired. "Difficult" = `w ≥ 2`, or `n ≥ 3` and `w/n ≥ 0.34`.

Progress kinds (add `...T2.KINDS` to `KINDS`; `record(kind, id, value)` as today):
| kind | key | value |
|---|---|---|
| `t2c` | card id | `{lv, due, n, w, s}` |
| `t2l` | `courseId/lessonId` | `{st: 1 learn done · 2 practise done, n}` |
| `t2x` | play id | `{ok, n, fails, due, step}` |
| `t2k` | judge id | `{ok, n, due}` |
| `t2p` | `YYYY-MM-DD` | `{ids: "id id id …"}` clean puzzle solves of that day (before writing, union with the stored value so two devices merge) |
| `t2d` | `YYYY-MM-DD` | `{rev, new, wrong, think, thinkOk, less, play, ms, fw}` daily totals (`fw` = wrong answers given in under 4 s) |
| `tr`, `trh` | as today | puzzle rating and its daily history (unchanged, still written) |

Old kinds stay in `KINDS` (documents still merge) and are read once, read-only, never rewritten: `puz` keys and `ct.puzseen` → seen set; `solved`/`pun` with `ok` → the matching `mine/` card counts as known and is first due on `today + (hash(id) mod 14)` days (no flood on day one); `eg[id].ok` → "played before" badge on that endgame lesson; `chk` → judged. `cv, tq, eo` are ignored.

Puzzle rating: keep the current update rule (port it from `startPuzzles`/its result handler unchanged). Stream target = rating − 50, window ±150.
Theme weight in the mixed stream: `1 + 2·(share of his last-60-games mistakes that map to the group) + 1.5·(1 − his accuracy in the group, if n ≥ 10)`; groups of a Tactics ABC chapter not yet learned get ×0.5.

Daily session ("Train today", about 15 minutes; each block can also be started alone):
1. **Reviews**: due cards of all sources, most overdue first, then shuffled across sources; cap 20 (button "keep going"). Due play-outs are offered at the end, one per day.
2. **New puzzles**: 10 from the stream.
3. **Think first**: 5 judgements/threat cards.
4. **Lesson of the day** (optional, "one more thing · 5 min"): the next unfinished lesson of the course with the lowest `finished share ÷ weight` (weights: convert 3, tactics 3, think 2, endgames 2; first week fixed: think-1, convert-1, tactics-1, endgames-1); every third day a play-out from his games instead (newest unconverted win first).
Also each day: up to 3 new own-game cards enter (newest games first) as part of block 1.

---

## 6. Statistics tied to his games

`build_mine2.py` writes `mine2.json.stats` (and `t2stats.py` prints it for writers):
```
"stats": { "games":175, "from","to",
  "tags":   { "<why tag>": {"n", "per10", "last30", "prev30", "group": themeGroupId} },        // per 10 games; last 30 games vs the 30 before
  "months": [ {"m":"2026-10","games","mist","blun","tags":{…},"fast":share of mistakes played < 5 s,"wonReached","wonKept"} ],
  "clock":  { "fastShare":0.31, "medianBad":7.4, "medianOther":5.8 },
  "won":    { "reached", "kept", "thrown":[{gid, ply, opp, end}] },                              // ≥ 85 win-% reached; kept = game won
  "endings":{ "<lesson id>": [{gid, ply, result}] } }   // his games that reached a course ending's material (e.g. R+P v R) — for "you had this"
```
Shown in the app (§7 F):
- **Your weak spots**: one row per theme group that maps to a tag: "In your games: 49 times (2.8 per 10 games) · last 30 games: 2.1 ↓" next to "In training: 83% of 120" and a Practise button.
- **Before / after**: the day of his first Train 2 session is the split (earliest `t2d` key). Mistakes+blunders per game, share of fast mistakes, won positions kept, per tag — games before vs after. Shown only with ≥ 20 games after the split; otherwise "needs N more games".
- **Slow down**: share of his mistakes played in under 5 s by month, next to `fw` from training.
- **Won positions**: "You reached a winning position in N games and won M" by month; link to the thrown ones (→ play-outs).
- Training: reviews per day, accuracy, cards by level, lessons finished, puzzle rating graph (existing `trh`).

---

## 7. UI / UX specification

Vanilla JS, chess.js 0.10.3, chessground 9.2.1; one module object **`T2`** in the style of `O2` (`train2/ui/t2core.js`, `t2play.js`, `t2stats.js`, `t2.css`, `t2.html`), inlined by `build.py` at `<!--T2_HTML-->`, `/*T2_CSS*/`, `/*T2_JS*/`. Reuse the app's helpers and CSS classes exactly as O2 does (hooks, no globals of its own except `T2`). Works offline. Developed in `train2/ui/dev.html` with stand-ins.

```
T2.init({ root, data:{train, puzzles, mine}, hooks:{ Chessground, record, progress, store, sfx, confetti, games, engine, myRating, openGame, onChange } })
T2.KINDS · T2.show(screen, arg) · T2.todayTasks() → [{nm, ct, done, go}] · T2.dueSummary() → {n, mins} · T2.startDaily() · T2.refresh()
```
Phone first (375 px): board full width, one card under it, sticky action bar. Desktop (≥ 900 px): board left, panel right (`.viewer`). No horizontal scrolling. Real `<button>`s, `aria-live` feedback, keyboard on desktop (Space = next, H = hint).

**A. Train home**
- Banner **Train today**: "8 reviews · 10 puzzles · 5 Think-first · about 14 min" + primary button; shows a tick per finished block. Nothing due → "Next review tomorrow" + "Learn something new".
- **Continue**: the lesson he is in the middle of.
- Four course cards (title, progress ring = mature cards / all, "x due", "Next: <lesson>"): **Tactics ABC** · **Think first** · **Win the won game** · **Essential endgames**.
- Row of quick starts: Puzzles (mixed) · Practise a theme · My mistakes (n new) · Play out a win.
- **Your weak spots** strip: the three worst tags with numbers from his games → Stats.
- Puzzle rating with the small trend line (as today).

**B. Course page** — header (why, progress), chapters as collapsible groups; lesson row: title, goal, state (New · Learning · Due · Known), "you met this in N games" where `stats.endings`/tags say so. Buttons: Learn / Review / (endgames) Play. Tabs: Lessons · Review (due, difficult cards, 7-day forecast) · From your games (cards and play-outs of this course's type).

**C. Lesson player** (three steps with a step bar: Learn · Practise · Test)
1. *Learn*: intro card with the `rule`; each example is stepped through with comments and arrows (Next / Back); at a key move `!` he is asked to play it (the arrow appears after one wrong try); then the `key` takeaway.
2. *Practise*: the lesson's cards as find-the-move, feedback with `why`; the targeted `wrong:` text if he plays that move; for Tactics ABC then the 20-puzzle set (can be left and resumed; set position stored in `t2l.n`).
3. *Test* (endgames, convert): the play-out against the engine (screen E).
Finish: summary card (cards added to reviews, due tomorrow), "Next lesson".

**D. Card trainer** — one player for reviews, puzzles, own-game cards, Think first.
- Top: mode and progress ("Review 4 of 12"), source chip (Puzzle · Lesson: Lucena · Your game vs FutureGecko, 3 Nov).
- Board oriented for the solver; the opponent's last move is animated first; legal-move dots; multi-move solutions play the reply automatically.
- Wrong → piece snaps back, card "Not this one" with the targeted reason if known, else the refutation is played on the board on request ("Show why") using the stored line or the in-page engine (1 s); one retry, then "Show me". After any result: `why` text, "Play through the solution", "Open the game" (own-game cards), Next.
- Think first variants: **Safe or blunder?** (his/the opponent's move is shown as an arrow; two buttons; if "blunder" he must then play the punishment on the board) · **Punish it or not?** (opponent has just moved; "Nothing special" button or play the winning move) · **What is the threat?** (step 1 move the opponent's piece, step 2 defend).
- Slow-down nudge: a wrong answer in under 4 s shows once per session: "That took 2 seconds. In your games 31% of your mistakes are played in under 5 seconds." (number from `stats.clock`).
- Action bar: Hint (highlights the piece) · Show me · Flip · More (Report a problem → copies id + FEN, Analyse → existing explore board).
- End of session: counts, accuracy, rating change, what comes back tomorrow, the missed ones as a list (tap → study).

**E. Play-out** (`t2play.js`, port of the current `playEssential` / `startConvert` logic): engine strength levels as today; live "still winning / win slipped" indicator from `failBelow`; when the win slips: stop, show the moment, "Take back and try again" (counts as a fail only once); success → confetti, schedule in `t2x`. For lesson play-outs a collapsible "Remind me of the rule" card.

**F. Stats** (`t2stats.js`): §6 blocks, each with a one-sentence plain-English reading. Empty states everywhere.

**G. Practise a theme**: grid of the 16 groups: name, description, his-games line, accuracy, unseen count; tap → stream filtered to the group.

States: draft data → ribbon; data file missing → the block hides with a one-line note; all lists render with 0, 1 and 200 items.

---

## 8. Files, build, integration

```
train2/
  BLUEPRINT.md, outline/*.md                       lead (read-only for workers)
  tools/t2common.py, tb.py, lesson_format.py, verify_lessons.py, compile_train2.py, pick.py, t2stats.py, explain.py
  tools/fetch_puzzles2.py, verify_puzzles.py, build_puzzles2.py, build_mine2.py, tests/
  courses/tactics.txt, think.txt, convert.txt, endgames.txt, sets.lock.json
  cache/evals.json, tb.json, mine_evals.jsonl (committed) · pool_raw.jsonl, pz_evals.jsonl (not committed, .gitignore)
  reports/*.verify.txt, *.decisions.md, *.lint.md
  ui/t2core.js, t2play.js, t2stats.js, t2.css, t2.html, dev.html, fixtures/
```
- `build.py`: `inline_t2()` like `inline_o2()`; copy list and `DATA_FILES` gain `train2.json`, `puzzles2.json`, `mine2.json` and lose `puzzles, punish, check, drills, convert, technique, endgames, essentials` once nothing reads them; service-worker core list updated.
- `update.py`: after `analyze.py` run `train2/tools/build_mine2.py --max-minutes 20` in place of `build_tactics.py`, `build_middlegame.py`, `build_endgame.py` and the drills step. The lesson compiler is not part of the nightly job (lessons do not change nightly; `MINE` blocks are filters resolved in the app).
- `app.html` is edited once (task T9): remove the three old views, the drills view and their code; one nav entry Train; Today tasks from `T2.todayTasks()`; `resumeLast` kinds mapped to T2 screens; Stats tab sentences that mention old modes.
- Each worker in its own worktree/branch, only its own files (README "Working with several Claude agents").

---

## 9. Work breakdown

Order: T1 → (T2 ∥ T3 ∥ T5b ∥ T6) → (T5a ∥ T5c) → T4 → T7 → T8 → T9 → T10 → T11. Lead reviews after T1, T2, each T5, T6, T9.
Every task: commit after each finished unit (a tool, a chapter, a screen) and keep a `train2/reports/<task>.progress.md` with "done / next" so that a worker stopped by a usage limit can be resumed by another.

| # | task | model | owns | acceptance |
|---|---|---|---|---|
| **T1** | Foundation tools: `t2common.py` (win %, `bulk()` with watchdog, JSONL cache), `tb.py`, `lesson_format.py`, `verify_lessons.py`, `compile_train2.py`, tests + a 2-lesson fixture | **Sonnet** | `train2/tools/**` (those files), `train2/cache/` | Tests seed and catch: illegal FEN, a card with two solutions (L4), an example where the opponent defends badly unflagged (L3), a drawn "win" play-out (L8), a wrong tablebase direction, a jargon word (X2), a false "wins the queen" (X4). Watchdog test: a fake engine that never answers is killed within cap + 15 s. Warm second run < 30 s. |
| **T2** | Puzzle pipeline: `fetch_puzzles2.py`, `verify_puzzles.py`, `explain.py`, `build_puzzles2.py`, `pick.py` | **Sonnet** | those files, `data/puzzles2.json`, `reports/puzzles.verify.txt` | After the user's OK (Q1). Resumable at every stage; engine stage within 3 runs of ≤ 45 min. ≥ 11,000 puzzles, table theme × band in the report, 0 duplicate posKeys, depth-22 sample ≤ 2% failures, `explain.py` tests green, file ≤ 1.8 MB. |
| **T3** | Own-games pipeline: `build_mine2.py`, `t2stats.py` (M1-M8, §6) | **Sonnet** | those files, `data/mine2.json`, `cache/mine_evals.jsonl` | Cold run completes in resumable ≤ 45-min runs; warm run with no new games < 60 s; counts per type in the report; 10 threat cards and 10 decoys hand-listed with FEN for the lead; stats cross-checked against the numbers in §0. |
| **T4** | Mechanical pass over all content: run verifiers, text lint, duplicate report, spelling; one table per course | **Haiku** | `reports/<id>.lint.md` | 0 FAIL; every WARN answered. Changes nothing except typos. |
| **T5a** | Write **Tactics ABC** (needs T2) | **Opus** | `courses/tactics.txt`, `reports/tactics.decisions.md` | Outline followed; verifier 0 FAIL; one chapter per commit. |
| **T5b** | Write **Essential endgames** (needs T1 only) | **Opus** | `courses/endgames.txt`, `reports/endgames.decisions.md` | Same; every position tablebase-proved or §2.1 engine rule; old ids kept. |
| **T5c** | Write **Think first** and **Win the won game** (needs T3) | **Opus** | `courses/think.txt`, `courses/convert.txt`, decisions | Same; examples from his games wherever one fits. |
| **T6** | UI core: home, course page, lesson player, card trainer (all variants), SRS, stream selection, daily session, dev harness | **Opus** | `ui/t2core.js`, `t2.css`, `t2.html`, `dev.html`, `fixtures/` | In `dev.html` at 375 px and 1280 px against the T1 fixture + a 300-puzzle sample: lesson → cards due next day (time travel) → wrong resets; puzzle miss returns next day and retires after L4; R3/R5 simulation passes; old `puz`/`solved` data respected; no console errors. One screen per commit. |
| **T7** | UI: play-outs (`t2play.js`), Stats (`t2stats.js`), Practise-a-theme grid | **Sonnet** | those files (+ a marked block in `t2.css`) | Play-out passes/fails correctly on 3 endgame lessons and 1 convert position; stats numbers equal `t2stats.py` output; empty states. |
| **T8** | Lead chess review of all four courses + 100 random puzzles + 30 own-game cards | **Lead** | review notes | Sign-off or fix lists. |
| **T9** | Integration: app.html (once), `build.py`, `update.py`, Today tab, old code and data removal, README | **Opus** | `app.html`, `build.py`, `update.py`, `README.md` | `python build.py` builds dist/ and docs/; no dead references to removed data; other tabs smoke-tested; old progress untouched; Today shows the T2 tasks. |
| **T10** | End-to-end test in `dist/preview.html`: scripted run through every lesson, card and play-out start; SRS clock tests; phone + desktop screenshots; sync kinds present | **Sonnet** | `tools/tests/e2e.md` | Checklist green; bugs filed to owners. |
| **T11** | Final sweep (JSON sizes, dead ids, UI spelling) | **Haiku** | `reports/final.md` | All green. Then lead hand-over note; user approval before publish. |

Brief for content writers (T5a-c)
1. Read §1-3 and your outline. The outline's lesson list and order are binding; positions are yours (**W:**) unless a FEN is given.
2. Find positions with `pick.py` (Lichess pool, his games) — do not type a FEN from memory without verifying it; endgame theory positions go through `tb.py` first.
3. Per lesson: rule → example(s) → cards with the most tempting wrong move explained → play-out/set. Run `verify_lessons.py <course> --lesson <id>` until clean before starting the next lesson.
4. Voice: talk to him ("you"), one idea per sentence, say what to look at on the board, give a rule of thumb he can use in a 10-minute game. Use his games ("you had this against X on 3 Nov and played …") only with data printed by `t2stats.py`/`pick.py --mine`.
5. Never invent statistics, games or players. Never claim a result the verifier has not confirmed.
6. Sizes: Tactics ABC about 45 examples, 75 cards, 15 sets · Endgames 26 lessons, about 35 examples, 120 cards, 30 play-outs · Think first 6 lessons · Win the won game 7 lessons.

---

## 10. Open questions for the user (lead's recommendation first)

1. **Download the Lichess puzzle database once?** It is a stream of roughly 300 MB that is read and thrown away; only about 12,000 chosen puzzles are kept (about 1.5 MB in the app). *Recommended: yes* — it is the only way to end the repeats.
2. **One Train screen instead of the Tactics / Middlegame / Endgames switch**, with "Fix my mistakes" folded in? *Recommended: yes.*
3. **Daily amount**: reviews (max 20) + 10 new puzzles + 5 Think-first + one optional lesson, about 15 minutes. *Recommended: start with this; it is one setting to change later.*
4. Endgame checks use the free Lichess tablebase website while building (nothing to download, nothing personal is sent, only textbook positions). The alternative is a one-off 1 GB download of tablebase files. *Recommended: the website.* (Only tell us if you object.)

### User answers (2026-11-14)
1. Lichess puzzle database: **yes, download once** (streamed; keep only the selected puzzles).
2. **One Train screen**, with Fix my mistakes folded in.
3. Daily load: **~15 min** (up to 20 reviews, 10 puzzles, 5 Think-first, optional lesson).
4. Endgame checks: **Lichess tablebase website** (cached), no tablebase download.
