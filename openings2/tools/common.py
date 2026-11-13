"""Shared helpers for the openings2 tools: paths, position keys, explorer stats, the user's games,
material counting and the cached Stockfish wrapper (BLUEPRINT section 1.1)."""
import time
import io, json, os, re, sys
from pathlib import Path
import chess, chess.engine, chess.pgn

TOOLS = Path(__file__).resolve().parent
O2 = TOOLS.parent                      # openings2/
ROOT = O2.parent                       # chess-trainer/
sys.path.insert(0, str(ROOT))
CACHE_DIR = O2 / "cache"
EVALS_PATH = CACHE_DIR / "evals.json"
COURSES_DIR = O2 / "courses"
REPORTS_DIR = O2 / "reports"
EXPLORER_PATH = ROOT / "data" / "explorer.json"
GAMES_PATH = ROOT / "data" / "games.json"

STD_DEPTH, FINAL_DEPTH, MPV, CLAMP = 22, 24, 3, 1500
VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}


def pos_key(board_or_fen):
    """The app's key: first three FEN fields + ' -' (no en-passant square, no counters)."""
    fen = board_or_fen if isinstance(board_or_fen, str) else board_or_fen.fen()
    return " ".join(fen.split()[:3]) + " -"


def clamp(cp, lim=CLAMP):
    return max(-lim, min(lim, cp))


def material(board):
    """White minus Black material, P1 N3 B3 R5 Q9."""
    t = 0
    for pt, v in VALUES.items():
        t += v * (len(board.pieces(pt, chess.WHITE)) - len(board.pieces(pt, chess.BLACK)))
    return t


# ---------------------------------------------------------------- explorer stats and games
_EXPLORER = None
_GAMES = None


def explorer():
    global _EXPLORER
    if _EXPLORER is None:
        _EXPLORER = json.loads(EXPLORER_PATH.read_text(encoding="utf-8")) if EXPLORER_PATH.exists() else {"stats": {}, "courses": {}}
    return _EXPLORER


def stat_for(key, san):
    """Explorer stats for a move: {"n": games with the move, "total": position count, "share", "score", "valid", "found"}
    or None when the position is unknown.  'valid' is True when the position has n >= 1000 games (BLUEPRINT 1.2);
    a move missing from the stored top list then has share 0."""
    s = explorer()["stats"].get(key)
    if not s:
        return None
    total = s.get("n", 0)
    for m in s.get("m", []):
        if m[0] == san:
            return {"n": m[1], "total": total, "share": (m[1] / total) if total else 0.0, "score": m[2] if len(m) > 2 else None,
                    "valid": total >= 1000, "found": True}
    return {"n": 0, "total": total, "share": 0.0, "score": None, "valid": total >= 1000, "found": False}


def stats_children(key):
    """[(san, share, count)] for a position with n >= 1000, else None."""
    s = explorer()["stats"].get(key)
    if not s or s.get("n", 0) < 1000:
        return None
    return [(m[0], m[1] / s["n"], m[1]) for m in s.get("m", [])]


def games():
    """The user's games parsed once: list of dicts {color, result, url, opp, plies:[(key_before, san, mover_color)]}."""
    global _GAMES
    if _GAMES is None:
        out = []
        raw = json.loads(GAMES_PATH.read_text(encoding="utf-8")) if GAMES_PATH.exists() else []
        for g in raw:
            try:
                pg = chess.pgn.read_game(io.StringIO(g.get("pgn", "")))
                if pg is None:
                    continue
                b = pg.board(); plies = []
                for mv in pg.mainline_moves():
                    plies.append((pos_key(b), b.san(mv), b.turn)); b.push(mv)
            except Exception:
                continue
            out.append({"color": g.get("color"), "result": g.get("result"), "url": g.get("url"), "opp": g.get("opp"),
                        "end": g.get("end"), "plies": plies})
        _GAMES = out
    return _GAMES


_GAME_INDEX = None


