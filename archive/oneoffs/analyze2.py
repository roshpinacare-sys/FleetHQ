import json, datetime, collections
RAW="/home/z/my-project/t24/raw/"
def iso(ms): return datetime.datetime.utcfromtimestamp(ms/1000).strftime('%Y-%m-%dT%H:%M:%SZ') if ms else None
f=json.load(open(RAW+"foreman-state.1"))
NOW_MS = 1791934295636
H24 = 24*3600*1000

tk=f.get("tasks") or []
print("total tasks:", len(tk))
by_status=collections.Counter(t.get("status") for t in tk)
print("by status:", dict(by_status))
by_agent=collections.defaultdict(collections.Counter)
for t in tk: by_agent[t.get("assignee")][t.get("status")]+=1
for a,c in by_agent.items(): print("assignee",a,dict(c))
print()
# last-24h: created recently or completed recently
print("=== tasks with timestamps in last 24h ===")
recent=[]
for t in tk:
    created=t.get("createdAt"); done_at=t.get("doneAt") or t.get("completedAt") or t.get("updatedAt")
    if (created and NOW_MS-created<H24) or (done_at and NOW_MS-done_at<H24):
        recent.append(t)
print("recent count:", len(recent))
for t in recent[:40]:
    print(json.dumps({k:t.get(k) for k in ("id","title","status","assignee","createdAt","doneAt","completedAt","updatedAt","createdBy")}, ensure_ascii=False))
print()
# open/blocked tasks per agent
print("=== NOT-done tasks ===")
for t in tk:
    if t.get("status")!="done":
        print(json.dumps({k:t.get(k) for k in ("id","title","status","assignee","createdAt","createdBy","why")}, ensure_ascii=False))
print()
print("=== feed ===")
for x in (f.get("feed") or []): print(json.dumps(x, ensure_ascii=False)[:250])
print("=== memory ===", json.dumps(f.get("memory"), ensure_ascii=False)[:300])
print("=== reports ===", json.dumps(f.get("reports"), ensure_ascii=False)[:200])
print("=== lastError ===", json.dumps(f.get("lastError"), ensure_ascii=False)[:300])
print("=== backend ===", json.dumps(f.get("backend"), ensure_ascii=False)[:200])
print("=== statusHe ===", json.dumps(f.get("statusHe"), ensure_ascii=False)[:200])
print("=== mode/connected ===", f.get("mode"), f.get("connected"))
print("=== books ===", json.dumps(f.get("books"), ensure_ascii=False)[:600])
