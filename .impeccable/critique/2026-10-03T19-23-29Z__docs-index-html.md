---
target: chess trainer app
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\mateu\\chess-trainer\\docs\\index.html"
target_fingerprint: "sha256:9c42f0e2feffec9de2b6166ba1469d494459c7dc8cd2913e2380a98db05cdda8"
target_path: "C:\\Users\\mateu\\chess-trainer\\docs\\index.html"
timestamp: 2026-10-03T19-23-29Z
slug: docs-index-html
---
# Critique: Chess Trainer app (docs/index.html / live PWA)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Progress counts/bars good; signed-out sync state easy to miss |
| 2 | Match System / Real World | 2 | Engine jargon: "Evaluation: +61.0", "+M58", "inaccuracy", "theme hidden" |
| 3 | User Control and Freedom | 3 | Back/Restart/Forward exist; "Next" (skip) is primary blue before solving |
| 4 | Consistency and Standards | 2 | Endgames exercise back link says "← Middlegame"; "Endgames"/"Endings"; 95/65 vs 93/64 |
| 5 | Error Prevention | 3 | Hints/arrows; Blunder check answerable on autopilot |
| 6 | Recognition Rather Than Recall | 3 | Winning checklist hidden while playing Convert the win |
| 7 | Flexibility and Efficiency | 2 | No keys for Hint/Next/Show solution |
| 8 | Aesthetic and Minimalist Design | 2 | Report very long; Tactics home 18 equal cards |
| 9 | Error Recovery | 2 | No "why your move fails" after a miss |
| 10 | Help and Documentation | 3 | Great inline copy; no glossary |
| Total | | 25/40 | Acceptable |

## Design Specificity Verdict
Personalised in substance, generic in form. Copy and data are uniquely his; the visual layer (pale cards, standard board, pills, stat tiles) is category-interchangeable. Detector: 5 findings — low-contrast x2 (dark-mode secondary text 4.2:1), tight-leading x1 (line-height 1.0 on condensed numbers), all-caps-body x1, skipped-heading x1 (h1 → h3 in account panel). No overlay (browser denied to detector agent).

## Priority Issues
- [P1] Phone exercise screens: controls below the board, page 7px wider than the viewport. Fix: fit board to height, bottom action bar, fix overflow. (/impeccable adapt)
- [P1] Six small (37px) top tabs on phone. Fix: bottom tab bar, 4–5 destinations (Today · Games · Openings · Train · Stats). (/impeccable adapt + layout)
- [P1] Inconsistent labels/numbers: "← Middlegame" on Endgames, Endgames/Endings, 95/65 vs 93/64, puzzle rating seeded 1600 for a 1376 player. (/impeccable harden + clarify)
- [P2] Engine numbers instead of chess language in exercises. (/impeccable clarify)
- [P2] Too many equal choices: Tactics 18 cards, Endgames 21. One recommended action + grouped/collapsed rest. (/impeccable distill)

## Persona Red Flags
- Casey: top nav/back link out of thumb reach; ~37px Hint/Next below the fold; small sync link; no resume.
- Jordan: unexplained eval/+M/inaccuracy/lines learned/theme hidden/Plans quiz; vague "Play one position out"; spaced-review intervals unexplained.
- Alex: no keys for Hint/Show/Next; no tab keys; skip looks more inviting than solve; no search in My games, 36-item opening dropdown.

## Minor Observations
- Coach's notes are all criticism; no wins/progress.
- No celebration at 4/4 daily tasks; no session-end summary.
- Winning checklist not visible during Convert the win.
- "Next mistake of mine" buried among tiny toolbar buttons.
- Stat tiles have no trend or goal.

## Questions to Consider
- How could the 5-second check be felt (e.g. enforced pause in Blunder check)?
- Should the app open on Today instead of the long report?
- Merge Tactics/Middlegame/Endgames into one "Train" tab with a daily queue?
