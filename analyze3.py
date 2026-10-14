import json, datetime, collections
RAW="/home/z/my-project/t24/raw/"
def iso(ms): return datetime.datetime.utcfromtimestamp(ms/1000).strftime('%Y-%m-%dT%H:%M:%SZ') if ms else None
NOW_MS=1791934295636

q=json.load(open(RAW+"queue.1"))
print("=== QUEUE.json ===")
print("top keys:", sorted(q.keys())[:20])
for k in ("generatedAt","updatedAt","runId"):
    if k in q: print(k,"=",q[k])
orders = q.get("orders") or q.get("items") or []
print("orders:", len(orders))
open_orders=[o for o in orders if (o.get("status") or "open").lower() in ("open","pending","new","")]
print("open:", len(open_orders))
prio=collections.Counter(o.get("priority") for o in open_orders)
print("open by priority:", dict(prio))
ownerseen=collections.Counter(o.get("owner") for o in open_orders)
print("open by owner field:", dict(ownerseen))
for o in orders:
    st=o.get("status") or "open"
    print(f'{o.get("id")} | {st} | {o.get("priority")} | {o.get("repo")} | {o.get("kind")} | owner={o.get("owner") or o.get("assignee") or "-"} | {str(o.get("title"))[:70]}')
