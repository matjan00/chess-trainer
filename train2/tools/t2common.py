"""Shared helpers for the Train 2 tools (BLUEPRINT section 2.1).

Contents
  * paths, win_pct(), pos_key(), material helpers
  * LockedJson      - a JSON dict cache with merge-on-save under a lock file
  * SafeEngine      - Stockfish with a watchdog: every search is time-capped AND killed if it does not return within cap+15 s
  * T2Evals         - openings2 `Evals` (cached content search) running on a SafeEngine, cache train2/cache/evals.json
  * bulk()          - N worker processes, 1-thread Stockfish each, JSONL cache, resumable, --max-minutes

The cached content search and the time-capped logic come from openings2/tools/common.py (credit: Openings 2 tools);
this file adds the watchdog and the bulk runner described in the Train 2 blueprint.  Lesson from the previous project:
a background engine job once hung for 3 hours, so there is NO search anywhere without a time cap and a watchdog.
"""
import json, math, os, subprocess, sys, threading, time
from pathlib import Path
import chess, chess.engine

TOOLS = Path(__file__).resolve().parent
T2 = TOOLS.parent                      # train2/
ROOT = T2.parent                       # chess-trainer/
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "openings2" / "tools"))
CACHE_DIR = T2 / "cache"
COURSES_DIR = T2 / "courses"
REPORTS_DIR = T2 / "reports"
EVALS_PATH = CACHE_DIR / "evals.json"
DATA_DIR = ROOT / "data"

# content search defaults (BLUEPRINT 2.1): depth 20, multipv 4, 60 s per search
os.environ.setdefault("O2_MAXTIME", "60")
CONTENT_DEPTH, CONTENT_MPV = 20, 4
WATCHDOG_GRACE = 15.0

import common as o2common                       # openings2/tools/common.py  (Evals, pos_key, material)
from common import pos_key, material, VALUES, san_pv   # noqa: F401  (re-exported)


# ---------------------------------------------------------------- win %
def win_pct(cp):
    """Win % (0-100) of the side the score is for.  cp clamped to +-1000; |cp| >= 9000 means mate (100 / 0)."""
    if cp is None:
        return None
    if cp >= 9000:
        return 100.0
    if cp <= -9000:
        return 0.0
    cp = max(-1000, min(1000, cp))
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def men(board):
    return chess.popcount(board.occupied)


def solver_pct(cp_stm, board_turn, solver):
    """Win % for `solver` from a score that is for the side to move `board_turn`."""
    w = win_pct(cp_stm)
    return w if board_turn == solver else 100 - w


# ---------------------------------------------------------------- lock-safe JSON dict cache
class LockedJson:
    """A dict persisted as one JSON file.  save() takes <file>.lock, merges entries another process wrote meanwhile
    (ours win on conflict only for keys we set), writes a temp file and renames it (atomic)."""

    def __init__(self, path):
        self.path = Path(path)
        self.data = {}
        self.dirty = set()
        if self.path.exists():
            try:
                self.data = json.loads(self.path.read_text(encoding="utf-8"))
            except Exception:
                self.data = {}

    def get(self, k, default=None):
        return self.data.get(k, default)

    def set(self, k, v):
        self.data[k] = v
        self.dirty.add(k)

    def save(self):
        if not self.dirty:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock = self.path.with_suffix(".lock")
        fd = None
        for _ in range(300):
            try:
                fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                break
            except FileExistsError:
                try:
                    if time.time() - lock.stat().st_mtime > 120:
                        lock.unlink()
                except OSError:
                    pass
                time.sleep(0.1)
        try:
            if self.path.exists():
                try:
                    for k, v in json.loads(self.path.read_text(encoding="utf-8")).items():
                        if k not in self.dirty:
                            self.data[k] = v
                except Exception:
                    pass
            tmp = self.path.with_suffix(f".{os.getpid()}.tmp")
            tmp.write_text(json.dumps(self.data, separators=(",", ":"), sort_keys=True), encoding="utf-8")
            os.replace(tmp, self.path)
            self.dirty = set()
        finally:
            if fd is not None:
                os.close(fd)
                try:
                    lock.unlink()
                except OSError:
                    pass


# ---------------------------------------------------------------- watchdog engine
class EngineTimeout(Exception):
    """A search did not return within cap + grace; the engine process was killed."""


def _kill_pid(pid):
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True, timeout=20)
        else:
            os.kill(pid, 9)
    except Exception:
        pass


def engine_command():
    from engine_path import find_engine
    return [str(find_engine(ROOT))]


