#!/usr/bin/env python3
"""Recon 2: recovery plan content, repo visibilities, saos-runtime workflow, steem HEAD, agent ledger."""
import json, urllib.request, base64, datetime

TOK = open('/home/z/my-project/upload/pat.env').read().strip()
ORG = 'roshpinacare-sys'
H = {'Authorization': f'Bearer {TOK}', 'Accept': 'application/vnd.github+json', 'User-Agent': 'recon-z-web-f8355c11'}

def gh(path):
    req = urllib.request.Request(f'https://api.github.com{path}', headers=H)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        return {'__err': str(e)}

print('=== FULL REPO LIST ===')
repos = gh(f'/orgs/{ORG}/repos?per_page=100')
if isinstance(repos, list):
    for r in sorted(repos, key=lambda x: x['pushed_at'], reverse=True):
        print(f"{'PRIV' if r['private'] else 'pub '} {r['pushed_at'][:16]} {r['name']:<30} {r.get('language') or '-'}")

print('\n=== SOVEREIGN-RECOVERY-PLAN-2026-10-11.md (full) ===')
f = gh(f'/repos/{ORG}/Sandbox/contents/ops/SOVEREIGN-RECOVERY-PLAN-2026-10-11.md')
if 'content' in f:
    print(base64.b64decode(f['content']).decode())
else:
    print(f)

print('\n=== AGENT-LEDGER.md (full) ===')
f = gh(f'/repos/{ORG}/Sandbox/contents/ops/AGENT-LEDGER.md')
if 'content' in f:
    print(base64.b64decode(f['content']).decode())
else:
    print(f)

print('\n=== saos-runtime repo meta ===')
m = gh(f'/repos/{ORG}/saos-runtime')
print({k: m.get(k) for k in ['private','default_branch','pushed_at','size','language']})

print('\n=== saos-runtime workflows ===')
ws = gh(f'/repos/{ORG}/saos-runtime/actions/workflows')
if 'workflows' in ws:
    for w in ws['workflows']:
        print(f"id={w['id']} state={w['state']:<10} {w['name'][:50]:<50} {w['path']}")
else:
    print(ws)

print('\n=== saos-runtime sovereign-runtime latest run ===')
rs = gh(f'/repos/{ORG}/saos-runtime/actions/runs?per_page=2')
if 'workflow_runs' in rs:
    for r in rs['workflow_runs']:
        print(f"{r['id']} {r['created_at'][:16]} {r['status']} {r['conclusion']} run_number={r['run_number']}")
    if rs['workflow_runs']:
        rid = rs['workflow_runs'][0]['id']
        jobs = gh(f'/repos/{ORG}/saos-runtime/actions/runs/{rid}/jobs')
        for j in jobs.get('jobs', []):
            print(f"job: {j['name']} -> {j['status']}/{j['conclusion']}")
            for s in j.get('steps', [])[:15]:
                print(f"   step: {s['name'][:45]:<45} {s['conclusion']}")

print('\n=== steem: recovery-meta.json still at HEAD? ===')
f = gh(f'/repos/{ORG}/steem/contents/agent/recovery-meta.json')
if 'content' in f:
    print('YES at HEAD, size', f['size'])
else:
    print('not found:', f.get('__err') or f.get('message'))

print('\n=== steem workflows state ===')
ws = gh(f'/repos/{ORG}/steem/actions/workflows')
if 'workflows' in ws:
    for w in ws['workflows']:
        print(f"state={w['state']:<10} {w['name'][:45]:<45} {w['path']}")
else:
    print(ws)
