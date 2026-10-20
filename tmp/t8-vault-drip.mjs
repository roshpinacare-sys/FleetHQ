#!/usr/bin/env node
// vault-drip.mjs — T8 · vault-first credential drip for the blurt lane.
// Law: the git vault IS the credential delivery (ci-cycle.mjs header law; the
// same law the R314b delegation rail fix uses). The runner decrypts the
// sha-pinned vault (AES-256-CBC pbkdf2 300k — vault-revival.mjs formula),
// extracts ONE account's posting WIF (GEN-2 first, GEN-1 fallback), prints it
// to stdout ONLY. Caller must ::add-mask:: it before capture. The plaintext
// tmp never outlives this process (0700 dir, wiped on all paths).
//
// usage: node vault-drip.mjs <account> [engine-dir]
//   engine-dir = a checkout of steem@saos-cockpit containing agent/vault + agent/recovery-meta.json
// exit 0 + wif on stdout, or exit 1 with a verdict JSON on stdout (fail-closed).
import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const account = String(process.argv[2] ?? "").trim();
const engine = path.resolve(String(process.argv[3] ?? "."));
const fail = (verdict, reason) => {
  console.log(JSON.stringify({ verdict, reason: String(reason).slice(0, 140) }));
  process.exit(1);
};
if (!/^[a-z0-9\-.]{3,16}$/.test(account)) fail("DRIP-REFUSED", "bad account name");

const META_CANDIDATES = ["agent/recovery-meta.json", "agent/vault/recovery-meta.json"];
const ZIPS = [
  { gen: "GEN-2", zip: "agent/vault/KEYS-ZIP-2026-10-07.zip.enc" },
  { gen: "GEN-1", zip: "agent/vault/KEYS-ZIP-2026-09-10.zip.enc" },
];

const sha256hex = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
let meta = null;
for (const p of META_CANDIDATES) {
  const full = path.join(engine, p);
  try { meta = JSON.parse(fs.readFileSync(full, "utf8")); meta.__src = p; break; } catch { /* next */ }
}
if (!meta) fail("DRIP-REFUSED", "recovery-meta.json not found in engine tree");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "drip-"));
fs.chmodSync(TMP, 0o700);
let wif = null, usedGen = null, errors = [];
try {
  for (const c of ZIPS) {
    try {
      const zipPath = String(meta.keysZipFile ?? c.zip);
      const encPath = path.join(engine, zipPath);
      const enc = fs.readFileSync(encPath);
      if (sha256hex(enc) !== String(meta.keysZipSha256 ?? "")) throw new Error("outer-sha-mismatch");
      const encTmp = path.join(TMP, "k.enc"), innerTmp = path.join(TMP, "k.zip");
      fs.writeFileSync(encTmp, enc, { mode: 0o600 });
      execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000",
        "-in", encTmp, "-out", innerTmp, "-pass", `pass:${meta.keysZipPass}`],
        { stdio: ["ignore", "ignore", "pipe"] });
      const inner = fs.readFileSync(innerTmp);
      if (sha256hex(inner) !== String(meta.keysZipInnerSha256 ?? "")) throw new Error("inner-sha-mismatch");
      const outDir = path.join(TMP, "opened");
      execFileSync("unzip", ["-o", "-q", innerTmp, "agent/keys/vault.json", "-d", outDir],
        { stdio: ["ignore", "ignore", "pipe"] });
      const vault = JSON.parse(fs.readFileSync(path.join(outDir, "agent", "keys", "vault.json"), "utf8"));
      const acc = (vault.accounts ?? []).find((a) => a.username === account || a.name === account);
      if (!acc) throw new Error("account-absent-in-vault");
      // dual-gen shape first (gens[], newest first), then flat keys shape
      const g = (acc.gens ?? []).find((x) => x?.wif);
      const flat = acc?.keys?.steem?.posting?.wif ?? acc?.keys?.posting?.wif ?? null;
      wif = (g?.wif ?? flat ?? "").trim() || null;
      usedGen = g?.gen ?? "flat";
      if (wif) break;
      throw new Error("no-posting-wif-in-generation");
    } catch (e) {
      errors.push(`${c.gen}:${String(e?.message ?? e).slice(0, 60)}`);
    }
  }
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* wipe is best-effort */ }
}
if (!wif) fail("DRIP-EMPTY", errors.join(" | ") || "no generation yielded a posting wif");
console.log(wif);
