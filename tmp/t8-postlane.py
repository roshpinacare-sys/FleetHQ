#!/usr/bin/env python3
# T8-g: pull post-lane evidence from steem@saos-cockpit.
import json, os, subprocess

OUT = "/home/z/my-project/tmp/t8"

def pull_steem(path, fn):
    cmd = ('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
           '-H "Accept: application/vnd.github.raw" '
           '"https://api.github.com/repos/roshpinacare-sys/steem/contents/%s?ref=saos-cockpit" '
           '> %s/%s 2>/dev/null' % (path, OUT, fn))
    subprocess.run(["bash", "-lc", cmd], capture_output=True)
    p = os.path.join(OUT, fn)
    return os.path.getsize(p) if os.path.exists(p) else -1

print("streamer.mjs   ", pull_steem("mini-services/saos-engine/social-streamer.mjs", "social-streamer.mjs"))
print("content-ops    ", pull_steem("mini-services/saos-engine/state/content-ops.json", "content-ops.json"))
print("bridge-guard   ", pull_steem("mini-services/saos-engine/state/bridge-guard.json", "bridge-guard.json"))
print("social-sent    ", pull_steem("mini-services/saos-engine/content/sent/social-sent.jsonl", "social-sent.jsonl"))

try:
    rows = [json.loads(l) for l in open(OUT + "/social-sent.jsonl") if l.strip()]
    print("sent rows:", len(rows))
    for r in rows[-4:]:
        print("  ", json.dumps(r)[:280])
except Exception as e:
    print("sent parse:", e)

try:
    co = json.load(open(OUT + "/content-ops.json"))
    print("content-ops keys:", sorted(co.keys()))
    for k in ("verdict", "at", "queue", "drafts", "count", "next", "source"):
        if k in co:
            print("  %s = %s" % (k, json.dumps(co[k])[:220]))
except Exception as e:
    print("content-ops parse:", e)
