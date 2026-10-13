#!/usr/bin/env python3
import re, sys, json, html as H

PAGES = {
 "Domain/ (landing)": "domain-index.html",
 "Domain/giants.html": "giants_html.f",
 "Domain/reports.html": "reports_html.f",
 "Domain/sitemap.html": "sitemap_html.f",
 "Domain/standard.html": "standard_html.f",
 "Domain/net.html": "net_html.f",
 "Domain/truth.html": "truth_html.f",
 "Domain/versus.html": "versus_html.f",
 "Domain/roast.html": "roast_html.f",
 "Domain/deposits.html": "deposits_html.f",
 "Domain/dev.html": "dev_html.f",
 "Domain/wallet.html": "wallet_html.f",
 "Domain/market/": "market_.f",
 "Domain/marketing/": "marketing_.f",
 "Domain/office3d/": "office3d_.f",
 "Domain/verify/": "verify_.f",
 "(org) front door": "org-index.html",
 "(org)/standard.html": "org-standard.html",
 "Console/": "console-index.html",
 "FleetHQ/": "fleethq-index.html",
}

PATTERNS = {
 "personal-operator (המפעיל)": r"המפעיל",
 "personal-owner (הבעלים)": r"הבעלים",
 "asked-personally (ביקש)": r"ביקש(?:תי| ש(?:נעשה|אעשה))?",
 "first-name-גל": r"גל(?!י|ות|א|ימ|גל)",
 "first-name-שחר": r"שחר",
 "deco-dquotes": r"[\u201c\u201d]",
 "superlative-מהפכני": r"מהפכני",
 "superlative-מדהים": r"מדהים",
 "superlative-בלתי-נתפס": r"בלתי[- ]נתפס",
 "superlative-עוצמתי": r"עוצמתי",
 "promise-תמיד": r"תמיד",
 "promise-לעולם": r"לעולם",
 "promise-100%": r"100\s*%",
 "promise-אף-פעם": r"אף פעם",
 "promise-לנצח": r"לנצח",
 "promise-חייב-לעבוד": r"חייב לעבוד",
}

def strip_html(s):
    s = re.sub(r"<script\b.*?</script>", " ", s, flags=re.S|re.I)
    s = re.sub(r"<style\b.*?</style>", " ", s, flags=re.S|re.I)
    s = re.sub(r"<!--.*?-->", " ", s, flags=re.S)
    return s

def text_of(s):
    s = strip_html(s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = H.unescape(s)
    return re.sub(r"\s+", " ", s)

report = {}
for name, f in PAGES.items():
    raw = open(f, encoding="utf-8", errors="replace").read()
    vis = text_of(raw)
    # also scan raw for dquotes inside scripts (JS copy) but report separately
    res = {}
    for label, pat in PATTERNS.items():
        hits = []
        scope = vis
        if label == "deco-dquotes":
            # decorative quotes: count in visible text AND script strings
            scope = raw
        for m in re.finditer(pat, scope):
            s = max(0, m.start()-45); e = min(len(scope), m.end()+45)
            ctx = scope[s:e].strip()
            hits.append(ctx)
        if hits:
            res[label] = {"count": len(hits), "samples": hits[:3]}
    report[name] = res

for name, res in report.items():
    total = sum(r["count"] for r in res.values())
    print(f"\n### {name}  (violations: {total})")
    if not res:
        print("  clean")
        continue
    for label, r in sorted(res.items()):
        print(f"  [{label}] x{r['count']}")
        for s in r["samples"]:
            print(f"      …{s}…")
json.dump(report, open("voice-report.json","w"), indent=1, ensure_ascii=False)
