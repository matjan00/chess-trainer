"""Find the Stockfish program in engine/, on Windows (the laptop) and on Linux (the nightly GitHub job)."""
import os, sys
from pathlib import Path


def find_engine(root: Path) -> Path:
    candidates = sorted(p for p in (root / "engine").rglob("stockfish*") if p.is_file())
    if sys.platform == "win32":
        candidates = [p for p in candidates if p.suffix.lower() == ".exe"]
    else:
        candidates = [p for p in candidates if p.suffix == "" and os.access(p, os.X_OK)]
    if not candidates:
        raise FileNotFoundError(f"No Stockfish program found in {root / 'engine'}")
    return candidates[0]
