# Essential endgames — decisions (T5b)

Every position with 7 men or fewer was checked with the Lichess tablebase through `train2/tools/tb.py` (cached in `cache/tb.json`);
positions with more men use the Stockfish rule of BLUEPRINT 2.1. DTM is given in plies as the tablebase reports it (from the example start).
"Source: book" = standard endgame theory (Dvoretsky's Endgame Manual / Silman's Complete Endgame Course type positions); "constructed" = set up
for this course and proved by the tablebase.

## Per lesson

| lesson | sources | tablebase / engine result | DTM of model line | notes |
|---|---|---|---|---|
| square | book (square rule); old FEN kept as PLAY | old FEN: draw (only ...Ke5); EX b: win | EX a draw; EX b DTM 25 | 2 plays (defender + attacker). hold:3 because the game ends (K v K) after 4 Black moves. |
| kpfront | book (key squares); old FEN kept as PLAY | win (DTM 21) | EX DTM 25 | cards: king-first on c/e/g files + 6th-rank rule; each has the mirror move in `also:` |
| oppwin | book; old FEN kept as PLAY (side=white, Black moves first) | win (DTM 40 for Black to move) | EX (d-pawn shift) DTM 40, line = tablebase longest defence | cards are the only-move opposition moments of that line, shifted to other files |
| oppdraw | book; old FEN kept as PLAY (side=black) | draw | EX draw, ends in stalemate | EX is the "can White win? no" view (stronger side). In K+P v K the stronger side can never lose, so a tablebase card from his side is impossible (no losing move); the example covers it. |
| kpdef | book; old FEN kept as PLAY | draw | EX (d-pawn shift of the PLAY) draw | cards found by a tablebase scan of K+P v K with the defender to move (only 1-2 drawing moves) |
| rookpawn | book; old FEN kept as PLAY | draw (only ...Kc8) | EX draw, ends in stalemate | hold:4 (not 15): the game ends in stalemate after a few moves, so a longer hold cannot be reached. Card 4 is the stronger side's view (shut the king out: Kb7). |
| race (new) | composed (src=composed; the verifier has no "constructed" tag), tablebase-scanned K+P v K+P | all win | EX DTM 29 | theme: count, and stop his pawn first when yours runs alone (3 cards), push now (2 cards) |
| qmate | book; old FEN kept as PLAY | win | EX DTM 17 (tablebase line, longest defence) | **Cards cannot be pure K+Q v K**: an exhaustive retrograde search of all K+Q v K positions (scratch script, then confirmed by tablebase probes) found 0 positions where at most 2 moves are within 4 moves of the quickest mate, so every K+Q v K card fails L4. The cards therefore use K+Q v K with a blocked black pawn in the corner (composed, tablebase-proved): find the mate, every quiet move is stalemate. |
| qstale (new) | EX book; cards composed (same corner-pawn pattern) | win | EX mate in 2 | 3 cards (outline says three positions). |
| rrmate | book; old FEN kept as PLAY | win | EX mate in 4 | Same L4 problem for K+R+R v K (tablebase scan of 200 ladder positions: no card). Cards use the corner-pawn pattern: 2 mates, 2 "give him a square first" moves. |
| rmate | book; old FEN kept as PLAY | win | EX DTM 19 | cards from an exhaustive K+R v K retrograde search (1,064 L4-valid positions), each re-proved by the tablebase |
| qvp | book; old FEN kept as PLAY | win (DTM 23) | EX DTM 47 (king far away so the "free move" method is the tablebase line) | cards: guard the queening square (4) from a tablebase scan |
| qvpdraw (new) | book + composed | draw (cards 1-4), win (card 5, stronger side) | EX draw, ends in stalemate | PLAY 8/8/Q7/8/8/8/2p3K1/2k5 b (draw, 2 drawing moves) |
| wrongb | book; old FEN kept as PLAY | draw | EX draw, ends in stalemate | 3 defender cards + 2 stronger-side cards; hold:6 because stalemate ends the game early |
| ocb | constructed (src=composed), 6 men; old FEN kept as PLAY | draw (EX, cards 2-3, PLAY); card 4 win (stronger side) | EX draw | 3 cards (ocb-1 was dropped by the first writer; ids kept as they are). |
| activeking (new) | constructed (src=composed): tablebase scan of K+2P v K+2P (b- and g-pawns), 70 king placements | win, all items | EX DTM 53 (model line = tablebase longest defence for 3 moves, then stops: the point is made) | only 1-2 winning moves in each card, both king moves to the centre; every pawn move draws. PLAY = the colour-reversed EX (Black to move, DTM 53), self-play 13 moves. |
| outside | old FEN kept as PLAY (7 men: tablebase win, self-play 8 moves); EX and cards constructed (src=composed) from a tablebase scan of K+a+h v K+g+h and mirrors | win | EX DTM 35, line = tablebase longest defence | cards: push the decoy (2, one mirrored), walk to his pawns when his king has left (2, one mirrored). Wrong lines are the tablebase draws with the best reply. |
| protpass | old FEN kept as PLAY (13 men: engine rule, Stockfish depth 28 >= +3.00, self-play 13 moves); EX and cards constructed, K+c4+d5 v K+c5+h/g-pawn | win | EX DTM 47 | card 1 is two moves (king out, then catch the running h-pawn); card 2 has the "push d6 and lose the protection" trap. |
| majority (new) | constructed (src=composed), tablebase scan of 2-v-1 majorities with a black h/a-pawn | win | EX DTM 35 | cards 1 and 3 are two moves: candidate first, then *do not recapture*, push the other pawn (recapturing draws, tablebase). Card 2 is the kingside mirror. PLAY 8/5k2/p7/7p/PP6/5K2/8/8 w (DTM 39). Outline asks 4-6 cards; 3 here (each scan hit was a near-copy of these). |
| breakthru | old FEN kept as PLAY (8 men: engine rule, self-play 6 moves) | EX/PLAY/card 4: engine (8 men); cards 1-3: tablebase win after the first capture (7 men) | EX engine at 8 men, then tablebase (DTZ only for 7 men with pawns) | EX moved to the kingside with kings on b1/b8: in the old FEN 1.Kg2 also wins (+6.4, as good as 1.b6), so the EX uses a position where only g6 wins. src=composed on the 8-man EX and card 4 (avoids the L11 "book > 7 men" WARN; they are standard theory). Card 4 is the defender's view (...b6 stops it). |
| rbehind (new) | book, 5 men | EX draw (Black to move, rook behind the pawn); cards and PLAY win (DTM 45-59) | - | written by the first worker; verified unchanged |
| r7th (new) | constructed, 7 men | win (tablebase, DTZ only) | - | **changed by T5b**: PLAY finish eval:200 failed self-play (drew); now eval:250, max 40 (self-play 20 moves). See review items. |
| cutoff | book; old FEN kept as PLAY | win (DTM 71) | EX DTM 71 | verified unchanged |
| lucena | book; old FEN kept as PLAY | win (DTM 41) | EX DTM 41 | **changed by T5b**: card 3 (8/3k2P1/5K2/...) failed L6 (the pawn queens on the next move); replaced by the c-pawn version 8/2PK1k2/8/8/4R3/8/3r4/8 w (Kc6, also Kc8). |
| philidor | book; old FEN kept as PLAY | draw | EX draw | verified unchanged |
| longside | book; old FEN kept as PLAY | draw | EX draw | verified unchanged |

## T5b completion (second writer)

- Written: the whole chapter `pawns` (activeking, outside, protpass, majority, breakthru) — the first writer stopped before it.
- Fixed: `lucena-3` (L6) and `r7th-p` (L8), see the table.
- Final run: `verify_lessons.py endgames` = 26 lessons, 0 FAIL, 0 WARN (report `endgames.verify.txt`).

Review items for the lead
1. `r7th`: the example's key move 1.Rh3 is a sideways *defensive* rook move, which sits badly with the lesson rule "attack, never passive defence"; and the play-out passes self-play only with finish eval:250 (Stockfish self-play is not deterministic with 3 threads: the old eval:200 run drew). Worth a rewrite of the example and a more forgiving play-out.
2. Wrong-line texts in chapter 3 give the tablebase verdict with a short reason; some refutations are quiet king moves (e.g. outside-1 ((1.h4 Ke6))), so the reason is the general one ("the pawns come off, one pawn each is a draw") rather than a forced line.
3. `majority` has 3 cards (outline: 4-6); `ocb` has 3.
4. Many K+P cards accept only king moves; that is the theme (king activity), but the lesson may feel repetitive.
