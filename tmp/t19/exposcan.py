#!/usr/bin/env python3
"""t19-exposcan.py — targeted exposure scan across public repos (FleetHQ/Domain/Console).
Finds: owner-verbatim directive text, identity/entry hints, the new pubkey/WIF leakage, stale surfaces."""
import json, os, re, sys, time, urllib.request

TOKEN = open('/home/z/my-project/upload/pat.env').read().strip()
ORG = 'roshpinacare-sys'
API = 'https://api.github.com'
RAW = 'https://raw.githubusercontent.com'
REPOS = ['FleetHQ', 'Domain', 'Console']

# markers: (label, regex, severity)
MARKERS = [
    ('WIF-LEAK', r'5KQGnQ3GWx7NPF9YSip2FBztEqYBnbsJyaFYWMQMCt6grcScU4G', 'CRITICAL'),
    ('PUBKEY-NEW', r'STM8StTG4aesGfmAUgBpMU9LKvoz98E5uz9eCCtEUvYM8Ywnicnoh', 'CRITICAL'),
    ('WIF-PATTERN', r'(?<![A-Za-z0-9])[5KHL][1-9A-HJ-NP-Za-km-z]{49,51}(?![A-Za-z0-9])', 'CRITICAL'),
    ('ACCOUNT-NAME', r'headcorner', 'HIGH'),
    ('SECRET-NAMES', r'(STEEM_ACTIVE_WIF|HEAD_CORNER_MASTER|HEADCORNER|MAIN_KEY|CI_.*_WIF|\.secrets/)', 'HIGH'),
    ('OWNER-DIRECTIVE-1', r'סבב-אחרון', 'HIGH'),
    ('OWNER-DIRECTIVE-2', r'דווח מצב אוצרה', 'HIGH'),
    ('OWNER-DIRECTIVE-3', r'צו-בעלים', 'HIGH'),
    ('OWNER-DIRECTIVE-4', r'אימות-ערוץ: הריבונות', 'HIGH'),
    ('OWNER-DIRECTIVE-5', r'הוראת-בדיקה', 'HIGH'),
    ('CLAIM-HINT', r'(סיסמת-אב|WIF \(posting\)|מפתח הפרסום של|המפתח הפעיל של)', 'MEDIUM'),
    ('IDENTITY-BIND', r'(המנהל הוא @{0,1}\w+|המפעיל הוא|המפקד @{0,1}\w+|הארנק של|האוצרה של \S*headcorner)', 'MEDIUM'),
    ('PAT-HINT', r'(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})', 'CRITICAL'),
]

PATH_KEYWORDS = re.compile(
    r'(state|report|decision|directive|ledger|ack|gate|operator|progress|handoff|status|live|roast|dev|versus|wallet|deposit|truth|readme|sovereign|estate|activation|note|bloc|fate|inbox|log)', re.I)
TEXT_EXT = ('.md', '.html', '.json', '.yml', '.yaml', '.js', '.cjs', '.mjs', '.jsonl', '.txt', '.css')

def api(path):
    req = urllib.request.Request(API + path, headers={'Authorization': f'Bearer {TOKEN}', 'User-Agent': 't19-scan'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def raw(repo, path, ref='main'):
    try:
        req = urllib.request.Request(f'{RAW}/{ORG}/{repo}/{path}?ref={ref}',
                                     headers={'Authorization': f'Bearer {TOKEN}', 'User-Agent': 't19-scan'})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode('utf-8', 'replace')
    except Exception as e:
        return None

def scan():
    results = []
    for repo in REPOS:
        tree = json.load(open(f'/home/z/my-project/tmp/t19/{repo}-tree.json'))
        blobs = [t['path'] for t in tree.get('tree', []) if t['type'] == 'blob' and t['path'].endswith(TEXT_EXT)]
        targets = [p for p in blobs if PATH_KEYWORDS.search(p.split('/')[-1]) or p.count('/') <= 1]
        # cap per repo for rate sanity, prioritized by path keyword
        targets = targets[:700]
        print(f'{repo}: {len(blobs)} text blobs, scanning {len(targets)} targets...', flush=True)
        for p in targets:
            content = raw(repo, p)
            if content is None:
                continue
            for label, rx, sev in MARKERS:
                for m in re.finditer(rx, content):
                    s = max(0, m.start() - 60)
                    ctx = content[s:m.end() + 60].replace('\n', ' ')[:150]
                    results.append({'repo': repo, 'path': p, 'marker': label, 'severity': sev, 'ctx': ctx})
                    break  # one hit per marker per file
    return results

if __name__ == '__main__':
    out = scan()
    json.dump(out, open('/home/z/my-project/tmp/t19/exposure-scan.json', 'w'), ensure_ascii=False, indent=1)
    print(f'\nTOTAL FINDINGS: {len(out)}')
    by_sev = {}
    for r in out:
        by_sev.setdefault(r['severity'], []).append(r)
    for sev in ['CRITICAL', 'HIGH', 'MEDIUM']:
        print(f"\n=== {sev} ({len(by_sev.get(sev, []))}) ===")
        for r in by_sev.get(sev, [])[:40]:
            print(f"  [{r['marker']}] {r['repo']}/{r['path']}")
            print(f"      …{r['ctx']}…")
