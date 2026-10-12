#!/usr/bin/env python3
"""Recon: what have other agents done since e92f22f? + quota probe + fleet state."""
import json, urllib.request, base64, sys, datetime

TOK = open('/home/z/my-project/upload/pat.env').read().strip().replace('\r','').replace('\n','')
ORG = 'roshpinacare-sys'
H = {'Authorization': f'Bearer {TOK}', 'Accept': 'application/vnd.github+json', 'User-Agent': 'recon-z-web-f8355c11'}

def gh(path):
    req = urllib.request.Request(f'https://api.github.com{path}', headers=H)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        return {'__err': str(e)}

print('=== RATE LIMIT ===')
rl = gh('/rate_limit')
if 'resources' in rl:
    core = rl['resources']['core']
    print(f"core: {core['remaining']}/{core['limit']} reset {datetime.datetime.utcfromtimestamp(core['reset']).strftime('%H:%M')}")

print('\n=== ORG REPOS (sorted by pushed) ===')
repos = gh(f'/orgs/{ORG}/repos?per_page=100&sort=pushed')
if isinstance(repos, list):
    print(f"total: {len(repos)}")
    for r in repos[:30]:
        print(f"{'PRIV' if r['private'] else 'pub '} {r['pushed_at'][:16]} {r['name']:<28} {r['default_branch']}")
else:
    print(repos)

for repo in ['Sandbox', 'saos-runtime', 'steem', 'Defi']:
    print(f'\n=== {repo} last commits ===')
    cs = gh(f'/repos/{ORG}/{repo}/commits?per_page=8')
    if isinstance(cs, list):
        for c in cs:
            msg = (c['commit']['message'] or '').split('\n')[0][:90]
            print(f"{c['sha'][:7]} {c['commit']['committer']['date'][:16]} {c['commit']['committer']['name'][:20]:<20} {msg}")
    else:
        print(cs)

for repo in ['Sandbox', 'saos-runtime', 'Defi', 'Domain', 'Console']:
    print(f'\n=== {repo} last workflow runs ===')
    rs = gh(f'/repos/{ORG}/{repo}/actions/runs?per_page=4')
    if 'workflow_runs' in rs:
        for r in rs['workflow_runs']:
            print(f"{r['created_at'][:16]} {r['event']:<20} {r['status']:<11} {(r['conclusion'] or '-'):<10} {r['name'][:40]}")
    else:
        print(rs)

print('\n=== Sandbox ops/AGENT-LEDGER.md at HEAD ===')
f = gh(f'/repos/{ORG}/Sandbox/contents/ops/AGENT-LEDGER.md')
if 'content' in f:
    print(base64.b64decode(f['content']).decode()[:4000])
else:
    print(f)

print('\n=== Sandbox ops dir listing ===')
d = gh(f'/repos/{ORG}/Sandbox/contents/ops')
if isinstance(d, list):
    for x in d:
        print(f"{x['type']:<5} {x['size']:>8} {x['name']}")
else:
    print(d)
