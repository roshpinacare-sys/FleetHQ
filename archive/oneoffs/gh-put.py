#!/usr/bin/env python3
"""
gh-put.py — reusable GitHub contents-API publisher with readback MD5 verification.
Usage: gh-put.py <repo> <ref> <commit-message> <file:localpath ...>
Every file is verified by readback (md5) after commit — anti-forgery law.
"""
import base64, hashlib, json, sys, urllib.request

TOKEN = open('/home/z/my-project/upload/pat.env', encoding='utf-8').read().replace('\r', '').replace('\n', '').replace(' ', '')
API = 'https://api.github.com'

def call(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read()
            return r.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:500]

def md5(b): return hashlib.md5(b).hexdigest()

def put(repo, ref, path, content_bytes, message):
    got, cur = call('GET', f'/repos/roshpinacare-sys/{repo}/contents/{path}?ref={ref}')
    sha = cur.get('sha') if got == 200 else None
    code, res = call('PUT', f'/repos/roshpinacare-sys/{repo}/contents/{path}', {
        'message': message, 'content': base64.b64encode(content_bytes).decode(),
        'sha': sha, 'branch': ref,
    })
    if code not in (200, 201):
        print(f'FAIL {path}: {code} {res}')
        return False
    blob_sha = res.get('content', {}).get('sha')
    got2, ver = call('GET', f'/repos/roshpinacare-sys/{repo}/contents/{path}?ref={ref}')
    ok = bool(got2 == 200 and ver.get('content') and
          md5(base64.b64decode(ver['content'])) == md5(content_bytes))
    print(f'{"OK " if ok else "MISMATCH "}{repo}:{path} commit={res.get("commit", {}).get("sha", "?")[:9]} md5={md5(content_bytes)[:10]}')
    return ok

if __name__ == '__main__':
    repo, ref, msg = sys.argv[1], sys.argv[2], sys.argv[3]
    allok = True
    for spec in sys.argv[4:]:
        path, local = spec.split(':', 1)
        allok &= put(repo, ref, path, open(local, 'rb').read(), msg)
    sys.exit(0 if allok else 1)
