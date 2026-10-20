#!/usr/bin/env python3
"""Two atomic mutations, each verified:
1. Sandbox: register agent on ops/AGENT-LEDGER.md (append-only).
2. saos-runtime: fix workflow step order (Arm BEFORE Beat) in sovereign-runtime.yml.
"""
import json, urllib.request, base64, sys

TOK = open('/home/z/my-project/upload/pat.env').read().strip().replace('\r','').replace('\n','')
ORG = 'roshpinacare-sys'
AGENT = 'z-web-f8355c11'
H = {'Authorization': f'Bearer {TOK}', 'Accept': 'application/vnd.github+json', 'User-Agent': f'{AGENT}'}

def api(method, path, body=None):
    req = urllib.request.Request(f'https://api.github.com{path}', method=method,
                                 data=json.dumps(body).encode() if body else None, headers=H)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        return {'__err': f'HTTP {e.code}', '__body': e.read().decode()[:300]}
    except Exception as e:
        return {'__err': str(e)}

def put_file(repo, branch, path, content_bytes, message, sha=None):
    body = {'message': message, 'content': base64.b64encode(content_bytes).decode(), 'branch': branch}
    if sha: body['sha'] = sha
    return api('PUT', f'/repos/{ORG}/{repo}/contents/{path}', body)

# ── 1. AGENT-LEDGER registration ──────────────────────────────────────────
path = 'ops/AGENT-LEDGER.md'
f = api('GET', f'/repos/{ORG}/Sandbox/contents/{path}?ref=main')
if 'content' not in f:
    print('LEDGER-FAIL:', f); sys.exit(1)
cur = base64.b64decode(f['content']).decode()
if AGENT in cur:
    print('LEDGER: already registered, skip')
else:
    line = f"2026-10-11 | {AGENT} | תיקון סדר-שלבים ב-sovereign-runtime (חימוש לפני הפעימה) + corpus +28 מאמרים | (ראה commits) | saos-runtime.yml + content-corpus.json\n"
    new = cur.rstrip('\n') + '\n' + line
    r = put_file('Sandbox', 'main', path, new.encode(),
                 f'ledger: register {AGENT} (workflow step-order fix + corpus batch) [append-only]', f['sha'])
    ok = 'commit' in r
    print(f"LEDGER: {'OK ' + r['commit']['sha'][:7] if ok else 'FAIL ' + str(r)}")

# ── 2. Workflow step-order fix ────────────────────────────────────────────
wf_path = '.github/workflows/sovereign-runtime.yml'
f2 = api('GET', f'/repos/{ORG}/saos-runtime/contents/{wf_path}?ref=main')
if 'content' not in f2:
    print('WF-FAIL:', f2); sys.exit(1)
src = base64.b64decode(f2['content']).decode()

BEAT_MARK = '      - name: Beat env + posting arming (standing order travels as a repo secret)'
ARM_MARK = '      - name: Arm the posting stream (T-61'
COMMIT_MARK = '      - name: Commit state back (FF-only, no force, ever)'

if src.index(ARM_MARK) < src.index(BEAT_MARK):
    print('WF: already ordered arm-first, no change needed')
    sys.exit(0)

i_beat = src.index(BEAT_MARK)
i_arm = src.index(ARM_MARK)
i_commit = src.index(COMMIT_MARK)
beat_block = src[i_beat:i_arm]
arm_block = src[i_arm:i_commit]
fixed = src[:i_beat] + arm_block + beat_block + src[i_commit:]
# sanity: arm now precedes beat, blocks intact
assert fixed.index(ARM_MARK) < fixed.index(BEAT_MARK)
assert fixed.count(BEAT_MARK) == 1 and fixed.count(ARM_MARK) == 1
assert len(fixed.splitlines()) == len(src.splitlines())  # pure reorder

r2 = put_file('saos-runtime', 'main', wf_path, fixed.encode(),
              'fix(runtime): arm the posting stream BEFORE the beat — the streamer reads the armed file inside ci-cycle, so arming after it is dead code (root cause of LIVE-REFUSED-NOT-ARMED since ae16adc)\n\nAgent: z-web-f8355c11', f2['sha'])
print(f"WORKFLOW-FIX: {'OK ' + r2['commit']['sha'][:7] if 'commit' in r2 else 'FAIL ' + str(r2)}")
