#!/usr/bin/env python3
import re, json, posixpath

BASE = "https://roshpinacare-sys.github.io"
FILES = {
  "Domain/": "domain-index.html",
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
  "(org)/": "org-index.html",
  "(org)/standard.html": "org-standard.html",
}
def resolve(src, href):
    if href.startswith("//"): return "https:"+href
    if href.startswith("http"): return href
    if href.startswith("/"): return BASE + href
    base_dir = posixpath.dirname(src.rstrip("/"))
    return BASE + "/" + posixpath.normpath(posixpath.join(base_dir, href)).lstrip("/")

pairs = []
uniq = set()
for src, f in FILES.items():
    html = open(f, encoding="utf-8", errors="replace").read()
    for h in set(re.findall(r'(?:href|src)\s*=\s*["\']([^"\'#]+)["\']', html)):
        if h.startswith(("data:","javascript:","mailto:")): continue
        u = resolve(src, h)
        pairs.append({"source": src, "href": h, "url": u})
        uniq.add(u)

sm = open("sitemap_html.f", encoding="utf-8", errors="replace").read()
sm_paths = sorted(set(re.findall(r'href=["\']([a-zA-Z0-9_\-./]+)["\']', sm)))
for p in sm_paths:
    u = BASE + "/Domain/" + p
    pairs.append({"source": "sitemap-inventory", "href": p, "url": u})
    uniq.add(u)

json.dump({"pairs": pairs, "uniq": sorted(uniq)}, open("url-universe.json","w"), indent=1, ensure_ascii=False)
print("pairs", len(pairs), "unique", len(uniq), "sitemap_paths", len(sm_paths))
