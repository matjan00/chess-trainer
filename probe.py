"""Quick engine look-up while writing courses.
Usage: python probe.py "1. d4 d5 2. Nc3" ["1. e4 c6" ...]   -> top moves (multipv 4, depth 20)
"""
import sys, io
from pathlib import Path
import chess, chess.engine, chess.pgn

ENGINE = next((Path(__file__).parent / "engine").rglob("stockfish*.exe"))
eng = chess.engine.SimpleEngine.popen_uci(str(ENGINE))
eng.configure({"Threads": 6, "Hash": 256})
for arg in sys.argv[1:]:
    g = chess.pgn.read_game(io.StringIO(arg))
    b = g.end().board()
    infos = eng.analyse(b, chess.engine.Limit(depth=20), multipv=4)
    out = []
    for i in infos:
        s = i["score"].white()
        ev = f"M{s.mate()}" if s.is_mate() else f"{s.score() / 100:+.2f}"
        out.append(f"{b.san(i['pv'][0])} {ev}")
    print(f"{arg[-40:]:>40} | " + " | ".join(out))
eng.quit()
