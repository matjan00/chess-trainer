# Tagging videos for the Watch tab

Each `tube/batches/bNN.json` holds videos that Reddit chess players linked in recommendation threads:
title, channel, length in minutes, upload year, the thread titles, and up to two comments that linked it.

For every video write one entry into `tube/batches/bNN.out.json`, keyed by the video id:

```json
{ "VIDEO_ID": { "keep": true, "kind": "lesson", "top": ["endgame"], "op": [], "lvl": 2, "why": "..." } }
```

- **keep**: true only for English-language videos that teach or explain chess, or show strong players thinking out loud.
  False for: not chess; not English (Polish, Spanish, Russian, Hindi... titles); music, memes, news, drama, interviews,
  tournament broadcasts without teaching, cheating scandals, podcasts about the chess scene, self-promotion that the
  comments do not praise, and comments that link a video to mock it or as a bad example.
- **kind**: `lesson` (one idea, up to ~40 min), `play` (speedrun, guess-the-move, game review, the player explains while
  playing), `course` (long lecture or full course, usually 40+ min, teaching one subject in depth).
- **top**: 1–3 of `thinking` (blunder check, how to think, avoiding blunders), `tactics`, `convert` (winning a won
  position, technique, simplifying when ahead), `endgame`, `strategy` (middlegame plans, pawn structures, piece placement),
  `attack`, `defence`, `openings` (opening principles in general, not one opening), `time` (clock handling),
  `study` (how to improve, training methods), `classic` (famous games explained).
- **op**: which of these opening courses it fits, if any: `jobava` (Jobava London / London System, 1.d4 with Bf4 and Nc3),
  `caro` (Caro-Kann as Black), `kid` (King's Indian set-up as Black: g6, Bg7, d6 against 1.d4), `e4` (1.e4 as White in general,
  incl. answers to the Sicilian, French, Scandinavian), `italian` (Italian Game, Giuoco Piano, Two Knights as White),
  `slav` (Slav Defence as Black). A speedrun that plays one of these systems throughout counts.
- **lvl**: 1 = beginner (under ~1000), 2 = club player (~1000–1800), 3 = advanced (1800+). The reader is about 1400.
- **why**: one plain sentence (max ~25 words) saying what the viewer gets from it, based on the title and what the comments
  say. Write it yourself; do not copy comment text.

When unsure whether a video is worth keeping, keep it only if the comments clearly recommend it.
