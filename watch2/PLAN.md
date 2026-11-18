# Watch tab rebuild ("watch2") - plan only, nothing changed yet

## 1. What it does today, and the problems
Watch (view-watch, renderWatch in app.html ~l.1775) is one long page: kind filter + "Hide watched", Continue
watching, Your history (up to 30), Saved for later, "Who Reddit names most" (13 creator chips), 5 need shelves
(watchNeeds: convert, thinking, tactics, endgame, strategy), one shelf per Openings course, then "Browse
everything" (topic chips + 24-card grid). The player overlay (#player, openVideo / savePos) is solid: resume
position, playlist index, 90% = watched. Today has a card (renderTodayWatch) = resume, else one pick.

Data (data/tube.json, 273 videos): lesson 105, play 77, course 91. 70 are playlists with no length stored
(len 0), so "how long?" is unknown for a quarter of the list. Level: 174 lvl 2, 85 lvl 1, 14 lvl 3.
Topic tags (a video can have up to 3): openings 102, strategy 89, thinking 74, tactics 50, classic 35,
attack 34, endgame 24, study 24, defence 6, convert 6.

Problems
- **The user's #1 weakness has almost no videos.** Tag "convert" (Finish off games you are winning) = 6 videos
  in total, 1 of them short and level 2. "endgame" 24, "tactics" 50, "thinking" 74. Of the short (15 min or
  less, not course) level-2 videos: convert 1, endgame 1, tactics 6, thinking 3. The shelves look full but
  repeat the same few videos, often long.
- **Too much choice.** About 10 shelves x 12 cards, plus a 273-video grid, plus 13 creator chips. A player
  who "plays too fast" will scroll, not pick.
- **Watching and doing are not linked.** Nothing says "after this, do these Train puzzles / this opening
  line". The video ends and nothing happens.
- **Course shelves match, but are thin.** O2.courses() is now Jobava, Caro-Kann, Slav, and shelves match by
  op tag: jobava 8 videos, caro 4, slav 3. Orphan tags: e4 21, italian 5, kid 1 (courses no longer exist).
- **Train courses are ignored.** Train now has think / convert / tactics / endgames (train2). Watch has its
  own copy of the coach logic (watchNeeds) and does not know what the user is training.
- **Length does not fit level.** Courses are 91 videos, single videos reach 33539 s (9 h). Only 54 non-course
  videos are 15 min or less. There is no "short" lens, only the Kind filter.
- **Today card ignores length**, so it can offer a long lecture (it only excludes kind course, requires lvl > 1).
- Dead weight: long intro and footer text; "Who Reddit names most" is trivia, not guidance.

## 2. Goal
Watch answers one question: "what is the best video for me right now, and what do I do right after it?"

## 3. New structure, priority order
1. **Watch next (top, one big card).** One video for the current weak spot: level 2, up to about 20 min,
   not watched, highest Reddit count. One-line reason ("You won 3 of 9 winning positions"). Data: watchNeeds()
   + VIDS with a length cap, falling back to the next need. Action: opens the player.
2. **Watch, then practise pairs.** Fixed partner per need: convert -> Train "convert", thinking -> Train
   "think", tactics -> Train "tactics", endgame -> Train "endgames", opening course -> Openings course
   (Jobava / Caro-Kann / Slav). The player gets a "Now practise" button that jumps there; after the video it
   becomes the main button. Data: small map need -> {train course | opening id}. Action: jump to Train or
   Openings, back to Watch when done.
3. **Continue watching.** Keep, shown only if something is started; sits above Watch next.
4. **Your 3 courses.** Three short shelves (max 4 cards each, collapsed) from op tags, each with "see all".
   Honest text for thin ones: "only 3 videos found".
5. **Short / Long switch.** Replace the Kind filter with "Up to 15 min" (default) and "Long courses".
   Playlists count as long. Needs playlist length data.
6. **Series progress.** For playlists show "video 4 of 22" and a bar. Needs playlist size from the pipeline;
   the player already stores v/vi.
7. **Key idea after a video.** On "Mark watched" or 90%, one optional line: "What will you check before every
   move?" Stored as a new field k on progress 'vid'. Shown in history and on Today. Targets "plays too fast".
8. **Browse (collapsed, bottom).** Topic + creator chips merged into one "Browse all 273" block, watched hidden.
9. **Yours.** Saved for later and history merged into one row with two toggles and "show all".

## 4. Remove or merge
- Remove the big intro paragraph and footer paragraph (one short line inside Browse).
- Merge "Who Reddit names most" into Browse chips; drop its heading, blurb and counts.
- Merge Saved-for-later and Your history into one "Yours" row.
- Hide-watched default ON; checkbox moves into Browse.
- Show only the top 1-2 need shelves; other needs live in Browse.
- Kind label "Speedruns & reviews" only as a Browse filter.
- Stop making shelves for e4/italian/kid tags (keep the data, no cost).

## 5. Code / data touched, rough size
| Item | Where | Size |
|---|---|---|
| Watch next + pair map + length cap | renderWatch, renderTodayWatch, new need->course map | small-medium (~60 lines) |
| "Now practise" in player | #player markup, openVideo, T2/O2 show hooks | small (~25 lines) |
| Length switch, hide-watched default | renderWatch, store wkind/whide | small |
| 3 collapsed course shelves | renderWatch | small |
| Reorder, merge Browse/Yours, trim copy | renderWatch + view-watch markup | medium (~80 lines moved/cut) |
| Playlist length + count | tube/meta.py, build_tube.py, rebuild tube.json | medium; needs internet |
| Key-idea note | player markup, vidRecord field k (vid kind already syncs) | small-medium |
| Fill the convert gap | section 6 | data task |
| Test | preview desktop + 375 px: player, resume, pair buttons, empty states | small |

Suggested order: 1, 2, 5, 8/4 and the trimming first; then 7; then playlist data and the refresh.

## 6. Refresh of the video list (new Reddit pass)
Convert has 6 videos and endgame 24: the biggest content hole. A targeted pass (searches like "winning
positions", "convert advantage", "technique", "simple endgames", plus Jobava / Slav / Caro videos) through
the existing pipeline: threads.py, titles.py, texts.py, meta.py, prep_batches.py, tagging per TAGGING.md,
merge_tags.py, build_tube.py. Cost: a few tagging batches (a cheaper model is fine), internet access, no
paid API. Expect about 60-100 candidates, maybe 15-30 kept. Cheaper fallback: add 10 well-known
technique videos by hand via overrides.json. Needs the user's OK because it fetches from the web.

## 7. Open questions (recommended answer first)
1. Can Watch next ever pick a long course? Recommend no: only up to 20 min; courses stay behind "Long courses".
2. Add a "Now practise" jump after every video? Recommend yes: one button, never forced.
3. Run a targeted Reddit pass for convert / endgame / Slav / Jobava videos? Recommend yes, convert first.
4. Add the optional one-line "key idea" note after a video? Recommend yes, skippable.
5. Should watching tick something on Today's list? Recommend no: Today keeps Watch as the optional extra.
6. Hide watched videos by default? Recommend yes, one tap to show them.

## Decisions (user, 2026-11-18)
Plan approved. All open questions: the recommended answer.
