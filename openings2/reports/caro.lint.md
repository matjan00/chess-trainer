# Lint report: caro (T3 mechanical pass)

Scope: `courses/caro.txt`, run with `verify_course.py caro --coverage` (O2_THREADS=2). No course text was edited.

| check | result |
|---|---|
| Verifier FAIL count (`--coverage`) | 0 FAIL, 44 WARN |
| WARN breakdown | Q6 x1, Q13 x4, Q14 x39 (answers in `reports/caro.decisions.md`, section "WARN answers") |
| Typos / spelling fixed in comments | 0 (none found in prose or comments; word-list scan clean) |
| Course files edited | none, so no re-verify needed |
| Comment length (limit 320; plan notes 650) | no violations |
| Banned content (numeric evals, cp, eval, "the engine says", "obviously", "simply winning") | none |
| Undefined jargon | "gambit" (L37, not explained); "hole" (L107, L122, L126); "blockade" (L188, L192); "a good French Defence" (L79, vague); "rule 5" (L42, L222) refers to a rule list the course never gives (4 `rule N` references in total) |
| Arrow / circle syntax | valid, no Q20 failures |
| `=>` links | none used in this course |
| Line-id references in text ("line x") | all exist (e.g. c4-accel, cl-bd3-oo, cl-nf3, nf3-e5, ex-main, ex-h3, panov-main) |
| Cross-course links | L25-27 "see the Slav course" (`courses/slav.txt` exists) |
| Non-typo note | "pawn chain" is defined inline at L5, so it is fine there; later uses rely on that definition |
