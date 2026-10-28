import json, datetime, collections
RAW="/home/z/my-project/t24/raw/"
def iso(ms): return datetime.datetime.utcfromtimestamp(ms/1000).strftime('%Y-%m-%dT%H:%M:%SZ') if ms else None
NOW_MS=1791934295636

print("=== world-journal.jsonl ===")
lines=[l for l in open(RAW+"world-journal.1") if l.strip()]
print("lines:", len(lines))
first=json.loads(lines[0]); last=json.loads(lines[-1])
print("first:", json.dumps(first, ensure_ascii=False)[:200])
print("last :", json.dumps(last, ensure_ascii=False)[:200])
print("last 12:")
for l in lines[-12:]:
    e=json.loads(l); print(" ", iso(e.get("ts")), e.get("who"), "·", e.get("text"))
who=collections.Counter(json.loads(l).get("who") for l in lines)
print("by who:", dict(who))
# any noa?
allw=set(who)
print("noa in journal who-set?", "noa" in allw, "| set:", allw)

print()
print("=== claims.jsonl ===")
cl=[l for l in open(RAW+"claims.1") if l.strip()]
print("lines:", len(cl))
for l in cl:
    print(" ", l.strip()[:400])

print()
print("=== selfhood journal.jsonl ===")
sl=[json.loads(l) for l in open(RAW+"selfhood-journal.1") if l.strip()]
print("lines:", len(sl))
print("last 8:")
for e in sl[-8:]:
    print(" ", json.dumps(e, ensure_ascii=False)[:260])
kinds=collections.Counter(e.get("kind") for e in sl)
print("kinds:", dict(kinds))
