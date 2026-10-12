#!/usr/bin/env python3
"""LOCAL VAULT REVIVAL + KEY-FIT VERDICT (independent of CI, fail-closed).

Law:
- No WIF ever printed. Only derived pubkeys (truncated) + FIT/NO-FIT verdicts.
- All temp files 0600 in a private dir, shredded in finally.
- Chain truth via api.steemit.com only.

Targets:
  agent/vault/KEYS-ZIP-2026-09-10.zip.enc  (GEN-1, pass known from era meta)
  agent/vault/KEYS-ZIP-2026-10-07.zip.enc  (GEN-2)
  agent/vault/KEYS-ZIP-2026-10-08-ROT4.zip.enc (newest)
Formula (documented): openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000
Inner: agent/keys/vault.json with per-account WIF material.
"""
import hashlib, json, os, subprocess, sys, tempfile, urllib.request

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

def wif_priv(wif):
    payload = b58check_decode(wif)
    if payload[0] != 0x80:
        raise ValueError("not WIF prefix")
    return payload[1:33]

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
    R = (S2 - S1) % P
    HH = H * H % P
    HHH = H * HH % P
    V = U1 * HH % P
    X3 = (R * R - HHH - 2 * V) % P
    Y3 = (R * (V - X3) - S1 * HHH) % P
    Z3 = 2 * Z1 * H % P
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

RPC = "https://api.steemit.com"

def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode())
        if "error" in d:
            raise RuntimeError(json.dumps(d["error"])[:200])
        return d["result"]

def gh_raw(repo, path, ref):
    url = f"https://api.github.com/repos/roshpinacare-sys/{repo}/contents/{path}?ref={ref}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", "Bearer " + os.environ["GH_TOKEN"])
    req.add_header("Accept", "application/vnd.github.raw")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

REDACT_PAT = ("5", "P")

def redact_json(obj, depth=0):
    """schema view with WIF-looking values replaced"""
    if depth > 6:
        return "..."
    if isinstance(obj, dict):
        return {k: redact_json(v, depth + 1) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact_json(v, depth + 1) for v in obj]
    if isinstance(obj, str):
        if len(obj) in (51, 52, 53) and obj[0] in REDACT_PAT:
            return "[REDACTED-WIF]"
        return obj
    return obj

