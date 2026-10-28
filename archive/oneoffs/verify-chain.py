#!/usr/bin/env python3
"""Verify claimed broadcasts against the REAL Steem chain via public RPC."""
import json
import sys
import urllib.request

RPC = "https://api.steemit.com"


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    accounts = ["israelnews", "headcorner", "macrame", "woq", "tov", "lsa", "wic", "wog", "siq", "cashmachine"]
    print("=== account existence + vesting (VERIFIED-VS-CHAIN) ===")
    try:
        res = rpc("condenser_api.get_accounts", [accounts])
        for a in res["result"]:
            if a is None:
                print("  MISSING on chain")
                continue
            vest = int(a["vesting_shares"].split()[0].replace(".", ""))
            print(f"  {a['name']:14} created:{a['created'][:10]} vesting:{a['vesting_shares']:>18} post_count:{a['post_count']:>5} last_vote:{a['last_vote_time'][:16]}")
    except Exception as e:
        print("  RPC FAILED:", e)
        sys.exit(1)

    print()
    print("=== israelnews: last 8 history ops (verify the 13:20 comment txid) ===")
    try:
        res = rpc("condenser_api.get_account_history", ["israelnews", -1, 8])
        for block, op in res["result"]:
            opd = op["op"]
            if opd[0] == "comment":
                v = opd[1]
                print(f"  block {block} COMMENT | author:{v.get('author')} permlink:{v.get('permlink','')[:40]} | body_len:{len(v.get('body',''))} | parent:{v.get('parent_permlink','')[:24]}")
            elif opd[0] == "vote":
                v = opd[1]
                print(f"  block {block} VOTE | voter:{v.get('voter')} -> {v.get('author')}/{str(v.get('permlink'))[:28]} weight:{v.get('weight')}")
            else:
                print(f"  block {block} {opd[0]}")
    except Exception as e:
        print("  RPC FAILED:", e)


if __name__ == "__main__":
    main()
