#!/usr/bin/env python3
# T8-i4: fetch the canonical BLURT chain id from official sources.
import subprocess

RAW = "/home/z/my-project/tmp/t8/blurt-chainid-sources.txt"
open(RAW, "w").close()

URLS = [
    # blurt-js (gitea, official blurtchain org) — serializer config holds the chain id
    "https://git.blurt.world/blurtchain/blurt-js/raw/branch/master/src/config.cjs",
    "https://git.blurt.world/blurtchain/blurt-js/raw/branch/master/src/config.js",
    "https://git.blurt.world/blurtchain/blurt-js/raw/branch/master/src/auth/serializer/src/operations.cjs",
    # blurtfoundation on github — chain source
    "https://raw.githubusercontent.com/blurtfoundation/blurt/master/libraries/chain/include/steem/protocol/config.hpp",
    "https://raw.githubusercontent.com/blurtfoundation/blurt/master/doc/chainid.md",
    # npm blurtjs dist (config bundled)
    "https://unpkg.com/@blurtfoundation/blurtjs@latest/src/config.cjs",
    "https://unpkg.com/@blurtfoundation/blurtjs@latest/dist/blurt.min.js",
]

def pull(url):
    r = subprocess.run(["bash", "-lc", "curl -sL -m 15 '%s' | head -c 4000" % url],
                       capture_output=True, text=True)
    return url, r.stdout

for u in URLS:
    url, body = pull(u)
    hit = ""
    for ln in body.splitlines():
        if "chain_id" in ln.lower() or "chainid" in ln.lower() or "CHAIN_ID" in ln:
            hit += ln.strip()[:200] + " || "
    with open(RAW, "a") as f:
        f.write("URL %s\nHIT %s\nHEAD %s\n\n" % (u, hit[:600] or "none", body[:200].replace("\n", " ")))
    print("%-84s -> %s" % (u.split("//")[1][:80], (hit[:180] or "no chain_id token")))
