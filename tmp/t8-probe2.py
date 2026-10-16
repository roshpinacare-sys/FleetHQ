#!/usr/bin/env python3
# T8-i2: discover the saboin node's API surface + lawful chain-id source.
import json, subprocess

NODE = "https://blurt-rpc.saboin.com"
RAW = "/home/z/my-project/tmp/t8/chainid-probe.jsonl"

def probe(tag, method, params=None, use_call=False):
    if use_call:
        body = {"jsonrpc": "2.0", "method": "call", "params": params, "id": 1}
    else:
        body = {"jsonrpc": "2.0", "method": method, "params": params or [], "id": 1}
    r = subprocess.run(
        ["bash", "-lc", "curl -s -m 12 -X POST -H 'Content-Type: application/json' -d '%s' %s"
         % (json.dumps(body).replace("'", "'\\''"), NODE)],
        capture_output=True, text=True)
    line = json.dumps({"probe": tag, "method": method, "callParams": params if use_call else None,
                       "resp": (r.stdout or r.stderr)[:500]})
    with open(RAW, "a") as f:
        f.write(line + "\n")
    return line

open(RAW, "w").close()
tests = [
    ("get-version-cond",  "condenser_api.get_version", [], False),
    ("get-version-db",    "database_api.get_version", [], False),
    ("get-apis",          "condenser_api.get_apis", [], False),
    ("jsonrpc-methods",   "jsonrpc.get_methods", [], False),
    ("account-count",     "condenser_api.get_account_count", [], False),
    ("call-version",      None, ["condenser_api", "get_version", []], True),
    ("dbpi-count",        "database_api.api.count", [], False),
    ("dgpo",              "condenser_api.get_dynamic_global_properties", [], False),
]
for tag, m, p, uc in tests:
    print(probe(tag, m, p, uc)[:300])
