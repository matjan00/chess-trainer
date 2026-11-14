"""Prints the numbers lesson writers may quote (BLUEPRINT 6) from data/mine2.json.  No engine.

    t2stats.py [--mine data/mine2.json] [--samples [N]] [--save-samples FILE]

Without options: games, mistakes by tag (per 10 games, last 30 vs the 30 before), months, clock, won positions, endings,
and the number of cards / judgements / play-outs per type.
--samples N       also lists N threat cards, N decoys (safe judgements) and N cards of every other type with FEN, his move and link.
"""
import argparse, json, sys, datetime as dt
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def day(t):
    return dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%d %b %Y")


def stats_text(m):
    st = m.get("stats") or {}
    out = []
    n = st.get("games", 0)
    out.append(f"Games: {n}  ({day(st['from'])} to {day(st['to'])})" if n else "No games.")
    tags = st.get("tags", {})
    total = sum(v["n"] for v in tags.values())
    out.append("\nMistakes and blunders by tag (a mistake can carry several tags):")
    for t, v in tags.items():
        out.append(f"  {t:<20} {v['n']:>4}   {v['per10']:>4} per 10 games   last 30 games {v['last30']:>3}   30 before {v['prev30']:>3}"
                   f"   group {v['group']}")
    ck = st.get("clock", {})
    out.append(f"\nClock: {ck.get('fastShare', 0):.0%} of his mistakes are played in under 5 s; median time {ck.get('medianBad')} s on a mistake,"
               f" {ck.get('medianOther')} s on other moves.")
    w = st.get("won", {})
    if w:
        out.append(f"\nWinning positions (85+ win-%): reached in {w['reached']} games, kept (won) in {w['kept']}, thrown away in {len(w['thrown'])}.")
        for x in w["thrown"][:5]:
            out.append(f"  newest thrown: vs {x['opp']} on {day(x['end'])}, ply {x['ply']}, game {x['gid']}")
    out.append("\nMonths:  month   games  mist  blun  fast<5s  won positions kept/reached")
    for mo in st.get("months", []):
        fast = "  -  " if mo["fast"] is None else f"{mo['fast']:.0%}"
        out.append(f"  {mo['m']}  {mo['games']:>5}  {mo['mist']:>4}  {mo['blun']:>4}  {fast:>6}   {mo['wonKept']}/{mo['wonReached']}")
    en = st.get("endings", {})
    if en:
        out.append("\nHis games that reached a course ending (lesson id: games):")
        out.append("  " + ", ".join(f"{k}: {len(v)}" for k, v in sorted(en.items(), key=lambda kv: -len(kv[1]))))
    out.append("\nData:")
    out.append(f"  cards {dict(Counter(c['type'] for c in m['cards']))}; tq kinds {dict(Counter(c.get('kind') for c in m['cards'] if c['type'] == 'tq'))}")
    out.append(f"  judgements {dict(Counter((j['who'], j['verdict']) for j in m['judges']))}")
    out.append(f"  play-outs {dict(Counter(p['id'][:2] for p in m['plays']))}" + (f"; cv results {dict(Counter(p['result'] for p in m['plays'] if p['id'].startswith('cv/')))}"))
    if m.get("left"):
        out.append(f"  NOTE: {m['left']} positions are not searched yet (time budget): run build_mine2.py again.")
    return "\n".join(out)


def samples_text(m, n):
    out = []

    def show(title, items, fmt):
        out.append(f"\n== {title} ({len(items)} total, first {min(n, len(items))}) ==")
        for x in items[:n]:
            out.append(fmt(x))

    cards = m["cards"]
    thr = [c for c in cards if c["type"] == "thr"]
    show("Threat cards (what is the threat?)", thr,
         lambda c: f"{c['id']}  {c['fen']}\n    {c['side']} to move; threat {c['threat']}; ok {c['ok']}; he played {c['played']}; {c['url']}\n    {c['why']}")
    dec = [j for j in m["judges"] if j["verdict"] == "safe"]
    show("Decoys (safe moves)", dec,
         lambda j: f"{j['id']}  {j['fen']}\n    {j['who']} played {j['san']} ({j['mv']}); {j['url']}")
    for t in ("fix", "pun", "tq"):
        show(f"{t} cards", [c for c in cards if c["type"] == t],
             lambda c: f"{c['id']}  {c['fen']}\n    {c['side']} to move; ok {c['ok']}; played {c['played']}; {c['url']}\n    {c['why']}")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mine", default=str(ROOT / "data" / "mine2.json"))
    ap.add_argument("--samples", nargs="?", const=10, type=int, default=0)
    ap.add_argument("--save-samples", default="")
    a = ap.parse_args()
    m = json.loads(Path(a.mine).read_text(encoding="utf-8"))
    print(stats_text(m))
    if a.samples:
        s = samples_text(m, a.samples)
        print(s)
        if a.save_samples:
            Path(a.save_samples).write_text(s + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
