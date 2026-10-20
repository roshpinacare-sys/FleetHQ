#!/usr/bin/env python3
# T9-verify2: anti-fabrication double-fetch — every datum fetched TWICE via
# independent curl executions, md5-compared. A fabricator that rewrites
# display cannot survive file-level md5 equality of two real fetches.
import hashlib, json, os, subprocess

OUT = "/home/z/my-project/tmp/t9"
os.makedirs(OUT, exist_ok=True)

def sh(cmd):
    return subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)

def fetch2(url_path, tag, raw=False):
    """Fetch url_path twice via independent curls; return (md5_match, size1, size2)."""
    h = "-H 'Accept: application/vnd.github.raw'" if raw else ""
    f1, f2 = OUT + "/%s.1" % tag, OUT + "/%s.2" % tag
    sh('source /home/z/my-project/ghenv.sh && curl -sL %s -H "Authorization: Bearer $GH_TOKEN" '
       '"https://api.github.com/%s" > %s 2>/dev/null' % (h, url_path, f1))
    sh('source /home/z/my-project/ghenv.sh && curl -sL %s -H "Authorization: Bearer $GH_TOKEN" '
       '"https://api.github.com/%s" > %s 2>/dev/null' % (h, url_path, f2))
    h1 = hashlib.md5(open(f1, "rb").read()).hexdigest() if os.path.exists(f1) else "x"
    h2 = hashlib.md5(open(f2, "rb").read()).hexdigest() if os.path.exists(f2) else "y"
    return h1 == h2, h1, h2, f1

pairs = [
    ("sovereign-runs", "repos/roshpinacare-sys/saos-runtime/actions/workflows/sovereign-runtime.yml/runs?per_page=10", False),
    ("deleg-last", "repos/roshpinacare-sys/steem/contents/mini-services/saos-engine/state/delegation-last.json?ref=saos-cockpit", True),
    ("blurt-runs", "repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/runs?per_page=10", False),
    ("hb-state", "repos/roshpinacare-sys/steem/contents/mini-services/saos-engine/state/ci-last-heartbeat.json?ref=saos-cockpit", True),
]
verdicts = {}
for tag, path, raw in pairs:
    ok, h1, h2, f1 = fetch2(path, tag, raw)
    verdicts[tag] = (ok, f1)
    print("%-14s self-consistency: %s (md5 %s)" % (tag, "MATCH" if ok else "MISMATCH", h1[:10]))

print()
# Parse ONLY the self-consistent files.
if verdicts["sovereign-runs"][0]:
    d = json.load(open(verdicts["sovereign-runs"][1]))
    print("== sovereign-runtime beats ==")
    for r in d.get("workflow_runs", [])[:8]:
        print("  %s | %-11s | %-9s | %s" % (r["id"], r["status"], r["conclusion"], r["created_at"]))

if verdicts["deleg-last"][0]:
    print("\n== delegation-last.json ==")
    print(json.dumps(json.load(open(verdicts["deleg-last"][1])), indent=1)[:500])

if verdicts["blurt-runs"][0]:
    d = json.load(open(verdicts["blurt-runs"][1]))
    print("\n== blurt-revival runs ==")
    for r in d.get("workflow_runs", [])[:6]:
        print("  %s | %-11s | %-9s | %s" % (r["id"], r["status"], r["conclusion"], r["created_at"]))

if verdicts["hb-state"][0]:
    hb = json.load(open(verdicts["hb-state"][1]))
    print("\n== heartbeat ==")
    for k in ("at", "custody", "delegation", "delegationOps", "delegationSp", "post", "blurt"):
        print("  %-14s %s" % (k, hb.get(k)))
