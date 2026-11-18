# Games tab rebuild ("games2") - plan

Planning only. Nothing built yet. Style reference: today2/PLAN.md, openings2/BLUEPRINT.md.
Reader: the worker agent who builds it; the user (Janczu00, ~1376 rapid, no coding background) approves the questions at the end.

## 1. What the tab does today, and what is wrong
Code: app.html, section `view-games` (list + `#game-viewer`), JS "games list" / "game viewer" (~lines 1140-1420).

- **List** (`renderList`, filters `setupFilters`): a 9-column table: Date, colour dot, Opponent, Result, Opening, Moves, Accuracy, ACPL, Mistakes (`7??`). Filters: colour, result, opening family. Newest first.
  - Finding a game: no way to ask "which games did I throw away?" even though `WINNING` / `g.myWin` and the tag "threw away win" (101 mistakes in the data) exist. No "not yet reviewed" idea at all.
  - 9 columns do not fit a phone (the card scrolls sideways). ACPL and Accuracy are two numbers for one idea, and ACPL is jargon.
- **Viewer** (`openGame`, `goto`, `renderComment`, `drawEvalGraph`, `renderMoveList`):
  - Opens at move 0; the user must press "Next mistake of mine" repeatedly. Nothing says "here is what decided the game".
  - The comment box shows engine numbers (`evalText` "+1.4", "win chance -23%", "lost 310") and the best move in SAN at once. The plain-English helpers `standWords` / `evalWords` exist but the viewer barely uses them. The answer is shown before the user thinks, which feeds his "plays too fast" weakness.
  - Eval graph (`drawEvalGraph`) marks only your mistakes with dots; a click jumps to the nearest move, no labels, tiny on a phone.
  - `renderGameReport` (open by default) is a wall: 4 big numbers, 2 tables (move quality, ACPL by phase), turning points, one time sentence. The actionable part (turning points) is at the bottom.
  - Time data is the biggest unused asset: all 11,774 analysed moves have `t` (seconds spent) and `clk`. Only one sentence uses it ("N mistakes in under 3 seconds").
  - Dead end: from a mistake the user cannot practise it. The Train "fix" card for it exists (mine2.json: 173 `fix` cards with `url`, `moveNo`, `sol`, `played`) but is reachable only from Today's "Since your last game" card (`renderLastGame`) or Train -> From your games. Opening "out of book" (`bookAlerts`) is also only on Today.
  - "Try your own move" works (Stockfish in the browser) but is hidden among five buttons.
- **Phone**: board, controls and side panel stack in one long scroll; the graph and move list are far from the board; hints like "M" and arrow keys mean nothing on a phone.

Data available per game (data/analysis.json, 176 games, 168 are 10 min, 8 are 15+10): url, color, result, how, end, opening, ratings, opp, `final` eval, and per move: `san`, `e` (eval), `best`, `ph` (phase), `loss` (win-chance lost), `clk`, `t`; only on labelled moves (1,180: 310 blunders, 248 mistakes, 622 inaccuracies): `lab`, `pv`, `fen`, `refute`; `why` tags only on 593 of them (your own mistakes). Derived in app.html: `acpl`, `acc`, `nb`, `nm`, `myWin`, `family`.

## 2. Goal
After each game, see the 2-3 moments that decided it, try them first yourself, and send each one to practice.

## 3. Proposed structure (priority order)

### G1. "Review this game": the key moments flow (the main new thing)
- Opening a game starts on a **Review** screen, not move 0. Header: result, opponent, one plain sentence ("You were winning at move 22, then lost it on move 31").
- **Key moments** = up to 3 of your own biggest swings (`loss` >= 15, at least 6 moves apart), always including the move where a winning position (`myWin` >= 85) first fell below 60, if any. Optionally 1 "great move" you found, so it is not only negative.
- One moment per screen: board at the position BEFORE your move, text "Move 31. You are slightly better. What would you play?". The user moves a piece or taps "Show me". Then the reveal: your move vs the best move with arrows, a plain sentence, and the stored `pv` / `refute` line. Buttons: "Next moment", "Practise this" (G4), "Try your own move" (existing explore).
- Why: it makes him think before looking (his "plays too fast" weakness) and takes about 2 minutes instead of scrolling 40 moves.
- Data: existing `loss`, `lab`, `best`, `fen`, `pv`, `refute`, `why`, `myWin`. New: a pure JS function `keyMoments(g)` (~40 lines). No Python change.
- The old full viewer (move list, arrows, explore) stays as "Whole game", one tap away.

### G2. Plain-English explanations instead of numbers
- `renderComment`: lead with a sentence built from `why` tags and standings: "You left your bishop hanging (hung piece). Before: about equal. After: you are clearly worse." Use `standWords` for before and after. Exact numbers go behind a small "numbers" toggle.
- Tag to sentence table for the 8 existing tags (threw away win, walked into check, hung piece, missed capture, lost material, fork, allowed mate, missed mate). Moves without a tag get a generic sentence by size ("This gave away about a pawn").
- Data: existing. About 60 lines plus the wording table. No engine call.

### G3. Eval graph as the map (replaces the tiny graph)
- Bigger, full width, shown on Review and above the move list. Numbered markers 1, 2, 3 for key moments (tappable, jump into that moment); a green band while you were "winning" (>= 85) so "threw it away" is visible at a glance; opponent blunders as small hollow dots ("they gave it back").
- Optional thin strip under it: seconds per move (bars from `t`); red bars = quick moves (< 4 s) that were mistakes. Time shown only where it matters.
- Data: existing `myWin`, `t`, `lab`. About 50 lines (rewrite of `drawEvalGraph`); touch targets >= 44 px.

