import json, datetime, collections
RAW="/home/z/my-project/t24/raw/"
def iso(ms): return datetime.datetime.utcfromtimestamp(ms/1000).strftime('%Y-%m-%dT%H:%M:%SZ') if ms else None
NOW_MS=1791934295636

fh=json.load(open(RAW+"fleet-health.1"))
print("=== alerts ===")
for a in (fh.get("alerts") or [])[:12]: print(" ", json.dumps(a, ensure_ascii=False)[:260])
print("apiQuota:", json.dumps(fh.get("apiQuota"), ensure_ascii=False)[:200])
print("remediations(last 5):")
for r in (fh.get("remediations") or [])[-5:]: print(" ", json.dumps(r, ensure_ascii=False)[:220])
print()
for r in fh["repos"]:
    if r["name"] in ("Domain","Console","ops-forge","Autonomy","GridWatch","ops-intake","FleetHQ","Pulse","saos-runtime"):
        print(r["name"], "health=", r.get("health"), "counts=", json.dumps(r.get("counts"), ensure_ascii=False)[:160], "pushedAt=", r.get("pushedAt"))
print()
print("=== foreman: per-agent done-in-24h (by updatedAt) ===")
f=json.load(open(RAW+"foreman-state.1"))
H24=86400000
per=collections.defaultdict(lambda: {"done24":0,"last":0,"lastTask":None,"oldestBlocked":None})
for t in f["tasks"]:
    a=t.get("assignee"); up=t.get("updatedAt") or 0
    if t.get("status")=="done" and up and NOW_MS-up<H24:
        per[a]["done24"]+=1
        if up>per[a]["last"]: per[a]["last"]=up; per[a]["lastTask"]=(t["id"], t["title"][:50])
    if t.get("status")=="blocked":
        cr=t.get("createdAt")
        per[a]["oldestBlocked"]=(t["id"], t["title"][:60], iso(cr))
for a,v in sorted(per.items()):
    print(a, "done24h:", v["done24"], "| last-done:", iso(v["last"]), v["lastTask"], "| blocked:", v["oldestBlocked"])
print()
print("=== foreman books (22) ===")
print(json.dumps(f.get("books"), ensure_ascii=False)[:900])
