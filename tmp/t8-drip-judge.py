#!/usr/bin/env python3
# T8-m: chain-judge the vault drip — try every generation's posting WIF against
# the LIVE blurt posting authority (saboin, keyless), emit the fitting one.
import base64, hashlib, json, os, subprocess, sys, time

T8 = "/home/z/my-project/tmp/t8"
drip = T8 + "/vault-drip.mjs"
src = open(drip, encoding="utf-8").read()

OLD_TAIL = """const vault = JSON.parse(fs.readFileSync(path.join(TMP, "agent", "keys", "vault.json"), "utf8"));
const acc = (vault.accounts ?? []).find((a) => a.username === ACCOUNT || a.name === ACCOUNT || a.account === ACCOUNT);
if (!acc) fail("ACCOUNT-ABSENT", ACCOUNT);
const gen = (acc.gens ?? []).find((g) => g?.wif) ?? null;
const wif = String(gen?.wif ?? acc?.keys?.steem?.posting?.wif ?? acc?.keys?.posting?.wif ?? "").trim();
fs.rmSync(TMP, { recursive: true, force: true });
if (!wif || wif.length < 51) fail("NO-POSTING-WIF", "vault had no posting wif for " + ACCOUNT);
console.log(wif);"""

NEW_TAIL = """const vault = JSON.parse(fs.readFileSync(path.join(TMP, "agent", "keys", "vault.json"), "utf8"));
const acc = (vault.accounts ?? []).find((a) => a.username === ACCOUNT || a.name === ACCOUNT || a.account === ACCOUNT);
if (!acc) fail("ACCOUNT-ABSENT", ACCOUNT);
// candidates: every generation first (GEN-2, GEN-1, ...), then the flat shape.
const cands = [...(acc.gens ?? []).map((g) => ({ gen: g?.gen ?? "?", wif: String(g?.wif ?? "").trim() })),
  { gen: "flat", wif: String(acc?.keys?.steem?.posting?.wif ?? acc?.keys?.posting?.wif ?? "").trim() }]
  .filter((c) => c.wif.length >= 51);
if (!cands.length) fail("NO-POSTING-WIF", "vault had no posting wif for " + ACCOUNT);

// CHAIN-JUDGE (the chain is the only judge - the R267 law): the fitting
// generation is the one whose derived pubkey equals the LIVE blurt posting
// authority. Blurt was never re-keyed to GEN-2 (R267 measured 4/4 GEN-1),
// so generation order alone lies - the chain decides.
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58checkEncode(bytes) {
  const h = crypto.createHash("sha256").update(crypto.createHash("sha256").update(bytes).digest()).digest().subarray(0, 4);
  const all = Buffer.concat([bytes, h]);
  let n = BigInt("0x" + all.toString("hex")), out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of all) { if (b === 0) out = "1" + out; else break; }
  return out;
}
const secp = await import("@noble/secp256k1");
async function chainJudge(wifHex) {
  const priv = Buffer.from(wifHex, "hex");
  const pub = Buffer.from(secp.getPublicKey(priv, true));
  const blt = "BLT" + b58checkEncode(pub);
  const r = await fetch("https://blurt-rpc.saboin.com", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "condenser_api.get_accounts", params: [[ACCOUNT]] }),
    signal: AbortSignal.timeout(12000),
  });
  const j = await r.json();
  if (j.error) throw new Error(String(j.error?.message ?? "rpc").slice(0, 80));
  const live = j.result?.[0]?.posting?.key_auths?.[0]?.[0] ?? "";
  return { blt, live, match: blt === live };
}
fs.rmSync(TMP, { recursive: true, force: true }); // wipe BEFORE network judging
const tried = [];
let chosen = null;
for (const c of cands) {
  let privHex;
  try {
    const raw = crypto.createHash("sha256").update(Buffer.from(c.wif, "utf8")).digest(); // never - decode properly below
    privHex = null; // placeholder, replaced by real WIF decode
  } catch { privHex = null; }
}
// real WIF decode: base58check strip 0x80 prefix
function wifPriv(w) {
  const raw = (() => {
    let n2 = 0n;
    for (const ch of w) { const i = B58.indexOf(ch); if (i < 0) throw new Error("b58"); n2 = n2 * 58n + BigInt(i); }
    let hx = n2.toString(16).padStart(2, "0");
    if (hx.length % 2) hx = "0" + hx;
    return Buffer.from(hx, "hex");
  })();
  const body = raw.subarray(0, raw.length - 4);
  const chk = raw.subarray(raw.length - 4);
  const h = crypto.createHash("sha256").update(crypto.createHash("sha256").update(body).digest()).digest().subarray(0, 4);
  if (!h.equals(chk)) throw new Error("wif-checksum");
  if (body[0] !== 0x80) throw new Error("wif-prefix");
  return body.subarray(1);
}
for (const c of cands) {
  try {
    const priv = wifPriv(c.wif);
    const j = await chainJudge(priv);
    tried.push({ gen: c.gen, match: j.match, pub8: j.blt.slice(0, 11) });
    if (j.match) { chosen = c; break; }
  } catch (e) { tried.push({ gen: c.gen, err: String(e?.message ?? e).slice(0, 60) }); }
}
if (!chosen) fail("NO-GEN-FITS-CHAIN", JSON.stringify(tried).slice(0, 160));
console.log(chosen.wif);"""

if src.count(OLD_TAIL) != 1:
    print("tail anchor count=%d" % src.count(OLD_TAIL)); sys.exit(1)
src = src.replace(OLD_TAIL, NEW_TAIL)
# remove the dead placeholder loop I embedded (unlawful dead code)
DEAD = """const tried = [];
let chosen = null;
for (const c of cands) {
  let privHex;
  try {
    const raw = crypto.createHash("sha256").update(Buffer.from(c.wif, "utf8")).digest(); // never - decode properly below
    privHex = null; // placeholder, replaced by real WIF decode
  } catch { privHex = null; }
}
// real WIF decode: base58check strip 0x80 prefix"""
if src.count(DEAD) != 1:
    print("dead anchor count=%d" % src.count(DEAD)); sys.exit(1)
src = src.replace(DEAD, "// real WIF decode: base58check strip 0x80 prefix")
open(drip, "w", encoding="utf-8").write(src)
r = subprocess.run(["node", "--check", drip], capture_output=True, text=True)
print("node --check rc=%s %s" % (r.returncode, (r.stderr or "OK")[:160]))
print("bytes:", os.path.getsize(drip))
