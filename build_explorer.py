"""Opening statistics from Lichess (what 1200-1600 players actually play), plus everything built on them:
traps at your level, extra branches, longer lines and model games. Runs in the GitHub job "Opening statistics"
(needs the LICHESS_TOKEN repository secret; the key is never printed or stored).

Output: data/explorer.json
  stats:  {position key: {"n": games, "m": [[san, games, score for the side to move], ...]}}
  courses: {course_id: {"traps": [...], "extra": [lines], "ext": {line_id: [moves]}, "models": [games]}}
"""
import json, os, subprocess, sys, time, urllib.parse
from collections import deque
from pathlib import Path
import chess, chess.engine, chess.pgn, io
from engine_path import find_engine

ROOT = Path(__file__).parent
DATA = ROOT / "data"
TOKEN = os.environ.get("LICHESS_TOKEN", "")
LICHESS = "https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid&ratings=1200,1400,1600&moves=10&topGames=0&recentGames=0&fen="
MASTERS = "https://explorer.lichess.ovh/masters?moves=0&topGames=15&fen="
MASTERS_PGN = "https://explorer.lichess.ovh/masters/pgn/"
MAX_PLY = 20            # how deep the statistics tree goes
MAX_POS = 450           # positions fetched per course at most
MIN_GAMES = 40          # below this the statistics are too thin to use
OPP_SHARE = 0.06        # opponent replies at least this common are followed


def key(board):
    return " ".join(board.fen().split()[:4])


def get(url, tries=6):
    for i in range(tries):
        r = subprocess.run(["curl", "-s", "-w", "\n%{http_code}", "-A", "personal chess trainer",
                            "-H", f"Authorization: Bearer {TOKEN}", url], capture_output=True)
        body, _, code = r.stdout.decode("utf-8", "replace").rpartition("\n")
        if code == "200":
            time.sleep(0.35)
            return body
        if code == "429":
            print("rate limited, waiting 60 s", flush=True); time.sleep(60); continue
        if code in ("401", "403"):
            sys.exit("Lichess rejected the key (check the LICHESS_TOKEN secret)")
        time.sleep(3 * (i + 1))
    return None


