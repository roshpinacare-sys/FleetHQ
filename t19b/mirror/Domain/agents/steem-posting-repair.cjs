#!/usr/bin/env node
/**
 * steem-posting-repair.cjs — recovery of the fleet's STEEM posting identities.
 *
 * Context (measured 2026-10-07): the hourly anchor line (weave-anchor-lines)
 * refuses honestly — WEAVE_STEEM_WIF in the Domain vault no longer matches the
 * live posting authority of ANY fleet account. The vault map SA_FLEET_KEYS
 * (base64 → {username: postingWif}, 11 entries) was never matched against the
 * live chain for the STEEM posting role. This desk does exactly that match,
 * and in repair mode relays the matched WIF into WEAVE_STEEM_WIF and
 * re-dispatches the anchor line.
 *
 * Honesty law: WIFs never printed, never logged, never written to disk.
 * Only PUBLIC keys (derivable) and chain-visible authorities are printed.
 *
 * Modes:
 *   check   — match table only (pub → matched chain account or -)
 *   repair  — check + sealed-box PUT into WEAVE_STEEM_WIF + dispatch the line
 *
 * Env: SA_FLEET_KEYS · WEAVE_OPS_PAT · REPAIR_MODE (check|repair)
 */

const dhive = require("@hiveio/dhive");
const sodium = require("libsodium-wrappers");
const bs58 = require("bs58");
const crypto = require("crypto");

const PAT = process.env.WEAVE_OPS_PAT || "";
const MODE = (process.env.REPAIR_MODE || "check").toLowerCase();
const REPO = process.env.REPAIR_REPO || "roshpinacare-sys/Domain";
const TARGET_SECRET = process.env.REPAIR_TARGET || "WEAVE_STEEM_WIF";
const DISPATCH_WF = process.env.REPAIR_DISPATCH || "weave-anchor-lines.yml";
const ANCHOR_FLEET = ["cashmachine", "headcorner", "lsa"];

function fail(code, he) {
  console.log(`[repair] ✗ ${code} — ${he}`);
  process.exit(1);
}

// normalize any Graphene-family WIF into a dhive-parseable WIF.
// Measured forms: 37 bytes (version+scalar+chk) and 38 bytes
// (version+scalar+0x01-compressed-flag+chk — the LIVE fleet keys' form).
// The private SCALAR is chain-agnostic (same curve) — re-stamp 0x80.
function wifNormalized(wif) {
  try {
    const bytes = bs58.decode(wif.trim());
    if (bytes.length !== 37 && bytes.length !== 38) return null;
    const chk = crypto.createHash("sha256").update(
      crypto.createHash("sha256").update(bytes.subarray(0, bytes.length - 4)).digest()
    ).digest().subarray(0, 4);
    if (!chk.equals(bytes.subarray(bytes.length - 4))) return null;
    const body = Buffer.concat([Buffer.from([0x80]), bytes.subarray(1, 33)]);
    const chk2 = crypto.createHash("sha256").update(
      crypto.createHash("sha256").update(body).digest()
    ).digest().subarray(0, 4);
    return bs58.encode(Buffer.concat([body, chk2]));
  } catch {
    return null;
  }
}

