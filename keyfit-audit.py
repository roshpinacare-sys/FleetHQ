#!/usr/bin/env python3
"""FIXED crypto + full extracted-vault key-fit audit.
Unit test: wif->pub must equal sibling recorded pub (internal consistency).
Then: compare with live chain authorities.
NEVER prints wifs. Verdicts + truncated pubs only."""
import hashlib, json, os, urllib.request

P = 2**256 - 2**32 - 977
Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

def b58d(s):
    n = 0
    for c in s:
        n = n * 58 + B58.index(c)
    b = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    pad = 0
    for c in s:
        if c == "1":
            pad += 1
        else:
            break
    return b"\x00" * pad + b

def b58e(b):
    n = int.from_bytes(b, "big")
    s = ""
    while n:
        n, r = divmod(n, 58)
        s = B58[r] + s
    pad = len(b) - len(b.lstrip(b"\x00"))
    return "1" * pad + s

def b58check_decode(s):
    raw = b58d(s)
    payload, check = raw[:-4], raw[-4:]
    if hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4] != check:
        raise ValueError("b58check mismatch")
    return payload

def jac_dbl(p):
    X1, Y1, Z1 = p
    if Y1 == 0:
        return (1, 1, 0)
    A = X1 * X1 % P
    B = Y1 * Y1 % P
    C = B * B % P
    D = 2 * ((X1 + B) ** 2 - A - C) % P
    E = 3 * A % P
    F = E * E % P
    return (F - 2 * D) % P, (E * (D - (F - 2 * D)) - 8 * C) % P, 2 * Y1 * Z1 % P

def jac_add(p1, p2):
    if p1[2] == 0:
        return p2
    if p2[2] == 0:
        return p1
    X1, Y1, Z1 = p1
    X2, Y2, Z2 = p2
    Z1Z1 = Z1 * Z1 % P
    Z2Z2 = Z2 * Z2 % P
    U1 = X1 * Z2Z2 % P
    U2 = X2 * Z1Z1 % P
    S1 = Y1 * Z2 * Z2Z2 % P
    S2 = Y2 * Z1 * Z1Z1 % P
    if U1 == U2:
        if S1 != S2:
            return (1, 1, 0)
        return jac_dbl(p1)
    H = (U2 - U1) % P
    I = (2 * H) ** 2 % P
    J = H * I % P
    r = 2 * (S2 - S1) % P
    V = U1 * J % P
    X3 = (r * r - J - 2 * V) % P
    Y3 = (r * (V - X3) - 2 * S1 * J) % P
    Z3 = ((Z1 + Z2) ** 2 - Z1Z1 - Z2Z2) * H % P
    return (X3, Y3, Z3)

def priv_to_comp(k):
    r = (1, 1, 0)
    a = (Gx, Gy, 1)
    while k:
        if k & 1:
            r = jac_add(r, a)
        a = jac_dbl(a)
        k >>= 1
    X, Y, Z = r
    if Z == 0:
        raise ValueError("infinity")
    zi = pow(Z, P - 2, P)
    zi2 = zi * zi % P
    x = X * zi2 % P
    y = Y * zi2 * zi % P
    return (b"\x03" if y & 1 else b"\x02") + x.to_bytes(32, "big")

def steem_pub(priv32):
    comp = priv_to_comp(int.from_bytes(priv32, "big"))
    check = hashlib.new("ripemd160", hashlib.sha256(comp).digest()).digest()[:4]
    return "STM" + b58e(comp + check)

def wif_priv(wif):
    payload = b58check_decode(wif)
    if payload[0] != 0x80:
        raise ValueError("bad WIF prefix")
    return payload[1:33]

RPC = "https://api.steemit.com"

def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode())
        if "error" in d:
            raise RuntimeError(json.dumps(d["error"])[:200])
        return d["result"]

ACCOUNTS = ["headcorner", "cashmachine", "haran", "israelnews", "lsa", "macrame",
            "siq", "tov", "wic", "wog", "woq", "hcsoldier4", "hcsoldier5", "hcsoldier6"]

def is_wif(s):
    return isinstance(s, str) and 50 <= len(s) <= 54 and s[0] in ("5", "P")

def walk(node, path=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, path + "/" + str(k))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, path + f"[{i}]")
    elif isinstance(node, str) and is_wif(node):
        yield path, node

def main():
    base = "/tmp/vaultrev-e8owm647/x_KEYS-ZIP-2026-09-10.zip.enc"
    accs = rpc("condenser_api.get_accounts", [ACCOUNTS])
    live = {}
    for a in accs:
        live[a["name"]] = {
            "active": [k[0] for k in a["active"]["key_auths"]],
            "posting": [k[0] for k in a["posting"]["key_auths"]],
            "owner": [k[0] for k in a["owner"]["key_auths"]],
        }

    out = {"files": {}, "results": []}

    # collect candidate (wif, context) pairs from every file
    entries = []
    for root, _, files in os.walk(base):
        for fn in files:
            fp = os.path.join(root, fn)
            rel = os.path.relpath(fp, base)
            try:
                if fn.endswith(".json"):
                    data = json.load(open(fp))
                    for path, wif in walk(data):
                        # find sibling pub within 1 level
                        entries.append({"src": rel, "path": path, "wif": wif, "data": data, "json": True})
                elif fn.endswith(".txt"):
                    lines = open(fp, errors="replace").read().splitlines()
                    out["files"][rel] = {"lines": len(lines),
                                         "shapes": [f"{i}:{len(l)}ch:{l[:3]}..." for i, l in enumerate(lines)]}
                    for i, l in enumerate(lines):
                        if is_wif(l.strip()):
                            entries.append({"src": rel, "path": f"line{i}", "wif": l.strip(), "json": False})
            except Exception as e:
                out["files"][rel] = {"err": str(e)[:100]}

    for e in entries:
        try:
            priv = wif_priv(e["wif"])
            pub = steem_pub(priv)
        except Exception as ex:
            out["results"].append({"src": e["src"], "path": e["path"], "err": str(ex)[:80]})
            continue
        rec = {"src": e["src"], "path": e["path"], "derived": pub[:20] + "...", "len": len(e["wif"])}
        # internal consistency: look for sibling pub in enclosing json
        sib = None
        if e.get("json"):
            node = e["data"]
            try:
                for part in e["path"].strip("/").split("/"):
                    part = part.split("[")[0]
                    node = node[int(part)] if part.isdigit() else node[part]
            except Exception:
                node = None
            if isinstance(node, dict):
                for k, v in node.items():
                    if isinstance(v, str) and v.startswith("STM") and len(v) > 50:
                        sib = v
                        break
        rec["sibling_pub"] = (sib[:20] + "...") if sib else None
        rec["internal"] = ("CONSISTENT" if sib == pub else ("MISMATCH" if sib else "n/a")) if sib else "n/a"
        # chain fit: which account/role does this pub match?
        fits = []
        for acct, roles in live.items():
            for role, pubs in roles.items():
                if pub in pubs:
                    fits.append(f"{acct}:{role}")
        rec["chain_fit"] = fits or "NONE"
        out["results"].append(rec)

    body = json.dumps(out, indent=1)
    open("/tmp/keyfit-verdict.json", "w").write(body)
    print("md5", hashlib.md5(body.encode()).hexdigest())
    for r in out["results"]:
        print(r.get("src"), r.get("path"), r.get("derived"), r.get("internal"), r.get("chain_fit"), r.get("err", ""))

if __name__ == "__main__":
    main()
