#!/usr/bin/env python3
# T8-i3: probe ALL blurt nodes for get_chain_id (the lawful oracle hunt).
import json, subprocess

NODES = [
    "https://blurt-rpc.saboin.com",
    "https://rpc.blurt.world",
    "https://blurt-rpc.salvadx.net",
    "https://rpc.blurt.buzz",
    "https://blurt.lexai.host",
    "https://blurt-rpc.sensei69.net",
    "https://rpc.blurtbot.com",
    "https://api.blurt.world",
]
RAW = "/home/z/my-project/tmp/t8/nodes-chainid-probe.jsonl"
open(RAW, "w").close()

def call(node, method):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": [], "id": 1})
    r = subprocess.run(
        ["bash", "-lc", "curl -s -m 10 -X POST -H 'Content-Type: application/json' -d '%s' %s"
         % (body.replace("'", "'\\''"), node)],
        capture_output=True, text=True)
    return (r.stdout or ("ERR:" + r.stderr))[:300]

for n in NODES:
    a = call(n, "condenser_api.get_chain_id")
    b = call(n, "condenser_api.get_version")
    with open(RAW, "a") as f:
        f.write(json.dumps({"node": n, "chainid": a, "version": b}) + "\n")
    short_a = a if len(a) < 190 else a[:187] + "..."
    print("%-34s CHAINID: %s" % (n, short_a))
    print("%-34s VERSION: %s" % ("", b[:130]))
