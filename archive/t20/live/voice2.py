#!/usr/bin/env python3
import re, html as H, json

PAGES = {
 "Domain/": "domain-index.html", "Domain/giants.html": "giants_html.f",
 "Domain/reports.html": "reports_html.f", "Domain/sitemap.html": "sitemap_html.f",
 "Domain/standard.html": "standard_html.f", "Domain/net.html": "net_html.f",
 "Domain/truth.html": "truth_html.f", "Domain/versus.html": "versus_html.f",
 "Domain/roast.html": "roast_html.f", "Domain/deposits.html": "deposits_html.f",
 "Domain/dev.html": "dev_html.f", "Domain/wallet.html": "wallet_html.f",
 "Domain/market/": "market_.f", "Domain/marketing/": "marketing_.f",
 "Domain/office3d/": "office3d_.f", "Domain/verify/": "verify_.f",
 "(org)/": "org-index.html", "(org)/standard.html": "org-standard.html",
 "Console/": "console-index.html", "FleetHQ/": "fleethq-index.html",
}
def vis(s):
    s = re.sub(r"<script\b.*?</script>", " ", s, flags=re.S|re.I)
    s = re.sub(r"<style\b.*?</style>", " ", s, flags=re.S|re.I)
    s = re.sub(r"<!--.*?-->", " ", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", H.unescape(s))

CHECKS = {
 "name-גל-standalone": r"(?<![\w])גל(?![\w])",
 "name-שחר-standalone": r"(?<![\w])שחר(?![\w])",
 "latin-Gal": r"\bGal\b",
 "latin-Shachar": r"\bShachar\b",
 "המפעיל": r"המפעיל",
 "הבעלים": r"הבעלים",
 "ביקש": r"ביקש",
 "תמיד": r"תמיד",
 "לעולם": r"לעולם",
 "לנצח": r"לנצח",
 "אף-פעם": r"אף פעם",
 "100%": r"100\s*%",
 "superlatives": r"מהפכני|מדהים|בלתי[- ]נתפס|עוצמתי|פורץ[- ]דרך|מדהימה",
 "deco-quotes": r"[\u201c\u201d\u201e\u00ab\u00bb]",
 "english-ism": r"\b(delve|seamless|robust|cutting[- ]edge|unleash|supercharge|elevate|game[- ]changer)\b",
 "colon-pattern": r"[\u05d0-\u05ea\u201d\"]\s*:\s*[\u05d0-\u05ea]",
}
totals = {}
out = {}
for name, f in PAGES.items():
    v = vis(open(f, encoding="utf-8", errors="replace").read())
    row = {}
    for label, pat in CHECKS.items():
        ms = list(re.finditer(pat, v))
        if label == "colon-pattern":
            # count only in body sentences (visible text), all matches
            row[label] = len(ms)
            continue
        hits = []
        for m in ms:
            s = max(0, m.start()-40); e = min(len(v), m.end()+40)
            hits.append(v[s:e].strip())
        row[label] = hits
    out[name] = row

print(f"{'page':28}", "  ".join(f"{k[:12]:>12}" for k in CHECKS))
for name, row in out.items():
    print(f"{name:28}", "  ".join(f"{(len(v) if isinstance(v,list) else v):>12}" for v in row.values()))
print()
print("=== REAL NAME HITS (standalone) ===")
for name, row in out.items():
    for k in ("name-גל-standalone","name-שחר-standalone","latin-Gal","latin-Shachar","ביקש"):
        if row[k]:
            print(f"--- {name} [{k}] x{len(row[k])}")
            for s in row[k][:4]: print("   …", s, "…")
json.dump(out, open("voice-report2.json","w"), indent=1, ensure_ascii=False)
