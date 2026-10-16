#!/usr/bin/env python3
# T8-j: npm registry search for official blurt js libs; extract chain id constants.
import json, os, subprocess

OUT = "/home/z/my-project/tmp/t8"
os.makedirs(OUT, exist_ok=True)

def sh(cmd):
    return subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)

r = sh("curl -s -m 20 'https://registry.npmjs.org/-/v1/search?text=blurt&size=20' > %s/npm-search.json" % OUT)
d = json.load(open(OUT + "/npm-search.json"))
objs = d.get("objects", [])
print("search hits:", len(objs))
for o in objs:
    p = o.get("package", {})
    print("  %-44s %-10s %s" % (p.get("name", "?"), p.get("version", "?"), (p.get("description") or "")[:80]))
json.dump([o.get("package", {}).get("name") for o in objs], open(OUT + "/npm-names.json", "w"))
