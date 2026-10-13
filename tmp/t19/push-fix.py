#!/usr/bin/env python3
"""t19-push-fix.py — push patched decider.py + workflow to Sandbox (readback-verified)."""
import base64, json, sys, urllib.request

TOKEN = open('/home/z/my-project/upload/pat.env').read().strip()
ORG, REPO = 'roshpinacare-sys', 'Sandbox'
API = 'https://api.github.com'

def gh(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f'{API}{path}', data=data, method=method, headers={
        'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json', 'User-Agent': 't19-fix'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            body = r.read()
            return r.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

def push_file(repo_path, local_path, message):
    content = open(local_path, 'rb').read()
    b64 = base64.b64encode(content).decode()
    s, b = gh('GET', f'/repos/{ORG}/{REPO}/contents/{repo_path}?ref=main')
    if s != 200:
        print(f'FETCH-FAIL {repo_path}: {s}')
        return False
    sha = b['sha']
    s, b = gh('PUT', f'/repos/{ORG}/{REPO}/contents/{repo_path}', {
        'message': message, 'content': b64, 'sha': sha})
    if s not in (200, 201):
        print(f'PUT-FAIL {repo_path}: {s} {json.dumps(b)[:120]}')
        return False
    commit = b.get('commit', {}).get('sha', '')[:9]
    # readback verify
    s2, b2 = gh('GET', f'/repos/{ORG}/{REPO}/contents/{repo_path}?ref=main')
    back = base64.b64decode(b2.get('content', '')).decode('utf-8', 'replace') if s2 == 200 else ''
    local = content.decode('utf-8', 'replace')
    ok = (back == local)
    print(f'{"OK" if ok else "READBACK-MISMATCH"} {repo_path} commit={commit} bytes={len(content)}')
    return ok

ok1 = push_file('ops/sovereign/DECIDER/decider.py', 'decider-remote.py',
                'T19-fix: D0 inbox fallback — private repo read via built-in GITHUB_TOKEN (Contents API); ACK statuses OPEN|NEW (writer/consumer alignment) [T19]')
ok2 = push_file('.github/workflows/sovereign-decider.yml', 'sovereign-decider.yml',
                'T19-fix: decide step gets built-in GITHUB_TOKEN env; publish step push-race retry (5x backoff) — parallel-writer survival [T19]')
print('ALL-OK' if (ok1 and ok2) else 'PARTIAL/FAIL')
sys.exit(0 if (ok1 and ok2) else 1)
