#!/usr/bin/env python3
# T8-f: commit patched signer.mjs + delegation-rail.mjs to steem@saos-cockpit
# via contents API (sha-atomic, retry-on-409), then read-back verify by md5.
import base64, hashlib, json, os, subprocess, sys, time

T8 = "/home/z/my-project/tmp/t8"
REPO = "repos/roshpinacare-sys/steem"
BRANCH = "saos-cockpit"

def sh(cmd):
    r = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr

def api(method, url, body=None):
    b = ("-X %s -d '%s'" % (method, json.dumps(body))) if body is not None else ""
    rc, out, err = sh(
        'source /home/z/my-project/ghenv.sh && curl -s -X %s -H "Authorization: Bearer $GH_TOKEN" '
        '-H "Accept: application/vnd.github+json" "https://api.github.com/%s" %s'
        % (method, url, ("-d " + "'%s'" % json.dumps(body)) if body else "")
    )
    try:
        return json.loads(out)
    except Exception:
        return {"_raw": out[:200], "_err": err[:200]}

def put_file(remote_path, local_path, message):
    local_bytes = open(local_path, "rb").read()
    b64 = base64.b64encode(local_bytes).decode()
    for attempt in range(4):
        meta = api("GET", "%s/contents/%s?ref=%s" % (REPO, remote_path, BRANCH))
        if "sha" not in meta:
            print("GET meta FAIL:", meta.get("message")); sys.exit(1)
        res = api("PUT", "%s/contents/%s" % (REPO, remote_path), {
            "message": message,
            "content": b64,
            "sha": meta["sha"],
            "branch": BRANCH,
        })
        if "commit" in res and "sha" in res.get("commit", {}):
            print("PUT ok attempt=%d commit=%s" % (attempt + 1, res["commit"]["sha"][:12]))
            return res["commit"]["sha"]
        msg = str(res.get("message", ""))
        print("PUT attempt=%d refused: %s" % (attempt + 1, msg[:120]))
        if "409" in msg or "fast-forward" in msg.lower() or "not a fast" in msg.lower():
            time.sleep(6); continue
        sys.exit(1)
    sys.exit("PUT exhausted")

def readback(remote_path, local_path):
    rc, out, _ = sh(
        'source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
        '-H "Accept: application/vnd.github.raw" "https://api.github.com/%s/contents/%s?ref=%s" > %s/.rb'
        % (REPO, remote_path, BRANCH, T8)
    )
    h1 = hashlib.md5(open(T8 + "/.rb", "rb").read()).hexdigest()
    h2 = hashlib.md5(open(local_path, "rb").read()).hexdigest()
    os.remove(T8 + "/.rb")
    return h1, h2, h1 == h2

TRACE = "zai-agent trace t8-r314b"

c1 = put_file(
    "mini-services/saos-engine/signer.mjs", T8 + "/signer.mjs",
    "R314b: signer.adoptedWifFor - fail-closed vault-custody accessor "
    "(wif-direct chain-verified identities only; null unless verified vs LIVE "
    "authority in this process) [%s]" % TRACE,
)
c2 = put_file(
    "mini-services/saos-engine/delegation-rail.mjs", T8 + "/delegation-rail.mjs",
    "R314b: delegation rail gate-4 VAULT-FIRST credential - CI_ADOPT_WIF_ACTIVE "
    "measured stale (ADOPT-REFUSED active-authority-mismatch @2026-10-11T14:00:12Z); "
    "custody-adopted master ACTIVE wif is primary; chain re-judged via "
    "adoptVerifiedWifIdentity either way [%s]" % TRACE,
)

for rp, lp in [
    ("mini-services/saos-engine/signer.mjs", T8 + "/signer.mjs"),
    ("mini-services/saos-engine/delegation-rail.mjs", T8 + "/delegation-rail.mjs"),
]:
    h1, h2, ok = readback(rp, lp)
    print("READBACK %s: %s vs %s -> %s" % (rp.split("/")[-1], h1[:10], h2[:10], "MATCH" if ok else "MISMATCH"))
print("COMMITS:", c1[:12], c2[:12])
