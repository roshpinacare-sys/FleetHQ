#!/usr/bin/env python3
"""Recon 3: repo list via /users/, sovereign-runtime.yml, recovery-meta.json, secrets, run #241 result."""
import json, urllib.request, base64

TOK = open('/home/z/my-project/upload/pat.env').read().strip().replace('\r','').replace('\n','')
ORG = 'roshpinacare-sys'
H = {'Authorization': f'Bearer {TOK}', 'Accept': 'application/vnd.github+json', 'User-Agent': 'recon-z-web-f8355c11'}

def gh(path):
    req = urllib.request.Request(f'https://api.github.com{path}', headers=H)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {'__err': f'HTTP {e.code}', '__body': e.read().decode()[:200]}
    except Exception as e:
        return {'__err': str(e)}

print('=== /users/ORG/repos ===')
repos = gh(f'/users/{ORG}/repos?per_page=100&sort=pushed')
if isinstance(repos, list):
    print(f"count={len(repos)}")
    for r in sorted(repos, key=lambda x: x['pushed_at'], reverse=True):
        print(f"{'PRIV' if r['private'] else 'pub '} {r['pushed_at'][:16]} {r['name']:<30} {r.get('language') or '-'}")
else:
    print(repos)

print('\n=== sovereign-runtime.yml (full) ===')
f = gh(f'/repos/{ORG}/saos-runtime/contents/.github/workflows/sovereign-runtime.yml')
if 'content' in f:
    print(base64.b64decode(f['content']).decode())
else:
    print(f)

print('\n=== saos-runtime secrets (names only) ===')
ss = gh(f'/repos/{ORG}/saos-runtime/actions/secrets')
if 'secrets' in ss:
    for s in ss['secrets']:
        print(f"  {s['name']}  updated={s.get('updated_at','?')[:16]}")
else:
    print(ss)

print('\n=== Sandbox secrets (names only) ===')
ss2 = gh(f'/repos/{ORG}/Sandbox/actions/secrets')
if 'secrets' in ss2:
    for s in ss2['secrets']:
        print(f"  {s['name']}  updated={s.get('updated_at','?')[:16]}")
else:
    print(ss2)

print('\n=== saos-runtime run #241 (38139965979) outcome ===')
r = gh(f'/repos/{ORG}/saos-runtime/actions/runs/38139965979')
if 'conclusion' in r:
    print(f"status={r['status']} conclusion={r['conclusion']} updated={r['updated_at']}")
else:
    print(r)
jobs = gh(f'/repos/{ORG}/saos-runtime/actions/runs/38139965979/jobs')
if 'jobs' in jobs:
    for j in jobs['jobs']:
        print(f"job={j['name']} {j['status']}/{j['conclusion']}")
        for s in j.get('steps', []):
            print(f"   {s['name'][:60]:<60} {s['status']:<9} {s['conclusion']}")
