"""Print a plain-text summary of data/analysis.json (used to write the coach's notes)."""
import json, collections, statistics
from pathlib import Path

G = json.loads((Path(__file__).parent / "data" / "analysis.json").read_text(encoding="utf-8"))
mine = lambda g, i: (i % 2 == 0) == (g["color"] == "white")
print(len(G), "games")

bad = [(g, i, p) for g in G for i, p in enumerate(g["plies"]) if mine(g, i) and p.get("lab") in ("blunder", "mistake")]
print("blunders+mistakes:", len(bad), "blunders:", sum(p["lab"] == "blunder" for _, _, p in bad))
print("by phase:", collections.Counter(p["ph"] for _, _, p in bad))
print("my moves by phase:", collections.Counter(p["ph"] for g in G for i, p in enumerate(g["plies"]) if mine(g, i)))
print("tags:", collections.Counter(t for _, _, p in bad for t in p.get("why", [])).most_common())
print("move number of first blunder/mistake:", statistics.median([min([i // 2 + 1 for gg, i, p in bad if gg is g] or [999]) for g in G]))

# how losses happen: first big swing
def first_drop(g):
    for i, p in enumerate(g["plies"]):
        if mine(g, i) and p.get("lab") == "blunder": return i // 2 + 1, p["ph"]
    return None
losses = [g for g in G if g["result"] == "loss"]
print("losses:", len(losses), "with a blunder of mine:", sum(1 for g in losses if first_drop(g)))
print("first blunder phase in losses:", collections.Counter(first_drop(g)[1] for g in losses if first_drop(g)))

# time
def bucket(t): return ">5m" if t >= 300 else "2-5m" if t >= 120 else "1-2m" if t >= 60 else "<1m"
b = collections.defaultdict(lambda: [0, 0])
for g in G:
    for i, p in enumerate(g["plies"]):
        if mine(g, i) and "clk" in p:
            k = bucket(p["clk"] + p.get("t", 0)); b[k][0] += 1; b[k][1] += p.get("lab") in ("blunder", "mistake")
print("error rate by clock:", {k: f"{v[1]}/{v[0]} = {v[1]/v[0]:.1%}" for k, v in b.items()})
fast = [p for g in G for i, p in enumerate(g["plies"]) if mine(g, i) and p.get("t") is not None]
for lo, hi in [(0, 3), (3, 10), (10, 30), (30, 999)]:
    s = [p for p in fast if lo <= p["t"] < hi]
    print(f"think {lo}-{hi}s: {len(s)} moves, error rate {sum(p.get('lab') in ('blunder','mistake') for p in s)/max(1,len(s)):.1%}")
print("time used (avg of my final clock):", statistics.mean([next((p["clk"] for i, p in reversed(list(enumerate(g["plies"]))) if mine(g, i) and "clk" in p), 0) for g in G]))
print("games lost on time:", sum(g["how"] == "timeout" and g["result"] == "loss" for g in G))

# conversion
def wp(e, n):
    if "m" in e: return 100 if (e["m"] > 0 or (e["m"] == 0 and n % 2 == 1)) else 0
    import math; cp = max(-1000, min(1000, e["cp"])); return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)
for g in G:
    n = len(g["plies"]); w = [wp(p["e"], n) for p in g["plies"]] + [wp(g["final"], n)]
    g["my"] = w if g["color"] == "white" else [100 - x for x in w]
win = [g for g in G if max(g["my"]) >= 85]; lose = [g for g in G if min(g["my"]) <= 15]
print("had winning pos:", len(win), collections.Counter(g["result"] for g in win))
print("had losing pos:", len(lose), collections.Counter(g["result"] for g in lose))
# resign / checkmate details
print("results:", collections.Counter((g["result"], g["how"]) for g in G).most_common())

# openings: avg win% after move 10 (my POV) by family
fam = collections.defaultdict(list)
for g in G:
    name = " ".join(g["opening"].replace("-", " ").split()[:3])
    k = 20 if len(g["my"]) > 20 else len(g["my"]) - 1
    fam[(g["color"], name)].append((g["my"][k], g["result"]))
for (c, name), v in sorted(fam.items(), key=lambda kv: -len(kv[1]))[:14]:
    print(f"{c:5} {name:30} n={len(v):3} win%@move10={statistics.mean(x for x, _ in v):5.1f} score={sum(1 if r=='win' else .5 if r=='draw' else 0 for _, r in v)/len(v):.0%}")
print("opening phase loss avg per my move by color:", {c: round(statistics.mean(p["loss"] for g in G if g["color"] == c for i, p in enumerate(g["plies"]) if mine(g, i) and p["ph"] == "opening"), 2) for c in ("white", "black")})

# endgames
eg = [g for g in G if any(p["ph"] == "endgame" for p in g["plies"])]
print("games reaching endgame:", len(eg), collections.Counter(g["result"] for g in eg))
eg_swing = [g for g in eg if any(mine(g, i) and p["ph"] == "endgame" and p.get("lab") == "blunder" for i, p in enumerate(g["plies"]))]
print("endgames with my blunder:", len(eg_swing))
# missed opponent blunders: opponent blunders followed by my non-punishing move
opp_bl = missed = 0
for g in G:
    for i, p in enumerate(g["plies"]):
        if not mine(g, i) and p.get("lab") == "blunder" and i + 1 < len(g["plies"]):
            opp_bl += 1
            if g["plies"][i + 1]["loss"] >= 10: missed += 1
print(f"opponent blunders: {opp_bl}, not punished by me: {missed}")
# piece types involved in hung pieces
print("sample blunders:")
for g, i, p in bad[:0]: pass
