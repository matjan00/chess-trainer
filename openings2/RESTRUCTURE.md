# Openings restructure: main lines + trigger rules (PLAN, nothing built yet)

Written 2026-11-22. Covers ideas 1 (one main line per family, everything else as a difference)
and 2 (trigger rules: the one thing that decides the move), plus a fresh start of opening progress.

## Why
- 47 / 42 / 48 lines per course are all taught and reviewed the same way, so lines that look alike
  get mixed up and it is not clear WHY the move changes.
- A coach teaches one main line per family very well, then every other line as
  "the same, except ... so now ...", with a rule you can say out loud.

## What stays the same
- The moves of the lines (all Stockfish-checked). Only small fixes where a branch turns out to be a
  near-copy of another one (see Q3).
- Daily review, boxes, daily cap 15, replay from move 1, split-move notes, Your games, Traps, Model games, Stats.

## 1. New shape of each course

Opening -> Families -> Main line of the family -> Branches (and branches of branches).

- **Family** = today's chapter (jobava 7, caro 6, slav 8), regrouped where needed so one family = one
  kind of position (same pawn structure / same plan). Each family gets a 2-3 sentence "story":
  what White does, what you aim for.
- **Main line** = one line per family, the one played most at 1200-1800 (from opening statistics)
  that shows the family plan best. About 21 main lines in total.
- **Branch** = every other line. Stored with its **parent** (the line it leaves) and the **split**
  (the move where it leaves). Parent = the line sharing the longest start, picked automatically,
  checked by the lead.
- Course screen: per family the main line on top, branches indented under it as a small tree
  ("leaves the main line at 6.h4"). The family is "done" when the main line is Silver.

## 2. Trigger rules