### G4. From a moment to practice (close the loop)
- "Practise this" on a key moment: if mine2 has a `fix` card with the same `url` and `moveNo`, call the existing `T2.startOne('mine/' + id, back)` (what Today already does) and return to this game. If no card exists (moment too small), offer "Try your own move".
- Game header: "Opening: you left your Caro course at move 6 -> Fix the line" from `bookAlerts()`. Move the Today logic into one shared helper `gameFacts(g)` used by both Today and Games so they never disagree.
- After the last moment: "Practise all now". Tick moments already practised (read-only use of existing mine2 progress).
- Data: existing mine2.json, `T2.startOne`, `bookAlerts`. About 40 lines. No new data.

### G5. Simpler list, filters you will use
- Card rows instead of a table, two lines each: result pill, opponent (rating), opening, date; second line small tags: "Threw away a win", "Quick moves", "Opening mistake", "2 key moments". One accuracy number; no ACPL, no Moves column.
- Filters: Result, Colour, Opening (keep) plus chips **Threw away a win** (`max(myWin) >= 85` and not a win), **Not reviewed yet**, **Quick-move mistakes**. Sort: newest (default) or biggest swing.
- "Reviewed": set automatically when the key-moment flow is finished (or a manual tick). Stored in `progress` as a new tiny kind `gr` (per game url); must be added to `KINDS` (~line 701) so sync merges it.
- Top card **"Next to review"**: newest unreviewed game with a big swing, one button "Review it".
- About 100 lines.

### G6. Time use, only where it matters
- Review header: "3 of your 5 mistakes came in under 4 seconds". Per key moment: "You spent 2 s here (your usual: 7 s)". No table of seconds per phase.
- Later, across games (Stats): "In winning positions you play X s per move vs Y s elsewhere" using `myWin` and `t`.
- Data: existing. About 30 lines.

### G7. Game of the week (later, optional)
- Once a week: the game with the biggest "threw away a win" swing, shown at the top of Games and as an option in Today's "Since your last game" slot: "Your most expensive game this week". About 25 lines once G1 exists.

### G8. Phone layout
- Review: one column: board full width, graph under it, text under that, a large "Next moment" button pinned at the bottom. Whole game: board sticky at the top, move list scrolls beneath it. Hide keyboard hints on touch.

## 4. Remove or merge
- Remove from the default view: the 4 big numbers, "Move quality" table and "ACPL by phase" table. Keep them inside a collapsed "More about this game (you vs opponent)" at the bottom of Whole game; `renderGameReport` is shortened, not deleted.
- Remove ACPL and "Moves" columns from the list and the "What is ACPL?" lines in the Games tab (glossary term and the Stats ACPL trend card stay).
- Merge: the turning-points list becomes the key moments (G1); Today's "Since your last game" and the viewer share `gameFacts(g)`.
- Keep: next mistake (renamed "Next mistake"), flip board, "Try your own move", chess.com link, desktop shortcuts.

## 5. Code and data touched, rough size
| Item | Where | Size |
|---|---|---|
| G1 review flow | app.html: new `#game-review` block, `keyMoments`, `renderReview`, CSS | ~200 lines, medium |
| G2 explanations | app.html `renderComment` + wording table | ~60 lines, small |
| G3 graph + time strip | app.html `drawEvalGraph` rewrite | ~60 lines, small-medium |
| G4 practise links | app.html; `T2.startOne`, `bookAlerts`, mine2.json (read only) | ~50 lines, small |
| G5 list, filters, reviewed | app.html list code; `progress` kind `gr`; `KINDS` | ~100 lines, medium |
| G6 time facts | app.html | ~30 lines, small |
| G7 game of the week | app.html (+ Today hook) | ~25 lines, small |
| G8 phone CSS | app.html CSS | ~40 lines, small |

No change to update.py or analyze.py is needed for G1-G8 (one optional change in Q4). All in `C:\Users\mateu\chess-trainer`; build.py inlines app.html as today. Suggested order: G1 + G2 together, then G4, G5, G3, G6 + G8, G7. Test at 375 px width and on the real 176 games; check the 8 games with 15+10 time control and any game with a missing `t`.

## 6. Open questions for the user
1. **Open a game straight into "Review the key moments" instead of move 0?** Recommended: yes; the full game is one tap away ("Whole game").
2. **How many key moments per game?** Recommended: at most 3 of yours (the biggest swings), so a review takes about 2 minutes; more feels like homework.
3. **Ask "what would you play?" before showing the best move?** Recommended: yes, with a "Show me" button; a wrong guess is not counted anywhere.
4. **Plain words from the existing labels, or richer engine explanations for every move?** Recommended: plain words from the existing 8 labels now (free, instant). Richer explanations would add work to the twice-a-day update; only add them if the sentences feel too thin.
5. **Mark a game "reviewed" automatically when you finish the key moments?** Recommended: yes, plus a manual tick; it powers "Next to review" and the "Not reviewed yet" filter and syncs between phone and laptop.
6. **Remove ACPL and the opponent-comparison tables from the Games tab?** Recommended: yes from the list and default view (kept in Stats and in a collapsed "More about this game"); you read one accuracy number instead.

## Decisions (user, 2026-11-18)
Plan approved. All open questions: the recommended answer.