async function gh(path, method = "GET", body = null) {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `token ${PAT}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return r;
}

async function steemAccounts(names) {
  const r = await fetch("https://api.steemit.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "condenser_api.get_accounts",
      params: [names],
    }),
  });
  const j = await r.json();
  if (j.error) fail("steem-rpc", JSON.stringify(j.error).slice(0, 120));
  return j.result || [];
}

(async () => {
  await sodium.ready;

  const raw = process.env.SA_FLEET_KEYS || "";
  if (!raw) fail("no-vault", "SA_FLEET_KEYS absent — nothing to match");
  let map;
  try {
    map = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch (e) {
    fail("vault-parse", String(e.message).slice(0, 120));
  }
  const entries = Object.entries(map).filter(([, w]) => typeof w === "string" && w.length > 40);
  if (!entries.length) fail("vault-empty", "no usable entries in the vault map");

  // derive public keys (public information — safe to print)
  const cands = [];
  for (const [username, wif] of entries) {
    const norm = wifNormalized(wif);
    try {
      if (!norm) throw new Error("bad checksum/length");
      const pub = new dhive.PrivateKey(norm).createPublic("STM").toString();
      cands.push({ username, pub });
    } catch {
      cands.push({ username, pub: null });
    }
  }

  // live authorities for every vault username + the anchor trio
  const names = Array.from(new Set([...entries.map(([u]) => u), ...ANCHOR_FLEET]));
  const accs = await steemAccounts(names);
  const auth = new Map();
  for (const a of accs) {
    auth.set(a.name, {
      posting: ((a.posting && a.posting.key_auths) || []).map((k) => k[0]),
      active: ((a.active && a.active.key_auths) || []).map((k) => k[0]),
    });
  }

  console.log(`[repair] vault entries: ${cands.length} · mode: ${MODE}`);
  // shape diagnostics — lengths/categories ONLY, zero secret content
  for (const [username, wif] of entries) {
    let decoded = null, chkOk = false;
    try {
      decoded = bs58.decode(wif.trim());
      const chk = crypto.createHash("sha256").update(
        crypto.createHash("sha256").update(decoded.subarray(0, decoded.length - 4)).digest()
      ).digest().subarray(0, 4);
      chkOk = chk.equals(decoded.subarray(decoded.length - 4));
    } catch { /* not base58 */ }
    console.log(`  · shape @${username}: strlen=${wif.length} head="${wif.slice(0, 2)}" b58bytes=${decoded ? decoded.length : "no"} checksum=${chkOk ? "ok" : "bad"}`);
  }
  console.log("[repair] MATCH TABLE (public keys + chain authorities only):");
  const matched = [];
  for (const c of cands) {
    if (!c.pub) {
      console.log(`  · @${c.username}: unparsable-as-STEEM (probably another chain's encoding)`);
      continue;
    }
    let hit = null;
    for (const [acc, a] of auth) {
      if (a.posting.includes(c.pub)) { hit = { account: acc, role: "posting" }; break; }
      if (a.active.includes(c.pub)) { hit = { account: acc, role: "active" }; break; }
    }
    console.log(`  · @${c.username}: ${c.pub.slice(0, 14)}… → ${hit ? `LIVE ${hit.role} of @${hit.account}` : "no live match"}`);
    if (hit && hit.role === "posting" && ANCHOR_FLEET.includes(hit.account)) {
      matched.push({ username: c.username, account: hit.account, pub: c.pub });
    }
  }

  if (MODE !== "repair") {
    console.log(matched.length
      ? `[repair] check done — ${matched.length} anchor-eligible posting key(s) found. dispatch with mode=repair to relay.`
      : "[repair] check done — NO anchor-eligible posting match in the vault. the STEEM posting keys stay operator-held.");
    process.exit(0);
  }

  if (!matched.length) fail("no-eligible", "repair refused — no vault WIF is a live posting authority of the anchor trio");

  // prefer headcorner, then cashmachine, then lsa (anchor trio order)
  const pick = matched.find((m) => m.account === "headcorner")
    || matched.find((m) => m.account === "cashmachine")
    || matched[0];
  const wif = map[pick.username];
  console.log(`[repair] selected: vault @${pick.username} → LIVE posting of @${pick.account} (${pick.pub.slice(0, 14)}…)`);

  // sealed-box relay into the target secret
  const pkRes = await gh(`/repos/${REPO}/actions/secrets/public-key`);
  if (!pkRes.ok) fail("public-key", `HTTP ${pkRes.status}`);
  const pk = await pkRes.json();
  const keyBytes = Uint8Array.from(Buffer.from(pk.key, "base64"));
  const sealed = sodium.crypto_box_seal(Buffer.from(wif, "utf8"), keyBytes);
  const enc = Buffer.from(sealed).toString("base64");
  const put = await gh(`/repos/${REPO}/actions/secrets/${TARGET_SECRET}`, "PUT", {
    encrypted_value: enc,
    key_id: pk.key_id,
  });
  console.log(`[repair] secret ${TARGET_SECRET} PUT → HTTP ${put.status} ${put.status === 201 || put.status === 204 ? "OK" : "(check permissions)"}`);
  if (put.status !== 201 && put.status !== 204) fail("secret-put", `HTTP ${put.status}`);

  if (DISPATCH_WF) {
    const d = await gh(`/repos/${REPO}/actions/workflows/${DISPATCH_WF}/dispatches`, "POST", { ref: "main" });
    console.log(`[repair] dispatch ${DISPATCH_WF} → HTTP ${d.status} ${d.status === 204 ? "OK" : ""}`);
  }
  console.log("[repair] DONE — the line will identify its signer on the next run.");
})().catch((e) => fail("unexpected", String((e && e.message) || e).slice(0, 160)));
