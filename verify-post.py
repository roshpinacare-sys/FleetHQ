#!/usr/bin/env python3
"""Verify the latest claimed post + check DEX/delegation/blurt gate state."""
import json
import urllib.request

RPC = "https://api.steemit.com"


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


res = rpc("condenser_api.get_content", ["siq", "explaining-it-broke-it-what-teaching-a-s-20261011-040953fc"])
c = res["result"]
print("=== ON-CHAIN POST VERIFICATION (siq) ===")
if c and c.get("author"):
    print("author:      ", c["author"])
    print("created:     ", c["created"])
    print("title:       ", c["title"][:80])
    print("body length: ", len(c["body"]), "chars")
    print("net_votes:   ", c["net_votes"])
    print("children:    ", c["children"])
    print("payout:      ", c.get("pending_payout_value"))
    print("tags/meta:   ", json.dumps(json.loads(c.get("json_metadata") or "{}"))[:120])
else:
    print("POST NOT FOUND ON CHAIN — claim unverified!")
