# New Openings tab: main lines + rules (summary for you)

Built overnight 2026-11-22/23. **Not live yet**: it waits for your OK.

## What changed for you

**1. Each opening is now a set of families, each with one main line.**
- Jobava: 14 families (12 with a main line, 2 "odds and ends").
  You start with: 3...c6 with 4.Nb5 · 3...Bf5 with Bd3 · 3...Nc6 with Nb5 and the e5 gambit.
- Caro-Kann: 9 families (Exchange and Panov are now separate).
  You start with: Advance 4.Bd3 · Exchange · 2.Nf3 with 3.e5 · Classical main line.
- Slav: 13 families.
  You start with: the main line (5.a4 Bf5) · London · Exchange Slav · 4.Bg5.
- The other lines sit under their main line as branches: "leaves <main line> at 6.h4".
- A branch stays locked until its main line has passed its first review. A line that looks a lot like
  one you already know waits until that one is solid. There is a "Learn anyway" button if you want it sooner.

**2. Rules that explain why the move changes.**
- Each opening has a rule book of 14-15 rules, for example "h4 against your bishop", "Bishop out before ...e6",
  "Take c4 unless e3 is played", "Nb5 when no pawn covers b5". You can find it in the Ideas tab, with small boards
  for every place a rule decides the move.
- About 85 places per opening have a "trigger". When you learn the line, the app asks:
  1. **What changed?** Tap the square to look at. A wrong tap just shows it, with no penalty.
  2. **Which rule?** Pick from 3 choices.
  3. Then you play the move.
- When you learn a branch, the moves you already know play fast up to where it splits. Then you see
  "Same as <main line> until here. Now White plays X instead of Y", with the main line's position next to it.
- In reviews, the "What changed?" question comes back only the first time and after a miss, at most once per line.
- If you play the move from the look-alike line, you get a card showing both positions side by side with the rule.

**3. Fresh start.** Your old opening progress is ignored, so all lines start as new. It isn't deleted, so it can't
come back by mistake from the phone either. Traps, model games, your games and every other tab are unchanged.
The moves themselves did not change.

## How it was checked
- Chess content: every rule and trigger sentence was checked on the real board by the writer and again by a
  stronger reviewer. The reviewers fixed about 25 sentences that were not true in their position and rewrote
  about 15 rules.
- The app was played through for real (clicks, and taps in a phone-sized screen) on the Caro course:
  learning a main line, the next day's review through Today → Start the session, unlocking and learning a
  branch, playing the "wrong line" move, and the rule book. All 9 checks passed after one fix (on the phone the
  "tap the square" message was hidden behind the buttons).
- Automatic tests: 79 new checks plus the old ones all pass. The one old failure was already there before this work.

## Not checked / worth knowing
- Jobava and Slav were checked on screen and in the data, but not played through move by move.
- Not tried on your real phone yet.
- A few rules are good guidelines rather than laws, for example the Caro "h3 against your g4 bishop" rule.
- A handful of places have no trigger on purpose: you play the same move whatever the opponent does there.

## Q3: lines that are almost copies (DONE, 2026-11-23: all turned into notes)
24 lines are now "Know the idea" notes: shown in the tree with a Study button, no Learn button, no daily reviews,
not counted in "x/y learned". A note is never the parent of another line. For the pairs, the note is nf3-bb5 (bc4-bb5 stays),
nc3-bg5-bxf6 (bg5-bxf6 stays) and e3-na2 (e3-nb1 stays). Mark: `| idea` at the end of the `### LINE` header.

## To make it live
Say OK. I then merge the work branch (agent/o3) into main, rebuild, and push (app version 92).
