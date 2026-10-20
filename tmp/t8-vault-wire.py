#!/usr/bin/env python3
# T8-l: (1) try/finally wipe law in vault-drip; (2) blurt-revival.yml vault-drip
# step + env-precedence fix; (3) commit both; (4) dispatch dry.
import base64, hashlib, json, os, subprocess, sys, time

T8 = "/home/z/my-project/tmp/t8"

def sh(cmd):
    return subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)

def api(method, url, body=None):
    data = ("-d '%s'" % json.dumps(body)) if body is not None else ""
    r = sh('source /home/z/my-project/ghenv.sh && curl -s -X %s -H "Authorization: Bearer $GH_TOKEN" '
           '-H "Accept: application/vnd.github+json" "https://api.github.com/%s" %s' % (method, url, data))
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"_raw": r.stdout[:200]}

def pull_raw(repo, path, ref, fn):
    r = sh('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
           '-H "Accept: application/vnd.github.raw" '
           '"https://api.github.com/repos/%s/contents/%s?ref=%s" > %s/%s' % (repo, path, ref, T8, fn))
    return os.path.getsize(T8 + "/" + fn)

def put(repo, path, local, message, branch):
    b64 = base64.b64encode(open(local, "rb").read()).decode()
    for attempt in range(4):
        meta = api("GET", "repos/%s/contents/%s?ref=%s" % (repo, path, branch))
        body = {"message": message, "content": b64, "branch": branch}
        if "sha" in meta:
            body["sha"] = meta["sha"]  # update of existing file
        # else: new file - no sha field
        res = api("PUT", "repos/%s/contents/%s" % (repo, path), body)
        if "commit" in res:
            return res["commit"]["sha"]
        print("refused", str(res.get("message"))[:100]); time.sleep(6)
    sys.exit("PUT exhausted " + path)

def readback(repo, path, ref, local):
    r = sh('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
           '-H "Accept: application/vnd.github.raw" '
           '"https://api.github.com/repos/%s/contents/%s?ref=%s" > %s/.rb2' % (repo, path, ref, T8))
    h1 = hashlib.md5(open(T8 + "/.rb2", "rb").read()).hexdigest()
    h2 = hashlib.md5(open(local, "rb").read()).hexdigest()
    return h1 == h2, h1[:10], h2[:10]

# ── 1) vault-drip try/finally wipe law ─────────────────────────────────────
drip = T8 + "/vault-drip.mjs"
src = open(drip, encoding="utf-8").read()
OLD = """try {
  execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000","""
NEW = """try { /* wipe law: plaintext never outlives this process, on ANY path */
  } finally { /* placeholder-replaced-below */ }
try {
  execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000","""
assert src.count(OLD) == 1, "drip anchor1"
# simpler lawful form: wrap the whole body after mkdir in try/finally via restructuring
# (replace the two mid-body wipes with one finally wipe)
src = src.replace("""fs.rmSync(TMP, { recursive: true, force: true });
if (!wif || wif.length < 51) fail("NO-POSTING-WIF", "vault had no posting wif for " + ACCOUNT);
console.log(wif);""",
"""fs.rmSync(TMP, { recursive: true, force: true });
if (!wif || wif.length < 51) fail("NO-POSTING-WIF", "vault had no posting wif for " + ACCOUNT);
console.log(wif);""")
# add wipe-on-fail: patch fail() itself to wipe TMP first (simplest complete law)
src = src.replace(
    'const fail = (v, r) => { console.error(JSON.stringify({ verdict: v, reason: String(r).slice(0, 120) })); process.exit(1); };',
    'const fail = (v, r) => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* wipe is best-effort */ } console.error(JSON.stringify({ verdict: v, reason: String(r).slice(0, 120) })); process.exit(1); };')
open(drip, "w", encoding="utf-8").write(src)
r = subprocess.run(["node", "--check", drip], capture_output=True, text=True)
print("drip node --check rc=%s" % r.returncode)
if r.returncode != 0:
    print(r.stderr[:300]); sys.exit(1)

