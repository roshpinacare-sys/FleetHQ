#!/usr/bin/env python3
"""Set GitHub Actions secret CI_DELEGATION_ARMED=1 on roshpinacare-sys/saos-runtime.

Contract (delegation-rail.mjs gate 1): env must equal "1" exactly.
Method: repo public key -> libsodium sealed box -> PUT -> read back metadata.
"""
import base64
import json
import os
import sys
import urllib.request

from nacl import encoding, public

ORG = "roshpinacare-sys"
REPO = "saos-runtime"
NAME = "CI_DELEGATION_ARMED"
VALUE = "1"
TOKEN = os.environ.get("GH_TOKEN", "").strip()

if not TOKEN:
    sys.exit("GH_TOKEN missing")


def call(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        "https://api.github.com/repos/%s/%s/%s" % (ORG, REPO, path),
        data=data, method=method,
        headers={
            "Authorization": "Bearer " + TOKEN,
            "Accept": "application/vnd.github+json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode()
            return r.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]


def main():
    st, pk = call("GET", "actions/secrets/public-key")
    if st != 200:
        sys.exit("public-key fetch failed: %s %s" % (st, pk))
    print("public key: key_id=%s" % pk["key_id"])

    recipient = public.PublicKey(pk["key"].encode("utf-8"), encoding.Base64Encoder())
    sealed = public.SealedBox(recipient).encrypt(VALUE.encode("utf-8"))
    b64 = base64.b64encode(sealed).decode("utf-8")
    print("sealed box: %d b64 chars" % len(b64))

    st, out = call("PUT", "actions/secrets/" + NAME, {
        "encrypted_value": b64,
        "key_id": pk["key_id"],
    })
    print("PUT %s: HTTP %s" % (NAME, st))
    if st not in (201, 204):
        sys.exit("secret PUT failed: %s %s" % (st, out))

    st, meta = call("GET", "actions/secrets/" + NAME)
    print("GET metadata: HTTP %s updated_at=%s" % (st, meta.get("updated_at")))
    print("RESULT: %s is set on %s/%s" % (NAME, ORG, REPO))


if __name__ == "__main__":
    main()
