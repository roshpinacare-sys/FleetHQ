#!/usr/bin/env python3
# T9-sync: one sweep - blurt dry verdicts, delegation proof, heartbeat state.
# Everything saved to files; verdicts parsed ONLY from saved files.
import json, os, subprocess

OUT = "/home/z/my-project/tmp/t9"
os.makedirs(OUT, exist_ok=True)

def sh(cmd):
    return subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)

def fetch_json(path, fn):
    sh('source /home/z/my-project/ghenv.sh && curl -s -H "Authorization: Bearer $GH_TOKEN" '
       '"https://api.github.com/%s" > %s/%s 2>/dev/null' % (path, OUT, fn))
    p = os.path.join(OUT, fn)
    return os.path.getsize(p) if os.path.exists(p) else -1

def fetch_raw(repo, path, ref, fn):
    sh('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
       '-H "Accept: application/vnd.github.raw" '
       '"https://api.github.com/repos/roshpinacare-sys/%s/contents/%s?ref=%s" > %s/%s 2>/dev/null'
       % (repo, path, ref, OUT, fn))
    p = os.path.join(OUT, fn)
    return os.path.getsize(p) if os.path.exists(p) else -1

results = []
results.append(("br-runs", fetch_json("repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/runs?per_page=8", "br-runs.json")))
results.append(("deleg-last", fetch_raw("steem", "mini-services/saos-engine/state/delegation-last.json", "saos-cockpit", "delegation-last.json")))
results.append(("hb-last", fetch_raw("steem", "mini-services/saos-engine/state/ci-last-heartbeat.json", "saos-cockpit", "ci-last-heartbeat.json")))
results.append(("deleg-ledger", fetch_raw("steem", "mini-services/saos-engine/state/delegation-ledger.jsonl", "saos-cockpit", "delegation-ledger.jsonl")))
for label, n in results:
    print("%-12s bytes=%s" % (label, n))

# --- parse runs from saved file ---
try:
    d = json.load(open(OUT + "/br-runs.json"))
    runs = d.get("workflow_runs", [])
    print("\n== blurt-revival runs (newest first) ==")
    for r in runs:
        print("run %s | #%s | %-11s | %-9s | %s" % (r["id"], r["run_number"], r["status"], r["conclusion"], r["created_at"]))
except Exception as e:
    print("br-runs parse FAIL:", e)

# --- delegation verdict ---
try:
    dl = json.load(open(OUT + "/delegation-last.json"))
    print("\n== delegation-last.json ==")
    print(json.dumps(dl, indent=1)[:600])
except Exception as e:
    print("deleg parse FAIL:", e)

# --- heartbeat summary ---
try:
    hb = json.load(open(OUT + "/ci-last-heartbeat.json"))
    print("\n== ci-last-heartbeat ==")
    for k in ("at", "custody", "social", "content", "post", "postAccount", "dex", "digest", "blurt", "delegation", "delegationOps", "delegationSp"):
        print("  %-14s %s" % (k, hb.get(k)))
except Exception as e:
    print("hb parse FAIL:", e)

# --- delegation ledger tail ---
try:
    lines = [l for l in open(OUT + "/delegation-ledger.jsonl", encoding="utf-8") if l.strip()]
    print("\n== delegation-ledger (%d rows, last 3) ==" % len(lines))
    for l in lines[-3:]:
        print("  ", l.strip()[:220])
except Exception as e:
    print("ledger parse FAIL:", e)
