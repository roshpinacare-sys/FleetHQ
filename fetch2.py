#!/usr/bin/env python3
"""Double-fetch repo file with md5 cross-check (anti-fabrication law).
Usage: fetch2.py <repo> <path> <ref>
Fetches the same blob twice via independent API shapes:
  A: Contents API raw Accept header
  B: Contents API JSON -> base64 decode
Prints md5A, md5B, MATCH/MISMATCH, size, and writes body to /tmp/fetch2_body.bin
"""
import sys, json, base64, hashlib, urllib.request, os

def call(url, accept=None):
    req = urllib.request.Request(url)
    req.add_header("Authorization", "Bearer " + os.environ["GH_TOKEN"])
    if accept:
        req.add_header("Accept", accept)
    with urllib.request.urlopen(req) as r:
        return r.read()

def main():
    repo, path, ref = sys.argv[1], sys.argv[2], sys.argv[3]
    api = "https://api.github.com/repos/roshpinacare-sys/" + repo
    # Source A: raw accept
    bodyA = call(f"{api}/contents/{path}?ref={ref}", "application/vnd.github.raw")
    # Source B: json base64
    meta = json.loads(call(f"{api}/contents/{path}?ref={ref}").decode("utf-8"))
    bodyB = base64.b64decode(meta["content"])
    md5A = hashlib.md5(bodyA).hexdigest()
    md5B = hashlib.md5(bodyB).hexdigest()
    sha_api = meta.get("sha", "?")
    size = meta.get("size", "?")
    verdict = "MATCH" if md5A == md5B and bodyA == bodyB else "MISMATCH"
    print(f"file={path} ref={ref} size={size} sha={sha_api[:12]}")
    print(f"md5A={md5A} md5B={md5B} verdict={verdict}")
    with open("/tmp/fetch2_body.bin", "wb") as f:
        f.write(bodyA)
    if verdict == "MISMATCH":
        sys.exit(2)

if __name__ == "__main__":
    main()
