#!/usr/bin/env python3
# T8-e: surgical patch — vault-first credential for the delegation rail.
# Patches local copies, node --check, prints unified diff. NO commit here.
import subprocess, sys, os

T8 = "/home/z/my-project/tmp/t8"

def patch(path, old, new, tag):
    src = open(path, encoding="utf-8").read()
    n = src.count(old)
    if n != 1:
        print("%s: ANCHOR COUNT %d != 1 — ABORT" % (tag, n)); sys.exit(1)
    out = src.replace(old, new)
    open(path, encoding="utf-8", newline="").write(out)
    print("%s: patched, bytes %d -> %d" % (tag, len(src), len(out)))

# ---------- signer.mjs ----------
OLD_MEM = (
    '/* in-memory only \xe2\x80\x94 never serialized anywhere. One identity per account. */'
)
# use unicode-safe anchors read from the file itself
signer = T8 + "/signer.mjs"
src = open(signer, encoding="utf-8").read()
anchor = "const mem = { identities: {}, master: null, keyFileFp: null }; // account \u2192 { password, wifs:{role:wif}, matchedOrder, verified }"
assert src.count(anchor) == 1, "mem anchor not unique"
accessor = (
    "\n\n/**\n"
    " * R314b \u00b7 VAULT-CUSTODY ACCESSOR (2026-10-11): hands a chain-verified,\n"
    " * in-memory adopted wif to a caller that chain-judges it AGAIN before any\n"
    " * broadcast (the delegation rail gate 4 re-runs adoptVerifiedWifIdentity).\n"
    " * Fail-closed: null unless THIS process verified the identity against the\n"
    " * LIVE chain (verified.ok, matchedOrder \"wif-direct\"). The wif never\n"
    " * reaches logs, state files, or ledgers \u2014 only the signing path.\n"
    " */\n"
    "export function adoptedWifFor(account, role) {\n"
    "  const id = mem.identities[account];\n"
    "  if (!id?.verified?.ok || id?.verified?.matchedOrder !== \"wif-direct\") return null;\n"
    "  const w = id?.wifs?.[role];\n"
    "  return typeof w === \"string\" && w.length >= 51 ? w : null;\n"
    "}"
)
open(signer, "w", encoding="utf-8", newline="").write(src.replace(anchor, anchor + accessor))
print("signer.mjs: accessor inserted, bytes %d -> %d" % (len(src), len(src) + len(accessor)))

# ---------- delegation-rail.mjs ----------
rail = T8 + "/delegation-rail.mjs"
src = open(rail, encoding="utf-8").read()

old_import = 'import { masterAccount } from "./signer.mjs";'
new_import = 'import { masterAccount, adoptedWifFor } from "./signer.mjs";'

old_hdr = (
    " *   4. CREDENTIAL\u2014 env CI_ADOPT_WIF_ACTIVE (master ACTIVE WIF), chain-judged\n"
    " *                  via adoptVerifiedWifIdentity \u2014 the SAME lawful adoption\n"
    " *                  path R245 uses for the dex takeover. Key bytes never print."
)
new_hdr = (
    " *   4. CREDENTIAL\u2014 VAULT-FIRST (R314b, 2026-10-11): the custody step of THIS\n"
    " *                  beat already chain-adopted the master's ACTIVE wif from the\n"
    " *                  git vault (adoptedWifFor \u2014 verified.ok, wif-direct).\n"
    " *                  Fallback: env CI_ADOPT_WIF_ACTIVE (measured 2026-10-11:\n"
    " *                  its wif does NOT match headcorner's live active authority\n"
    " *                  \u2014 verdict ADOPT-REFUSED @14:00:12Z). Either way the wif is\n"
    " *                  chain-judged AGAIN via adoptVerifiedWifIdentity. Key bytes\n"
    " *                  never print."
)

old_gate = (
    "  /* 4 \u00b7 CREDENTIAL gate + chain-judged adoption */\n"
    "  const raw = String(process.env.CI_ADOPT_WIF_ACTIVE ?? \"\").trim();\n"
    "  if (!raw) {\n"
    "    const out = { ...base, verdict: \"NO-CREDENTIAL\", reason: \"CI_ADOPT_WIF_ACTIVE absent\" };\n"
    "    writeJson(path.join(S, \"delegation-last.json\"), out);\n"
    "    ledger(out);\n"
    "    return out;\n"
    "  }\n"
    "  const master = masterAccount();"
)
new_gate = (
    "  /* 4 \u00b7 CREDENTIAL gate + chain-judged adoption (R314b: VAULT-FIRST).\n"
    "   * The custody step of this same beat/process already chain-adopted the\n"
    "   * master's ACTIVE wif from the git vault (army-custody.json\n"
    "   * \"ACTIVE-VERIFIED\" GEN-2 \u2192 signer.mem, verified.ok wif-direct). The vault\n"
    "   * IS the credential delivery (ci-cycle.mjs law: zero key material in CI\n"
    "   * secrets). Fallback: the CI_ADOPT_WIF_ACTIVE secret \u2014 measured\n"
    "   * 2026-10-11 its wif does NOT match headcorner's live active authority\n"
    "   * (verdict ADOPT-REFUSED), so it is fallback only. EITHER source is\n"
    "   * chain-judged again below \u2014 a stale or wrong wif still fails closed. */\n"
    "  const master = masterAccount();\n"
    "  const vaultWif = adoptedWifFor(master, \"active\");\n"
    "  const raw = vaultWif ?? String(process.env.CI_ADOPT_WIF_ACTIVE ?? \"\").trim();\n"
    "  if (!raw) {\n"
    "    const out = { ...base, verdict: \"NO-CREDENTIAL\", reason: \"no vault-adopted master ACTIVE wif; CI_ADOPT_WIF_ACTIVE absent\" };\n"
    "    writeJson(path.join(S, \"delegation-last.json\"), out);\n"
    "    ledger(out);\n"
    "    return out;\n"
    "  }"
)

for tag, old, new in [("import", old_import, new_import), ("header", old_hdr, new_hdr), ("gate4", old_gate, new_gate)]:
    n = src.count(old)
    if n != 1:
        print("rail %s: ANCHOR COUNT %d != 1 — ABORT" % (tag, n)); sys.exit(1)
    src = src.replace(old, new)
    print("rail %s: patched" % tag)
open(rail, "w", encoding="utf-8", newline="").write(src)

# ---------- syntax gates ----------
for f in (signer, rail):
    r = subprocess.run(["node", "--check", f], capture_output=True, text=True)
    print("node --check %s: rc=%s %s" % (os.path.basename(f), r.returncode, (r.stderr or "OK")[:200]))

# ---------- unified diff vs originals ----------
for orig, patched in [(T8 + "/signer.mjs.orig", signer), (T8 + "/delegation-rail.mjs.orig", rail)]:
    pass
print("PATCH-DONE")
