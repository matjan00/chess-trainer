# Outline — Think first (`courses/think.txt`) and Win the won game (`courses/convert.txt`)

Both courses are short (he should finish each in about a week) and built on **his own games**: examples, cards and judgements come
from `mine2.json` through `pick.py --mine` and `#### MINE` blocks wherever possible. Numbers quoted must come from `t2stats.py`.
Binding: lessons, order, rules. **W:** positions and wording.

## Think first — the habit course against playing too fast

Why (for the `why:` field, with his numbers): 31% of his mistakes are played in under 5 seconds; "walked into check" 50 times,
"hung a piece" 49 times in 175 games. The cure is one routine before every move, trained until it is automatic.

| # | lesson id | title | rule | built from |
|---|---|---|---|---|
| 1 | `check3` | The three questions | Before you let go of the piece: what can he **check**, **capture**, **threaten** after my move? | 2 examples from his blunders (`why` = hung piece); 4 `JUDGE` (safe/blunder on his own moves); `MINE chk | who=me | n=10` |
| 2 | `hismove` | What does his move want? | Every move changes something: what does it attack now, and what did it stop defending? | 2 examples; `MINE thr | n=8` (threat cards: play his threat, then stop it) |
| 3 | `loose` | Loose pieces drop off | An undefended piece is a target for forks and double attacks: defend it or know why not. | examples with tags hung piece / fork; `MINE fix | tags=hung piece,fork | n=8` |
| 4 | `checks` | Never be surprised by a check | List his checks before you move a piece away from your king or open a line. | examples tag walked into check; `MINE fix | tags=walked into check | n=8`; 4 `JUDGE` |
| 5 | `gift` | Is it a gift or a trap? | When he leaves something, take ten seconds: usually it is a blunder — punish it; sometimes it is bait. | `MINE pun | n=8` mixed with quiet decoys (`MINE chk | who=opp | n=8`) |
| 6 | `clock` | Where your time should go | Spend time when the position changes: captures, checks, pawn breaks, and whenever you are winning. | his clock numbers (`stats.clock`, mistakes by time left); 6 `JUDGE` from moves he played in under 3 s (3 safe, 3 blunders) |

Daily drill after the course: the Think-first block (5 a day) keeps drawing from `mine2.json` judgements, threat cards and punish cards.

## Win the won game — converting an advantage

Why: "threw away a win" is his most frequent tag (91). Use `stats.won` (reached / kept) in the `why:` text.

| # | lesson id | title | rule | technique kind / source |
|---|---|---|---|---|
| 1 | `stillgame` | Winning is not won | When you are ahead, your first question is still: what is his threat? | `defend` (138 positions): 2 examples from games he lost from a won position; `MINE tq | kind=defend | n=8` |
| 2 | `trade` | Trade pieces, keep pawns | Ahead in material: swap pieces (not pawns), every fair trade makes the win simpler. | `trade`; `MINE tq | kind=trade | n=6`; 2 composed-from-pool examples if his games give too few (W:) |
| 3 | `counterplay` | Kill his counterplay first | Before you win more, take away his only active idea: the open file, the passed pawn, the attack on your king. | `defend`; `MINE tq | kind=defend | n=8` (different items: compiler takes the next ones) |
| 4 | `takefree` | Take what is free — after a check for the catch | Free material makes the win easier, if nothing is hanging at home. | `take`; `MINE tq | kind=take | n=8` |
| 5 | `allpieces` | Bring everyone | Before the final attack, the worst-placed piece joins; in the endgame that includes the king. | W: 2 examples (pool, theme quietMove or his games); 4 cards |
| 6 | `simplest` | Choose the simplest win | A clearly won endgame you know beats a flashy attack you have to calculate. | links to Endgames lessons (`qmate`, `rrmate`, `outside`, `lucena`); 4 cards "which line is the safe win?" |
| 7 | `finish` | Finish the job | Far ahead: look for mate with checks, and never stalemate. | `finish`; `MINE tq | kind=finish | n=6`; link to `qstale` |

Each lesson ends with one `MINE cv` play-out (a won position from his games against the engine); lesson 1 uses a game he
actually lost or drew from a winning position (`stats.won.thrown`), newest first.

Notes for the writer
- These are habit courses: every lesson fits on two phone screens of text in total. The cards do the teaching.
- If a `MINE` filter returns fewer items than asked, the app shows what exists; write the lesson so it still works with 3.
- Tone: no blame. "This is the most common way 1400 players lose won games, and it is the easiest rating to win back."
