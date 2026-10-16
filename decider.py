#!/usr/bin/env python3
"""DECIDER: scan DELEGATEE accounts' recent history for delegate_vesting_shares
ops with delegator=headcorner. Also re-scan headcorner's newest 300 ops.
Writes /tmp/decider.json; prints md5 + facts."""
import json, urllib.request, hashlib

RPC = "https://api.steemit.com"

def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode())
        if "error" in d:
            raise RuntimeError(json.dumps(d["error"])[:200])
        return d["result"]

FLEET = ["cashmachine", "haran", "israelnews", "lsa", "macrame", "siq", "tov",
         "wic", "wog", "woq", "hcsoldier4", "hcsoldier5", "hcsoldier6"]

out = {"delegatee_hits": {}, "headcorner_recent_deleg": [], "hcsoldier4": {}}

for name in FLEET + ["headcorner"]:
    try:
        newest = rpc("condenser_api.get_account_history", [name, -1, 1])[0][0]
        start = max(newest - 299, 1)
        res = rpc("condenser_api.get_account_history", [name, start, min(300, newest - start + 1)])
        hits = []
        for idx, ev in res:
            opname, opbody = ev["op"]
            if opname == "delegate_vesting_shares":
                hits.append({
                    "idx": idx, "ts": ev.get("timestamp"),
                    "delegator": opbody.get("delegator"),
                    "delegatee": opbody.get("delegatee"),
                    "vests": opbody.get("vesting_shares"),
                })
        if name == "headcorner":
            out["headcorner_recent_deleg"] = sorted(hits, key=lambda x: -x["idx"])[:10]
        else:
            out["delegatee_hits"][name] = {"scanned": len(res), "newest_idx": newest, "hits": hits[:5]}
    except Exception as e:
        out["delegatee_hits"][name] = {"error": str(e)[:150]}

# hcsoldier4 posting evidence
try:
    a = rpc("condenser_api.get_accounts", [["hcsoldier4"]])[0]
    out["hcsoldier4"] = {"post_count": a["post_count"], "last_vote_time": a["last_vote_time"],
                         "received": a["received_vesting_shares"]}
    disc = rpc("condenser_api.get_discussions_by_blog", [{"tag": "hcsoldier4", "limit": 3}])
    out["hcsoldier4"]["recent_posts"] = [[p["permlink"], p["created"], p["author"]] for p in disc]
except Exception as e:
    out["hcsoldier4"]["error"] = str(e)[:150]

body = json.dumps(out, indent=1)
open("/tmp/decider.json", "w").write(body)
print("md5", hashlib.md5(body.encode()).hexdigest())
total_hits = sum(len(v.get("hits", [])) for k, v in out["delegatee_hits"].items() if isinstance(v, dict))
print("delegatee_hits_total", total_hits)
print("headcorner_recent_deleg", len(out["headcorner_recent_deleg"]))
for k, v in out["delegatee_hits"].items():
    if isinstance(v, dict) and v.get("hits"):
        print("HIT", k, v["hits"])
print("hcsoldier4", out["hcsoldier4"].get("post_count"), out["hcsoldier4"].get("recent_posts"))
