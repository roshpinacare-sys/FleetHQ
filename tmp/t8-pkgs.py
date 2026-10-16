#!/usr/bin/env python3
# T8-k: verify blurt js packages on npm; extract chain id from official tarball.
import json, os, subprocess

OUT = "/home/z/my-project/tmp/t8"
CANDS = ["@blurtfoundation/blurtjs", "@beblurt/blurt", "dblurt", "blurt-tx", "@beblurt/dblurt"]
os.makedirs(OUT + "/tars", exist_ok=True)

def sh(cmd):
    return subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)

results = []
for name in CANDS:
    r = sh("curl -s -m 15 'https://registry.npmjs.org/%s' > %s/pkg.json" % (name.replace("/", "%2F"), OUT))
    try:
        d = json.load(open(OUT + "/pkg.json"))
    except Exception:
        print("%-32s NOT-FOUND" % name)
        continue
    latest = d.get("dist-tags", {}).get("latest", "?")
    repo = d.get("repository", {})
    tar = d.get("versions", {}).get(latest, {}).get("dist", {}).get("tarball", "")
    print("%-32s latest=%-8s repo=%s" % (name, latest, repo.get("url", repo) if isinstance(repo, dict) else repo))
    results.append((name, latest, tar))

json.dump(results, open(OUT + "/blurt-pkgs.json", "w"))
