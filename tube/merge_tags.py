"""Join Claude's answers (tube/batches/bNN.out.json) and hand corrections (tube/overrides.json) into tube/tags.json.
Usage:  python tube/merge_tags.py
"""
import json
from pathlib import Path

HERE = Path(__file__).parent


def main():
    path = HERE / "tags.json"
    tags = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for f in sorted((HERE / "batches").glob("b*.out.json")):
        tags.update(json.loads(f.read_text(encoding="utf-8")))
    over = HERE / "overrides.json"   # hand corrections win over Claude's tags
    if over.exists():
        for k, v in json.loads(over.read_text(encoding="utf-8")).items(): tags[k] = {**tags.get(k, {}), **v}
    path.write_text(json.dumps(tags, ensure_ascii=False, indent=0), encoding="utf-8")
    print(len(tags), "videos tagged,", sum(1 for t in tags.values() if t.get("keep")), "kept")


if __name__ == "__main__":
    main()
