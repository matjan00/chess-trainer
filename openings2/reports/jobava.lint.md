# Lint report: jobava (T3 mechanical pass)

Scope: `courses/jobava.txt`, run with `verify_course.py jobava --coverage` (O2_THREADS=2). No course text was edited.

| check | result |
|---|---|
| Verifier FAIL count (`--coverage`) | 0 FAIL, 66 WARN |
| WARN breakdown | Q1 x1, Q6 x8, Q9 x1, Q11 x3, Q13 x2, Q14 x51 (answers in `reports/jobava.decisions.md`, section "WARN answers") |
| Typos / spelling fixed in comments | 0 (none found in prose or comments; word-list scan clean) |
| Course files edited | none, so no re-verify needed |
| Comment length (limit 320; plan notes 650) | max 276 characters, no violations |
| Banned content (numeric evals, cp, eval, "the engine says", "obviously", "simply winning") | none |
| Undefined jargon (not on the glossary, not explained in the sentence) | "theory" (L240, L291); "pawn chain" (L92); "pawn storm" (L108); "clamp" / "f4-pawn clamp" (L150, L199); "hole" (L15, L186, L271, L278-279); "gambit" (L155; L193 explained inline); "French Defence" used as a name (L201, L209, L291) with no explanation |
| Arrow / circle syntax | valid, no Q20 failures |
| `=>` links | 3 (L209 `a6-e6`, L213 `e6-bd6`, L240 `2e6-bb4`); all ids exist |
| Line-id references in text ("line x") | all exist |
| Cross-course links | none |
| Non-typo note | L232 says "After 1...d5 2.Nc3 c6 3.Bf4" while the line itself starts 1.d4; wording only, not changed |
