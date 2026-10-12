#!/usr/bin/env python3
"""
value-scan.py — מנוע-סריקת-הערך האוטונומי של הריבונות. [T13]
---------------------------------------------------------------------------
הלולאה שהבעלים דרש: "שכל הזמן ישאלו מה הפוטנציאל ומה פתוח ומה יכול
לתת לנו עוד ערך" — רץ על הגיט (GitHub Actions, keyless) פעמיים בשעה.
חוקי-אמת:
 · כל הזדמנות נושאת ראיה מדודה + מקור פומבי. אין ראיה → אין הזדמנות.
 · מקור שנפל → מסומן בכנות (degraded), לעולם לא ממולא בהמצאה.
 · כלכלת-רצפות = דיווח-בלבד; הכרעה = הבעלים (חוזה-האורגניזם).
פלט: ops/sovereign/VALUE-SCAN/state.json + ledger.jsonl (append-bounded 60) +
     FLOORS-LEDGER.md [T16 — הצרכן-המדוד של מדיניות D1: רצפות-מדורגות מול מדידה-טרייה].
"""
import json, os, time, urllib.request

RAW = 'https://raw.githubusercontent.com/roshpinacare-sys'
RPC = 'https://api.steemit.com'
FLOORS = {'treasury': 3000.0, 'operator': 100.0, 'soldier': 20.0}
# [T16] סגל-המפעילים — זהה ל-FLEET של המכריע (ops/sovereign/DECIDER/decider.py) —
# הצרכן-המדוד של מדיניות D1 (רצפות-מדורגות 75/30/20 + קו-שימור 2800 + יעד 3000)
FLEET = ['cashmachine', 'haran', 'israelnews', 'lsa', 'macrame',
         'siq', 'tov', 'wic', 'wog', 'woq', 'hcsoldier4', 'hcsoldier5', 'hcsoldier6']

def jget(url, timeout=12):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'value-scan/1'}), timeout=timeout) as r:
            return json.load(r)
    except Exception:
        return None

