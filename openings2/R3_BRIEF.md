# R3 brief: chess-content review of one restructured course

Work ONLY in C:\Users\mateu\chess-trainer-work\o3 (git worktree; do NOT commit). Edit only
openings2/courses/<course>.txt and write openings2/reports/<course>.r3.md. Python:
%LOCALAPPDATA%\Programs\Python\Python312\python.exe (python-chess). Two other reviewers run at the same time:
always pass --no-engine to the tools, never run the engine, no background processes. Do not print whole files.

Context: openings2/RESTRUCTURE.md (why + §6 format). The writer's report: openings2/reports/<course>.o3.md
(read its doubts first). The learner is an adult rated 1200-1400. The whole point of this restructure is that
each family has ONE main line they learn first, and that at every look-alike/split position a trigger tells them
the ONE thing that decides the move, tied to a rule. A wrong rule or a false trigger teaches them something false:
that is the main thing you prevent.

Check and FIX in the course file (no move changes, no added/deleted lines):
1. Trunk per family: is it the line a coach would teach first (common at club level AND shows the family plan;
   reach numbers punish long lines, so do not follow reach blindly)? Is `start:` the 2-4 families met most
   (the `why:` paragraph has the user's game counts)? Compile to a temp file
   (`compile_courses2.py <course> --no-engine --out %TEMP%\r3_<course>.json`) and inspect lines[].parent/split:
   every branch's parent must make sense (same family, real shared start). Fix with `trunk`, reordering or
   `parent:`. Lines without a parent are open at once (fine for mixed chapters / unrelated starts).
2. Rules: each rule true as a general club-level guideline in every position that uses it; names short and clear;
   merge near-duplicates; remove stretched uses (re-tag the trigger to a better rule).
3. Every trigger: the "here" fact true in that exact position (verify with python-chess), the clue squares the
   ones a player should look at, and the "so" really follows. Wording: plain, short.
4. Check the specific chess claims the writer flagged as doubts.
Then: `verify_course.py <course> --no-engine` 0 FAIL, compile not a draft, run `triggers_needed.py <course>`.
Write openings2/reports/<course>.r3.md: what you changed (short list), anything still doubtful.
Final reply under 12 lines.
