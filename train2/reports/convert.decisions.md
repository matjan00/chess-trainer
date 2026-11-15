# Win the won game — decisions (T5c)

Course file `train2/courses/convert.txt`, verified with `verify_lessons.py convert`: **7 lessons, 37 items, 0 FAIL, 0 WARN**
(depth 20, multipv 4, 3 engine threads; tablebase for the 4-5-man positions).
Every game reference was fact-checked against `data/analysis.json` (FEN, opponent, date, move played, seconds, result).

## Counts

| lesson | EX | CARD | JUDGE (safe / blunder) | MINE | sources |
|---|---|---|---|---|---|
| stillgame | 2 (both games he lost from a won position) | 0 | 2 (0 / 2) | tq kind=defend n=8 · cv result=loss,draw n=1 | yanis4dja, LicMenchaca; judges befuddledtub88, emperorchiken |
| trade | 2 (one missed trade, one taken) | 0 | 2 (2 / 0) | tq kind=trade n=6 · cv n=1 | matteoborgio, Alaa93Salman; allison_08, justinkron31 |
| counterplay | 2 (passed pawn; checks on his king) | 0 | 1 (0 / 1) | tq kind=defend n=8 · cv n=1 | JHSistemas, AgapelosLiberty; traCys-Rarity |
| takefree | 2 | 0 | 2 (1 / 1) | tq kind=take n=8 · cv n=1 | Zendop75, Sergei-501; gillesbellenger, spingobingo |
| allpieces | 1 | 1 | 1 (1 / 0) | cv n=1 | traCys-Rarity; IsaacFeny; Kapil03091999 |
| simplest | 1 | 1 | 2 (2 / 0) | cv n=1 | Miky_il; MUY3KWE; laleta34, jagan365 |
| finish | 2 (stalemate; mate with checks) | 1 | 0 | tq kind=finish n=6 · cv n=1 | TRylo, mohammedabukassem; card from Patrick_BEV |
| **total** | **12** | **3** | **10 (6 / 4)** | 11 blocks (4 tq, 7 cv play-outs) | |

His own games: 12/12 examples, 10/10 judgements and 2/3 cards are positions from his games (`src=game:`).
One card (`finish-1`) is `src=composed`: it is his game against Patrick_BEV one check later than the moment he missed
(66...Rb2+ 67.Ka1, tablebase-proved), because the game position itself fails L6/L4 as a card. The text says where it comes from.
Numbers quoted: 175 games, 108 won positions reached, 74 kept, "threw away a win" 91 (all `t2stats.py`).

## Deviations from the outline

- **allpieces** (outline: 2 examples + 4 cards) has 1 example, 1 card, 1 judgement + play-out. **simplest** (outline: 4 cards
  "which line is the safe win?") has 1 card + 2 judgements + play-out. A scan of all his cached positions (`mine_evals.jsonl`, his side,
  ≥ 72 win-%, ≤ 2 good moves, gap ≥ 10) found almost no quiet "bring a piece" or "simplify" positions that are not already
  `mine2.json` cards; the candidates tried failed L4 (spingobingo Nf3: third move 11 behind) or L6 (Rebelc Be5: capture next).
  The pool (`data/puzzles2.json`) does not exist yet, so Lichess positions could not be used either. Judgements ("is this trade / king move safe?") replace the missing cards.
- Lesson 7 has no JUDGE but a CARD; the outline asked for the `finish` MINE block and the `qstale` link: both there (link in text only, the format has no link field).
- Links to Endgames lessons (`qmate`, `rrmate`, `outside`, `lucena`, `qstale`) are mentioned in intro text only.
- Chapter theme set to `defend` (one chapter; theme is informational).

## For the lead

- Examples whose start position is also an item in `mine2.json` (not servable, but he may meet the same position from a MINE block):
  stillgame-a (chk), stillgame-b (eo play + tq card), counterplay-a/-b (chk), takefree-a (chk), takefree-b (cv play),
  the other examples are not. No CARD or JUDGE shares a posKey with `mine2.json` (checked).
- `MINE cv | result=loss,draw` relies on the `result` field of `mine2.json` plays (values win/loss/draw). Other lessons use `cv n=1`
  and assume the app hands out the next unused play-out per block (outline: "the compiler takes the next ones").
- `trade-a` flags the opponent's 37.Kd2 with `?` (it lost 48 win-%); the example shows the trade he missed (he still won the game).
- `simplest-1`: both Qxg4 and Rxg4 are accepted (`also:`); he played Rxg4 in the game.
