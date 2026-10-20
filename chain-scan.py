#!/usr/bin/env python3
"""Independent on-chain scan: headcorner delegation ops + custody stats.
Writes JSON result to /tmp/chain_scan.json and prints it."""
import json, urllib.request, hashlib

RPC = "https://api.steemit.com"

def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode())
        if "error" in d:
            raise RuntimeError(json.dumps(d["error"])[:300])
        return d["result"]

out = {}

# 1) newest op index for headcorner
hist1 = rpc("condenser_api.get_account_history", ["headcorner", -1, 1])
newest_idx = hist1[0][0]
out["newest_idx"] = newest_idx

# 2) walk back ~2000 ops in pages of 100
found_deleg = []
hist = {}
cursor = newest_idx
pages = 0
while pages < 21 and cursor >= 1:
    start = max(cursor - 99, 1)
    limit = min(100, cursor - start + 1)
    res = rpc("condenser_api.get_account_history", ["headcorner", start, limit])
    low = res[0][0]
    for idx, ev in res:
        opname, opbody = ev["op"]
        hist[opname] = hist.get(opname, 0) + 1
        if opname == "delegate_vesting_shares":
            found_deleg.append({
                "idx": idx,
                "ts": ev.get("timestamp"),
                "delegator": opbody.get("delegator"),
                "delegatee": opbody.get("delegatee"),
                "vesting_shares": opbody.get("vesting_shares"),
            })
    pages += 1
    if low <= 1:
        break
    cursor = low - 1

out["pages_scanned"] = pages
out["op_histogram"] = hist
out["delegate_ops"] = sorted(found_deleg, key=lambda x: -x["idx"])

# 3) custody account snapshot (the 10 fleet accounts + headcorner)
fleet = ["israelnews", "headcorner", "macramecorner", "woqcorner", "tovcorner",
         "lsacorner", "wiccorner", "wogcorner", "siqcorner", "cashmachinecorner"]
snap = {}
try:
    accs = rpc("condenser_api.get_accounts", [fleet])
    for a in accs:
        vs = a["vesting_shares"].split()
        dv = a["delegated_vesting_shares"].split()
        rv = a["received_vesting_shares"].split()
        snap[a["name"]] = {
            "vesting_shares": vs[0] if vs else "?",
            "delegated_out": dv[0] if dv else "?",
            "received": rv[0] if rv else "?",
            "post_count": a["post_count"],
        }
    out["fleet_snapshot"] = snap
except RuntimeError as e:
    out["fleet_snapshot_error"] = str(e)
    # retry with the names that exist (some may 404)
    ok = {}
    for name in fleet:
        try:
            a = rpc("condenser_api.get_accounts", [[name]])
            if a:
                aa = a[0]
                ok[name] = {
                    "vesting_shares": aa["vesting_shares"],
                    "delegated_out": aa["delegated_vesting_shares"],
                    "received": aa["received_vesting_shares"],
                    "post_count": aa["post_count"],
                }
        except RuntimeError as e2:
            ok[name] = "ERR " + e2
    out["fleet_snapshot"] = ok

body = json.dumps(out, indent=1)
with open("/tmp/chain_scan.json", "w") as f:
    f.write(body)
print("md5:", hashlib.md5(body.encode()).hexdigest())
print(body[:2500])
