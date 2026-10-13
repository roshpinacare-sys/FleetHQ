#!/usr/bin/env python3
import re, json, posixpath

BASE = "https://roshpinacare-sys.github.io"
# source -> (base_path_within_site, file)
FILES = {
  "Domain/ (landing)": ("Domain", "domain-index.html"),
  "Domain/giants.html": ("Domain", "giants_html.f"),
  "Domain/reports.html": ("Domain", "reports_html.f"),
  "Domain/sitemap.html": ("Domain", "sitemap_html.f"),
  "Domain/standard.html": ("Domain", "standard_html.f"),
  "Domain/net.html": ("Domain", "net_html.f"),
  "Domain/truth.html": ("Domain", "truth_html.f"),
  "Domain/versus.html": ("Domain", "versus_html.f"),
  "Domain/roast.html": ("Domain", "roast_html.f"),
  "Domain/deposits.html": ("Domain", "deposits_html.f"),
  "Domain/dev.html": ("Domain", "dev_html.f"),
  "Domain/wallet.html": ("Domain", "wallet_html.f"),
  "Domain/market/": ("Domain/market", "market_.f"),
  "Domain/marketing/": ("Domain/marketing", "marketing_.f"),
  "Domain/office3d/": ("Domain/office3d", "office3d_.f"),
  "Domain/verify/": ("Domain/verify", "verify_.f"),
  "(org) front door": ("", "org-index.html"),
  "(org)/standard.html": ("", "org-standard.html"),
}
def resolve(base, href):
    if href.startswith("//"): return "https:"+href
    if href.startswith("http"): return href
    if href.startswith("/"): return BASE + href
    return BASE + "/" + posixpath.normpath(posixpath.join(base, href))

pairs = []
for src, (base, f) in FILES.items():
    html = open(f, encoding="utf-8", errors="replace").read()
    for h in set(re.findall(r'(?:href|src)\s*=\s*["\']([^"\'#]+)["\']', html)):
        if h.startswith(("data:","javascript:","mailto:")): continue
        pairs.append({"source": src, "href": h, "url": resolve(base, h)})

sm = open("sitemap_html.f", encoding="utf-8", errors="replace").read()
sm_paths = sorted(set(re.findall(r'href=["\']([a-zA-Z0-9_\-./]+)["\']', sm)))
for p in sm_paths:
    pairs.append({"source": "sitemap-inventory", "href": p, "url": BASE + "/Domain/" + p})

json.dump(pairs, open("pairs.json","w"), indent=1, ensure_ascii=False)
print("pairs", len(pairs))
