#!/usr/bin/env python3
"""T11 Lane-1: independent chain truth vs new claims (~1,100 SP powerup wave,
headcorner 2926 SP, fleet 4,470 SP, cornerstone 102,433 HP + 13,036 HIVE).
Also pulls engine self-report (private repo) for cross-check. Output: files + tiny stdout."""
import json, os, hashlib, urllib.request, urllib.error, time

OUT = "/home/z/my-project/tmp/t11"
STEEM = "https://api.steemit.com"
HIVE = "https://api.hive.blog"

def rpc(url, params):
    body = json.dumps({"jsonrpc": "2.0", "method": "call", "params": params, "id": 1}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        d = json.loads(r.read())
    if "error" in d:
        raise RuntimeError(str(d["error"])[:200])
    return d["result"]

def steem(api, *args):
    return rpc(STEEM, ["condenser_api", api, list(args)])

def num(x):
    return float(str(x).split()[0])

def hive(api, *args):
    return rpc(HIVE, ["condenser_api", api, list(args)])

truth = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

# 1. Steem global k factor
dp = steem("get_dynamic_global_properties")
k = num(dp["total_vesting_fund_steem"]) / num(dp["total_vesting_shares"])
truth["steem_k_sp_per_vest_milli"] = round(k * 1e6, 6)

OPERATORS = ["cashmachine", "haran", "israelnews", "lsa", "macrame", "siq", "tov", "wic", "wog", "woq"]
TREASURY = ["headcorner"]
SOLDIERS = ["hcsoldier1", "hcsoldier2", "hcsoldier3", "hcsoldier4", "hcsoldier5", "hcsoldier6"]

accs = steem("get_accounts", TREASURY + OPERATORS + SOLDIERS)
truth["accounts_missing"] = [a["name"] for a in accs if a is None]
fleet = {}
for a in accs:
    if a is None:
        continue
    vests = num(a["vesting_shares"])
    recv = num(a["received_vesting_shares"])
    dele = num(a["delegated_vesting_shares"])
    sp = vests * k
    net_sp = (vests + recv - dele) * k
    fleet[a["name"]] = {
        "sp_own": round(sp, 2), "sp_recv": round(recv * k, 2), "sp_out": round(dele * k, 2),
        "sp_net": round(net_sp, 2), "post_count": a.get("post_count"),
        "last_vote": a.get("last_vote_time"), "created": a.get("created"),
    }
truth["steem_fleet"] = fleet

# 2. headcorner history: powerups/delegations today (UTC 2026-10-11) — paged (node caps 100)
def get_hist(acc, maxpages=30):
    rows, start = [], -1
    for _ in range(maxpages):
        h = steem("get_account_history", acc, start, 100)
        if not h:
            break
        rows = h + rows if start == -1 else h + rows
        low = h[0][0]
        if low <= 1:
            break
        # continue backwards: fetch from low-1
        start = low - 1
        first_ts = rows[0][1]["timestamp"]
        if first_ts < "2026-10-10T00:00:00Z":
            break
    return rows

hc = get_hist("headcorner")
ops_today = []
for idx, item in hc:
    ts = item["timestamp"]
    if ts >= "2026-10-11T00:00:00Z":
        op = item["op"]
        ops_today.append({"ts": ts, "type": op[0], "body": op[1]})
truth["headcorner_ops_today_n"] = len(ops_today)
with open(os.path.join(OUT, "headcorner-ops-today.json"), "w") as f:
    json.dump(ops_today, f, indent=1)

# 3. soldiers: incoming delegation + powerups today
soldier_ops = {}
for s in SOLDIERS:
    if s not in fleet:
        continue
    try:
        h = get_hist(s, maxpages=6)
        mine = []
        for idx, item in h:
            ts = item["timestamp"]
            if ts >= "2026-10-11T00:00:00Z":
                op = item["op"]
                mine.append({"ts": ts, "type": op[0], "body": op[1]})
        soldier_ops[s] = mine
    except Exception as e:
        soldier_ops[s] = {"error": str(e)[:120]}
with open(os.path.join(OUT, "soldier-ops-today.json"), "w") as f:
    json.dump(soldier_ops, f, indent=1)

# 4. Hive cornerstone claim
try:
    ca = hive("get_accounts", ["cornerstone"])
    if ca:
        c = ca[0]
        hv = num(c["vesting_shares"])
        hdp = hive("get_dynamic_global_properties")
        hk = num(hdp["total_vesting_fund_hive"]) / num(hdp["total_vesting_shares"])
        truth["hive_cornerstone"] = {"hp": round(hv * hk, 1), "liquid_hive": round(num(c["balance"]), 1)}
except Exception as e:
    truth["hive_cornerstone"] = {"error": str(e)[:150]}

# 5. engine self-report (private steem repo) for cross-check
TOK = open("/home/z/my-project/upload/pat.env", "rb").read().decode().replace("\r", "").strip()
TOK = "".join(TOK.split())
def gh_raw(repo, path, ref):
    url = f"https://api.github.com/repos/roshpinacare-sys/{repo}/contents/{path}?ref={ref}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Accept", "application/vnd.github.raw")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""

st, b = gh_raw("steem", "mini-services/saos-engine/state/delegation-last.json", "saos-cockpit")
if st == 200:
    with open(os.path.join(OUT, "delegation-last.json"), "wb") as f:
        f.write(b)
    truth["engine_selfreport_status"] = 200
else:
    truth["engine_selfreport_status"] = st

st, b = gh_raw("saos-runtime", "learning/blurt/revival-20261011T185647Z.json", "main")
if st == 200:
    with open(os.path.join(OUT, "blurt-revival-latest.json"), "wb") as f:
        f.write(b)
    truth["blurt_receipt_status"] = 200
else:
    truth["blurt_receipt_status"] = st

with open(os.path.join(OUT, "chain-truth.json"), "w") as f:
    json.dump(truth, f, indent=1)

# tiny stdout
print("k=", truth["steem_k_sp_per_vest_milli"], "SP/vest-1e6")
for name in ["headcorner"] + SOLDIERS:
    if name in fleet:
        print(name, fleet[name]["sp_net"], "netSP")
tot = round(sum(v["sp_net"] for v in fleet.values()), 1)
print("fleet_total_net_SP:", tot)
print("hive_cornerstone:", truth.get("hive_cornerstone"))