At every split (the 66 existing ones plus any new ones made by the regrouping) and at every pair of
look-alike positions (today's "Don't mix it up" pairs), the course gets a **trigger**:

```
{T: clue=g6,h4 | rule=bishop-home | Your bishop is on g6, so it needs h7 to escape: ...h6, not ...h5.}
```

- **clue**: the square(s)/piece that make the difference; highlighted on the board.
- **rule**: id of a named rule of the opening.
- text: one sentence "here X, so Y".

Each opening gets a short **rule book** (aim: 8-15 rules), e.g. Caro:
- "Bishop out before ...e6"
- "h4 against your bishop: on f5 answer ...h5, on g6 answer ...h6 (it needs h7)"
- "Check on b5: block with the bishop if it is still on c8, with the knight if it already left"
- "White's dark bishop left c1: look at b2 with ...Qb6"

Each rule has a plain sentence, the clue to look at, and links to every position it decides (shown as
small boards side by side: "here -> this move, there -> that move"). The rule book is a new part of
the Ideas tab.

## 3. New learning flow

**Main line**: same as today's Learn (walk through + from memory), plus the family story first and the
plan notes. No change in difficulty.

**Branch** (the new part):
1. The known start plays by itself (fast), up to the split.
2. Pause: "Same as <parent> until here. Now White plays 6.h4 instead of 6.Nf3." The board
   briefly shows the parent position next to this one, with the changed squares marked.
3. Question 1 "What changed?": tap the clue square. (Wrong tap -> it is shown, no penalty.)
4. Question 2 "So which rule?": 2-3 short choices from the rule book.
5. Then you play the move, and the rest of the branch is learned as today.

**Unlocking** (so look-alikes are never learned in the same week):
- A branch opens when its parent line has passed its first review (box 2 or higher).
- Two lines that are "Don't mix it up" pairs: the second one opens only when the first is in box 3.
- A suggested order is shown ("Next up"); main lines of the next family are always open.

**Reviews**:
- Unchanged for normal moves (replay from move 1, guided replay after a miss).
- At a split you missed before (or the first time after learning), the clue question comes first,
  then the move. Kept short: at most 1 question per line per review.
- A wrong move that is the move of a sister line opens the rule card with both positions side by
  side (today's "Don't mix it up" box, but with the rule and the boards).

## 4. Fresh start of opening progress

- Wipe: line learned marks and all move boxes / review dates (kinds o2c, o2l) and opening day
  points / streak (o2d).
- Keep: Your games, Traps, Model games, Stats, and everything outside the Openings tab.
- How: not by deleting rows (phone and laptop merge progress and an old copy would bring it back).
  The new version stores opening progress under new keys (`caro@2/...`), so the old entries are
  ignored everywhere at once. Old entries can be cleaned out later.
- Happens only when the new version goes live, so the current reviews keep working until then.

## 5. Work (same team set-up as openings2)

| # | Task | Who |
|---|------|-----|
| R1 | Format + compiler: `parent`, `split`, `{T: ...}` notes, `## RULES` section; lint: every split has a trigger, clue squares really differ, every rule is used | Opus |
| R2 | Per course: pick families + main lines (opening statistics), regroup chapters, write family stories and rule book, triggers at every split and look-alike pair; one worker per course, run 3 in parallel | Opus x3 |
| R3 | Lead review of R2: rules correct and few, each trigger true in the position, wording for 1200-1400 | Fable |
| R4 | UI: course tree, branch learn flow (steps 1-5), unlocking, rule book, review clue question, rule card on wrong sister move | Opus |
| R5 | Progress fresh start (new keys) + Today tab counts still right | Opus (with R4) |
| R6 | Tests: compiler checks, unlocking, clue question, real flow Today -> Start the session, counts before/after closing mid-session, phone layout | Sonnet checker |
| R7 | Summary for you -> your OK -> publish | me |

Order: R1 -> R2 (3 parallel) -> R3 -> R4+R5 -> R6 -> R7.
Models actually used (user wants to save tokens): R1/R2/R4/R5/R6 Sonnet, R3 Opus.

## STATUS (keep updated after every step; a fresh session resumes from here)
- 2026-11-22 night: worktree C:\Users\mateu\chess-trainer-work\o3 (branch agent/o3, engine junction, cache copied). Spec §6 written. Next: R1.
- 2026-11-22 ~01:00: R1 DONE (commit 2e5a73d on agent/o3, 34 tests OK). R2 writers (Sonnet x3, brief openings2/R2_BRIEF.md) in progress; R4 UI (Sonnet) in progress in parallel on fixture data. If resuming: check reports/<course>.o3.md exist and verify_course.py <course> --no-engine has 0 FAIL before R3.
- R2 DONE for all 3 courses (commit f636a4f). R3 Opus reviewers x3 in progress (brief R3_BRIEF.md, reports/<course>.r3.md when done). R4 UI agent still running.
- 2026-11-23 after 01:30: limit hit at ~00:50 and reset; the SAME session resumed the 4 agents, the 02:00 scheduled run was disabled (this is the second budget window).
- R3 DONE (commit 1d47827). R4+R5 DONE (commit dcebbbe, app v91 built in worktree docs/, o3_check 79/79). R6 e2e (Sonnet) in progress → tools/tests/o3_e2e.md. Then R7 summary.
- R6 DONE (9/9 PASS, o3_e2e.md). R7 summary written: openings2/RESTRUCTURE_SUMMARY.md. FINISHED, waiting for user OK to merge+push (and Q3 answer).
- Nothing is committed on main or pushed. Do NOT publish: the user approves the summary first.

## User answers (2026-11-22)
Q1 yes (keep chapters, split only mixed ones). Q2 = B (main lines of the most-met families first).
Q3 yes, but the list goes to the user before anything is turned into a note (writers only list candidates).
Q4 no. Agents do NOT commit; the orchestrator commits on agent/o3.
Budget: this session, then (if the limit hits) a fresh session at 02:00 2026-11-23; nothing else. Save tokens, but it has to work.

## 6. Exact format (R1 implements, R2 writes)

### Source additions (`openings2/courses/<id>.txt`)
- **Family main line**: 4th header field `trunk`:
  `### LINE short-main | Short system: 5.Be2 c5 6.O-O | main | trunk`
  Exactly one per chapter. A chapter of unrelated odds and ends may instead be marked
  `## CHAPTER odd | Other first moves | mixed` and then has no trunk.
- **Chapter intro** (`> ...`) is the family story: what the opponent does, what you aim for, 2-4 sentences.
- **Start lines** (course header, after `why:`): `start: short-main, cl-main, ex-main`
  = the 2-4 trunks to learn first (most-met families in the user's games / opening statistics).
- **Parent override** (optional, own line right after the LINE header, before `>`): `parent: <lineId>`.
- **Rule book**: new section before `## TRAPS`:
  ```
  ## RULES
  rule: bishop-home | h4 against your bishop | On f5 answer ...h5 so the pawn stops; on g6 answer ...h6, because the bishop needs h7 to escape.
  ```
  `rule: id | short name (max 6 words) | one or two plain sentences`. 6-15 rules per course.
- **Trigger** on OUR move, a note in `{...}` after the move (like `{P: ...}`):
  `{T: bishop-home | g6 h4 | Your bishop is on g6, so it needs h7: ...h6, not ...h5.}`
  fields: rule id | clue squares (1-3, space separated: where to look) | one sentence "here X, so Y".
  Optional 4th field `not=ruleA,ruleB` = wrong choices for the "which rule?" question
  (default: compiler picks 2 other rules, preferring ones used in the same chapter).
  Written once, on the first line that owns the move (same as comments).

### Lint (`verify_course.py`, new check ids)
- `T-SPLIT` WARN: our reply right after an opponent move at a split point (position with more than one
  opponent reply in the course) has no trigger.
- `T-SISTER` WARN: our move in a look-alike pair has no trigger. Look-alike = Python port of `sisters()` in
  `openings2/ui/o2core.js`: another line, same ply and side to move, 1-4 squares differ, our moves differ and the
  other move is legal here.
- `T-RULE` FAIL unknown rule id; FAIL rule never used; WARN rule used once.
- `T-CLUE` FAIL clue not a square; WARN none of the clue squares differ from the parent/sister position.
- `TRUNK` FAIL chapter without exactly one trunk (unless `mixed`); FAIL `start:` names a non-trunk.
- `RULES` FAIL more than 15 rules.
- New tool `openings2/tools/triggers_needed.py <course>`: prints every T-SPLIT / T-SISTER place with line id,
  move, the differing squares and the moves played in each position: the writers' worklist.

### Compiled additions (`data/courses2.json`)
- course: `"ver": 3`, `"start": [lineId…]`, `"learn": [lineId…]` (start lines, then other trunks by reach
  (null reach last), then branches: each after its parent, by reach), `"rules": [{"id","name","text","cases":[{"node","line"}]}]`.
- chapter: `"trunk": lineId|null`, `"mixed": bool`.
- line: `"trunk": bool`, `"parent": lineId|null`, `"split": i|null` (index in `nodes` of the first node not shared with
  the parent; parent = explicit `parent:`, else the chapter trunk if it shares the longest start, else the line with
  the longest shared start that is earlier in `learn`; trunks have parent null), `"twins": [lineId…]` (lines with a
  look-alike pair to this one).
- node: `"trig": {"rule","clue":[sq…],"text","not":[ruleId…]}|null`.
- Card/node ids unchanged.

### UI rules (R4)
- Progress namespace: `ckey(c,id)` = `` `${c.id}@3/${id}` `` for o2c and o2l; o2d (day points/streak) uses keys
  prefixed `3:` (or equivalent) so it restarts → old opening progress ignored on every device, no rows deleted.
  Traps/models/your games unchanged. Today tab counts must follow.
- Course screen: families (chapters) with the trunk on top, branches indented under their parent with
  "leaves <parent title> at <move>"; locked branches greyed with the reason; "Next up" = first open unlearned line in `learn`.
- Unlock: trunk always open; branch open when every card of its parent line is in box ≥ 2; if it has a twin that is
  learned, it opens only when that twin is in box ≥ 3. "Learn anyway" link on a locked line (no hard block).
- Branch learn: auto-play the shared start fast → pause card "Same as <parent> until here. Now <opp> plays <split move>
  instead of <parent move>." with changed squares marked (parent position as a mini board) → if our next move has
  `trig`: Q1 "What changed? Tap where to look" (any clue square = right; wrong tap → clue shown, no penalty) →
  Q2 "Which rule?" (rule + 2 `not`, shuffled) → the move → rest as today's Learn (step 2 from memory unchanged).
- Review: at a node with `trig`, if it is the card's first review or it was missed last time, ask Q1 before the move
  (max one per line per review). A wrong move equal to a twin's move shows the rule card: rule name + text and
  both positions as mini boards, "here → X / there → Y".
- Ideas tab: "Rule book": every rule with its cases (mini board + move).

## Open questions (my recommendation first)
- Q1 Families: keep today's chapters as families, regroup only where a chapter mixes two kinds of position? (yes)
- Q2 Main lines first: learn the 2-3 main lines you meet most in each opening before any branch? (yes: Caro Advance + Classical + Exchange first, etc.)
- Q3 Near-copy branches (differ only in one late move): turn them into "know the idea" notes without daily review? (yes, ask you with the list before doing it)
- Q4 Reset also Traps / Model games progress? (no, only lines and reviews)