class SafeEngine:
    """Stockfish behind a watchdog.  Same call style as chess.engine.SimpleEngine (analyse, configure, quit) but:
      * analyse(board, limit, **kw) raises EngineTimeout when no answer arrives within limit.time + grace seconds
        (the process is killed; the next call starts a fresh one) - a hung engine can never block a job;
      * a limit without a time is refused (ValueError): no search without a time cap.
    `cmd` can point to any UCI program (the tests use a fake engine that never answers)."""

    def __init__(self, cmd=None, threads=1, hash_mb=64, grace=WATCHDOG_GRACE, startup_timeout=20):
        self.cmd = cmd or engine_command()
        self.threads, self.hash_mb, self.grace, self.startup_timeout = threads, hash_mb, grace, startup_timeout
        self.eng = None
        self.kills = 0
        self.options = {}

    def _start(self):
        # popen_uci's own timeout covers a program that never completes the UCI handshake
        eng = chess.engine.SimpleEngine.popen_uci(self.cmd, timeout=self.startup_timeout)
        try:
            eng.configure({"Threads": self.threads, "Hash": self.hash_mb})
            if self.options:
                eng.configure(self.options)
        except Exception:
            pass
        self.eng = eng

    def _pid(self):
        try:
            return self.eng.protocol.transport.get_pid()
        except Exception:
            return None

    def _kill(self):
        pid = self._pid()
        if pid:
            _kill_pid(pid)
        self.kills += 1
        try:
            self.eng.close()
        except Exception:
            pass
        self.eng = None

    def configure(self, opts):
        self.options.update(opts)
        if self.eng is not None:
            try:
                self.eng.configure(opts)
            except Exception:
                pass

    def analyse(self, board, limit, **kw):
        if limit.time is None:
            raise ValueError("every engine search needs a time cap (Limit(time=...))")
        if self.eng is None:
            self._start()
        fired = []
        pid = self._pid()

        def fire():
            fired.append(1)
            if pid:
                _kill_pid(pid)

        timer = threading.Timer(float(limit.time) + self.grace, fire)
        timer.daemon = True
        timer.start()
        try:
            return self.eng.analyse(board, limit, **kw)
        except (chess.engine.EngineTerminatedError, chess.engine.EngineError, TimeoutError, OSError) as e:
            if fired:
                self._kill()
                raise EngineTimeout(f"search killed after {limit.time + self.grace:.0f}s: {board.fen()}") from e
            self._kill()
            raise
        finally:
            timer.cancel()

    def play(self, board, limit, **kw):
        """Best move with a time cap (same watchdog)."""
        info = self.analyse(board, limit, **kw)
        pv = info.get("pv") or []
        return (pv[0] if pv else None), info

    def quit(self):
        if self.eng is not None:
            try:
                self.eng.quit()
            except Exception:
                self._kill()
            self.eng = None

    close = quit


# ---------------------------------------------------------------- cached content search (lessons)
class T2Evals(o2common.Evals):
    """openings2 `Evals` (cache key posKey|depth|multipv|root, any deeper entry serves) running on a SafeEngine:
    cache train2/cache/evals.json, Threads from O2_THREADS (default 6), Hash O2_HASH (default 1024), cap O2_MAXTIME (60 s)."""

    def __init__(self, path=EVALS_PATH, threads=6, hash_mb=1024, engine=True, cmd=None):
        super().__init__(path=path, threads=threads, hash_mb=hash_mb, engine=engine)
        self._cmd = cmd

    def _engine(self):
        if self.eng is None:
            self.eng = SafeEngine(self._cmd, threads=self.threads, hash_mb=self.hash_mb)
        return self.eng

    def _analyse(self, board, depth, **kw):
        cap = float(os.environ.get("O2_MAXTIME", 60))
        eng = self._engine()
        return eng.analyse(board, chess.engine.Limit(depth=depth, time=cap), **kw)


# ---------------------------------------------------------------- bulk search with JSONL cache
def _jsonl_key(fen, depth, mpv):
    return f"{fen}|{depth}|{mpv}"


