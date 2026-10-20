#!/usr/bin/env python3
"""
publish-fleethq-office3d.py — Task 12: push the upgraded 3D office sources to FleetHQ.
New: src/lib/hq/truth.ts, src/lib/hq/truth-bridge.ts, src/components/hq/RoomRoot.tsx
Upgraded: store.ts (+truth field), contract.ts (reception preset re-shot),
Office3D.tsx (mobile-adaptive), CameraDirector.tsx (cinematic idle drift),
ViewDeck.tsx (TruthChip + mobile hierarchy).
All additive/compatible — office-ci build+types stay green (truth.ts ships with store.ts).
"""
import base64, hashlib, io, json, sys, time, urllib.request

TOKEN = io.open('/home/z/my-project/upload/pat.env', encoding='utf-8').read()
TOKEN = TOKEN.replace('\r', '').replace('\n', '').replace(' ', '')
API = 'https://api.github.com'
ORG = 'roshpinacare-sys'
REPO = 'FleetHQ'

def call(method, path, payload=None, headers=None):
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read()
            return r.status, (json.loads(body) if body and r.headers.get('content-type', '').startswith('application/json') else body)
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:400]

def md5(b): return hashlib.md5(b).hexdigest()

SRC = '/home/z/my-project/src'
files = {
    'src/lib/hq/truth.ts': f'{SRC}/lib/hq/truth.ts',
    'src/lib/hq/truth-bridge.ts': f'{SRC}/lib/hq/truth-bridge.ts',
    'src/components/hq/RoomRoot.tsx': f'{SRC}/components/hq/RoomRoot.tsx',
    'src/lib/hq/store.ts': f'{SRC}/lib/hq/store.ts',
    'src/lib/hq/contract.ts': f'{SRC}/lib/hq/contract.ts',
    'src/components/hq/Office3D.tsx': f'{SRC}/components/hq/Office3D.tsx',
    'src/components/hq/CameraDirector.tsx': f'{SRC}/components/hq/CameraDirector.tsx',
    'src/components/hq/ViewDeck.tsx': f'{SRC}/components/hq/ViewDeck.tsx',
}
contents = {p: io.open(f, 'rb').read() for p, f in files.items()}

MESSAGE = ('office(3D): truth-bridge + honesty UI + mobile-adaptive room [T12]\n\n'
           '- NEW truth.ts/truth-bridge.ts: the room feeds from REAL public sources\n'
           '  (foreman office-state.json + Domain office/data.json + beacon state.json +\n'
           '  keyless commits feed) — zero simulation, honest unavailability.\n'
           '- NEW RoomRoot.tsx: standalone client root (dynamic Room3D + bridge).\n'
           '- store.ts: additive truth field (setTruth) — wire contract untouched.\n'
           '- contract.ts: reception preset re-shot (screen now READS: the old NE angle\n'
           '  photographed the welcome screen from behind).\n'
           '- Office3D.tsx: mobile-adaptive dpr/shadows (<=820px or <=4 cores).\n'
           '- CameraDirector.tsx: cinematic idle drift after 25s (reduced-motion safe).\n'
           '- ViewDeck.tsx: TruthChip (source+age, stale flag) + mobile bottom hierarchy.')

for attempt in range(3):
    st, ref = call('GET', f'/repos/{ORG}/{REPO}/git/ref/heads/main')
    assert st == 200, f'ref failed {st}'
    base_sha = ref['object']['sha']
    st, base_commit = call('GET', f'/repos/{ORG}/{REPO}/git/commits/{base_sha}')
    assert st == 200
    base_tree = base_commit['tree']['sha']

    tree, ok = [], True
    for path, content in contents.items():
        st, blob = call('POST', f'/repos/{ORG}/{REPO}/git/blobs',
                        {'content': base64.b64encode(content).decode('utf-8'), 'encoding': 'base64'})
        if st != 201:
            print(f'BLOB FAIL {path}: {st} {blob}'); ok = False; break
        tree.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        print(f'blob {path}: {blob["sha"][:10]} ({len(content)}B)')
    assert ok, 'blob creation failed'

    st, new_tree = call('POST', f'/repos/{ORG}/{REPO}/git/trees', {'base_tree': base_tree, 'tree': tree})
    assert st == 201, f'tree failed: {st} {new_tree}'
    st, commit = call('POST', f'/repos/{ORG}/{REPO}/git/commits',
                      {'message': MESSAGE, 'tree': new_tree['sha'], 'parents': [base_sha]})
    assert st == 201, f'commit failed: {st} {commit}'
    st, upd = call('PATCH', f'/repos/{ORG}/{REPO}/git/refs/heads/main', {'sha': commit['sha'], 'force': False})
    if st == 200:
        print(f'PUSHED: {commit["sha"][:10]} (attempt {attempt + 1})')
        break
    print(f'ref raced ({st}) — retry')
    time.sleep(3)
else:
    sys.exit('FAILED after retries')

time.sleep(2)
for path in list(contents):
    st, got = call('GET', f'/repos/{ORG}/{REPO}/contents/{path}?ref=main',
                   headers={'Accept': 'application/vnd.github.raw'})
    assert st == 200, f'readback {path}: {st}'
    same = md5(got) == md5(contents[path])
    print(f'readback {path}: {"MD5-MATCH" if same else "MISMATCH!"}')
    assert same
print('ALL READBACK-VERIFIED')
