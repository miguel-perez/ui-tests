#!/usr/bin/env python3
"""Collect first-person candidate stories and comments from Hacker News via the Algolia API.
Usage: python3 -I collect_hn.py OUT.json
Each comment is its own candidate; thread link kept."""
import json, sys, time, html, re, urllib.request, urllib.parse

QUERIES = ["usability testing", "user testing", "unmoderated usability", "usability test",
           "test with real users", "watch users use", "user research no budget", "hallway testing"]

def strip(h):
    t = re.sub(r"<[^>]+>", " ", h or "")
    return re.sub(r"\s+", " ", html.unescape(t)).strip()

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "ui-tests-discovery/0.1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def main(out):
    seen, items = {}, []
    for q in QUERIES:
        for tags in ("story", "comment"):
            for page in range(0, 4):
                url = "https://hn.algolia.com/api/v1/search?" + urllib.parse.urlencode({
                    "query": q, "tags": tags, "hitsPerPage": 100, "page": page})
                try:
                    d = get(url)
                except Exception as e:
                    print("ERR", q, tags, page, e, file=sys.stderr); break
                hits = d.get("hits", [])
                for h in hits:
                    key = f"hn:{h['objectID']}"
                    if key in seen: continue
                    seen[key] = True
                    text = strip(h.get("comment_text") or h.get("story_text") or "")
                    if not text: continue
                    items.append({
                        "id": key, "source": "hackernews", "kind": tags,
                        "url": f"https://news.ycombinator.com/item?id={h['objectID']}",
                        "thread": f"https://news.ycombinator.com/item?id={h.get('story_id') or h['objectID']}",
                        "title": h.get("title") or h.get("story_title"), "text": text,
                        "score": h.get("points"), "created": h.get("created_at"), "author": h.get("author"),
                        "query": q, "words": len(text.split()),
                    })
                print(q, tags, page, len(hits), file=sys.stderr)
                if len(hits) < 100: break
                time.sleep(0.3)
    json.dump(items, open(out, "w"), indent=1)
    print("wrote", len(items), "candidates to", out, file=sys.stderr)

if __name__ == "__main__":
    main(sys.argv[1])
