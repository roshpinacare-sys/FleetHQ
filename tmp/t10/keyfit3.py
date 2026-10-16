#!/usr/bin/env python3
# T10 keyfit v3: POINT-LEVEL chain fit (encoding-law independent).
# v2 lesson: vault WIFs derive the exact stored points, but stored pub
# STRINGS do not verify under ripemd(sha256())[:4] - so string compare is
# unsafe (false NO-FIT). v3 fits by comparing 33-byte compressed points:
# derived(WIF) == decoded(chain pub). Also probes which checksum law
# reproduces chain pub strings. Verdict -> JSON. No private material printed.
import json, hashlib, sys, os, urllib.request

VAULT = "/tmp/vaultrev-e8owm647/x_KEYS-ZIP-2026-09-10.zip.enc/agent/keys/vault.json"
RUN = sys.argv[1] if len(sys.argv) > 1 else "1"
OUT = "/home/z/my-project/tmp/t10/keyfit-%s.json" % RUN
RPC = "https://api.steemit.com"

P = 2**256 - 2**32 - 977
G = (0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
     0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8)

def inv(a):
    return pow(a, P - 2, P)

def ecadd(p, q):
    if p is None: return q
    if q is None: return p
    if p[0] == q[0] and (p[1] + q[1]) % P == 0:
        return None
    if p == q:
        l = 3 * p[0] * p[0] % P * inv(2 * p[1] % P) % P
    else:
        l = (q[1] - p[1]) % P * inv((q[0] - p[0]) % P) % P
    x = (l * l - p[0] - q[0]) % P
    y = (l * (p[0] - x) - p[1]) % P
    return (x, y)

def ecmul(k, pt=G):
    r = None
    while k:
        if k & 1:
            r = ecadd(r, pt)
        pt = ecadd(pt, pt)
        k >>= 1
    return r

def ser_comp(pt):
    return bytes([2 + (pt[1] & 1)]) + pt[0].to_bytes(32, "big")

B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

def b58enc(b):
    n = int.from_bytes(b, "big")
    s = ""
    while n:
        n, r = divmod(n, 58)
        s = B58[r] + s
    pad = 0
    for c in b:
        if c == 0: pad += 1
        else: break
    return "1" * pad + s

def b58dec(s):
    n = 0
    for c in s:
        n = n * 58 + B58.index(c)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    pad = 0
    for c in s:
        if c == "1": pad += 1
        else: break
    return b"\x00" * pad + raw

def sha256(b):
    return hashlib.sha256(b).digest()

def ripemd(b):
    return hashlib.new("ripemd160", b).digest()

def wif_decode(w):
    raw = b58dec(w)
    data, chk = raw[:-4], raw[-4:]
    if sha256(sha256(data))[:4] != chk:
        raise ValueError("wif checksum fail")
    if data[0] != 0x80:
        raise ValueError("wif version byte")
    body = data[1:]
    comp = False
    if len(body) == 33 and body[-1] == 1:
        comp = True
        body = body[:-1]
    if len(body) != 32:
        raise ValueError("wif length")
    return body, comp

def pub_decode(s):
    """STM... -> (33-byte comp point, 4-byte chk) ; raises on bad b58 len."""
    if not isinstance(s, str) or not s.startswith("STM") or len(s) < 50:
        raise ValueError("not a steem pub")
    payload = b58dec(s[3:])
    if len(payload) != 37:
        raise ValueError("payload len %d" % len(payload))
    return payload[:33], payload[33:]

LAWS = {
    "ripemd_sha256": lambda c: ripemd(sha256(c))[:4],
    "sha256d":       lambda c: sha256(sha256(c))[:4],
    "sha256":        lambda c: sha256(c)[:4],
    "ripemd_raw":    lambda c: ripemd(c)[:4],
    "ripemd_sha256_streamprefix": lambda c: ripemd(sha256(b"STM" + c))[:4],
}

def selftest():
    r = {}
    p1 = ecmul(1)
    r["mul1G"] = (p1[0] == G[0] and p1[1] == G[1])
    p2 = ecmul(2)
    r["mul2Gx"] = p2[0] == 0xC6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5
    r["mul2Gy"] = p2[1] == 0x1AE168FEA63DC339A3C58419466CEAEEF7F632653266D0E1236431A950CFE52A
    r["ripabc"] = ripemd(b"abc").hex() == "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc"
    r["ripempty"] = ripemd(b"").hex() == "9c1185a5c5e9fc54612808977ee8f548b2258d31"
    r["b58vec"] = b58enc(bytes.fromhex(
        "00010966776006953D5567439E5E39F86A0D273BEED61967F6")
    ) == "16UwLL9Risc3QfPqBUvKofHmBQ7wMtjvM"
    priv, comp = wif_decode("KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn")
    r["wifknown"] = (int.from_bytes(priv, "big") == 1 and comp is True)
    r["pass"] = all(r.values())
    return r

