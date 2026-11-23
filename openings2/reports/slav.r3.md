# slav: R3 chess review

No move changed, no line added or deleted. verify_course.py slav --no-engine: 0 FAIL, 18 WARN (the same 18 as after R2).
compile: 48 lines, 549 nodes, 272 cards, not a draft. triggers_needed.py: 9 places, the same ones R2 skipped on purpose.

## Changed
- `start:` is now dutch-main, london-main, ex-main, nc3-bg5 (it was dutch-main, london-main, nc3-a6-b3, slow-nh4).
  The why: text has no game counts, and the user has only 3 games with 1...d5, so I used Lichess shares
  (explorer.json). After 1.d4 d5: 2.Bf4 21%. After 2.c4 c6: 3.Nc3 52%, then 3...Nf6 4.Bg5 23%, but 4.e3 only 13%.
  Exchange (3.cxd5, or 3.Nc3 Nf6 4.cxd5) is about 17% of Slav games, against about 7% for 3.Nc3 Nf6 4.e3 (nc3-a6-b3).
  4.Bg5 is not a rare mistake: it is White's second most common 4th move.
- gambits trunk: e4-e5 -> e4-a4. After 5.e4 b5, 6.a4 is 37% and 6.e5 is 20%. e4-a4 also shows the family plan
  (...b5, ...b4, win e4).
- Added `parent:` lines: e3-na2 -> e4-a4 (the same ...b4 idea after 5.e3 instead of 5.e4); e3-nb1 -> e3-na2
  (Na2 63% against Nb1 24%; it was the other way round). london-nf3 and jobava -> london-main, torre -> veresov.
  These three had no parent before, so they were open from the start. Now ne4 hangs under e3-na2.
- Rules (texts only; names and ids kept):
  - c6-vs-c4: dropped the confusing "if White has not played c4 or d4".
  - grab-c4: the reason is now that White loses time winning the pawn back. The old reason, that e2 shuts the
    bishop in, did not fit Qc2.
  - bishop-first: "e3 blocks his own bishop" was the wrong reason. The reason is now that after e3 ...dxc4 gains nothing.
  - keep-c4: now covers "...b5, then just develop" (this fixes the stretched use at e4-quiet and e4-a3).
  - a4-hits-b5: now limited to "with a knight on c3". In bg5 there is no Nc3 and we play ...h6.
  - g5-pin: limited to "before c4". It no longer says "answer Bh4 with ...g5"; in bg5 that would be false,
    because we play ...e6 there.
  - knight-jump: limited to "no pawn on c4". Otherwise it would contradict 4.Bg5 dxc4.
  - c5-centre: the old text, "without c4 play ...c5", was false in the Colle (3.e3 Bf5). The rule is now: London
    bishop on f4, or Bd3 already stops ...Bf5.
  - a6-first: small wording change.
- Triggers rewritten (the fact or the "so" was wrong or soft): dutch-main 8...O-O (no e4 pawn existed yet),
  e3-bf5 3...Bf5, colle 3...Bf5 (clue e3 d3) and 7...Bg6 (the reason now names Nc3 backing up e4, which is why
  you retreat now and not on move 4), stonewall 3...c5, jobava 5...a6 (the Nb5 and c7 idea with the f4 bishop)
  and 7...Bd7, reti 4...a6 (e3 and Nc3, not "d2"), ex-main 7...Bg4 and ex-rc1 7...Bf5 (the false rook-on-a1
  causal claim is gone), bxf6 lines (exf6 opens the f8-bishop; it was "both bishops come out").
- kia-g3 2...c6 moved from c6-vs-c4 to bishop-first, because there is no pawn on c4.
- Clues fixed: bg5 5...b5 (a2 e3), ne4 9...Be7 (a2 b4), e4-a4-e5 7...bxc3 (b4 c3).

## Still doubtful
- dutch-main (5.a4) is only about 20% after 4...dxc4. 5.e4 is 42%, so the gambits family may be met more than the
  main line. I kept dutch-main as the first start line because it teaches the core plan, and e4-a4 comes later
  in learn (its reach is low because the line is long).
- The ex-main 7...Bg4 / ex-rc1 7...Bf5 split has no clean club rule. Both bishop moves are probably fine in both
  positions, so these triggers only say "bishop out before ...e6".
- Slow trunk slow-nh4 vs slow-bd3 is a tie in the data. 6.Bd3 may be more natural at club level; I left it.
- The learn order puts bdg before slow-nh4 (by reach). That is acceptable but slightly odd.
