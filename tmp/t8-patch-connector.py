import subprocess, sys, os

T8 = "/home/z/my-project/tmp/t8"
F = T8 + "/blurt-connector.mjs"
src = open(F, encoding="utf-8").read()

A1 = 'const chainIdHex = await rpc(node, "condenser_api.get_chain_id", []);'
if src.count(A1) != 1:
    print("ANCHOR1 count=%d ABORT" % src.count(A1)); sys.exit(1)

B1 = (
    "let chainIdHex = null;\n"
    "try { chainIdHex = await rpc(node, \"condenser_api.get_chain_id\", []); receipt.chainIdSource = \"rpc:get_chain_id\"; }\n"
    "catch (e) { receipt.chainIdSource = \"unavailable:\" + String(e?.message ?? e).slice(0, 60); } // saboin has no get_chain_id (measured 2026-10-11); DRY needs none"
)
src = src.replace(A1, B1)

A2 = "const digest = Buffer.from(sha256(Buffer.concat([Buffer.from(chainIdHex, \"hex\"), serTx(tx)])));"
if src.count(A2) != 1:
    print("ANCHOR2 count=%d ABORT" % src.count(A2)); sys.exit(1)

B2 = (
    "if (!chainIdHex) { receipt.verdict = \"CHAIN-ID-UNMEASURED (post refused — fail-closed; dry law needs none, post does)\"; console.log(JSON.stringify(receipt, null, 2)); process.exit(1); }\n"
    "const digest = Buffer.from(sha256(Buffer.concat([Buffer.from(chainIdHex, \"hex\"), serTx(tx)])));"
)
src = src.replace(A2, B2)
open(F, "w", encoding="utf-8").write(src)
r = subprocess.run(["node", "--check", F], capture_output=True, text=True)
print("node --check rc=%s %s" % (r.returncode, (r.stderr or "OK")[:120]))
print("PATCHED bytes=%d" % os.path.getsize(F))
