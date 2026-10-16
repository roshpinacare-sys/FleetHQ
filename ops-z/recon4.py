#!/usr/bin/env python3
"""Recon 4: run #241 outcome, heartbeat state, vault meta, on-chain fleet state."""
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

def rpc(method, params):
    body = json.dumps({'jsonrpc': '2.0', 'method': method, 'params': params, 'id': 1}).encode()
    req = urllib.request.Request('https://api.steemit.com', data=body,
                                 headers={'Content-Type': 'application/json', 'User-Agent': 'recon-z'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode()).get('result')
    except Exception as e:
        return {'__err': str(e)}

print('=== saos-runtime: last 3 runs ===')
rs = gh(f'/repos/{ORG}/saos-runtime/actions/runs?per_page=3')
for r in rs.get('workflow_runs', []):
    print(f"#{r['run_number']} {r['created_at'][:16]} {r['status']}/{r['conclusion']}")

print('\n=== run #241 jobs/steps ===')
jobs = gh(f'/repos/{ORG}/saos-runtime/actions/runs/38139965979/jobs')
for j in jobs.get('jobs', []):
    print(f"job={j['name']} {j['status']}/{j['conclusion']}")
    for s in j.get('steps', []):
        print(f"   {s['name'][:58]:<58} {s['status']:<9} {s['conclusion']}")

print('\n=== steem@saos-cockpit: state/ci-last-heartbeat.json ===')
for br in ['saos-cockpit', 'main']:
    f = gh(f'/repos/{ORG}/steem/contents/mini-services/saos-engine/state/ci-last-heartbeat.json?ref={br}')
    if 'content' in f:
        raw = base64.b64decode(f['content']).decode()
        print(f'--- branch {br} (sha {f.get("sha","?")[:8]}):')
        try:
            print(json.dumps(json.loads(raw), indent=1)[:2500])
        except Exception:
            print(raw[:2500])
        break
    else:
        print(f'branch {br}: {f}')

print('\n=== steem@main: agent/recovery-meta.json ===')
f = gh(f'/repos/{ORG}/steem/contents/agent/recovery-meta.json?ref=main')
if 'content' in f:
    raw = base64.b64decode(f['content']).decode()
    # mask long secrets: show structure + pass entries truncated
    try:
        d = json.loads(raw)
        def scrub(x, k=''):
            if isinstance(x, dict):
                return {kk: ('***'+str(vv)[-6:] if isinstance(vv,str) and len(vv)>40 else scrub(vv,kk)) for kk,vv in x.items()}
            if isinstance(x, list):
                return [scrub(v,k) for v in x]
            return x
        print(json.dumps(scrub(d), indent=1)[:3000])
    except Exception:
        print(raw[:1500])
else:
    print(f)

print('\n=== steem@main: agent/vault listing ===')
d = gh(f'/repos/{ORG}/steem/contents/agent/vault?ref=main')
if isinstance(d, list):
    for x in d:
        print(f"{x['size']:>9}  {x['name']}")
else:
    print(d)

print('\n=== Steem RPC: fleet accounts state ===')
ACCTS = ['headcorner','haran','cashmachine','wic','woq','tov','spaminator','saos','powerspan','ynet']
res = rpc('condenser_api.get_accounts', [[a for a in ACCTS]])
if isinstance(res, list):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    for a in res:
        vest = float(a['vesting_shares'].split(' ')[0])
        recv = float(a['received_vesting_shares'].split(' ')[0])
        dele = float(a['delegated_vesting_shares'].split(' ')[0])
        eff_vest = vest - dele + recv
        sp = eff_vest * 1e-6 * 2100  # rough VESTS->SP (actual varies ~2050-2200)
        last = (now - datetime.strptime(a['last_post_date'], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc)).total_seconds()/86400
        lav = (now - datetime.strptime(a['last_vote_time'], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc)).total_seconds()/3600
        print(f"@{a['name']:<12} SP≈{sp:7.0f} (own {vest*2.1e-6:7.0f} out {dele*2.1e-6:6.0f} in {recv*2.1e-6:6.0f}) VP={float(a['voting_power'])/100:5.1f}% lastPost={last:5.1f}d lastVote={lav:6.1f}h bal={a['balance']}")
else:
    print(res)

print('\n=== Steem RPC: latest posts of active soldiers ===')
for acct in ['haran','cashmachine','wic','woq','tov','headcorner']:
    disc = rpc('condenser_api.get_discussions_by_blog', [{'tag': acct, 'limit': 2}])
    if isinstance(disc, list):
        for p in disc:
            body = p.get('body','')
            print(f"@{acct:<12} {p['created'][:16]} len={len(body):>5} votes={p['net_votes']:>3} pays={p.get('pending_payout_value','?'):<14} | {p['title'][:60]!r}")
            # quality probe: unique paragraphs, template markers
            paras = [x for x in body.split('\n\n') if x.strip()]
            print(f"   paras={len(paras)} head={body[:110].strip()[:110]!r}")
    else:
        print(f"@{acct}: {disc}")

print('\n=== /tmp local clones ===')
import os
for d0 in ['sbx','ecosystem','sdk-review']:
    p = f'/tmp/{d0}'
    if os.path.isdir(p):
        try:
            print(d0, '->', os.listdir(p)[:12])
        except Exception as e:
            print(d0, e)
