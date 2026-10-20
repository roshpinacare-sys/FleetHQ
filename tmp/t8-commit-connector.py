import base64, hashlib, json, os, subprocess, sys, time

T8 = "/home/z/my-project/tmp/t8"
REPO = "repos/roshpinacare-sys/saos-runtime"
BRANCH = "main"
PATH = "scripts/blurt-connector.mjs"
LOCAL = T8 + "/blurt-connector.mjs"

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

b64 = base64.b64encode(open(LOCAL, "rb").read()).decode()
for attempt in range(4):
    meta = api("GET", "%s/contents/%s?ref=%s" % (REPO, PATH, BRANCH))
    if "sha" not in meta:
        print("meta fail:", meta.get("message")); sys.exit(1)
    res = api("PUT", "%s/contents/%s" % (REPO, PATH), {
        "message": ("blurt dry-law fix: get_chain_id is NOT served by saboin (measured 2026-10-11, "
                    "assert method_itr) - fetch is now best-effort; DRY needs no chain id "
                    "(key-fit=get_accounts, byte-law=get_transaction_hex); POST fail-closes on "
                    "CHAIN-ID-UNMEASURED until the id is measured from an oracle [zai-agent trace t8-blurt-dry]"),
        "content": b64, "sha": meta["sha"], "branch": BRANCH})
    if "commit" in res:
        print("PUT ok commit=", res["commit"]["sha"][:12])
        csha = res["commit"]["sha"]
        break
    print("refused:", str(res.get("message"))[:120]); time.sleep(6)
else:
    sys.exit("PUT exhausted")

# read-back verify
r = sh('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
       '-H "Accept: application/vnd.github.raw" "https://api.github.com/%s/contents/%s?ref=%s" > %s/.rb'
       % (REPO, PATH, BRANCH, T8))
h1 = hashlib.md5(open(T8 + "/.rb", "rb").read()).hexdigest()
h2 = hashlib.md5(open(LOCAL, "rb").read()).hexdigest()
print("READBACK", h1[:10], h2[:10], "MATCH" if h1 == h2 else "MISMATCH")

# dispatch fresh dry run
d = api("POST", "%s/actions/workflows/blurt-revival.yml/dispatches" % REPO,
        {"ref": BRANCH, "inputs": {"mode": "dry"}})
print("dispatch rc:", d)
time.sleep(8)
runs = api("GET", "%s/actions/workflows/blurt-revival.yml/runs?per_page=2" % REPO)
for run in runs.get("workflow_runs", []):
    print("run", run["id"], run["status"], run["conclusion"], run["created_at"])
