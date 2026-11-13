# Openings 2 — master blueprint

Rebuild of the Openings tab of the chess trainer (`C:\Users\mateu\chess-trainer`). Three courses, written from scratch, Chessable-style:
`jobava` (White: 1.d4, 2.Nc3, 3.Bf4), `caro` (Black vs 1.e4), `slav` (Black vs 1.d4 + flank openings).
Repertoire decisions: `openings2/jobava.md`, `caro.md`, `slav.md` (binding; only items marked **W:** are the worker's call).

Reader: worker agents. The user is ~1400 rapid, no coding background, wants every important move explained and no dubious lines.

Contents: 0 Principles · 1 Quality rules and the verifier · 2 Course source format · 3 Compiled data · 4 SRS · 5 UI/UX · 6 Files, build, integration · 7 Work breakdown · 8 Open questions

---

## 0. Principles (what the user asked for, made precise)

The old courses failed in three ways: an opponent ("computer") move gave up a knight for nothing; some lines ended clearly worse for him; some lines were dubious. His instruction: *"skip lines played most often at my elo unless they are sound and played really often."* Reading, now binding:

1. **The repertoire is built against good play.** Main lines answer sound, principled opponent moves (what a strong player or the engine would play). The user's own moves are always engine-approved.
2. **A common amateur reply gets a line only if it is frequent AND not simply bad** (class "common-ok" below).
3. **Bad-but-common replies are not main lines.** They become short `punish` lines or trap items: the mistake, the refutation, and then the *best defence* for the opponent — never a second cooperative blunder.
4. **Inside a line the opponent never plays a weak move silently.** Every opponent move after the branch point is sound; any exception is flagged in the notation and explained in the comment.
5. **Honesty about evaluations.** The Jobava is objectively about equal against best play and the comments say so ("equal, but you know the plans and they don't"). No line is sold as an advantage when it is not.
6. **One move per position.** The user has exactly one course move in any position, across move orders. Fewer rules beat "best move in every branch": system moves are allowed inside a stated tolerance (`!sys`).

Known data limits (verified in the repo):
- `data/explorer.json` holds Lichess **1200-1600 blitz+rapid** move counts for 3,236 positions (old courses' trees). There are **no masters statistics** in the repo and no local Lichess token. So "sound" is decided by Stockfish, "frequent" by explorer.json where the position is present, and by the user's 172 games (`data/games.json`, `data/analysis.json`). Where a position has no stats, soundness alone decides and coverage is checked after the weekly GitHub job has fetched the new tree (task T8).
- Only two real master games per old course id exist (`explorer.json → courses.<id>.models`). No game may be invented.

---

## 1. Quality rules and the verifier (`openings2/tools/verify_course.py`)

### 1.1 Engine protocol
- Stockfish from `engine_path.find_engine(ROOT)`; `Threads 6`, `Hash 1024` (override with the environment variables `O2_THREADS` / `O2_HASH`). The cache is merged under a lock file on every save, so two tool runs no longer overwrite each other — still run only one engine-heavy job at a time.
- Standard search: **depth 22** (`chess.engine.Limit(depth=22)`, no time cap). Final positions of lines: **depth 24**.
- All scores in centipawns via `score.pov(side).score(mate_score=10000)`, clamped to ±1500 before any subtraction.
- **Loss of a move** = `best − played`, both from the *same* position: `best` = top line of a multipv-3 search; `played` = `analyse(board, limit, root_moves=[move])` (skip the second search if the move is the multipv top). Mover's point of view.
- Cache every result in `openings2/cache/evals.json`, key = `posKey|depth|multipv|rootmove` where `posKey = " ".join(fen.split()[:3]) + " -"` (the app's key: no en-passant square, no counters). The cache is committed so reviews are fast.
- Engine noise at this depth is about ±15 cp; thresholds below already include it. Never "fix" a failure by lowering depth.

### 1.2 Classes of opponent moves
`share` = move count / position count in explorer.json, valid only when the position has n ≥ 1000. `YG` = number of the user's games in which the opponent played that move in that position.

**Revised 2026-11-13 (lead review of the Jobava course, "Q5 v2").** The first version tied every inaccurate move to a single line, which threw out whole defences the user really meets (1...b6, 1...g6, 1...d6, 1...c5, 1...c6). A flagged move is a *node of the tree*: any number of lines may pass through it.

| class | definition | where allowed | notation |
|---|---|---|---|
| **sound** | loss ≤ 35 | anywhere | plain |
| **common-ok** | loss 36-90 **and** one of: share ≥ 15%; YG ≥ 2; or, within the first 6 plies (a choice of defence), share ≥ 3% or YG ≥ 1 or the line tag `defence` (a named opening without stats in the repo) | main, side and punish lines; at most **two** per line | `?!` + comment saying why it is inaccurate and what we gain |
| **mistake** | loss > 90, with share ≥ 8% or YG ≥ 1 or line tag `classic` (a thematic trap) | only `punish` lines and traps | `?` + comment |
| not allowed | anything else | nowhere | – |

Rules per line: every non-sound opponent move is flagged and explained. After a `?` mistake the opponent plays only sound moves (the best defence); one further `?` is allowed in a punish line if its share is ≥ 25%. After the line's branch point a sound move must also be engine top-3 or share ≥ 10%. Rule of thumb for the opponent's continuation: the most frequent move among the sound ones; without stats, the engine's first choice.

Our own second move against a rare defence need not be 2.Nc3: where a plainly better move reaches the same set-up (1...b6 2.e4, 1...g6 2.e4, 1...d6 2.e4, 1...c5 2.d5), play it instead of spending a `!sys`.

### 1.3 Checks (each has an id; FAIL blocks the course, WARN must be answered in the worker's report)

Our moves
- **Q1 FAIL** loss > 35 (unless `!sys`). WARN 26-35.
- **Q2** `!sys` (a system move kept for consistency): FAIL if loss > 60 or if the comment gives no reason; max **8 per course**; the comment must name the stronger alternative in words ("4.e4 is even stronger if you know the French").
- **Q3 FAIL** position floor after our move (our point of view): White course < −0.20; Black courses < −0.55.
- **Q4 FAIL** winning positions: if best ≥ +3.00 our move may lose up to 120 cp but must stay ≥ +2.50.

Opponent moves
- **Q5 FAIL** class rules of §1.2 violated (this is the check that catches "the computer gave up a knight").
- **Q6 WARN** opponent move is not in the engine top-3 and has no stats: justify or replace.

Line shape
- **Q7 FAIL** illegal or ambiguous SAN; **FAIL** line does not end on **our** move.
- **Q8 FAIL** length: main/side lines 16-28 plies (8-14 moves); punish lines 6-20 plies. A line may be shorter only if it ends with a transposition marker `=> lineid` (§2).
- **Q9 FAIL** fewer than 2 *new* cards (positions where we move that no earlier line contains); WARN fewer than 3.
- **Q10 FAIL** **one move per position**: two different our-moves from the same `posKey` anywhere in the course (transpositions included).
- **Q11 FAIL** final evaluation at depth 24, our point of view:
  - White main/side: < −0.15 (WARN < 0.00). Black main/side: < −0.50 (WARN < −0.35).
  - punish lines: must be ≥ +0.60 (White course) / ≥ +0.20 (Black courses) **and** at least 50 cp better than before the flagged mistake.
- **Q12 FAIL** the end is not quiet: side to move is in check; or the material balance (P1 N3 B3 R5 Q9) changes within the first 4 plies of the depth-24 principal variation; or |eval(d14) − eval(d24)| > 50 (not applied when both depths give us ≥ +1.50). (Exception: punish lines where we are ≥ +3.00.) This also catches pieces left hanging and pending recaptures.
- **Q13 WARN** material sanity for every move of either side: if the mover is ≥ 2 points down after the 6-ply PV and the move's loss is > 35, print it (should already be a Q1/Q5 failure).

Coverage (uses explorer.json and the user's games; run by `--coverage`)
- **Q14 FAIL** at every opponent-to-move course node with ply ≤ 16 and n ≥ 1000: each reply with share ≥ 10% is either in the course or listed under `skip:` with a reason (e.g. "transposes to …"). WARN list for 5-10%.
- **Q15 FAIL** every opponent move the user has met ≥ 2 times in a course position (from analysis.json) is covered or skipped with a reason.
- **Q16 INFO** budget report: lines per chapter and kind, cards per course (target 220-320 cards).

Text
- **Q17 FAIL** a new our-move without a comment; a line without an intro; a line without a final plan note; fewer than 2 plan notes in a main line.
- **Q18 FAIL** comment longer than 320 characters (plan notes and `!` key moves: 650); banned content: numeric evals ("+0.3"), "the engine says", "obviously", "simply winning" without a variation, undefined jargon (allowed glossary: fork, pin, skewer, outpost, bishop pair, open file, pawn break, tempo, fianchetto, minority attack, isolated pawn, transposition, development, initiative — anything else must be explained in the sentence).
- **Q19 FAIL** every concrete variation inside a comment is written as `((7...Bxc3+ 8.bxc3 Ne4))`; the verifier replays it from the position named by its first move number/side inside the current line (legal check) and runs a depth-18 check that the claim's side is not losing > 80 cp against best play *unless* the variation is introduced by a `?`-marked move. A comment that names a move in SAN outside `(( ))` is a WARN.
- **Q20 FAIL** arrow/circle squares invalid; WARN if fewer than half of the commented our-moves carry an arrow or circle.

Output: `openings2/reports/<course>.verify.txt` (one line per finding: `Q5 FAIL slav/krause ply 14 Nb6: …`) and a summary table (line id, plies, new cards, final eval, worst our-move loss, worst opponent loss, reach %). Exit code 1 on any FAIL.

### 1.4 What a good line looks like (for writers)
- 8-14 moves deep; it stops when development is complete and the plan card can say what happens next in 2-4 concrete steps ("1. …Qc7 and …Rd8. 2. Break with …c5. 3. Trade a pair of knights on d5.").
- The intro (`>`) says when this line happens and the one thing to remember.
- Comments answer "why this move, why now" in plain English (B1 level, short sentences, second person). Mention the opponent's threat when there is one. Where the user's own games show him playing something else in this position, say so and why the course move is better (use `game_probe.py`).
- At least one **X-note** (tempting wrong move + why it fails) in every second line.
- Quizzes are optional, max 2 per line.

---

## 2. Course source format (`openings2/courses/<id>.txt`, UTF-8)

A superset of the old `courses.txt` dialect (the tokenizer in `compile_courses.py` is the starting point). Every line is written as a **full move sequence from move 1**; the compiler merges lines into a tree by position. Shared opening moves are written bare (no comment) in later lines — the first line that contains a move owns its comment (a different comment on the same position+move later is a FAIL).

```
# COURSE jobava | Jobava London | white
sub: one-line subtitle
why: one paragraph: why this opening suits him (may quote his own game statistics)
idea: Nb5 and the c7 square | text … [g:b5-c7] [r:c7] | fen=<optional FEN to show>
structure: carlsbad-rev | Reversed Carlsbad | fen=<FEN> | what both sides want, 3-5 sentences [arrows]
skip: 1.d4 d5 2.Nc3 Nf6 3.Bf4 h6 | rare and harmless: play 4.e3 and continue as against 3...a6

## CHAPTER c5 | Black hits the centre: 3...c5
> chapter intro, 2-4 sentences: the idea of this chapter and the rule of thumb.

### LINE c5-main | Main line: 4...cxd4 5.exd4 a6 | main
> When Black plays the most accurate set-up. Remember: recapture with the e-pawn.
1. d4 d5 2. Nc3 Nf6 3. Bf4 c5 4. e3! {Solid first. The d4 pawn is defended … [g:e3-d4]} cxd4 5. exd4 {Take towards the centre …}
a6 {Stops your knight coming to b5. [r:b5]} 6. Nf3 {X: Nb5 | The knight is simply chased away now ((6.Nb5 axb5)).} …
9. O-O {P: Your plan: 1. Re1 and Ne5. 2. … [g:f3-e5]}

### LINE c5-nc6 | The Nb5 trick: 4...Nc6? | punish
…  Nc6? {Natural, but it loses material by force.} 5. Nb5! { … } …

## TRAPS
### TRAP englund-qb4 | The Englund queen trap | avoid
> …
1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Nc3! {X: Bf4 | ((4.Bf4 Qb4+ 5.Bd2 Qxb2 6.Bc3 Bb4)) and Black wins material.}

## MODELS
### GAME CuQmjkwk | Carlsen, M. | So, W. | 2017 | 0-1 | explorer.json:caro
note 12: one-sentence annotation attached to ply 12 (1-based)
```

Tokens
- Move suffixes: `!` = **key move** for us (badge, weighted in "difficult moves", long comment allowed); `?!` / `?` on opponent moves per §1.2; `!sys` on our move (written `Bf4!sys`).
- `{text}` comment for the preceding move. Arrows `[b5-c7]`, circles `[e5]`, colour prefix `r: g: b: y:` (existing syntax, parsed out of the text).
- `{P: text}` plan note for the position after the preceding move (shown as a Plan card; learn mode pauses on it).
- `{X: san | explanation}` "don't play this" note attached to our move: `san` is the tempting wrong move in the position before it. Shown in learn mode with a red arrow, and as targeted feedback if he plays it in review.
- `{A: san | text}` an acceptable alternative the writer wants named ("also fine, transposes"). Other alternatives are computed by the compiler.
- `{? question | *right | wrong | wrong || explanation}` quiz (existing syntax).
- `((…))` variation inside any text (Q19).
- `=> lineid` at the end of a line: "from here continue as in line `lineid`" (the final position must occur in that line; the verifier checks).
- Line kinds: `main` (sound best play), `side` (sound but less critical, or common-ok), `punish`.
- Trap kinds: `set` (we set it; opponent's natural move loses), `avoid` (a pitfall for us), `punish`.
- `skip:` entries document deliberately uncovered opponent moves (Q14/Q15).
- Models: header fields `id | White | Black | year | result | source`. `source` must be `explorer.json:<courseId>` (the id must exist in `data/explorer.json` and its moves are copied from there by the compiler — the worker does not type the PGN) or `lichess-masters:<gameId>` (filled by the GitHub job, T8). Anything else is rejected. A model game must pass through a course position at ply ≥ 8 (verifier). Workers also write `models-wanted: <line id>` lines for positions where a model game should be fetched later.

No per-line explorer links are written by hand: statistics attach by `posKey` at compile time.

---

## 3. Compiled data (`data/courses2.json`, built by `openings2/tools/compile_courses2.py`)

```
{ "v": 2, "built": <unix>, "courses": [ {
  "id","title","side","sub","why",
  "ideas":[{"t","text","shapes","fen"}], "structures":[{"id","t","fen","text","shapes"}],
  "chapters":[{"id","title","intro","lines":[lineId…]}],
  "lines":[{"id","ch","title","intro","kind","nodes":[nodeId…],"to":lineId|null,"reach":0.031|null,"ev":<final cp, our pov>}],
  "nodes":{ nodeId: {"k":posKey before the move,"san","uci","ply","mine":bool,"key":bool,"nag":"!"|"?"|"?!"|"sys"|null,
                      "c":text,"shapes":[…],"plan":{text,shapes}|null,"x":[{"san","why"}],"quiz":{…}|null,
                      "ev":<cp after the move, white pov>,"loss":cp,
                      "alts":[{"san","loss","note"}],            // ours only: other moves within 25 cp of best and ≤ 10 cp worse than the course move
                      "st":{"n":games,"share":0.23,"score":0.52}|null } },   // opponent moves: Lichess 1200-1600
  "cards":[{"id","k","fen","san","node","line":primary lineId,"lines":[…],"ply"}],   // one per position where we move = the SRS unit
  "traps":[{"id","title","kind","intro","nodes":[…]}],
  "models":[{"id","white","black","wr","br","year","result","moves":[san…],"notes":{ply:text},"hits":[plies that are course positions],"source"}]
} ] }
```
- `nodeId` = first 8 hex of `md5(courseId|posKey|san)`. **Card id = node id.** Ids therefore survive re-ordering, renaming and re-compiling: SRS progress is never lost when a course is edited (only when the move in that position changes).
- A line is a list of node ids, so shared prefixes are stored once.
- `reach` = product of the opponent-move shares along the line where stats exist (as `lineReach` does today), else null.
- The compiler refuses to write the file if `verify_course.py` reports a FAIL (flag `--force` for drafts, which stamps `"draft": true`; the app shows a "draft" ribbon).
- `data/courses2.json` is added to `DATA_FILES` and to the copy list in `build.py`. Expected size: < 600 KB.

---

## 4. Spaced repetition (MoveTrainer-style)

**Unit = one card = one position where it is his move** (not a whole line). Reasons: shared opening moves are learned once; a weak move in a long line does not drag the whole line back; "difficult moves" falls out for free. Lines remain the unit for *learning* and the context in which cards are reviewed.

Progress kinds (new names, old data untouched; add to `KINDS` in app.html):
| kind | key | value |
|---|---|---|
| `o2c` | `courseId/cardId` | `{lv, due, n, w, s}` level 1-8, due time (ms), reviews, wrong answers, current streak |
| `o2l` | `courseId/lineId` | `{done:1}` line has been learned once |
| `o2g` | `courseId/gameId` | `{ok:1}` a "fix it" drill from one of his games solved |
| `o2t` | `courseId/trapId` | `{ok, n}` |
| `o2m` | `courseId/modelId` | `{seen:1, score}` |
| `o2d` | `YYYY-MM-DD` | `{rev, new, wrong, ms}` daily totals for the progress chart and streak |
`record(kind, id, value)` already stamps `t` and syncs (artifact DB or Supabase). The old kinds (`lines`, `pos`, `ideas`, `quiz`, `og`, `rep`, `cl`, `spd`, `opx`, `trp`) stay in `KINDS` so stored documents still merge, but nothing reads them any more.

Levels and intervals (USER DECISION 2026-11-12: no 4-hour step, first review the next day): L1 **1 d**, L2 3 d, L3 7 d, L4 14 d, L5 30 d, L6 90 d, L7 180 d (stays).
- Correct at the first try → level +1, due = now + interval(new level).
- Wrong move → level 1, due = tomorrow (end of today convention), `w`+1, streak 0. The card is asked again at the end of the current session (not counted twice).
- Acceptable alternative (in `alts` or `A:`) → no penalty, toast "Good move too — the course plays something else here. Try again." and the position stays.
- Hint used (piece highlighted) → counts as correct but level does not rise (due = now + interval(current level)). "Show the move" → wrong.
- Every interval is in days: a card is due "any time" on its due day (existing `endOfToday()` convention).
- "Mature" = level ≥ 4. "Difficult" = `w ≥ 2` or (`n ≥ 3` and `w/n ≥ 0.34`).

Learn mode (per line; chapter order, P1 lines first; the app always proposes "next line to learn")
1. **Walk through.** Opponent moves are played for him. Before each *new* our-move the comment is shown with its arrow; he plays the move on the board (the arrow shows it). X-notes and plan cards appear in place; "Continue" after a plan card. Cards he already knows from other lines are auto-played quickly with their comments collapsed (tap to read).
2. **From memory.** Immediately afterwards the same line again without arrows, only the new cards asked. A wrong move shows the comment again and repeats.
3. Finish: new cards get L1 (due tomorrow); `o2l` done; summary card with "Learn the next line" / "Review now".
A line can be re-read any time in "Study" mode (no scheduling).

Review mode
- Queue = all due cards (one course, or all three for the **daily review**), capped at 60 per session with "keep going".
- Cards are grouped by their primary line so that moves are seen in context: for each group the trainer **jumps in** at the opponent move before the first due card (move list above shows how the position arose; setting "play every line from move 1" available), then walks down the line; our non-due moves are auto-played, due cards are asked.
- No comments are shown until he answers; after a wrong answer the comment and arrows appear, he must play the right move, and the card goes to the end of the session.
- End of session: counts, accuracy, next due time, the cards that went wrong (tap → study position).

Other
- **Difficult moves** list per course with a "Drill these" button (practice: no promotion; a wrong answer makes the card due now).
- Progress per chapter and course: lines learned / total; cards by state (new, learning L1-4, mature L5+); a 5-step badge (as `LEVEL_COLOR` today).
- Daily review entry points: Openings home banner and the Today tab task (replace the old `startDaily`).
- Time travel for testing: `?o2now=<ms>` or `localStorage ct.o2now` overrides the clock used by the scheduler.

---

## 5. UI / UX specification

Plain vanilla JS + chess.js 0.10.3 + chessground 9.2.1, as the current tab. Reuse the app's helpers and CSS classes (`$`, `el`, `esc`, `store`, `record`, `progress`, `toDests`, `lastMoveOf`, `posKey`, `statsAt`, `engine.go`, `sfx`, `confetti`, `.card`, `.btn`, `.eyebrow`, `.pill`, `.controls`, `.viewer`, `.board-col`, glossary buttons `.gl`). One chessground instance for the trainer (`#o2board`), throw-away mini boards for lists (as `drawMiniBoards`). No frameworks, no new dependencies. Everything must work offline in the PWA.

Tone: beginner-friendly, short sentences, no jargon without the glossary. Phone first (375 px): board full width on top, one comment card under it, a sticky action bar at the bottom; desktop (≥ 900 px): board left, panel right (existing `.viewer` layout).

### Screens
**A. Openings home** (`#op-home` replacement)
- Daily review banner: "12 moves to review · about 4 min" (primary button). When nothing is due: next due time + "Learn a new line" button.
- Three course cards: title, side, progress ring (mature cards / all), "x due", "Next: <line title>", last studied.
- "Your recent games" strip: last 5 rated games that entered a course: result pill, where the game left the course ("You left at 5...Nf6 — course: 5...Bf5"), tap → screen E.

**B. Course page** — header (title, why, progress bars), then sections as a scrollable tab row (existing `.oc-tabs` pattern), state remembered per course:
1. **Learn** — chapters as collapsible groups; each line row: title, kind badge (Main / Side / Punish), state (New · Learning · Due · Known), reach ("you'll meet this in about 1 game in 30" from `reach`), final-position mini board on desktop. Buttons: Learn / Study / Review.
2. **Review** — due count, difficult moves, session start, forecast for the next 7 days (simple bar row).
3. **Ideas** — the `idea:` cards and `structure:` lessons with boards and arrows (replaces "Plans").
4. **Traps** — cards "Set it" / "Avoid it" / "Punish it"; tap → interactive: he must find the refutation / the safe move.
5. **Model games** — list; viewer steps through the game with the notes; optional "guess the move" for our side; course positions are highlighted on the move list.
6. **Your games** — screen E.
7. **Stats** — screen F.
Plus a "Move tree" button (screen D).

**C. Trainer** (learn / study / review / trap / fix-my-game share one player, as `#op-player` today)
- Top: mode label and progress ("Line 3 of 7 · move 5 of 11"), course/line title.
- Board with arrows/circles; last move highlighted; legal-move dots; wrong move → piece snaps back, board flashes, feedback card.
- Move list as chips (tap to look back; looking back never changes scheduling).
- Comment card: move in bold, text, glossary links; Plan card style (accent border, "Plan" eyebrow); X-note style (red eyebrow "Don't play …").
- Action bar: Hint · Show · (learn: Continue) · Flip · More (Stats here, Eval bar on/off, Open in move tree, Report a problem → copies line id + FEN).
- **Stats here** drawer for the current position: what 1200-1600 players play (bars with share and score, course move marked); "In your games: reached 6 times — you played Nf3 4×, Bd3 2× (course: Bd3)"; links to those games.
- Keyboard on desktop: ←/→ look back/forward, Space = Continue, H = hint.

**D. Move tree / explorer** — board + list of course replies in the current position with share %, your-games count and the line(s) they lead to; non-course popular replies shown greyed ("not in the course: 7%"); breadcrumbs; "Learn this line" from any leaf. (Adapt `courseTree` / `treeNodeAt` to the node store.)

**E. Your games vs the course** (per course, also "all courses")
- Summary sentence: "38 of your 52 White games started in this course. On average you stay in the course for 4.6 moves."
- **Where you leave the course** — table grouped by position, sorted by count: mini board, "your move → course move", times, results, average engine loss of his move (from `plies[].loss/lab`), button **Fix it** (drill: the game is replayed to that position, he must play the course move; solved → `o2g`). A deviation whose move is in `alts` is shown as "fine, but not the course move" and not counted as an error.
- **Where opponents leave the course** — opponent moves not in the course that he met ≥ 2 times, with what he played next and the result, the engine's best reply (from analysis.json `best`), and "ask Claude to add a line for this" (copies a ready-made request text). This is the feedback loop that keeps the repertoire matched to his real opponents.
- **Games list** — every game that entered the course: result, opponent rating, depth reached, deviation text; tap → game view with course moves / left-the-course / mistake colouring (existing `#op-game` design) and "Open the full game" (Games tab).
- Matching is by `posKey` (transpositions count), exactly as the current `c.games` computation.

**F. Statistics**
- **Position reach in your games**: for each chapter and line, how many of his games reached its branch point and how he scored there; heat list of the 15 most-reached course positions.
- **Opening statistics (Lichess 1200-1600)**: per chapter the opponents' move shares at the branch points; "most likely lines for you" (lines sorted by `reach`); per line the score of the final position's move where stats exist. Clearly labelled with the data source and date; hidden gracefully where a position has no stats yet.
- **Training**: cards by level, reviews per day (from `o2d`), accuracy, streak.

### States and details
- Empty states: nothing learned yet → big "Start with <course>: <first line>" button. No stats → "Statistics for this position arrive with the weekly update."
- A `draft` data file shows a ribbon on the course page.
- All lists must render with 0, 1 and 60+ items; long titles wrap; no horizontal scrolling at 375 px.
- Accessibility: buttons are real `<button>`s, `aria-selected` on tabs, feedback card `aria-live="polite"`.
- Removed from the tab: Spar vs Stockfish, Speed round, "Mine" (custom lines), repertoire alternatives chooser, old Drill tab (replaced by card review).

---

## 6. Files, build and integration

```
openings2/
  BLUEPRINT.md, jobava.md, caro.md, slav.md        lead (read-only for workers)
  courses/jobava.txt, caro.txt, slav.txt           line writers (one owner each)
  reports/<id>.verify.txt, <id>.decisions.md       generated / line writers
  cache/evals.json                                 engine cache (committed)
  tools/course_format.py                           parser shared by verifier and compiler
  tools/verify_course.py                           §1
  tools/compile_courses2.py                        §3 → data/courses2.json
  tools/sfq.py                                     "python sfq.py <SAN moves…> [--mpv 3] [--depth 22]" → evals, top moves, explorer stats
  tools/game_probe.py                              his games vs a course/sequence: positions reached, his moves, opponents' moves
  tools/tests/                                     fixtures + tests for the tools
  ui/o2core.js, o2stats.js, o2.css, o2.html        the new tab (inlined into app.html by build.py)
  ui/dev.html                                      harness page for developing the UI without touching app.html
```
- **UI is developed outside app.html** and inlined at build time, the way `/*CG_CSS*/` and `<!--NOTES-->` already work: app.html gets three placeholders (`<!--O2_HTML-->` inside `#view-openings`, `/*O2_CSS*/`, `/*O2_JS*/` inside the module script) and `build.py` replaces them. app.html is then edited exactly once (task T7), in the main copy.
- `ui/o2core.js` exposes one object `O2` (home, course page, trainer, SRS, tree); `ui/o2stats.js` adds `O2.stats` (screens E, F, traps, models). Both are plain script text that runs inside the app's module scope and receives the helpers by name; `ui/dev.html` provides stand-ins (`progress`, `record`, `GAMES` from `../../data/analysis.json`, `XP` from `../../data/explorer.json`, a fake `engine`).
- `build.py`: add `courses2.json` to the copy list and `DATA_FILES`; inline the three UI files; stop shipping `courses.json`/`openings.json` once nothing reads them. `update.py` and the GitHub workflow `opening-stats.yml`: call the new compiler/explorer steps.
- Old sources (`courses.txt`, `compile_courses.py`, `build_openings.py`) stay in git history; remove them from the working tree in T7 after the new tab works.
- Git: each worker in its own worktree/branch (`agent/<name>`, README "Working with several Claude agents"); only the files listed for its task.

---

## 7. Work breakdown

Order: T1 → (T2a ∥ T2b ∥ T2c ∥ T5) → T3 → T4 → T6 → T7 → T8 → T9 → T10 → T11.

| # | task | model | owns | acceptance |
|---|---|---|---|---|
| **T1** | Tools: `course_format.py`, `verify_course.py`, `compile_courses2.py`, `sfq.py`, `game_probe.py`, tests | **Sonnet** | `openings2/tools/**`, `openings2/cache/` | Runs on a 3-line fixture; tests seed and catch: illegal SAN, a line where the opponent hangs a knight (Q5), our move losing 80 cp (Q1), two moves in one position (Q10), a line ending mid-exchange (Q12), a bad `(( ))` variation (Q19), a made-up model source. Second run of the verifier uses the cache (< 10 s). Compiler output matches §3; node ids stable across re-ordering lines. |
| **T2a** | Write `jobava` | **Opus** | `courses/jobava.txt`, `reports/jobava.decisions.md` | see below |
| **T2b** | Write `caro` | **Opus** | `courses/caro.txt`, `reports/caro.decisions.md` | see below |
| **T2c** | Write `slav` | **Opus** | `courses/slav.txt`, `reports/slav.decisions.md` | see below |
| **T3** | Mechanical pass on each course: run verifier + coverage, lint text (length, banned words, spelling, arrows), check `=>` and cross-course links, produce one table per course | **Haiku** (one run per course) | `reports/<id>.lint.md` | No FAIL left; every WARN has a one-line answer in decisions.md; table complete. Haiku changes nothing in the course files except typos. |
| **T4** | Chess review: all `!sys`, all **W:** decisions, every punish line, 15% random sample of nodes at depth 26, read every plan note | **Lead (Fable)** | review notes | Lead signs off each course or returns a fix list to the T2 worker. |
| **T5** | UI core: home, course page (Learn/Review/Ideas), trainer, SRS engine, move tree, dev harness | **Opus** | `ui/o2core.js`, `ui/o2.css`, `ui/o2.html`, `ui/dev.html` | Works in `dev.html` against a draft `courses2.json` at 375 px and 1280 px; learn → next day (time travel) review → wrong answer resets; alternative move not penalised; progress survives reload; no console errors. Can start as soon as T1's fixture output exists. |
| **T6** | UI stats: Your games (E), Statistics (F), Stats-here drawer, Traps, Model games | **Sonnet** | `ui/o2stats.js` (+ additive CSS in `o2.css` under a marked block) | Numbers cross-checked against `game_probe.py` for 5 positions; Fix-it drill records `o2g`; all lists handle empty data. |
| **T7** | Integration in the main copy: placeholders in app.html, remove old Openings code and markup, `KINDS`, Today tab task + Stats tab references to old courses, `build.py`, `update.py`, README table | **Opus** | `app.html`, `build.py`, `update.py`, `README.md` | `python build.py` builds dist/ and docs/; `grep -n "COURSES\|OPEN\b\|courses.json\|openings.json" app.html` shows no dead references; other tabs unchanged (smoke test each tab); old progress untouched; service-worker core list updated. |
| **T8** | Statistics pipeline v2: `build_explorer.py` reads `courses2.json` (tree walk, same OPP_SHARE logic), keeps old stats, adds masters top games for each chapter's branch position as `lichess-masters:<id>` models; workflow yml | **Sonnet** | `build_explorer.py`, `.github/workflows/opening-stats.yml` | Without a token it exits cleanly and leaves explorer.json unchanged; with cached data a dry run lists the positions it would fetch; budget ≤ 85 min. After the first real run: re-run `verify --coverage` (Q14). |
| **T9** | End-to-end test in the built page (`dist/preview.html`): every line loads and can be played through by a script, SRS clock tests, phone + desktop screenshots, sync kinds present in the saved document | **Sonnet** | `openings2/tools/tests/e2e.md` (results) | Checklist all green; bugs filed back to T5/T6/T7 owners. |
| **T10** | Final mechanical sweep: JSON sizes, dead ids, every card belongs to ≥ 1 line, every line reachable from a chapter, spelling of UI strings | **Haiku** | `reports/final.md` | All green. |
| **T11** | Final review and hand-over note for the user (what changed, how to use, what is phase 2) | **Lead** | – | User approval before `publish`. |
| later | Phase 2: annotate fetched model games (Opus), add lines requested from "where opponents leave the course" (Opus, one course at a time) | | | |

### Brief for line writers (T2a-c)
1. Read this file §0-2 and your skeleton (`openings2/<id>.md`). The skeleton's choices are binding; **W:** items are yours — decide by depth-24 eval (`sfq.py`), tie → first option, and record each decision with the evals in `reports/<id>.decisions.md`. If a binding choice fails a threshold at depth 24, stop and report instead of improvising.
2. Work chapter by chapter, P1 lines first. For each line: (a) lay out the moves with `sfq.py --mpv 3` at **every** ply — our move must satisfy Q1-Q4; the opponent's move is the most frequent *sound* move (stats via `sfq.py`, which prints explorer shares) or the engine's first choice; (b) stop at a quiet position after our move, 8-14 moves deep; (c) write comments, plan notes, arrows, X-notes; (d) run `verify_course.py <id> --line <lineid>` until clean.
3. Use `game_probe.py <id>` to see what he and his opponents actually played in your positions; mention it in comments where it teaches something ("you played 5.Nf3 here twice and lost both: the bishop on f5 stayed too strong").
4. Never write a move you have not run through the engine. Never copy lines from the old `courses.txt` without re-verifying (it contains the faults we are fixing). Never invent statistics, game references or player names; model games only as described in §2.
5. Budget: 36-40 full lines + 6-10 short punish items, 220-320 cards. If the tree wants more, cut P3, then merge.
6. Deliver: the course file, decisions.md (W-decisions, `!sys` list with losses, WARN answers, anything you could not cover), and the verifier report with 0 FAIL.

Engine use is local and free; a full-course verify takes roughly 30-60 minutes cold, seconds when cached. Run long jobs in the background.

---

## 8. Open questions for the user (with the lead's recommendation)

1. **Jobava vs 2...e6 (1.d4 Nf6 2.Nc3 e6 and 1.d4 d5 2.Nc3 e6):** stay in the system with **3.Bf4** (equal, one set-up everywhere) or play the stronger **3.e4** (about +0.4, but it is a French Defence and needs its own theory)? *Recommended: 3.Bf4 now; a "French upgrade" chapter can be added later.*
2. **Size:** covering everything Black can throw at 1.d4 2.Nc3 needs about 36-40 lines **plus** ~10 very short "punish" items per course — slightly above the agreed 30-40. *Recommended: accept; punish items take a minute each.*
3. **Model games:** only two verified master games per course are available offline. More arrive after the weekly GitHub statistics job is extended (T8). *Recommended: ship with what is verified, add annotated games in phase 2.*
4. **First review after 4 hours** (Chessable's default) means a second short session on the same day a line is learned. *Recommended: keep; it is what makes moves stick.*

### User answers (2026-11-12)
1. Jobava vs 2...e6: **keep 3.Bf4**.
2. Size: **accepted** (36-40 lines + ~10 punish items per course).
3. Model games: **ship with the verified ones, add more in phase 2** (never invent games).
4. First review: **next day, not 4 hours** (§4 updated).
