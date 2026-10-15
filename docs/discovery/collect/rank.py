#!/usr/bin/env python3
"""Rank scored candidates and draw a calibration sample.
Usage: python3 -I rank.py scores.csv candidates/se.json candidates/hn.json --out-dir OUT
Writes ranked.md (top 150 by combined score), calibration.md (20 items spread across the range, blind to score),
and summary.txt. Combined = in_mind * on_topic; both columns kept."""
import csv, json, sys, random, os, statistics

def main():
    a = sys.argv[1:]; out = a[a.index("--out-dir") + 1]; os.makedirs(out, exist_ok=True)
    scores = list(csv.DictReader(open(a[0])))
    texts = {}
    for f in a[1:]:
        if f.endswith(".json"):
            for c in json.load(open(f)): texts[c["id"]] = c
    for r in scores:
        r["in_mind"] = float(r["in_mind"]); r["on_topic"] = float(r["on_topic"]); r["combined"] = r["in_mind"] * r["on_topic"]
    scores.sort(key=lambda r: -r["combined"])
    def q(xs, p): xs = sorted(xs); return xs[int(p * (len(xs) - 1))]
    im = [r["in_mind"] for r in scores]; ot = [r["on_topic"] for r in scores]; cb = [r["combined"] for r in scores]
    with open(f"{out}/summary.txt", "w") as f:
        f.write(f"scored {len(scores)}\n")
        for name, xs in (("in_mind", im), ("on_topic", ot), ("combined", cb)):
            f.write(f"{name}: median {statistics.median(xs):.2f} p75 {q(xs,.75):.2f} p90 {q(xs,.9):.2f} >=0.5: {sum(x>=.5 for x in xs)} >=0.7: {sum(x>=.7 for x in xs)}\n")
        f.write(f"combined>=0.5 by source: " + ", ".join(f"{s}={sum(1 for r in scores if r['combined']>=.5 and r['source']==s)}" for s in ("stackexchange","hackernews")) + "\n")
        f.write(f"cost total ${sum(float(r['cost'] or 0) for r in scores):.3f}\n")
    with open(f"{out}/ranked.md", "w") as f:
        f.write("# Ranked candidates (top 150 by in_mind × on_topic)\n\nScores order reading time; they decide nothing.\n\n")
        for i, r in enumerate(scores[:150], 1):
            t = texts.get(r["id"], {}); snippet = (t.get("text") or "")[:280].replace("\n", " ")
            f.write(f"{i}. **{r['combined']:.2f}** (mind {r['in_mind']:.2f}, topic {r['on_topic']:.2f}, {r['words']}w, {r['source']}) [{(r['title'] or r['id'])[:90]}]({r['url']})\n   > {snippet}\n\n")
    random.seed(7)
    bands = [(0.0, .2), (.2, .4), (.4, .6), (.6, .8), (.8, 1.01)]
    sample = []
    for lo, hi in bands:
        pool = [r for r in scores if lo <= r["combined"] < hi]
        sample += random.sample(pool, min(4, len(pool)))
    random.shuffle(sample)
    with open(f"{out}/calibration.md", "w") as f:
        f.write("# Calibration sample: 20 candidates, scores hidden\n\nFor each, mark A (a first-person account of trying to learn whether others can use what they built), T (a theory or general question), or O (other). Then compare with calibration-key.csv.\n\n")
        for i, r in enumerate(sample, 1):
            t = texts.get(r["id"], {})
            f.write(f"## {i}. {(r['title'] or r['id'])[:100]}\n{r['url']}\n\n{(t.get('text') or '')[:1200]}\n\n")
    with open(f"{out}/calibration-key.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["n", "id", "in_mind", "on_topic", "combined", "url"])
        for i, r in enumerate(sample, 1): w.writerow([i, r["id"], f"{r['in_mind']:.2f}", f"{r['on_topic']:.2f}", f"{r['combined']:.2f}", r["url"]])
    print(open(f"{out}/summary.txt").read())

if __name__ == "__main__":
    main()
