#!/usr/bin/env python3
"""Score every summary for emotional valence with Jev. Two questions per summary:
 - charge (score, 4 levels): how strong is the emotional charge the person expresses
 - sign (choice): negative / neutral / positive
Writes valence.csv: summary, charge(0..1), p_neg, p_neu, p_pos, text."""
import json, csv, os, sys, re, time, urllib.request, urllib.error, threading, queue
ENDPOINT="https://openrouter.ai/api/alpha/decisions"; MODEL="typesafe/jev-1.13"
def key():
    k=os.environ.get("OPENROUTER_API_KEY")
    if k: return k
    for p in (".env","../.env","../../.env","../../../.env"):
        if os.path.exists(p):
            for l in open(p):
                if l.startswith("OPENROUTER_API_KEY="): return l.split("=",1)[1].strip().strip('"').strip("'")
    sys.exit("no key")
def call(k, text):
    body=json.dumps({"model":MODEL,"state":{"summary":text},"questions":{
      "charge":{"type":"score","instructions":"The summary is a first-person sentence of what a person thought or felt at a moment. How strong is the emotional charge the person expresses, judged only from the words of the summary, not from what the situation might imply?","criteria":[
        "No emotional charge: a plan, judgment, or decision stated flatly.",
        "Mild: a preference, hope, curiosity, or mild unease is expressed.",
        "Clear: a named feeling or an evaluative word with weight (depressed, surprised, exhausted, glad, uncomfortable, fascinated).",
        "Intense: strong feeling with emphasis (extremely happy, so disappointed, really sucks, terrifying, burnt, lost)."]},
      "sign":{"type":"choice","instructions":"What is the direction of the feeling the person expresses in the summary?","criteria":{
        "negative":"frustration, worry, fear, discomfort, regret, exhaustion, disappointment, confusion",
        "neutral":"no feeling, or a flat judgment, plan or decision",
        "positive":"relief, gladness, excitement, fascination, pride, confidence, eagerness"}}}}).encode()
    req=urllib.request.Request(ENDPOINT,data=body,method="POST",headers={"Authorization":f"Bearer {k}","Content-Type":"application/json"})
    for a in range(5):
        try:
            with urllib.request.urlopen(req,timeout=120) as r: return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429,500,502,503,504): time.sleep(min(60,2**a+1)); continue
            raise
        except (urllib.error.URLError,TimeoutError): time.sleep(2**a+1)
    raise RuntimeError("gave up")
def main(inp,out):
    k=key(); rows=[]
    for l in open(inp):
        m=re.match(r"(s\d+) \[(\S+)\] (.*)",l.strip())
        if m: rows.append(m.groups())
    q=queue.Queue(); [q.put(r) for r in rows]; lock=threading.Lock(); res=[]; cost=[0.0]
    def w():
        while True:
            try: sid,src,text=q.get_nowait()
            except queue.Empty: return
            try:
                d=call(k,text); c=d["answers"]["charge"]; probs=[c["probabilities"][str(i)] for i in range(4)]
                charge=sum(p*i for i,p in enumerate(probs))/3; s=d["answers"]["sign"]["probabilities"]
                with lock:
                    res.append([sid,src,f"{charge:.3f}",f"{s.get('negative',0):.2f}",f"{s.get('neutral',0):.2f}",f"{s.get('positive',0):.2f}",text]); cost[0]+=d.get("usage",{}).get("cost",0)
            except Exception as e:
                with lock: print("ERR",sid,e,file=sys.stderr)
    ts=[threading.Thread(target=w) for _ in range(8)]; [t.start() for t in ts]; [t.join() for t in ts]
    res.sort(key=lambda r:int(r[0][1:]))
    with open(out,"w",newline="") as f:
        wr=csv.writer(f); wr.writerow(["summary","account","charge","p_neg","p_neu","p_pos","text"]); wr.writerows(res)
    print(len(res),"scored, cost $%.3f"%cost[0],file=sys.stderr)
if __name__=="__main__": main(sys.argv[1],sys.argv[2])
