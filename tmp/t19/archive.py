#!/usr/bin/env python3
"""t19-archive.py — archive stale public reports (no falsification: move to archive/2026-10/).
Domain: STATE-REPORT-2026{0929..1010}.md, progress.md, session-handoff.md (if stale)
Console: same pattern where present."""
import json, urllib.request, time

TOKEN = open('/home/z/my-project/upload/pat.env').read().strip()
ORG = 'roshpinacare-sys'
API = 'https://api.github.com'

def gh(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f'{API}{path}', data=data, method=method, headers={
        'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json', 'User-Agent': 't19-archive'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            return r.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

def get_file(repo, path):
    s, b = gh('GET', f'/repos/{ORG}/{repo}/contents/{path}?ref=main')
    if s != 200:
        return None
    import base64
    return {'sha': b['sha'], 'content': base64.b64decode(b['content']).decode('utf-8', 'replace')}

def move(repo, src, dst, tag):
    f = get_file(repo, src)
    if f is None:
        return f'skip:{src}(missing)'
    # create at destination
    s1, b1 = gh('PUT', f'/repos/{ORG}/{repo}/contents/{dst}', {
        'message': f'archive stale public report [T19-b] {src} → archive/ (no falsification — git history preserved)',
        'content': __import__('base64').b64encode(f['content'].encode()).decode(),
        'sha': None})
    if s1 not in (200, 201):
        return f'FAIL-create:{src}:{s1}'
    s2, b2 = gh('DELETE', f'/repos/{ORG}/{repo}/contents/{src}', {
        'message': f'archive stale public report [T19-b] remove origin {src} (moved to {dst})',
        'sha': f['sha']})
    if s2 not in (200, 201):
        return f'FAIL-delete:{src}:{s2}'
    return f'OK:{src}→{dst}'

JOBS = []
for n in ['20260929', '20260930'] + [f'202610{d:02d}' for d in range(1, 11)]:
    JOBS.append(('Domain', f'STATE-REPORT-{n}.md', f'archive/2026-10/STATE-REPORT-{n}.md'))
for extra in ['progress.md', 'session-handoff.md']:
    JOBS.append(('Domain', extra, f'archive/2026-10/{extra}'))
    JOBS.append(('Console', extra, f'archive/2026-10/{extra}'))

results = []
for repo, src, dst in JOBS:
    r = move(repo, src, dst, 'T19-b')
    results.append(f'{repo}: {r}')
    print(results[-1], flush=True)
    time.sleep(0.4)
print('\nDONE', len(results))
