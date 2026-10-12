#!/usr/bin/env python3
# T8-i: probe live blurt node for the working chain-id RPC method (keyless, public).
import json, subprocess

NODE = "https://blurt-rpc.saboin.com"

def probe(method, params=None):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params or [], "id": 1})
    r = subprocess.run(["bash", "-lc",
        "curl -s -m 12 -X POST -H 'Content-Type: application/json' -d '%s' %s" % (body, NODE)],
        capture_output=True, text=True)
    out = r.stdout.strip()
    try:
        d = json.loads(out)
        return method, d
    except Exception:
        return method, {"_raw": out[:160]}

for m in ["condenser_api.get_chain_id", "database_api.get_chain_id",
          "call", "condenser_api.get_dynamic_global_properties", "database_api.api.count"]:
    meth, d = probe(m if m != "call" else "call",
                    [] if m != "call" else ["database_api", "get_chain_id", []])
    s = json.dumps(d)
    print("%-46s -> %s" % (meth, s[:180]))
