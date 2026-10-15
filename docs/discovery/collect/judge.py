#!/usr/bin/env python3
"""Rank candidate passages with the purpose-graphing rows judge through Jev (OpenRouter Decisions API).
Usage: python3 -I judge.py ROWS_JUDGE.json CANDIDATES.json... --out scores.csv [--limit N] [--min-words 60] [--max-words 1500]
Reads OPENROUTER_API_KEY from the environment (or ../../../.env). Appends to scores.csv and skips ids already scored.
Scored question: `in-mind-at-the-time` (the judge's only validated question), scaled 0..1 as the expected rung.
Second, UNVALIDATED topical question `on_topic` (noul): is the speaker recounting trying to learn whether others can use what they built."""
import json, sys, os, csv, time, re, urllib.request, urllib.error, threading, queue

ENDPOINT = "https://openrouter.ai/api/alpha/decisions"
MODEL = "typesafe/jev-1.13"
ON_TOPIC = ("Is the speaker recounting their own or their team's attempt, need, or decision to find out whether "
            "other people can use, understand, or get through something they built (an app, site, product, tool, "
            "feature, or prototype)?")

def load_key():
    k = os.environ.get("OPENROUTER_API_KEY")
    if k: return k
    for p in (".env", "../.env", "../../.env", "../../../.env"):
        try:
            for line in open(p):
                if line.startswith("OPENROUTER_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
        except FileNotFoundError:
            pass
    sys.exit("no OPENROUTER_API_KEY")

def call(key, passage, question):
    body = json.dumps({"model": MODEL, "state": {"passage": passage}, "questions": {
        "in_mind": {"type": "score", "instructions": question["instructions"], "criteria": question["levels"]},
        "on_topic": {"type": "noul", "instructions": ON_TOPIC, "criteria": {
            "true": "The passage recounts the speaker's own situation of testing, wanting to test, or deciding how to learn whether others can use what they built.",
            "false": "The passage is general advice, a question about theory, a product pitch, or about something else."}},
    }}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(min(60, 2 ** attempt + 1)); continue
            raise RuntimeError(f"HTTP {e.code}")
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 ** attempt + 1)
    raise RuntimeError("gave up")

def main():
    args = sys.argv[1:]
    out = args[args.index("--out") + 1]
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else None
    minw = int(args[args.index("--min-words") + 1]) if "--min-words" in args else 60
    maxw = int(args[args.index("--max-words") + 1]) if "--max-words" in args else 1500
    files = [a for a in args if a.endswith(".json") and not a.startswith("--")]
    judge = json.load(open(files[0]))
    question = next(q for q in judge["questions"] if q["key"] == "in-mind-at-the-time")
    levels = len(question["levels"])
    cands = []
    for f in files[1:]:
        cands += json.load(open(f))
    first_person = re.compile(r"\b(I|I'm|I've|I'd|we|we're|we've|my|our|me)\b", re.I)
    cands = [c for c in cands if minw <= c["words"] <= maxw and first_person.search(c["text"])]
    done = set()
    if os.path.exists(out):
        done = {r["id"] for r in csv.DictReader(open(out))}
    todo = [c for c in cands if c["id"] not in done]
    if limit: todo = todo[:limit]
    print(f"{len(cands)} eligible, {len(done)} scored, {len(todo)} to do", file=sys.stderr)
    key = load_key()
    new = not os.path.exists(out)
    fh = open(out, "a", newline=""); w = csv.writer(fh)
    if new: w.writerow(["id", "in_mind", "in_mind_conf", "on_topic", "source", "words", "score", "url", "title", "cost"])
    lock = threading.Lock(); q = queue.Queue(); total_cost = [0.0]; n = [0]
    for c in todo: q.put(c)
    def worker():
        while True:
            try: c = q.get_nowait()
            except queue.Empty: return
            try:
                d = call(key, c["text"], question)
                a = d["answers"]["in_mind"]; probs = [a["probabilities"][str(i)] for i in range(levels)]
                exp = sum(p * i for i, p in enumerate(probs)) / (levels - 1)
                ot = d["answers"]["on_topic"]["noul"]; cost = d.get("usage", {}).get("cost", 0)
                with lock:
                    w.writerow([c["id"], f"{exp:.3f}", f"{a.get('confidence', 0):.2f}", f"{ot:.3f}", c["source"], c["words"],
                                c.get("score"), c["url"], (c.get("title") or "")[:120], cost]); fh.flush()
                    total_cost[0] += cost or 0; n[0] += 1
                    if n[0] % 50 == 0: print(f"{n[0]} scored, ${total_cost[0]:.3f}", file=sys.stderr)
            except Exception as e:
                with lock: print("ERR", c["id"], e, file=sys.stderr)
    ts = [threading.Thread(target=worker) for _ in range(8)]
    [t.start() for t in ts]; [t.join() for t in ts]
    print(f"done: {n[0]} scored, ${total_cost[0]:.3f}", file=sys.stderr)

if __name__ == "__main__":
    main()
