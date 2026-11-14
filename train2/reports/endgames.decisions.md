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
