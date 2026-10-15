#!/usr/bin/env python3
"""Collect first-person candidate posts from Stack Exchange sites into one JSON file.
Usage: python3 -I collect_se.py OUT.json
Public API, no key, ~300 requests/day. Content is CC BY-SA; owner link kept for attribution."""
import json, sys, time, html, re, urllib.request, urllib.parse, gzip

QUERIES = [
    "no UX researcher usability", "unmoderated usability test", "how many users usability test",
    "usability test my app", "test with real users before launch", "small team user testing",
    "developer usability testing without researcher", "how do I test if users can use my app",
    "remote usability testing tool", "usability testing budget", "user testing startup",
    "first usability test", "usability testing developers", "can users figure out",
]
SITES = ["ux", "stackoverflow", "softwareengineering", "pm"]

def strip(h):
    t = re.sub(r"<pre>.*?</pre>", " ", h, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t)).strip()

def get(url):
    req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip", "User-Agent": "ui-tests-discovery/0.1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)
    return json.loads(data)

def main(out):
    seen, items, failed = {}, [], []
    for site in SITES:
        for q in QUERIES:
            url = ("https://api.stackexchange.com/2.3/search/advanced?" + urllib.parse.urlencode({
                "q": q, "site": site, "pagesize": 50, "order": "desc", "sort": "relevance", "filter": "withbody"}))
            try:
                d = get(url)
            except Exception as e:
                print("ERR", site, q, e, file=sys.stderr); failed.append(f"{site}: {q}"); continue
            for it in d.get("items", []):
                key = f"se:{site}:{it['question_id']}"
                if key in seen: continue
                body = strip(it.get("body", ""))
                seen[key] = True
                items.append({
                    "id": key, "source": "stackexchange", "site": site, "url": it["link"],
                    "title": html.unescape(it["title"]), "text": body, "score": it.get("score"),
                    "created": it.get("creation_date"), "author": it.get("owner", {}).get("display_name"),
                    "author_link": it.get("owner", {}).get("link"), "license": it.get("content_license"),
                    "query": q, "words": len(body.split()),
                })
            print(site, q, len(d.get("items", [])), "quota", d.get("quota_remaining"), file=sys.stderr)
            if d.get("backoff"): time.sleep(d["backoff"] + 1)
            time.sleep(0.3)
    json.dump(items, open(out, "w"), indent=1)
    print("wrote", len(items), "candidates to", out, file=sys.stderr)
    if failed:
        print(f"{len(failed)} site queries failed; {out} is partial. Failed: {'; '.join(failed)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main(sys.argv[1])
