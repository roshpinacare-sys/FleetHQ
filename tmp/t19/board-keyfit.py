#!/usr/bin/env python3
"""t19-board-keyfit.py — append keyfit directive to board.json (status OPEN) + dispatch decider + watch."""
import base64, json, time, urllib.request

TOKEN = open('/home/z/my-project/upload/pat.env').read().strip()
ORG = 'roshpinacare-sys'
API = 'https://api.github.com'
BOARD = '/repos/roshpinacare-sys/Sandbox/contents/ops/sovereign/DIRECTIVES/board.json?ref=main'

def gh(url, method='GET', payload=None, ua='t19-board'):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json', 'User-Agent': ua})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            body = r.read()
            return r.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

# 1. read board
s, b = gh(f'{API}{BOARD}')
board = json.loads(base64.b64decode(b['content']).decode())
dirs = board.get('directives', [])
# skip if already present
if any('התאמת-מפתח' in str(d.get('text', '')) for d in dirs):
    print('ALREADY-PRESENT — skip append')
else:
    dirs.append({
        'id': f"DIR-20261012-{len(dirs)+1:04d}",
        'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'from': 'agent-T19 (owner-attached-key, owner standing mandate)',
        'channel': 'keyfit-verification-chain',
        'priority': 'P0',
        'text': ('צו-התאמת-מפתח: המפתח-הציבורי STM8StTG4aesGfmAUgBpMU9LKvoz98E5uz9eCCtEUvYM8Ywnicnoh '
                 '(נמדד: WIF-תקין, טרם-רשום — המקור: המפתח שצירף הבעלים לסוכן-T19) יתווסף כ-authority-פרסום '
                 '(posting, weight 1) על החשבון-הראשי ב-STEEM בעדכון-רשות שמשמר את המפתח-הקיים; '
                 'אימות-קריאה-מהשרשרת אחרי-השידור; ב-BLURT אותו-דבר כשהצמתים חוזרים-מתחזוקה. '
                 'הסוד-עצמו לא-נמצא-ולא-יימצא בשום-קובץ.'),
        'status': 'OPEN',
    })
    board['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    content = json.dumps(board, ensure_ascii=False, indent=1).encode()
    s, b = gh(f'{API}/repos/roshpinacare-sys/Sandbox/contents/ops/sovereign/DIRECTIVES/board.json', 'PUT', {
        'message': 'T19 keyfit directive (OPEN, P0): register owner-attached public key as posting authority — measured evidence attached',
        'content': base64.b64encode(content).decode(), 'sha': b['sha']})
    print('BOARD-WRITE:', s, 'commit', b.get('commit', {}).get('sha', '')[:9])
    # readback
    s2, b2 = gh(f'{API}{BOARD}')
    back = json.loads(base64.b64decode(b2['content']).decode())
    match = any(d.get('status') == 'OPEN' and 'התאמת-מפתח' in str(d.get('text', '')) for d in back.get('directives', []))
    print('READBACK-OPEN-PRESENT:', match)

# 2. dispatch decider
s, b = gh(f'{API}/repos/roshpinacare-sys/Sandbox/actions/workflows/sovereign-decider.yml/dispatches', 'POST', {'ref': 'main'}, ua='t19-ignite')
print('DISPATCH:', s, '(204=accepted)')

# 3. watch latest run
time.sleep(20)
for i in range(12):
    s, b = gh(f'{API}/repos/roshpinacare-sys/Sandbox/actions/workflows/sovereign-decider.yml/runs?per_page=1')
    r = b.get('workflow_runs', [{}])[0]
    print(f"run {r.get('id')} {r.get('created_at','')[11:19]} {r.get('event')} {r.get('status')} {r.get('conclusion')}")
    if r.get('status') == 'completed':
        break
    time.sleep(25)