def load_vault():
    v = json.loads(open(VAULT).read())
    out = []
    for a in v["accounts"]:
        u = a["username"]
        ks = a.get("keys", {})
        for chain in ("steem", "hive"):
            d = ks.get(chain)
            if isinstance(d, dict):
                for role in ("owner", "active", "posting", "memo"):
                    dd = d.get(role)
                    if isinstance(dd, dict) and isinstance(dd.get("wif"), str):
                        out.append((u, chain, role, dd["wif"]))
        for role in ("owner", "active", "posting", "memo"):
            dd = ks.get(role)
            if isinstance(dd, dict) and isinstance(dd.get("wif"), str):
                out.append((u, "steem", role, dd["wif"]))
    return out

def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method,
                       "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC, data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def chain_auth(names):
    snaps = []
    for _ in range(2):
        d = rpc("condenser_api.get_accounts", [names])
        snap = {}
        for acc in d["result"]:
            snap[acc["name"]] = {
                "owner": [k[0] for k in acc["owner"]["key_auths"]],
                "active": [k[0] for k in acc["active"]["key_auths"]],
                "posting": [k[0] for k in acc["posting"]["key_auths"]],
            }
        snaps.append(snap)
    stable = json.dumps(snaps[0], sort_keys=True) == json.dumps(snaps[1], sort_keys=True)
    return snaps[0], stable

def main():
    st = selftest()
    entries = load_vault()
    # derive points once per entry
    pts = []
    for (u, chain, role, w) in entries:
        try:
            priv, comp = wif_decode(w)
            pts.append((u, chain, role, ser_comp(ecmul(int.from_bytes(priv, "big")))))
        except Exception:
            pts.append((u, chain, role, None))
    names = sorted({e[0] for e in pts})
    auth, stable = chain_auth(names)
    # decode chain pubs to points
    chain_pts = {}
    law_votes = {}
    for u, roles in auth.items():
        chain_pts[u] = {}
        for role, pubs in roles.items():
            pl = []
            for s in pubs:
                try:
                    comp, chk = pub_decode(s)
                    pl.append(comp)
                    for lname, lf in LAWS.items():
                        if lf(comp) == chk:
                            law_votes[lname] = law_votes.get(lname, 0) + 1
                except Exception:
                    pl.append(None)
            chain_pts[u][role] = pl
    fits = []
    for (u, chain, role, pt) in pts:
        if pt is None:
            continue
        for role2 in ("owner", "active", "posting"):
            if pt in chain_pts.get(u, {}).get(role2, []):
                fits.append({"acct": u, "wif_role": role, "fits": role2})
    internal_pt = sum(1 for (u, c, r_, pt) in pts if pt is not None)
    verdict = {
        "run": RUN,
        "selftest": st,
        "vault_entries": len(entries),
        "wif_decode_ok": internal_pt,
        "wif_decode_fail": len(entries) - internal_pt,
        "chain_names": names,
        "chain_double_fetch_stable": stable,
        "chain_pub_decode_fail": sum(
            1 for u in chain_pts for role in chain_pts[u] for p in chain_pts[u][role] if p is None),
        "checksum_law_votes": law_votes,
        "fits": fits,
        "headcorner_active_fit": any(f["acct"] == "headcorner" and f["fits"] == "active" for f in fits),
        "accounts_with_active_fit": sorted({f["acct"] for f in fits if f["fits"] == "active"}),
        "accounts_with_any_fit": sorted({f["acct"] for f in fits}),
    }
    open(OUT, "w").write(json.dumps(verdict, indent=1, sort_keys=True))
    print("written", OUT)
    print("selftest_pass=%s wif_ok=%d/%d chain_decode_fail=%d fits=%d hc_active=%s active_fit=%s"
          % (st["pass"], internal_pt, len(entries),
             verdict["chain_pub_decode_fail"], len(fits),
             verdict["headcorner_active_fit"],
             ",".join(verdict["accounts_with_active_fit"]) or "NONE"))
    print("law_votes:", verdict["checksum_law_votes"])

if __name__ == "__main__":
    main()
