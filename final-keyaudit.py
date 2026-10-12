#!/usr/bin/env python3
"""FINAL key audit - atomic one-line results, no parsing ambiguity.
For each wif candidate in the REAL extracted vault:
  derive pub; find sibling pub (parent object scan);
  internal = derived==sibling;
  chain fit vs live authorities (fetched fresh in-process).
Output: /tmp/final-keylines.txt (one line per candidate) + /tmp/final-summary.json
Prints ONLY the summary lines."""
import hashlib, json, os, urllib.request

BASE = "/tmp/vaultrev-e8owm647/x_KEYS-ZIP-2026-09-10.zip.enc"
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

def b58c_dec(s):
    raw = b58d(s)
    if hashlib.sha256(hashlib.sha256(raw[:-4]).digest()).digest()[:4] != raw[-4:]:
        raise ValueError("b58check")
    return raw[:-4]

def jac_dbl(pt):
    X1, Y1, Z1 = pt
    A = X1 * X1 % P
    B = Y1 * Y1 % P
    C = B * B % P
    D = 2 * ((X1 + B) ** 2 - A - C) % P
    E = 3 * A % P
    F = E * E % P
    X3 = (F - 2 * D) % P
    Y3 = (E * (D - X3) - 8 * C) % P
    Z3 = 2 * Y1 * Z1 % P
    return (X3, Y3, Z3)

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

def derive(wif):
    priv = b58c_dec(wif)
    if priv[0] != 0x80:
        raise ValueError("prefix")
    k = int.from_bytes(priv[1:33], "big")
    r = (1, 1, 0)
    a = (Gx, Gy, 1)
    while k:
        if k & 1:
            r = jac_add(r, a)
        a = jac_dbl(a)
        k >>= 1
    X, Y, Z = r
    zi = pow(Z, P - 2, P)
    zi2 = zi * zi % P
    x = X * zi2 % P
    y = Y * zi2 * zi % P
    comp = (b"\x03" if y & 1 else b"\x02") + x.to_bytes(32, "big")
    chk = hashlib.new("ripemd160", hashlib.sha256(comp).digest()).digest()[:4]
    return "STM" + b58e(comp + chk)

def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request("https://api.steemit.com", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode())
        if "error" in d:
            raise RuntimeError(json.dumps(d["error"])[:200])
        return d["result"]

def is_wif(s):
    return isinstance(s, str) and 50 <= len(s) <= 54 and s[0] in ("5", "P") and all(c in "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz" for c in s[1:])

def scan_json(node, parent=None, key=None, path=""):
    """yield (wif, parent_dict, path)"""
    if isinstance(node, dict):
        for k, v in node.items():
            if is_wif(v):
                yield (v, node, path + "/" + k)
            else:
                yield from scan_json(v, node, k, path + "/" + k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from scan_json(v, parent, key, path + f"[{i}]")

def main():
    accs = rpc("condenser_api.get_accounts", [
        ["headcorner", "cashmachine", "haran", "israelnews", "lsa", "macrame", "siq",
         "tov", "wic", "wog", "woq", "hcsoldier4", "hcsoldier5", "hcsoldier6"]])
    live = {}
    for a in accs:
        for role in ("owner", "active", "posting"):
            for kp in a[role]["key_auths"]:
                live.setdefault(kp[0], []).append(f"{a['name']}:{role}")

    lines = []
    fits = []
    internal_ok = 0
    internal_total = 0
    candidates = []

    for root, _, files in os.walk(BASE):
        for fn in sorted(files):
            fp = os.path.join(root, fn)
            rel = os.path.relpath(fp, BASE)
            if fn.endswith(".json"):
                try:
                    data = json.load(open(fp))
                except Exception as e:
                    lines.append(f"{rel} JSON-ERR {str(e)[:60]}")
                    continue
                for wif, parent, path in scan_json(data):
                    candidates.append((rel, path, wif, parent))
            elif fn.endswith(".txt"):
                for i, ln in enumerate(open(fp, errors="replace").read().splitlines()):
                    s = ln.strip()
                    # try "LABEL: value" and bare wif
                    val = None
                    if ":" in s:
                        val = s.split(":", 1)[1].strip()
                    if is_wif(s):
                        candidates.append((rel, f"L{i}", s, None))
                    elif val and is_wif(val):
                        candidates.append((rel, f"L{i}:{s.split(':')[0][:12]}", val, None))

    for rel, path, wif, parent in candidates:
        try:
            pub = derive(wif)
        except Exception as e:
            lines.append(f"{rel}{path} ERR {str(e)[:40]}")
            continue
        sib = None
        if isinstance(parent, dict):
            for k, v in parent.items():
                if isinstance(v, str) and v.startswith("STM") and len(v) >= 50 and k != "wif":
                    sib = v
                    break
        internal = "n/a"
        if sib:
            internal_total += 1
            internal = "OK" if sib == pub else "BAD"
            if sib == pub:
                internal_ok += 1
        fit = ",".join(live.get(pub, [])) or "NONE"
        if fit != "NONE":
            fits.append(f"{rel}{path} -> {fit}")
        lines.append(f"{rel}{path} len={len(wif)} pub={pub[:16]}.. internal={internal} chain={fit}")

    open("/tmp/final-keylines.txt", "w").write("\n".join(lines) + "\n")
    summary = {"candidates": len(candidates), "internal_total": internal_total,
               "internal_ok": internal_ok, "chain_fits": fits}
    open("/tmp/final-summary.json", "w").write(json.dumps(summary, indent=1))
    print("CANDIDATES", len(candidates), "| internal_consistent", internal_ok, "/", internal_total)
    for f in fits:
        print("CHAIN-FIT:", f)
    if not fits:
        print("CHAIN-FIT: NONE of the extracted wifs match any live authority")

if __name__ == "__main__":
    main()
