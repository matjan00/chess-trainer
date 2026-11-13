# caro — lead review (T4), 2026-11-13

**Signed off. No worker needed.** 39 lines + 3 punish + 3 avoid traps, 338 cards, 0 FAIL / 44 WARN (all WARNs are 5-10% replies left out on purpose, or the flagged mistakes themselves).

Checks done
- Depth-25 re-check of every own move in the three sharp lines (nc3-g4, nf3-e5-h3, short-be3) plus a random sample: every move is the engine's first choice or within 12 cp. nc3-g4 holds at 0.00 all the way; nf3-e5-h3 is +0.36 for us; short-be3 −0.30.
- All 62 `skip:` entries: the move each one recommends was engine-checked at depth 18; none loses more than 30 cp. They are transpositions or deep side branches with a one-line answer, not hidden gaps. His real opponents' second moves are all covered by lines: 2.d4 (Advance incl. 4.Bd3, 4.h3, 4.c4, 4.g4, 4.Nc3; Exchange; Classical), 2.Nf3 (ex-nf3, nf3-e5, nf3-e5-h3, nf3-bb5, nf3-d3, nf3-c3), 2.Bc4 (bc4, bc4-bb5, bc4-bb3), 2.Qf3 (two lines), 2.f4 (line f4, which also covers 3.e5 Bf5 4.f4 by transposition).
- Skeleton deviations approved: cl-bc4 7.Nf3; nf3-c3 with 4.Ne5 as best defence; the dropped rarities (kia, tk-d3, nf3-ne5, fantasy-be3, ex-bf4, cl-qf3, be3, ne2, BDG 4.f3) as skips; added tk-exd5, nf3-e5-h3(p), qf3-d4.
- 338 cards: accepted, nothing cut (the 2.Nf3 tree is his most frequent and deserves it).

Edits made by the lead in caro.txt (text only): cl-bd3 final plan note listed "...e6" although it was just played (now "...Nbd7, ...Be7"); nf3-e5-h3 5...Bxf3 comment contradicted the intro about the d4 guard.

Phase 2 candidates (not blocking): lines for Exchange 4.Bd3 Nc6 5.Nf3 and 2.Bc4 … 4.Bb3 Nc6 5.Nf3 (he met each twice; now skip advice "5...Bg4").
