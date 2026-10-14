import json, datetime
RAW="/home/z/my-project/t24/raw/"
def iso(ms): return datetime.datetime.utcfromtimestamp(ms/1000).strftime('%Y-%m-%dT%H:%M:%SZ') if ms else None
NOW=1791934295636  # world-state t

# FOREMAN
f=json.load(open(RAW+"foreman-state.1"))
print("=== FOREMAN office/state/office-state.json ===")
print("top keys:", sorted(f.keys()))
print("capturedAt:", f.get("capturedAt"))
for k in ("counts","summary","meta"):
    if k in f: print(k, "=", json.dumps(f[k], ensure_ascii=False)[:400])
ag=f.get("agents") or []
print("agents:", len(ag))
for a in ag:
    print(json.dumps({k:a.get(k) for k in ("id","name","role","status","state","task","currentTask","assigned","updatedAt","since","workingOn","repo","station")}, ensure_ascii=False))
tk=f.get("tasks") or []
print("tasks:", len(tk))
for t in tk[:20]:
    print(json.dumps(t, ensure_ascii=False)[:300])
dc=f.get("decisions") or []
print("decisions:", len(dc))
for d in dc[-8:]:
    print(json.dumps(d, ensure_ascii=False)[:300])
