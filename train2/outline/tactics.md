# Outline — Tactics ABC (`train2/courses/tactics.txt`)

Binding: chapter list, order, the one-line goals and the rule sentences' meaning. **W:** = writer's call (positions, wording).
Each chapter = 1 lesson unless stated: `rule:` → 3 examples (first one as bare as possible: `composed` ≤ 12 men or a 600-900 pool puzzle; the last one from his own games when `pick.py --mine --theme <group>` has one) → 5 cards (rating 700-1300, at least one where the motif is **not** the first idea you see, at least one where *he* is the one about to fall for it: `tag=hold`) → `SET` of 20 pool puzzles, rating 700 → 1500, 1-2 solver moves.

Order = how much each motif costs him in real games (see BLUEPRINT §0), easier ones first.

| # | chapter id | title | pool group | goal (one line) | rule of thumb to teach |
|---|---|---|---|---|---|
| 1 | `loose` | Free pieces | hanging | Spot a piece nobody defends — yours or his. | After every move ask: which pieces are undefended now? |
| 2 | `count` | Count before you capture | hanging (defended targets), removal | Work out who wins a string of captures on one square. | Count attackers and defenders; start with the cheapest piece. |
| 3 | `mate1` | Checkmate patterns in one | mate1 | Recognise the five everyday mates (queen next to king with support, back rank, two rooks, queen+bishop line, knight corner). | Look at every check first. |
| 4 | `backrank` | The back rank | backrank | Use, and avoid, the king stuck behind its own pawns. | No escape square? Then every rook or queen check on the last row is a threat. |
| 5 | `fork` | Forks (2 lessons: `fork-knight`, `fork-other` = pawn, queen, bishop forks) | fork | One move, two targets. | Look for two valuable pieces a knight's jump apart, or on one line or diagonal. |
| 6 | `pin` | Pins | pin | A piece that cannot move because something bigger stands behind it. | A pinned piece does not defend; attack it again. |
| 7 | `skewer` | Skewers | skewer | Attack the big piece; win the one behind when it moves. | King or queen in front of another piece on a line? Check or attack along it. |
| 8 | `discovered` | Discovered attacks and double check | discovered | Move one piece and uncover another. | The piece that moves away can go anywhere with a threat of its own. |
| 9 | `removal` | Remove the defender | removal | Take or chase away the piece that guards the target. | Ask: what is that piece's job? Then get rid of it. |
| 10 | `deflect` | Lure and drag away (deflection, decoy) | deflection | Force a defender to leave its post, or a king onto a bad square. | A piece with two jobs can do only one. |
| 11 | `trapped` | Trapped pieces | trapped | Win a piece that has no safe square. | Before grabbing a pawn deep in his camp: how does my piece get out? |
| 12 | `between` | In-between moves | intermezzo | Before the obvious recapture, look for a check or a bigger threat. | You do not have to recapture at once. |
| 13 | `mate2` | Mate in two | mate2 | Check, forced reply, mate: the ladder, the smothered mate, queen sacrifices on the back rank. | Checks first; picture the position after his only reply. |
| 14 | `defend` | Find the defence | defend | He threatens something real: find the move that holds. | First name his threat, then choose: take, block, move away, or counter-attack with something bigger. |
| 15 | `promote` | Pawn tricks | promotion | Push a pawn through with a sacrifice or a tempo move. | A pawn two steps from queening is worth a piece. |

Notes for the writer
- Chapters 1, 2, 4, 5, 14 map to his most frequent real mistakes: give them the most care and at least two examples from his games each.
- `count` has no Lichess theme: take `hanging`/`removal` puzzles whose captured piece **is** defended (the compiler filter `defended=1` is computed by `pick.py`: target square attacked by the opponent before the capture). W: if fewer than 20 exist in range, widen rating to 600-1600.
- In every chapter one card must be a "don't fall for it" card (`tag=hold`): the motif is aimed at him and he must find the safe move.
- Final lesson `tactics-check` (no new content): a 20-puzzle mixed `SET` over all groups, rating 900-1500, as the course exam.