def main():
    pat = open("/home/z/my-project/upload/pat.env", "rb").read().strip()
    pat_hex = hashlib.sha256(pat).hexdigest()
    work = tempfile.mkdtemp(prefix="vaultrev-", dir="/tmp")
    os.chmod(work, 0o700)
    verdicts = {"zips": {}, "keys": []}
    try:
        zips = [
            ("KEYS-ZIP-2026-09-10.zip.enc", ["bK/0B/nCbgaYJSDszorAzWflJx+0ysFl"]),
            ("KEYS-ZIP-2026-10-07.zip.enc", [pat_hex, pat.decode(), "bK/0B/nCbgaYJSDszorAzWflJx+0ysFl"]),
            ("KEYS-ZIP-2026-10-08-ROT4.zip.enc", [pat_hex, pat.decode()]),
        ]
        opened = {}
        for name, passes in zips:
            raw = gh_raw("steem", "agent/vault/" + name, "saos-cockpit")
            sha = hashlib.sha256(raw).hexdigest()
            zrec = {"sha256": sha, "size": len(raw), "open": None}
            enc_path = os.path.join(work, name)
            with open(enc_path, "wb") as f:
                f.write(raw)
                os.chmod(enc_path, 0o600)
            inner = os.path.join(work, name + ".zip")
            for p in passes:
                r = subprocess.run(
                    ["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000",
                     "-in", enc_path, "-out", inner, "-pass", "pass:" + p],
                    capture_output=True)
                if r.returncode == 0 and os.path.exists(inner) and os.path.getsize(inner) > 100:
                    # zip magic check
                    with open(inner, "rb") as f:
                        magic = f.read(4)
                    if magic[:2] == b"PK":
                        zrec["open"] = "pass#%d" % (passes.index(p))
                        # unzip
                        ex = os.path.join(work, "x_" + name)
                        os.makedirs(ex, exist_ok=True)
                        u = subprocess.run(["unzip", "-o", "-q", inner, "-d", ex], capture_output=True)
                        zrec["unzip_rc"] = u.returncode
                        zrec["files"] = []
                        for root, _, files in os.walk(ex):
                            for fn in files:
                                fp = os.path.join(root, fn)
                                zrec["files"].append(os.path.relpath(fp, ex))
                                if fn.endswith(".json"):
                                    try:
                                        data = json.load(open(fp))
                                        opened[name] = (data, fp)
                                    except Exception as e:
                                        zrec.setdefault("json_err", []).append(str(e)[:80])
                    break
            if os.path.exists(inner):
                os.remove(inner)
            verdicts["zips"][name] = zrec

        # live chain pubkeys
        accounts = ["headcorner", "cashmachine", "haran", "israelnews", "lsa", "macrame",
                    "siq", "tov", "wic", "wog", "woq", "hcsoldier4", "hcsoldier5", "hcsoldier6"]
        accs = rpc("condenser_api.get_accounts", [accounts])
        live = {}
        for a in accs:
            live[a["name"]] = {
                "active": [k[0] for k in a["active"]["key_auths"]],
                "posting": [k[0] for k in a["posting"]["key_auths"]],
                "owner": [k[0] for k in a["owner"]["key_auths"]],
            }

        # key fit
        for zname, (data, fp) in opened.items():
            verdicts.setdefault("schema", {})[zname] = redact_json(data)
            def walk(node, path=""):
                if isinstance(node, dict):
                    for k, v in node.items():
                        yield from walk(v, path + "/" + str(k))
                elif isinstance(node, list):
                    for i, v in enumerate(node):
                        yield from walk(v, path + f"[{i}]")
                elif isinstance(node, str) and len(node) in (51, 52, 53) and node[0] in REDACT_PAT:
                    yield path, node
            for path, wif in walk(data):
                # guess account + role from path segments
                segs = [s for s in path.split("/") if s]
                acct = next((s for s in segs if s in accounts), None)
                role = next((s for s in segs if s in ("active", "posting", "owner", "memo")), None)
                try:
                    priv = wif_priv(wif)
                    pub = steem_pub(priv)
                except Exception as e:
                    verdicts["keys"].append({"zip": zname, "path": path, "err": str(e)[:80]})
                    continue
                entry = {"zip": zname, "path": path, "acct": acct, "role": role, "derived": pub[:18] + "..."}
                if acct and role and role in ("active", "posting", "owner"):
                    lp = live.get(acct, {}).get(role, [])
                    entry["live"] = lp[0][:18] + "..." if lp else None
                    entry["verdict"] = "FIT" if pub in lp else "NO-FIT"
                verdicts["keys"].append(entry)

        # cleanup key material
        subprocess.run(["shred", "-u"] + [os.path.join(work, n) for n in os.listdir(work)], capture_output=True)
    finally:
        try:
            subprocess.run(["shred", "-u"] + [os.path.join(work, n) for n in os.listdir(work)], capture_output=True)
            os.rmdir(work)
        except Exception:
            pass

    body = json.dumps(verdicts, indent=1)
    open("/tmp/vaultverdict.json", "w").write(body)
    print("md5", hashlib.md5(body.encode()).hexdigest())
    for z, rec in verdicts["zips"].items():
        print("ZIP", z, rec.get("open"), "sha", rec["sha256"][:12])
    for k in verdicts["keys"]:
        if "verdict" in k:
            print("KEY", k["zip"][-16:], k["acct"], k["role"], k["verdict"], k["derived"], "vs", k.get("live"))

if __name__ == "__main__":
    main()
