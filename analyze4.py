import json, datetime, collections
RAW="/home/z/my-project/t24/raw/"
def iso(ms): return datetime.datetime.utcfromtimestamp(ms/1000).strftime('%Y-%m-%dT%H:%M:%SZ') if ms else None
NOW_MS=1791934295636

q=json.load(open(RAW+"queue.1"))
o=q["orders"][0]
print("=== full order sample ===")
print(json.dumps(o, ensure_ascii=False, indent=1)[:1800])
print()
print("=== resolved count:", len(q.get("resolved") or []), "===")
for r in (q.get("resolved") or [])[-6:]:
    print(json.dumps(r, ensure_ascii=False)[:250])
print()
# RECEIPTS
print("=== RECEIPTS.jsonl ===")
lines=[l for l in open(RAW+"receipts.1") if l.strip()]
print("receipt lines:", len(lines))
recs=[json.loads(l) for l in lines]
print("first ts:", recs[0].get("ts") or recs[0].get("at"), "| last ts:", recs[-1].get("ts") or recs[-1].get("at"))
print("keys of last rec:", sorted(recs[-1].keys()))
c24=0
for r in recs:
    ts=r.get("ts") or r.get("at")
    if isinstance(ts,str):
        try: tms=datetime.datetime.fromisoformat(ts.replace("Z","+00:00")).timestamp()*1000
        except: tms=0
    else: tms=ts or 0
    if tms and NOW_MS-tms<86400000: c24+=1
print("receipts in last 24h:", c24)
for r in recs[-15:]:
    print(json.dumps(r, ensure_ascii=False)[:320])