class JsonlCache:
    """Append-only line cache {"k": "<fen>|<depth>|<multipv>", "r": [...] | "timeout"}.
    A restart skips what is already in the file; a deeper / wider entry serves a shallower request.
    Appends are done under a lock file so two jobs cannot interleave half lines."""

    def __init__(self, path):
        self.path = Path(path)
        self.by_fen = {}              # fen -> list of (depth, mpv, result)
        self.n = 0
        if self.path.exists():
            with open(self.path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        o = json.loads(line)
                        fen, d, m = o["k"].rsplit("|", 2)
                    except Exception:
                        continue          # a half-written last line after a crash
                    self.by_fen.setdefault(fen, []).append((int(d), int(m), o["r"]))
                    self.n += 1

    def find(self, fen, depth, mpv):
        best = None
        for d, m, r in self.by_fen.get(fen, ()):
            if r == "timeout":
                if d == depth and m == mpv:
                    return "timeout"
                continue
            if d >= depth and m >= mpv and (best is None or (d, m) < (best[0], best[1])):
                best = (d, m, r)
        return best[2][:mpv] if best else None

    def append(self, rows):
        """rows: list of (fen, depth, mpv, result)."""
        if not rows:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock = self.path.with_suffix(".lock")
        fd = None
        for _ in range(300):
            try:
                fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                break
            except FileExistsError:
                try:
                    if time.time() - lock.stat().st_mtime > 120:
                        lock.unlink()
                except OSError:
                    pass
                time.sleep(0.1)
        try:
            with open(self.path, "a", encoding="utf-8", newline="\n") as f:
                for fen, d, m, r in rows:
                    f.write(json.dumps({"k": _jsonl_key(fen, d, m), "r": r}, separators=(",", ":")) + "\n")
                    self.by_fen.setdefault(fen, []).append((d, m, r))
                    self.n += 1
        finally:
            if fd is not None:
                os.close(fd)
                try:
                    lock.unlink()
                except OSError:
                    pass


_W = {}      # per-worker-process state


def _worker_init(cmd, depth, tcap, mpv, hash_mb, grace):
    _W["eng"] = SafeEngine(cmd, threads=1, hash_mb=hash_mb, grace=grace)
    _W.update(depth=depth, tcap=tcap, mpv=mpv)


def _worker_search(fen):
    """-> (fen, result).  result: list of {m, cp, pv, d} (cp for the side to move, mate = +-10000) or 'timeout'."""
    eng, depth, tcap, mpv = _W["eng"], _W["depth"], _W["tcap"], _W["mpv"]
    board = chess.Board(fen)
    t = o2common.Evals.terminal(board)
    if t:
        return fen, [{"m": None, "cp": t[0]["cp"], "pv": [], "d": 0}]
    try:
        infos = eng.analyse(board, chess.engine.Limit(depth=depth, time=tcap), multipv=mpv)
    except EngineTimeout:
        return fen, "timeout"
    except Exception as e:                       # engine crashed: count as timeout, next call restarts it
        return fen, "timeout"
    if isinstance(infos, dict):
        infos = [infos]
    out = []
    for i in infos:
        if i.get("pv"):
            out.append({"m": i["pv"][0].uci(), "cp": i["score"].pov(board.turn).score(mate_score=10000),
                        "pv": [m.uci() for m in i["pv"][:8]], "d": i.get("depth", 0)})
    return fen, out


def bulk(fens, cache_path, depth=16, time_cap=4.0, multipv=3, workers=None, max_minutes=45,
         progress_every=200, hash_mb=64, grace=WATCHDOG_GRACE, cmd=None, log=None):
    """Search many positions with N one-thread Stockfish processes.
    fens: iterable of FEN strings.  Results are appended to the JSONL cache as they arrive; positions already in the cache
    (same or deeper/wider search, or a recorded timeout) are skipped, so running again continues where it stopped.
    Returns {"results": {fen: list | "timeout"}, "searched", "cached", "timeouts", "left", "stopped_by_time"}.
    No search is uncapped: Limit(depth, time=time_cap) in every worker plus a watchdog at time_cap + grace."""
    from concurrent.futures import ProcessPoolExecutor, wait, FIRST_COMPLETED
    log = log or (lambda s: print(s, file=sys.stderr, flush=True))
    workers = workers or int(os.environ.get("T2_WORKERS", 5))
    cache = JsonlCache(cache_path)
    todo, results, seen = [], {}, set()
    for fen in fens:
        if fen in seen:
            continue
        seen.add(fen)
        r = cache.find(fen, depth, multipv)
        if r is None:
            todo.append(fen)
        else:
            results[fen] = r
    cached = len(results)
    stats = {"searched": 0, "timeouts": 0, "left": 0, "stopped_by_time": False}
    deadline = time.time() + max_minutes * 60
    t0 = time.time()
    batch = []

    def flush():
        if batch:
            cache.append(list(batch))
            batch.clear()

    if todo:
        ex = ProcessPoolExecutor(max_workers=workers, initializer=_worker_init,
                                 initargs=(cmd, depth, time_cap, multipv, hash_mb, grace))
        it = iter(todo)
        pending = set()
        done_n = 0
        try:
            def feed():
                while len(pending) < workers * 2 and time.time() < deadline:
                    try:
                        fen = next(it)
                    except StopIteration:
                        return
                    pending.add(ex.submit(_worker_search, fen))
            feed()
            while pending:
                # a worker can only be stuck beyond cap + grace + restart; the watchdog inside kills the engine, so this is a last resort
                done, _ = wait(pending, timeout=time_cap + grace + 60, return_when=FIRST_COMPLETED)
                if not done:
                    log("bulk: no result for a long time; abandoning the pool (progress is saved)")
                    stats["stopped_by_time"] = True
                    break
                for fu in done:
                    pending.discard(fu)
                    try:
                        fen, r = fu.result()
                    except Exception:
                        continue
                    results[fen] = r
                    batch.append((fen, depth, multipv, r))
                    stats["searched"] += 1
                    done_n += 1
                    if r == "timeout":
                        stats["timeouts"] += 1
                    if done_n % progress_every == 0:
                        log(f"bulk: {done_n}/{len(todo)} searched, {stats['timeouts']} timeouts, "
                            f"{(time.time() - t0) / 60:.1f} min")
                if len(batch) >= 25:
                    flush()
                feed()
            if time.time() >= deadline:
                stats["stopped_by_time"] = True
        finally:
            flush()
            procs = list((getattr(ex, "_processes", None) or {}).values())
            ex.shutdown(wait=False, cancel_futures=True)
            # make sure no engine outlives us
            for p in procs:
                try:
                    p.terminate()
                except Exception:
                    pass
    stats["left"] = sum(1 for f in todo if f not in results)
    return {"results": results, "cached": cached, **stats}
