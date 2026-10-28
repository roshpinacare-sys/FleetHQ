#!/usr/bin/env python3
"""
publish-domain-office3d.py — Task 12 (office-3d-flagship) publish lane.
- Adds office3d/ standalone room (index.html + assets) + models/humans GLBs to Domain.
- Surgical hero edit on index.html: 3D entry button FIRST in cta-row + clickable
  shot overlay linking to office3d/ + small CSS block. No other changes.
- Git Data API, readback md5 verification, 2 retries on racing base (non-trampling).
"""
import base64, hashlib, io, json, sys, time, urllib.request

TOKEN = io.open('/home/z/my-project/upload/pat.env', encoding='utf-8').read()
TOKEN = TOKEN.replace('\r', '').replace('\n', '').replace(' ', '')
API = 'https://api.github.com'
ORG = 'roshpinacare-sys'
REPO = 'Domain'

def call(method, path, payload=None, raw_body=None, headers=None):
    url = API + path
    data = None
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
    elif raw_body is not None:
        data = raw_body
    req = urllib.request.Request(url, data=data, method=method)
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

# ── local files to publish ──────────────────────────────────────────────
DIST = '/home/z/my-project/tmp/office3d-standalone/dist'
MODELS = '/home/z/my-project/public/models/humans'
files = {
    'office3d/index.html': io.open(f'{DIST}/index.html', 'rb').read(),
    'office3d/assets/index.js': io.open(f'{DIST}/assets/index.js', 'rb').read(),
    'office3d/assets/index.css': io.open(f'{DIST}/assets/index.css', 'rb').read(),
    'models/humans/readyplayer.me.glb': io.open(f'{MODELS}/readyplayer.me.glb', 'rb').read(),
    'models/humans/Michelle.glb': io.open(f'{MODELS}/Michelle.glb', 'rb').read(),
    'models/humans/Xbot.glb': io.open(f'{MODELS}/Xbot.glb', 'rb').read(),
}

# ── hero edit ───────────────────────────────────────────────────────────
st, cur = call('GET', f'/repos/{ORG}/{REPO}/contents/index.html?ref=main',
               headers={'Accept': 'application/vnd.github.raw'})
assert st == 200, f'index.html fetch failed: {st} {cur}'
html = cur.decode('utf-8')
orig_md5 = md5(cur)
MARK = 'office3d-hero-v1'
if MARK in html:
    print('SKIP-EDIT: marker already present')
else:
    # 1) CSS (insert before closing of existing style — append at end of style block)
    css = """
/* office3d-hero-v1: the 3D room entry — T12 lane */
.shot a.shot3d{position:relative;display:block;text-decoration:none}
.shot a.shot3d::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(to top,rgba(24,18,10,.42),rgba(24,18,10,0) 45%)}
.shot .shot3d-btn{position:absolute;z-index:2;inset-inline-start:14px;bottom:14px;display:inline-flex;align-items:center;gap:8px;background:#1f1810;color:#ffe9c9;border:1px solid #5c4326;border-radius:999px;padding:10px 16px;font-weight:700;font-size:14px;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.shot .shot3d-btn small{display:block;font-weight:500;color:#d8c39a;font-size:11px}
"""
    idx = html.rfind('</style>')
    assert idx > 0, 'no style block found'
    html = html[:idx] + css + html[idx:]

    # 2) CTA row: 3D entry first
    old_cta = '<a class="btn" href="https://roshpinacare-sys.github.io/FleetHQ/" target="_blank" rel="noopener">כניסה למשרד החי →</a>'
    assert old_cta in html, 'CTA anchor not found'
    new_cta = ('<a class="btn" href="office3d/" data-office3d="hero-v1">🏛️ היכנסו למשרד התלת-ממדי החי ←</a>\n'
               '        <a class="btn ghost" href="https://roshpinacare-sys.github.io/FleetHQ/" target="_blank" rel="noopener">ממשק הפורמן ↗</a>')
    html = html.replace(old_cta, new_cta, 1)

    # 3) Shot becomes clickable entry to the room
    old_shot = '<img src="assets/office-top.png" alt="משרד הצי — חדר התפעול החי: סוכנים מול צגים חיים, קיר-משימות וספרייה" width="640" height="360">'
    assert old_shot in html, 'shot img not found'
    new_shot = (f'<a class="shot3d" href="office3d/" aria-label="היכנסו למשרד התלת-ממדי החי (<!-- {MARK} -->חדר תלת-ממדי חי)">\n          '
                + old_shot + '\n          '
                + '<span class="shot3d-btn">🏛️ המשרד התלת-ממדי<small>חדר חי · צוות אמיתי · אמת מהשרשרת</small></span></a>')
    html = html.replace(old_shot, new_shot, 1)
    html = html.replace(f'<!-- {MARK} -->', '', 1)  # keep aria clean; marker lives in CSS
    files['index.html'] = html.encode('utf-8')
    print(f'hero edit applied: {orig_md5} -> {md5(files["index.html"])}')

# ── commit with race-retry ──────────────────────────────────────────────
MESSAGE = ('office(3D): the real 3D room goes live — office3d/ standalone room + hero entry [T12]\n\n'
           '- office3d/: self-contained R3F room (same sources as FleetHQ hq/), truth-bridge pulls\n'
           '  foreman/pulse/beacon DIRECTLY from public raw sources (CORS) — no backend needed.\n'
           '- models/humans: the 3 crew GLBs (byte-identical to FleetHQ).\n'
           '- index.html: 3D entry is the FIRST CTA + clickable hero shot (marker office3d-hero-v1).\n'
           '- Anti-forgery law intact: every number in the room is measured & published; failures\n'
           '  render honestly as unavailable.')

for attempt in range(3):
    st, ref = call('GET', f'/repos/{ORG}/{REPO}/git/ref/heads/main')
    assert st == 200, f'ref failed {st}'
    base_sha = ref['object']['sha']
    st, base_commit = call('GET', f'/repos/{ORG}/{REPO}/git/commits/{base_sha}')
    assert st == 200
    base_tree = base_commit['tree']['sha']

    tree = []
    ok = True
    for path, content in files.items():
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
    print(f'ref update raced ({st}) — retrying on fresh base')
    time.sleep(3)
else:
    sys.exit('FAILED after retries — no push')

# ── readback verification ───────────────────────────────────────────────
time.sleep(2)
for path in ['office3d/index.html', 'office3d/assets/index.js', 'index.html', 'models/humans/Xbot.glb']:
    st, got = call('GET', f'/repos/{ORG}/{REPO}/contents/{path}?ref=main',
                   headers={'Accept': 'application/vnd.github.raw'})
    assert st == 200, f'readback {path}: {st}'
    local = files[path]
    same = md5(got) == md5(local)
    print(f'readback {path}: {"MD5-MATCH" if same else "MISMATCH!"} ({len(got)}B vs {len(local)}B)')
    assert same, f'readback mismatch for {path}'
print('ALL READBACK-VERIFIED')