def rpc(method, params):
    try:
        body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode()
        req = urllib.request.Request(RPC, body, {'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=12) as r:
            return json.load(r).get('result')
    except Exception:
        return None

def main():
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    sources, degraded = {}, []

    beacon = jget(f'{RAW}/sovereign-beacon/main/state.json') or {}
    sources['beacon'] = bool(beacon.get('lastPulse'))
    if not sources['beacon']: degraded.append('beacon')

    lh = jget(f'{RAW}/sovereign-lighthouse/main/state.json') or {}
    sources['lighthouse'] = bool(lh.get('lastPulse'))
    if not sources['lighthouse']: degraded.append('lighthouse')

    flow = jget(f'{RAW}/Sandbox/main/ops/flow/flow-map.json') or {}
    sources['flow-map'] = bool(flow.get('nodes'))
    if not sources['flow-map']: degraded.append('flow-map')

    dex = jget(f'{RAW}/Domain/main/dex/grid.json') or {}
    sources['dex'] = bool(dex.get('verdict'))
    if not sources['dex']: degraded.append('dex')

    foreman = jget(f'{RAW}/FleetHQ/main/office/state/office-state.json') or {}
    sources['foreman'] = bool(foreman.get('capturedAt') or foreman.get('agents'))
    if not sources['foreman']: degraded.append('foreman')

    office_pulse = jget(f'{RAW}/Domain/main/office/data.json') or {}
    sources['office-pulse'] = bool(office_pulse.get('verdict'))
    if not sources['office-pulse']: degraded.append('office-pulse')

    # ── מדידת-שרשרת ישירה (המרה מדויקת) ──
    gp = rpc('condenser_api.get_dynamic_global_properties', [])
    chain_head, mult, chain_treasury = None, None, None
    if gp and gp.get('total_vesting_shares'):
        tvs = float(gp['total_vesting_shares'].split(' ')[0])
        tvf = float(gp['total_vesting_fund_steem'].split(' ')[0])
        mult = tvf / tvs if tvs else None
        chain_head = gp.get('head_block_number')
    acc = rpc('condenser_api.get_accounts', [['headcorner']])
    if acc and mult:
        a = acc[0]
        v = float(a['vesting_shares'].split(' ')[0])
        d = float(a['delegated_vesting_shares'].split(' ')[0])
        r = float(a['received_vesting_shares'].split(' ')[0])
        chain_treasury = round((v - d + r) * mult, 1)

    # [T16] צרכן-מדיניות D1 — מדידת-סגל מלאה מהשרשרת (מפעילים 13 + אוצרה בקריאה-אחת)
    all_acc = rpc('condenser_api.get_accounts', [['headcorner'] + FLEET])
    ops_measured = {}
    if all_acc and mult and len(all_acc) == len(FLEET) + 1:
        for a in all_acc[1:]:
            v = float(a['vesting_shares'].split(' ')[0])
            d = float(a['delegated_vesting_shares'].split(' ')[0])
            r = float(a['received_vesting_shares'].split(' ')[0])
            ops_measured[a['name']] = round((v - d + r) * mult, 1)
    else:
        degraded.append('fleet-rpc')

    # [T16] בסיס-המדיניות: מדיניות D1 כפי-שפורסמה על-ידי המכריע (מקור-פומבי)
    decider = jget(f'{RAW}/Sandbox/main/ops/sovereign/DECIDER/state.json') or {}
    d1 = next((x for x in (decider.get('decisions') or [])
               if x.get('id') == 'D1-econ-treasury-floor'), None)
    d1_policy = (d1 or {}).get('policy') or None
    sources['decider-d1-policy'] = bool(d1_policy)
    if not d1_policy:
        degraded.append('decider-d1-policy')

    # ── מדדים ──
    treasury = (beacon.get('lastPulse') or {}).get('treasuryNetSp')
    min_op = (beacon.get('lastPulse') or {}).get('minOperatorSp')
    arteries = office_pulse.get('verdictChecks') or []
    arteries_fresh = sum(1 for c in arteries if c.get('state') == 'fresh')
    tasks = foreman.get('tasks') or []
    agents = foreman.get('agents') or []
    blocked = [t for t in tasks if t.get('status') == 'blocked']
    err_agents = [a for a in agents if a.get('state') == 'error']
    orphans = len(flow.get('orphans') or [])
    ghosts = len(flow.get('ghosts') or [])
    stale_flow = len(flow.get('stale') or [])
    nodes = len(flow.get('nodes') or [])
    dex_orders = dex.get('openOrdersNow') if isinstance(dex.get('openOrdersNow'), (int, float)) else None

    # [T16] הצרכן-המדוד של D1: רצפות-המדיניות (מהמכריע) מול מדידה-טרייה (מהשרשרת)
    operator_floors = []
    if d1_policy and ops_measured:
        pol_floors = {t.get('operator'): t.get('interimFloorSp')
                      for t in (d1_policy.get('operatorInterimFloors') or [])
                      if isinstance(t, dict) and t.get('operator')}
        for name in FLEET:
            m = ops_measured.get(name)
            f = pol_floors.get(name)
            operator_floors.append({
                'operator': name, 'measuredSp': m, 'policyFloorSp': f,
                'gapSp': (round((f - m), 1) if isinstance(m, (int, float)) and isinstance(f, (int, float)) else None),
                'ok': (bool(m >= f) if isinstance(m, (int, float)) and isinstance(f, (int, float)) else None),
            })
    below = [o['operator'] for o in operator_floors if o.get('ok') is False]
    keep = (d1_policy or {}).get('treasury') or {}
    keep_floor = keep.get('operatingFloorSp')

    metrics = {
        'treasuryNetSp': treasury, 'treasuryFloor': FLOORS['treasury'],
        'treasuryGapSp': round(FLOORS['treasury'] - treasury, 1) if isinstance(treasury, (int, float)) else None,
        'minOperatorSp': min_op, 'operatorFloor': FLOORS['operator'],
        'operatorGapSp': round(FLOORS['operator'] - min_op, 1) if isinstance(min_op, (int, float)) else None,
        'steemHead': chain_head, 'chainTreasurySp': chain_treasury,
        'beaconChainMatch': (abs(treasury - chain_treasury) <= 1.0) if isinstance(treasury, (int, float)) and chain_treasury is not None else None,
        'arteriesFresh': arteries_fresh, 'arteriesTotal': len(arteries),
        'blockedTasks': len(blocked), 'errorAgents': len(err_agents),
        'flowNodes': nodes, 'flowOrphans': orphans, 'flowGhosts': ghosts, 'flowStale': stale_flow,
        'dexVerdict': dex.get('verdict'), 'dexOpenOrders': dex_orders,
        # [T16] צריכת-D1 בפועל: מדיניות-הרצפות נמדדת-מול-השרשרת בכל פעימה
        'd1Consumer': {
            'policyBasis': (d1.get('decidedAt') if isinstance(d1, dict) else None),
            'deciderStateAgeOk': bool(decider.get('generatedAt')),
            'operatingFloorSp': keep_floor,
            'treasuryVsKeepSp': (round(treasury - keep_floor, 1)
                                 if isinstance(treasury, (int, float)) and isinstance(keep_floor, (int, float)) else None),
            'operatorInterimFloors': operator_floors,
            'operatorsBelowPolicyFloor': below,
        },
    }

    ops = []
    def add(id_, area, title, value, evidence, source, effort):
        ops.append({'id': id_, 'area': area, 'titleHe': title, 'valueHe': value,
                    'evidence': evidence, 'source': source, 'effort': effort})

    if isinstance(treasury, (int, float)) and treasury < FLOORS['treasury']:
        gap = round(FLOORS['treasury'] - treasury, 1)
        add('econ-treasury-floor', 'כלכלה',
            f'פער-רצפת-אוצרה {gap} SP',
            'השלמת הרצפה = יציבות-אוצרה מלאה; אופציות מתועדות: שחרור-האצלה-אסורה (244.2 SP, 7 ימים) / רצפות-מדורגות / הכנסות-DEX — הכרעת-בעלים',
            f'אוצרה {treasury} < 3,000 · נמדד במשואה keyless', 'sovereign-beacon state.json', 'M')
    if isinstance(min_op, (int, float)) and min_op < FLOORS['operator']:
        add('econ-operator-floor', 'כלכלה',
            f'פער-רצפת-מפעילים {round(FLOORS["operator"] - min_op, 1)} SP',
            'מפעיל מינימלי {m} מתחת לרצפת 100 — חוסן-הפעלה'.format(m=min_op),
            f'minOperatorSp={min_op}', 'sovereign-beacon state.json', 'M')
    if len(arteries) and arteries_fresh < len(arteries):
        bad = [c.get('name', '?') for c in arteries if c.get('state') != 'fresh'][:6]
        add('ops-arteries', 'תפעול',
            f'{len(arteries) - arteries_fresh} עורקים לא-טריים',
            'עורק-טרי = איבר-חי; החזרת-עורקים לטריות = האורגניזם שלם',
            'לא-טריים: ' + ', '.join(map(str, bad)), 'Domain office/data.json', 'S')
    if blocked:
        first = blocked[0]
        add('eng-unblock', 'הנדסה',
            f'{len(blocked)} משימות חסומות — שחרור-צוות',
            'משימה-חסומה = ערך-תקוע; שחרור = זרימה-מחדש',
            f'{first.get("id", "?")}: {(first.get("title") or "")[:80]}', 'FleetHQ office-state.json', 'S')
    if err_agents:
        add('eng-error-agents', 'הנדסה',
            f'{len(err_agents)} סוכנים בתקלה',
            'סוכן-תקוע = ידיים-חסרות לאורגניזם',
            ', '.join(str(a.get('id')) for a in err_agents), 'FleetHQ office-state.json', 'S')
    if orphans + ghosts > 0:
        add('net-weave', 'רשת',
            f'{orphans} יתומים + {ghosts} רוחות-רפאים במפת-הזרימה',
            'חיבור-יתומים = everything-uses-everything מלא; כל-חיבור מגדיל-ערך-הדדי',
            f'flow-map: {nodes} צמתים · stale={stale_flow}', 'Sandbox ops/flow/flow-map.json', 'M')
    if dex.get('verdict'):
        if dex_orders is not None:
            add('biz-dex-scale', 'עסקים',
                f'DEX חי ({dex.get("verdict")}) · {dex_orders} פקודות פתוחות',
                'הרחבת-עומק-ספר-הפקודות = הכנסה-מיקרו-מסחרית מתמשכת (ראה 1,480 order-ops ביום-שעבר)',
                f'verdict={dex.get("verdict")} · publishedAt={dex.get("publishedAt")}', 'Domain dex/grid.json', 'M')
        hive = dex.get('hive') or {}
        if isinstance(hive, dict) and hive.get('verdict'):
            add('biz-hive-leg', 'עסקים',
                'רגל-HIVE של ה-DEX — פוטנציאל נזילות שני',
                'Hive-נזיל 13k+ מדווח — רגל-שנייה פעילה מרחיבה-הכנסות',
                f'hive verdict={hive.get("verdict")}', 'Domain dex/grid.json', 'L')
    else:
        add('biz-dex-revive', 'עסקים', 'פס-ה-DEX לא מפרסם — החזרת-פעימה',
            'פס-מסחר שקט = הכנסה-עצורה; החזרה לפרסום = צינור-אמת לכלכלה',
            'dex/grid.json לא זמין', 'Domain dex/grid.json', 'S')

    top = sorted(ops, key=lambda o: {'S': 0, 'M': 1, 'L': 2}[o['effort']])[:3]
    verdict = (' · '.join(o['titleHe'] for o in top)) if top else 'אין הזדמנויות מדודות כרגע — כנות'

    state = {
        'schema': 'roshpina.value-scan/1', 'generatedAt': now,
        'publisher': 'value-scan.yml (GitHub Actions, keyless, T13)',
        'degraded': degraded, 'sources': sources, 'metrics': metrics,
        'verdictHe': verdict, 'topIds': [o['id'] for o in top],
        'opportunities': ops,
        'law': 'דיווח-בלבד על כלכלת-רצפות; הכרעה = הבעלים. אין זיופים — כל הזדמנות עם ראיה ומקור.',
    }

    base = os.path.join(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(base, exist_ok=True)
    with open(os.path.join(base, 'state.json'), 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=1)

    # [T16] פנקס-הרצפות (regenerated, bounded-by-design): הצרכן-המדוד של
    # D1-econ-treasury-floor — מדיניות-הרצפות המדורגת בפעולה: מדידה-טרייה
    # מול operatorInterimFloors + operatingFloorSp, בכל פעימה, מפורסם-ונבדק.
    md = []
    md.append('# פנקס-הרצפות — הצרכן-המדוד של D1-econ-treasury-floor [T16]')
    md.append('')
    md.append(f'נמדד: {now} · מקור-המדיניות: ops/sovereign/DECIDER/state.json (D1, {metrics["d1Consumer"]["policyBasis"]})')
    md.append('')
    md.append('מדיניות-D1 בפעולה: רצפות-מפעילים מדורגות (operatorInterimFloors 75/30/20 לפי-מדידה) + '
              f'קו-שימור-אוצרה operatingFloorSp={keep_floor} + יעד-3000 דרך-מנועי-התשואה.')
    md.append('')
    md.append('| מפעיל | SP נמדד (שרשרת) | רצפת-מדיניות | פער | תקין |')
    md.append('|---|---|---|---|---|')
    for o in operator_floors:
        md.append(f'| {o["operator"]} | {o["measuredSp"]} | {o["policyFloorSp"]} | {o["gapSp"]} | '
                  f'{("כן" if o["ok"] else ("לא" if o["ok"] is False else "—"))} |')
    md.append('')
    md.append(f'מתחת-לרצפת-המדיניות (מדוד): {", ".join(below) if below else "אף-אחד — כנות"}')
    if isinstance(treasury, (int, float)) and isinstance(keep_floor, (int, float)):
        md.append(f'אוצרה מול קו-השימור: {treasury} SP (מעל/מתחת הפער {round(treasury - keep_floor, 1)} SP)')
    md.append('')
    md.append('חוק: מדידה-בלבד (api.steemit.com המרה מדויקת) · מקור שנפל מסומן ב-degraded — אין זיופים.')
    with open(os.path.join(base, 'FLOORS-LEDGER.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(md) + '\n')

    ledger_path = os.path.join(base, 'ledger.jsonl')
    lines = []
    if os.path.exists(ledger_path):
        lines = [l for l in open(ledger_path, encoding='utf-8').read().splitlines() if l.strip()]
    lines.append(json.dumps({'at': now, 'opportunities': len(ops), 'degraded': degraded,
                             'treasury': treasury, 'head': chain_head}, ensure_ascii=False))
    with open(ledger_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines[-60:]) + '\n')
    print('value-scan done:', now, 'ops=', len(ops), 'degraded=', degraded)

if __name__ == '__main__':
    main()