def game_index():
    """{posKey: [(game, mover_is_me, san)]} built once."""
    global _GAME_INDEX
    if _GAME_INDEX is None:
        idx = {}
        for g in games():
            mine = chess.WHITE if g["color"] == "white" else chess.BLACK
            for k, san, mover in g["plies"]:
                idx.setdefault(k, []).append((g, mover == mine, san))
        _GAME_INDEX = idx
    return _GAME_INDEX


def game_moves_at(key, my_color=None):
    """{('me'|'opp', san): {'games': set(url), 'win': n, 'draw': n, 'loss': n}} for every game passing through position key.
    my_color restricts to games where the user had that colour ('white'/'black')."""
    res = {}
    for g, is_me, san in game_index().get(key, []):
        if my_color and g["color"] != my_color:
            continue
        d = res.setdefault(("me" if is_me else "opp", san), {"games": set(), "win": 0, "draw": 0, "loss": 0})
        if g["url"] not in d["games"]:
            d["games"].add(g["url"]); d[g["result"] if g["result"] in ("win", "draw", "loss") else "draw"] += 1
    return res


def yg(key, san, my_color):
    d = game_moves_at(key, my_color).get(("opp", san))
    return len(d["games"]) if d else 0


# ---------------------------------------------------------------- cached Stockfish
class Evals:
    """Stockfish with an on-disk cache.  Keys are 'posKey|depth|multipv|rootmove' (rootmove '-' for none).
    A request is served by an exact entry or by any entry with depth >= requested and multipv >= requested,
    so upgrades (deeper / wider) are reused and only the missing work is searched.
    Scores are centipawns from the side to move's point of view, mate = +-10000 (unclamped; clamp at use)."""

    def __init__(self, path=EVALS_PATH, threads=6, hash_mb=1024, engine=True):
        self.path = Path(path)
        # O2_THREADS / O2_HASH override the defaults (e.g. O2_THREADS=4 when something else needs the CPU)
        self.threads = int(os.environ.get("O2_THREADS", threads)); self.hash_mb = int(os.environ.get("O2_HASH", hash_mb))
        self.use_engine = engine
        self.data = {}
        if self.path.exists():
            try:
                self.data = json.loads(self.path.read_text(encoding="utf-8"))
            except Exception:
                self.data = {}
        self.index = {}
        for k in self.data:
            self._index(k)
        self.eng = None
        self.new = 0; self.hits = 0; self.searches = 0; self.dirty = 0

    def _index(self, k):
        pos, d, m, r = k.rsplit("|", 3)
        self.index.setdefault((pos, r), []).append((int(d), int(m), k))

    def _engine(self):
        if self.eng is None:
            from engine_path import find_engine
            self.eng = chess.engine.SimpleEngine.popen_uci(str(find_engine(ROOT)))
            self.eng.configure({"Threads": self.threads, "Hash": self.hash_mb})
        return self.eng

    def close(self):
        self.save()
        if self.eng is not None:
            try: self.eng.quit()
            except Exception: pass
            self.eng = None

    def save(self):
        """Merge-on-save under a lock file: entries another process wrote since we loaded are kept, not overwritten."""
        if not self.dirty:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock = self.path.with_suffix(".lock"); fd = None
        for _ in range(300):                       # wait up to ~30 s for another process to finish its save
            try:
                fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY); break
            except FileExistsError:
                try:
                    if time.time() - lock.stat().st_mtime > 120: lock.unlink()     # stale lock from a killed run
                except OSError: pass
                time.sleep(0.1)
        try:
            if self.path.exists():
                try:
                    for k, v in json.loads(self.path.read_text(encoding="utf-8")).items():
                        if k not in self.data:
                            self.data[k] = v; self._index(k)
                except Exception:
                    pass
            tmp = self.path.with_suffix(f".{os.getpid()}.tmp")
            tmp.write_text(json.dumps(self.data, separators=(",", ":"), sort_keys=True), encoding="utf-8")
            os.replace(tmp, self.path); self.dirty = 0
        finally:
            if fd is not None:
                os.close(fd)
                try: lock.unlink()
                except OSError: pass

    def _find(self, pos, depth, mpv, root):
        best = None
        for d, m, k in self.index.get((pos, root), []):
            if d >= depth and m >= mpv:
                if best is None or (d, m) < best[0]:
                    best = ((d, m), k)
        return self.data[best[1]] if best else None

    @staticmethod
    def _cp(info, turn):
        return info["score"].pov(turn).score(mate_score=10000)

    def _search(self, board, depth, mpv, root):
        self.searches += 1
        eng = self._engine()
        lim = chess.engine.Limit(depth=depth)
        if root:
            info = eng.analyse(board, lim, root_moves=[chess.Move.from_uci(root)])
            return {"cp": self._cp(info, board.turn), "pv": [m.uci() for m in info.get("pv", [])[:12]]}
        infos = eng.analyse(board, lim, multipv=mpv)
        if isinstance(infos, dict):
            infos = [infos]
        return [{"m": i["pv"][0].uci(), "cp": self._cp(i, board.turn), "pv": [m.uci() for m in i["pv"][:12]]} for i in infos if i.get("pv")]

    def _get(self, board, depth, mpv, root=None):
        pos = pos_key(board); r = root or "-"
        v = self._find(pos, depth, mpv, r)
        if v is not None:
            self.hits += 1
            return v
        if not self.use_engine:
            return None
        v = self._search(board, depth, mpv, root)
        k = f"{pos}|{depth}|{mpv}|{r}"
        self.data[k] = v; self._index(k); self.new += 1; self.dirty += 1
        if self.dirty >= 25:
            self.save()
        return v

    # -- public API (scores are for the side to move unless stated)
    @staticmethod
    def terminal(board):
        if board.is_checkmate():
            return [{"m": None, "cp": -10000, "pv": []}]
        if board.is_stalemate() or board.is_insufficient_material():
            return [{"m": None, "cp": 0, "pv": []}]
        return None

    def top(self, board, depth=STD_DEPTH, mpv=MPV):
        """List of {'m': uci, 'cp', 'pv': [uci]} best first (up to mpv); None if not cached and the engine is off."""
        t = self.terminal(board)
        if t:
            return t
        v = self._get(board, depth, mpv)
        return None if v is None else v[:mpv]

    def played(self, board, move, depth=STD_DEPTH, mpv=MPV):
        """(cp for the mover after the move, pv starting with the move, in_top3, top list); None if unavailable offline.
        A move inside the multipv top list uses that line's score; others get a root_moves search."""
        top = self.top(board, depth, mpv)
        if top is None:
            return None
        uci = move.uci() if isinstance(move, chess.Move) else move
        for t in top:
            if t["m"] == uci:
                return t["cp"], t["pv"], True, top
        v = self._get(board, depth, 1, uci)
        if v is None:
            return None
        return v["cp"], v["pv"], False, top

    def single(self, board, depth):
        """(cp stm pov, pv ucis) of the best move at the given depth."""
        top = self.top(board, depth, 1)
        if top is None:
            return None
        return top[0]["cp"], top[0]["pv"]


def san_pv(board, pv_ucis, n=6):
    b = board.copy(); out = []
    for u in pv_ucis[:n]:
        try:
            mv = chess.Move.from_uci(u); out.append(b.san(mv)); b.push(mv)
        except Exception:
            break
    return out


def fmt_cp(cp):
    if cp is None:
        return "  n/a"
    if abs(cp) >= 9000:
        return ("+" if cp > 0 else "-") + "M"
    return f"{cp/100:+.2f}"


def parse_moves_arg(text):
    """Accept a FEN or a PGN-ish move string ('1. d4 d5 2. Nc3', or bare SANs) and return a Board."""
    t = text.strip()
    if t.count("/") >= 7:
        return chess.Board(t)
    b = chess.Board()
    for tok in re.sub(r"\{[^}]*\}", " ", t).split():
        tok = re.sub(r"^\d+\.+", "", tok).strip("…")
        if not tok or tok in ("*", "1-0", "0-1", "1/2-1/2") or tok.startswith("..."):
            continue
        b.push_san(tok.rstrip("!?"))
    return b
