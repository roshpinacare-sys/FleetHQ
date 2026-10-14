import json, datetime, collections
RAW="/home/z/my-project/t24/raw/"
def iso(ms): return datetime.datetime.utcfromtimestamp(ms/1000).strftime('%Y-%m-%dT%H:%M:%SZ') if ms else None
NOW_MS=1791934295636

print("=== world-journal evs ===")
lines=[l for l in open(RAW+"world-journal.1") if l.strip()]
whos=collections.Counter(); evcount=0; latest_evs=[]
for l in lines:
    e=json.loads(l)
    for ev in (e.get("evs") or []):
        evcount+=1; whos[ev.get("who")]+=1; latest_evs.append(ev)
print("grouped entries:", len(lines), "| total evs:", evcount)
print("by who:", dict(whos))
print("last 14 evs:")
for ev in latest_evs[-14:]:
    print("  ", ev.get("at"), ev.get("who"), "·", ev.get("text"))
# age of last journal entry
last_at=latest_evs[-1].get("at")
print("last ev at:", last_at)
gen=datetime.datetime.fromisoformat(last_at.replace("Z","+00:00")).timestamp()*1000
print("ageMin at fetch:", round((NOW_MS-gen)/60000,1))
# events per member in last 6h
c6=collections.Counter()
for ev in latest_evs:
    at=ev.get("at")
    if not at: continue
    t=datetime.datetime.fromisoformat(at.replace("Z","+00:00")).timestamp()*1000
    if NOW_MS-t < 6*3600*1000: c6[ev.get("who")]+=1
print("evs last 6h by who:", dict(c6))

print()
print("=== fleet-health.json ===")
fh=json.load(open(RAW+"fleet-health.1"))
print("top keys:", sorted(fh.keys()))
print("generatedAt:", fh.get("generatedAt"))
repos=fh.get("repos") or fh.get("fleet") or []
print("repos:", len(repos) if isinstance(repos,list) else "dict?", type(repos))
if isinstance(repos,list) and repos:
    print("sample keys:", sorted(repos[0].keys()))
    st=collections.Counter(r.get("status") or r.get("health") for r in repos)
    print("status dist:", dict(st))
    for r in repos:
        if (r.get("status") or r.get("health")) not in ("green","ok","healthy"):
            print("  NON-GREEN:", json.dumps({k:r.get(k) for k in ("repo","name","status","health","failing","failingWorkflows","streak","pushedAt")}, ensure_ascii=False)[:220])
summ=fh.get("summary") or fh.get("totals")
if summ: print("summary:", json.dumps(summ, ensure_ascii=False)[:500])
