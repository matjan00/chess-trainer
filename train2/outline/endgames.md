# Outline — Essential endgames (`train2/courses/endgames.txt`)

Binding: lessons, order, ids. The 19 existing lessons keep their ids, start FENs and finish conditions from `data/essentials.json`
(use the FEN there as the `PLAY` position; re-verify it with `tb.py` — if a FEN fails L8, fix it and say so in decisions.md).
New lessons are marked **new**; their positions are **W:** (standard theory positions, tablebase-proved before use).

Per lesson: `rule:` → 1-2 examples (the model line with the *longest* defence) → 4-6 cards (the critical moments; include mirrored / shifted
positions and at least one "which move draws/loses?" trap with a `wrong:` line) → 1 `PLAY` (2 where both the winning and the holding side matter).

## Chapter 1 `mates` — Basic checkmates
| id | title | goal |
|---|---|---|
| `qmate` | Queen checkmate | Box the king in a knight's move away, bring your king, mate on the edge. |
| `qstale` **new** | Don't stalemate him | Three positions where the natural queen move is stalemate; always leave him a move until it is mate. |
| `rrmate` | Two-rook ladder | Roll the rooks rank by rank; step away when the king attacks a rook. |
| `rmate` | Rook checkmate | Rook cuts off, king pushes, waiting move when the kings face each other. |

## Chapter 2 `kp` — King and pawn
| id | title | goal |
|---|---|---|
| `square` | The square rule | Can the king catch the pawn? Count with the square, not move by move. |
| `kpfront` | King in front of the pawn | King ahead of the pawn on its key squares wins. |
| `oppwin` | The opposition: win | Take the opposition, go round when he steps aside. |
| `oppdraw` | The opposition: hold | Defender: step straight back, then take the opposition. |
| `kpdef` | Get in front of the pawn | Defender: run to the square in front of the pawn first. |
| `rookpawn` | Rook pawn: run to the corner | A rook pawn does not win if the defender reaches the corner. |
| `race` **new** | Pawn races | Count both sides' moves to queen; who queens first, and does it come with check? |

## Chapter 3 `pawns` — More pawns
| id | title | goal |
|---|---|---|
| `activeking` **new** | The king is a fighting piece | In the endgame walk the king to the centre before pushing pawns. |
| `outside` | The outside passed pawn | Use the far pawn as a decoy, then eat the other side. |
| `protpass` | The protected passed pawn | It ties his king down; yours is free. |
| `majority` **new** | Make a passed pawn from a majority | Push the pawn that has no enemy pawn in front of it first. |
| `breakthru` | Pawn breakthrough | Three against three: sacrifice two to queen one. |

## Chapter 4 `pieces` — Queen and bishops
| id | title | goal |
|---|---|---|
| `qvp` | Queen against a pawn on the 7th | Check closer and closer, force the king in front of the pawn, bring your king. |
| `qvpdraw` **new** | …and when it is a draw | Rook pawn or bishop pawn on the 7th with your king far away: stalemate saves him. |
| `wrongb` | The wrong bishop | Rook pawn + bishop that does not control the corner = draw. |
| `ocb` | Opposite-coloured bishops | Even two pawns down the defender often holds by blocking on his colour. |

## Chapter 5 `rooks` — Rook endings (the ones he will get most)
| id | title | goal |
|---|---|---|
| `rbehind` **new** | Rooks belong behind passed pawns | Yours and his: the rook behind the pawn gains room as the pawn moves. |
| `r7th` **new** | The active rook | A rook on the 7th rank or attacking pawns beats a rook that only defends. |
| `cutoff` | Cut the king off | Keep his king a file away from your pawn. |
| `lucena` | Lucena: build a bridge | Rook to the 4th rank, king out, block the checks. |
| `philidor` | Philidor: third-rank defence | Rook on the 3rd rank until the pawn steps there, then check from behind. |
| `longside` | Check from far away | Defender's rook needs distance; king to the short side. |

## Chapter 6 `own` — From your games
No lessons: the play-outs of `mine2.json` (`eo/…`), newest first, each linked to the course lesson it belongs to when
`stats.endings` matches its material (e.g. rook + pawn against rook → "see Lucena / Philidor").

Notes for the writer
- Order inside chapters is the teaching order. `square` comes first in chapter 2 because everything else uses it.
- Every drawing lesson needs a card from the *stronger* side's view too ("can White win? no — why"), so he stops wasting time in drawn positions and stops resigning them.
- Positions with more than 7 men (`outside`, `protpass`, `majority`, `activeking`, `r7th`): Stockfish rule of BLUEPRINT §2.1; keep them as simple as the idea allows (W: prefer ≤ 7 men where the idea survives).
- Say in `decisions.md` for every lesson: position source (book name or "constructed"), tablebase result, DTM of the model line.
