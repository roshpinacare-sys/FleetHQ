import json, datetime, collections
RAW="/home/z/my-project/t24/raw/"
def iso(ms): return datetime.datetime.utcfromtimestamp(ms/1000).strftime('%Y-%m-%dT%H:%M:%SZ') if ms else None

f=json.load(open(RAW+"foreman-state.1"))
b=f.get("books")
print("books type:", type(b))
if isinstance(b, dict):
    for k,v in list(b.items())[:30]:
        print("  book:", k, "->", json.dumps(v, ensure_ascii=False)[:150])
elif isinstance(b, list):
    for x in b[:30]: print("  book:", json.dumps(x, ensure_ascii=False)[:160])
print()
d=f.get("decisions") or []
print("decisions full:")
for x in d: print(" ", json.dumps(x, ensure_ascii=False)[:700])
print()
# receipts per hour
recs=[json.loads(l) for l in open(RAW+"receipts.1") if l.strip()]
byhr=collections.Counter()
for r in recs:
    at=r["at"][:13]; byhr[at]+=1
print("receipts per hour:", dict(sorted(byhr.items())))
print("distinct orderIds in receipts:", len(set(r.get("orderId") for r in recs)))
# which receipts have commits (real execution)
commitrecs=[r for r in recs if r.get("commits")]
print("receipts with commit shas:", len(commitrecs))
seen=set(); 
for r in commitrecs:
    key=(r["orderId"], r.get("recipe"))
    if key in seen: continue
    seen.add(key)
    print("  ", r["at"], r["orderId"], r.get("recipe"), r["commits"][:1], str(r.get("result"))[:80])
