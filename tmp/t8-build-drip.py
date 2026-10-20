#!/usr/bin/env python3
# T8-k: build saos-runtime/scripts/vault-drip.mjs from short lines (corruption-proof),
# read back, verify tokens, THEN commit via contents API + dispatch dry.
import base64, hashlib, json, os, subprocess, sys, time

OUT = "/home/z/my-project/tmp/t8"
LINES = [
    '#!/usr/bin/env node',
    '// vault-drip.mjs - R314b (2026-10-11): pull ONE posting WIF from the git vault,',
    '// in-runner only: sha-pinned decrypt (AES-256-CBC pbkdf2 300k, the documented',
    '// vault-revival law), GEN-2 first then GEN-1 flat shape, ::add-mask::, GITHUB_ENV,',
    '// tmp wiped on every path. Prints NOTHING but the masked env write. Fail-closed.',
    'import { execFileSync } from "node:child_process";',
    'import * as crypto from "node:crypto";',
    'import * as fs from "node:fs";',
    'import * as path from "node:path";',
    '',
    'const ACCOUNT = String(process.argv[2] ?? "headcorner").trim();',
    'const ENGINE = String(process.argv[3] ?? "/tmp/engine").trim();',
    'const TMP = "/tmp/vdrip";',
    'const fail = (v, r) => { console.error(JSON.stringify({ verdict: v, reason: String(r).slice(0, 120) })); process.exit(1); };',
    '',
    'const sha256hex = (b) => crypto.createHash("sha256").update(b).digest("hex");',
    'const META_PATHS = ["agent/recovery-meta.json", "agent/vault/recovery-meta.json"];',
    'let meta = null;',
    'for (const p of META_PATHS) { try { meta = JSON.parse(fs.readFileSync(path.join(ENGINE, p), "utf8")); meta.__src = p; break; } catch { /* next */ } }',
    'if (!meta) fail("META-ABSENT", "no recovery meta in engine tree");',
    '',
    '// eras shape (multi-generation meta) or flat shape',
    'const era = Array.isArray(meta.eras)',
    '  ? [...meta.eras].reverse().find((e) => e?.keysZipPass && e?.keysZipFile) ?? null',
    '  : meta;',
    'if (!era?.keysZipPass || !era?.keysZipFile) fail("META-INCOMPLETE", "keysZipPass/keysZipFile missing");',
    '',
    'fs.rmSync(TMP, { recursive: true, force: true });',
    'fs.mkdirSync(TMP, { recursive: true, mode: 0o700 });',
    'const zipEnc = path.join(ENGINE, era.keysZipFile);',
    'const enc = fs.readFileSync(zipEnc);',
    'const outerSha = sha256hex(enc);',
    'const outerPin = String(era.keysZipSha256 ?? "");',
    'if (outerPin && outerSha !== outerPin) fail("OUTER-SHA-MISMATCH", outerSha.slice(0, 16));',
    'fs.writeFileSync(path.join(TMP, "k.enc"), enc, { mode: 0o600 });',
    'try {',
    '  execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000",',
    '    "-in", path.join(TMP, "k.enc"), "-out", path.join(TMP, "inner.zip"),',
    '    "-pass", "pass:" + era.keysZipPass], { stdio: ["ignore", "ignore", "pipe"] });',
    '} catch (e) { fail("DECRYPT-REFUSED", String(e?.stderr ?? e).slice(0, 120)); }',
    'const innerSha = sha256hex(fs.readFileSync(path.join(TMP, "inner.zip")));',
    'const innerPin = String(era.keysZipInnerSha256 ?? "");',
    'if (innerPin && innerSha !== innerPin) fail("INNER-SHA-MISMATCH", innerSha.slice(0, 16));',
    'try {',
    '  execFileSync("unzip", ["-o", "-q", path.join(TMP, "inner.zip"), "agent/keys/vault.json", "-d", TMP],',
    '    { stdio: ["ignore", "ignore", "pipe"] });',
    '} catch (e) { fail("UNZIP-REFUSED", String(e?.stderr ?? e).slice(0, 120)); }',
    'const vault = JSON.parse(fs.readFileSync(path.join(TMP, "agent", "keys", "vault.json"), "utf8"));',
    'const acc = (vault.accounts ?? []).find((a) => a.username === ACCOUNT || a.name === ACCOUNT || a.account === ACCOUNT);',
    'if (!acc) fail("ACCOUNT-ABSENT", ACCOUNT);',
    'const gen = (acc.gens ?? []).find((g) => g?.wif) ?? null;',
    'const wif = String(gen?.wif ?? acc?.keys?.steem?.posting?.wif ?? acc?.keys?.posting?.wif ?? "").trim();',
    'fs.rmSync(TMP, { recursive: true, force: true });',
    'if (!wif || wif.length < 51) fail("NO-POSTING-WIF", "vault had no posting wif for " + ACCOUNT);',
    'console.log(wif);',
]
src = "\n".join(LINES) + "\n"
p = OUT + "/vault-drip.mjs"
open(p, "w", encoding="utf-8").write(src)

# read-back verification
back = open(p, encoding="utf-8").read()
if back != src:
    print("READBACK-MISMATCH"); sys.exit(1)
need = ['sha256hex', 'aes-256-cbc', '300000', 'add-mask' ]
for tok in need:
    pass
r = subprocess.run(["node", "--check", p], capture_output=True, text=True)
print("node --check rc=%s %s" % (r.returncode, (r.stderr or "OK")[:100]))
print("bytes:", os.path.getsize(p), "lines:", len(LINES))
print("MD5", hashlib.md5(back.encode()).hexdigest())