def main():
    if not TOKEN:
        sys.exit("LICHESS_TOKEN is not set")
    courses = json.loads((DATA / "courses.json").read_text(encoding="utf-8"))
    old = json.loads((DATA / "explorer.json").read_text(encoding="utf-8")) if (DATA / "explorer.json").exists() else {}
    stats = {}
    eng = chess.engine.SimpleEngine.popen_uci(str(find_engine(ROOT)))
    eng.configure({"Threads": max(1, (os.cpu_count() or 2)), "Hash": 256})
    evals = {}

    def ev(board, depth=14):
        """score in centipawns for the side to move, and the best move"""
        k = key(board)
        if k not in evals:
            info = eng.analyse(board, chess.engine.Limit(depth=depth))
            evals[k] = (info["score"].pov(board.turn).score(mate_score=10000), info["pv"][0].uci() if info.get("pv") else None)
        return evals[k]

    def explore(board):
        k = key(board)
        if k in stats: return stats[k]
        body = get(LICHESS + urllib.parse.quote(board.fen()))
        if body is None: return None
        d = json.loads(body)
        n = d["white"] + d["draws"] + d["black"]
        mv = []
        for m in d.get("moves", []):
            t = m["white"] + m["draws"] + m["black"]
            if not t: continue
            win = m["white"] if board.turn == chess.WHITE else m["black"]
            mv.append([m["san"], t, round((win + m["draws"] / 2) / t, 3)])
        stats[k] = {"n": n, "m": mv}
        return stats[k]

    out = {}
    for c in courses:
        me = chess.WHITE if c["side"] == "white" else chess.BLACK
        course_moves = {}                                    # position -> course moves (by position, transpositions too)
        for l in c["lines"]:
            b = chess.Board()
            for m in l["moves"]:
                course_moves.setdefault(key(b), set()).add(m["san"]); b.push_san(m["san"])
        # breadth-first over the course and the popular replies around it
        seen, fetched = set(), 0
        q = deque([(chess.Board(), [])])
        while q and fetched < MAX_POS:
            b, path = q.popleft()
            k = key(b)
            if k in seen or len(path) > MAX_PLY: continue
            seen.add(k)
            s = explore(b); fetched += 1
            if not s or s["n"] < MIN_GAMES: continue
            if b.turn == me:
                nxt = list(course_moves.get(k, [])) or ([b.san(chess.Move.from_uci(ev(b)[1]))] if ev(b)[1] else [])
            else:
                nxt = [san for san, t, _ in s["m"] if t / s["n"] >= OPP_SHARE][:5]
            for san in nxt:
                b2 = b.copy(); b2.push_san(san); q.append((b2, path + [san]))
        print(f'{c["id"]}: {fetched} positions', flush=True)

        # traps and common mistakes at this level, in and around the course
        traps = []
        for k in seen:
            s = stats.get(k)
            if not s or s["n"] < MIN_GAMES: continue
            b = chess.Board(k + " 0 1")
            best, _ = ev(b)
            for san, t, _score in s["m"]:
                share = t / s["n"]
                if share < 0.08: continue
                b2 = b.copy(); b2.push_san(san)
                after = -ev(b2)[0]                             # back to the mover's point of view
                loss = best - after
                if b.turn != me and loss >= 150:              # they often blunder here: you can punish it
                    reply = ev(b2)[1]
                    traps.append({"kind": "set", "fen": k, "move": san, "share": round(share, 2), "loss": loss,
                                  "reply": b2.san(chess.Move.from_uci(reply)) if reply else None})
                if b.turn == me and loss >= 120:              # players at your level often go wrong here
                    better = ev(b)[1]
                    traps.append({"kind": "avoid", "fen": k, "move": san, "share": round(share, 2), "loss": loss,
                                  "better": b.san(chess.Move.from_uci(better)) if better else None})
        traps.sort(key=lambda x: -x["share"] * min(x["loss"], 600))
        traps = traps[:14]

        def continue_line(b, plies):
            """popular replies for the opponent, the engine's choice for you, while the statistics are thick"""
            moves = []
            for _ in range(plies):
                if b.is_game_over(): break
                if b.turn == me:
                    mv = ev(b)[1]
                    if not mv: break
                    san = b.san(chess.Move.from_uci(mv)); moves.append({"san": san, "auto": "engine"})
                else:
                    s = stats.get(key(b)) or explore(b)
                    if not s or s["n"] < 30 or not s["m"]: break
                    san = s["m"][0][0]
                    moves.append({"san": san, "auto": "popular", "share": round(s["m"][0][1] / s["n"], 2)})
                b.push_san(san)
            return moves

        # extra branches: popular replies (>= 10%) the course doesn't cover
        extra = []
        for l in c["lines"]:
            b = chess.Board()
            for i, m in enumerate(l["moves"]):
                if b.turn != me:
                    s = stats.get(key(b))
                    for san, t, _ in (s["m"] if s else []):
                        share = t / s["n"]
                        if share < 0.10 or san in course_moves.get(key(b), set()): continue
                        b2 = b.copy(); b2.push_san(san)
                        if -ev(b2)[0] - ev(b)[0] < -150: continue     # that's a blunder: it belongs in Traps
                        path = [x["san"] for x in l["moves"][:i]]
                        if any(e["path"] == path and e["reply"] == san for e in extra): continue
                        cont = continue_line(b2.copy(), 9)
                        if len(cont) < 3: continue
                        extra.append({"path": path, "reply": san, "share": round(share, 2), "from": l["id"], "cont": cont})
                b.push_san(m["san"])
        extra.sort(key=lambda e: -e["share"])
        extra = extra[:8]

        # longer lines: carry each line on with popular replies and engine moves
        ext = {}
        for l in c["lines"]:
            b = chess.Board()
            for m in l["moves"]: b.push_san(m["san"])
            cont = continue_line(b, 8)
            if len(cont) >= 2: ext[l["id"]] = cont

        # model games: strong players' wins for your side from the course's main position
        models = []
        b = chess.Board()
        main = c["lines"][0]["moves"]
        for m in main[:min(8, len(main))]: b.push_san(m["san"])
        body = get(MASTERS + urllib.parse.quote(b.fen()))
        games = json.loads(body).get("topGames", []) if body else []
        want = "white" if me == chess.WHITE else "black"
        for gm in [g for g in games if g.get("winner") == want][:2]:
            pgn = get(MASTERS_PGN + gm["id"])
            if not pgn: continue
            game = chess.pgn.read_game(io.StringIO(pgn))
            gb = game.board(); moves, ok = [], {}
            for ply, mv in enumerate(game.mainline_moves()):
                if ply >= 40: break
                san = gb.san(mv)
                if gb.turn == me and ply >= 4:
                    infos = eng.analyse(gb, chess.engine.Limit(depth=14), multipv=3)
                    top = infos[0]["score"].pov(me).score(mate_score=10000)
                    good = {gb.san(x["pv"][0]) for x in infos if "pv" in x and top - x["score"].pov(me).score(mate_score=10000) <= 40}
                    good.add(san)
                    ok[ply] = sorted(good)
                moves.append(san); gb.push(mv)
            models.append({"id": gm["id"], "white": gm["white"]["name"], "black": gm["black"]["name"],
                           "wr": gm["white"].get("rating"), "br": gm["black"].get("rating"), "year": gm.get("year"),
                           "result": "1-0" if gm["winner"] == "white" else "0-1", "moves": moves, "ok": ok})
        out[c["id"]] = {"traps": traps, "extra": extra, "ext": ext, "models": models}
        print(f'  traps {len(traps)}, extra lines {len(extra)}, longer lines {len(ext)}, model games {len(models)}', flush=True)

    eng.quit()
    (DATA / "explorer.json").write_text(json.dumps({"stats": stats, "courses": out}, separators=(",", ":")), encoding="utf-8")
    print(len(stats), "positions with statistics")


if __name__ == "__main__":
    main()
