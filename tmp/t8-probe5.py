#!/usr/bin/env python3
# T8-i5: find blurt's official js lib on npm and extract its chain id.
import json, subprocess

RAW = "/home/z/my-project/tmp/t8/npm-blurt.jsonl"
open(RAW, "w").close()

def curl(url):
    r = subprocess.run(["bash", "-lc", "curl -sL -m 15 '%s'" % url],
                       capture_output=True, text=True)
    return r.stdout

# 1) npm search
s = curl("https://registry.npmjs.org/-/v1/search?text=blurt&size=12")
try:
    d = json.loads(s)
    pkgs = [(o["package"]["name"], o["package"]["version"], o["package"].get("description", "")[:70])
            for o in d.get("objects", [])]
except Exception as e:
    pkgs = []
    print("search fail:", e, s[:200])
for n, v, desc in pkgs:
    print("npm:", n, v, "|", desc)

# 2) for each candidate, pull package.json + serializer source, grep chain id
hits = []
for name, ver, _ in pkgs:
    meta = curl("https://registry.npmjs.org/%s" % name)
    try:
        m = json.loads(meta)
        latest = m.get("dist-tags", {}).get("latest")
        tar = m.get("versions", {}).get(latest, {}).get("dist", {}).get("tarball")
    except Exception:
        continue
    if not tar:
        continue
    with open(RAW, "a") as f:
        f.write(json.dumps({"pkg": name, "latest": latest, "tarball": tar}) + "\n")
    # fetch tarball and grep for chain id inside
    tgz = "/tmp/%s.tgz" % name.replace("@", "_").replace("/", "_")
    subprocess.run(["bash", "-lc", "curl -sL -m 30 '%s' -o %s" % (tar, tgz)], capture_output=True)
    g = subprocess.run(["bash", "-lc",
        "mkdir -p %s.x && tar xzf %s -C %s.x 2>/dev/null; grep -rIn --include='*.js' --include='*.cjs' --include='*.mjs' --include='*.json' -E 'chain_id|chainId|CHAIN_ID' %s.x | head -6"
        % (tgz, tgz, tgz, tgz)], capture_output=True, text=True)
    out = g.stdout.strip()
    print("== %s@%s ==" % (name, latest))
    for ln in out.splitlines()[:6]:
        print("   ", ln[:200])
    if out:
        hits.append((name, out))
