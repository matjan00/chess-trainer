# R2 brief: restructure one course (main lines + trigger rules)

You restructure ONE course file: openings2/courses/<course>.txt in C:\Users\mateu\chess-trainer-work\o3
(git worktree; do NOT commit; touch ONLY your course file and openings2/reports/<course>.o3.md).
Python: %LOCALAPPDATA%\Programs\Python\Python312\python.exe (python-chess). Two other writers work on the
other courses at the same time: always pass --no-engine to verify_course.py / compile_courses2.py (the
evaluation cache is shared; never run the engine, never leave background processes).

Read first: openings2/RESTRUCTURE.md (why + §6 exact format), your course file, the worklist
openings2/reports/<course>.triggers.txt (made by tools/triggers_needed.py).
The learner: adult, rated 1200-1400, no coaching, struggles to remember lines and to see WHY the move differs
between look-alike positions. Language: plain English, short sentences, name pieces in words
(knight, bishop) in prose; existing glossary words are fine. Same style as the existing notes.

DO
1. Families: every chapter stays a family. Split a chapter only if it mixes clearly different kinds of
   position (example: Caro "Exchange and Panov" = calm Carlsbad vs isolated d4 pawn → two chapters). A grab-bag
   chapter of unrelated sidelines/first moves is marked `| mixed` instead. Rewrite each chapter intro (`> `) as
   the family story: what the opponent does, what you aim for, the one or two rules that matter (2-4 sentences).
2. Mark exactly one `trunk` per non-mixed chapter: the line most often met at club level (use the `reach`
   numbers: compile with `compile_courses2.py <course> --no-engine --out <temp file>` and read lines[].reach;
   ties → the line that shows the family plan best). Trunk should normally be the line written first in its chapter;
   reorder lines inside a chapter so the trunk comes first.
3. `start:` = 2-4 trunks of the families the user meets most (the `why:` paragraph has their game counts;
   otherwise reach).
4. `## RULES` (before `## TRAPS`): 6-15 rules. A rule is a general if-then a coach would teach, true in every
   position it is used for, e.g. "h4 against your bishop: on f5 answer ...h5; on g6 answer ...h6 (it needs h7)".
   Prefer few strong rules used many times over many one-off rules.
5. Triggers `{T: rule | clue squares | sentence}` on our move:
   - REQUIRED at every SISTER place in the worklist (look-alike positions where our move differs).
   - REQUIRED at a SPLIT place when our reply here differs from what we play at the same moment in the parent
     line / sibling lines. NOT needed when we play the same move against every opponent choice (e.g. ...d5 against
     anything): leave those without a trigger.
   - Clue squares = 1-3 squares that are actually different and that a player should look at (use the
     "differ" squares in the worklist). The sentence must be TRUE in that exact position: check pieces/squares with
     python-chess before writing (print the board). "Here X, so Y" form, max ~25 words.
   - Put the {T:} note on the first line that owns that move (where its {comment} is); in later lines the move is
     bare. Place it after the move like other notes: `6... h6 {comment} {T: ...}`.
6. Do NOT change any move, add or delete lines. Moving a line to another chapter or reordering is fine.
   Q3: list (do not apply) branches that are near-copies of another line (differ only in one late move and add
   little) as candidates for "know the idea" notes.
7. Run until clean: `verify_course.py <course> --no-engine` → 0 FAIL; the new T-* / TRUNK / RULES WARNs must be
   either fixed or listed (grouped, one short reason each) in openings2/reports/<course>.o3.md. Then re-run
   `triggers_needed.py <course>` to confirm the remaining places are the intentional skips.
   Also: `compile_courses2.py <course> --no-engine --out <temp>` must succeed (not a draft).
8. Write openings2/reports/<course>.o3.md: families (chapter → trunk), start lines, the rule book (id + name +
   how many places use it), counts (triggers written / places skipped), skipped WARNs with reasons, Q3 candidates
   (line id + one-line reason), anything you were unsure about (especially chess claims).

Final reply to the orchestrator: under 15 lines (counts, FAIL/WARN numbers, open doubts). Save tokens: do not
print whole files; use grep/sed ranges.