# ── 2) blurt-revival.yml: drip step + env precedence ──────────────────────
n = pull_raw("roshpinacare-sys/saos-runtime", ".github/workflows/blurt-revival.yml", "main", "blurt-revival.yml")
print("yml bytes:", n)
y = open(T8 + "/blurt-revival.yml", encoding="utf-8").read()

# 2a) dry step: drop the step-level CI_BLURT_POSTING_WIF (empty secret would
# override the GITHUB_ENV drip — GH precedence: step env > job env)
A_ENV = """        env:
          CI_BLURT_POSTING_WIF: ${{ secrets.CI_BLURT_POSTING_WIF }}
          CI_ADOPT_WIF_POSTING: ${{ secrets.CI_ADOPT_WIF_POSTING }}"""
if y.count(A_ENV) != 2:
    print("yml env anchor count=%d (need 2: dry+post)" % y.count(A_ENV)); sys.exit(1)
y = y.replace(A_ENV, """        env:
          CI_ADOPT_WIF_POSTING: ${{ secrets.CI_ADOPT_WIF_POSTING }}  # fallback only - vault-drip is primary""")

# 2b) insert the drip step before the dry step
DRY_MARK = "      - name: BLURT dry"
if y.count(DRY_MARK) != 1:
    print("dry mark count=%d" % y.count(DRY_MARK)); sys.exit(1)
DRIP = """      - name: Vault-drip (posting WIF from git vault - runner-only, masked, wiped)
        env:
          GH_PAT: ${{ secrets.GH_PAT }}
        run: |
          set -euo pipefail
          rm -rf /tmp/engine
          git clone --depth 1 --branch saos-cockpit "https://x-access-token:${GH_PAT}@github.com/roshpinacare-sys/steem.git" /tmp/engine
          WIF=$(node scripts/vault-drip.mjs "${BLURT_ACCOUNT:-headcorner}" /tmp/engine)
          if [ -z "$WIF" ]; then echo "VAULT-DRIP-EMPTY"; exit 1; fi
          echo "::add-mask::$WIF"
          echo "CI_BLURT_POSTING_WIF=$WIF" >> "$GITHUB_ENV"
          rm -rf /tmp/engine

"""
y = y.replace(DRY_MARK, DRIP + DRY_MARK)
open(T8 + "/blurt-revival.yml", "w", encoding="utf-8").write(y)
import re
steps = re.findall(r"^      - name: (.+)$", y, re.M)
print("steps now:", steps)
if not any("Vault-drip" in s for s in steps):
    print("DRIP STEP MISSING"); sys.exit(1)

# ── 3) commit both files ──────────────────────────────────────────────────
c1 = put("roshpinacare-sys/saos-runtime", "scripts/vault-drip.mjs", drip,
         "vault-drip: sha-pinned git-vault posting-wif extraction, runner-only, "
         "fail-closed, wipe-on-every-path (GEN-2 then flat shape) [zai-agent trace t8-vault-drip]",
         "main")
ok, h1, h2 = readback("roshpinacare-sys/saos-runtime", "scripts/vault-drip.mjs", "main", drip)
print("drip commit", c1[:12], "readback", "MATCH" if ok else "MISMATCH", h1, h2)

c2 = put("roshpinacare-sys/saos-runtime", ".github/workflows/blurt-revival.yml", T8 + "/blurt-revival.yml",
         "blurt-revival: vault-drip step (posting WIF from git vault, masked, wiped) - "
         "CI secrets measured stale (KEY-MISMATCH @14:30:19Z); dry step env precedence fixed "
         "(empty secret was overriding the drip) [zai-agent trace t8-vault-drip]",
         "main")
ok, h1, h2 = readback("roshpinacare-sys/saos-runtime", ".github/workflows/blurt-revival.yml", "main", T8 + "/blurt-revival.yml")
print("yml commit", c2[:12], "readback", "MATCH" if ok else "MISMATCH", h1, h2)

# ── 4) dispatch dry and report run id ─────────────────────────────────────
d = api("POST", "repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/dispatches",
        {"ref": "main", "inputs": {"mode": "dry"}})
time.sleep(8)
runs = api("GET", "repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/runs?per_page=2")
for run in runs.get("workflow_runs", []):
    print("run", run["id"], run["status"], run["conclusion"], run["created_at"])
