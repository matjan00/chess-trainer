# Today tab rebuild ("today2")

Asked 2026-11-15. Today becomes the one place to press Start; Openings and Train stay for browsing and
studying on purpose. The user dropped the "My week" part.

## 1. Today's session (main card)
- One Start button runs one session with no tab hopping: Opening reviews (O2 daily review, if any are due)
  → Train reviews → Think-first → new puzzles (T2.runDaily). Train's existing order is kept.
- The opening summary gets a "Next: Train" button instead of Keep going / Done; Train's step bar shows
  "Openings ✓" as part 1; Train's end summary returns to Today.
- "Short day (about 5 min)": opening reviews + Train reviews only.
- The four parts show as checkpoints (ticks) with counts and an overall time estimate. The all-done
  celebration and the streak line stay.

## 2. Since your last game
- Newest analysed rapid game from the last 3 days: opponent, result, when, "Open game".
- Out of book in that game (from bookAlerts) → "Fix the opening line" (course → Your games).
- Up to 2 of your own mistakes from that game (mine2 "fix" cards for that game url) →
  "Practise this mistake" (T2.startOne, back to Today).
- Replaces the separate Out-of-book card.

## 3. One optional extra
- Lesson / play-out of the day if not done today; otherwise the Watch pick (continue watching or watch next).

## Removed
Task list, "Pick up where you left off" card, separate Out-of-book and Watch cards.
"Today you did" stays.

## Code
- openings2/ui/o2core.js: startDaily({onDone, label}); startReview onDone → summary button "next".
- train2/ui/t2core.js: runDaily(only, {pre, onDone}); startOne(id, back) exported; lessonOfDay via todayTasks.
- app.html: Today markup + renderToday + startSession(short) + renderLastGame + renderTodayExtra.
- Test: preview (desktop + 375 px), whole session click-through, short day, last-game buttons. Then user approval before push.
