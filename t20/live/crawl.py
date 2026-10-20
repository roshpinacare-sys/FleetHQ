#!/usr/bin/env python3
import re, subprocess, json, sys, posixpath, urllib.parse, time

BASE = "https://roshpinacare-sys.github.io"
SOURCES = {
  "Domain/": open("domain-index.html",encoding="utf-8",errors="replace").read(),
  "Domain/giants.html": open("giants_html.f",encoding="utf-8",errors="replace").read(),
  "Domain/reports.html": open("reports_html.f",encoding="utf-8",errors="replace").read(),
  "Domain/sitemap.html": open("sitemap_html.f",encoding="utf-8",errors="replace").read(),
  "Domain/standard.html": open("standard_html.f",encoding="utf-8",errors="replace").read(),
  "Domain/net.html": open("net_html.f",encoding="utf-8",errors="replace").read(),
  "Domain/truth.html": open("truth_html.f",encoding="utf-8",errors="replace").read(),
  "Domain/versus.html": open("versus_html.f",encoding="utf-8",errors="replace").read(),
  "Domain/roast.html": open("roast_html.f",encoding="utf-8",errors="replace").read(),
  "Domain/deposits.html": open("deposits_html.f",encoding="utf-8",errors="replace").read(),
  "Domain/dev.html": open("dev_html.f",encoding="utf-8",errors="replace").read(),
  "Domain/wallet.html": open("wallet_html.f",encoding="utf-8",errors="replace").read(),
  "Domain/market/": open("market_.f",encoding="utf-8",errors="replace").read(),
  "Domain/marketing/": open("marketing_.f",encoding="utf-8",errors="replace").read(),
  "Domain/office3d/": open("office3d_.f",encoding="utf-8",errors="replace").read(),
  "Domain/verify/": open("verify_.f",encoding="utf-8",errors="replace").read(),
  "(org)/": open("org-index.html",encoding="utf-8",errors="replace").read(),
  "(org)/standard.html": open("org-standard.html",encoding="utf-8",errors="replace").read(),
}

def resolve(src, href):
    if href.startswith("//"): return "https:"+href
    if href.startswith("http"): return href
    base_dir = posixpath.dirname(src.rstrip("/"))
    if href.startswith("/"):
        return BASE + href
    return BASE + posixpath.normpath(posixpath.join(base_dir, href))

pairs = {}
for src, html in SOURCES.items():
    hrefs = re.findall(r'(?:href|src)\s*=\s*["\']([^"\'#]+)["\']', html)
    for h in set(hrefs):
        if h.startswith(("data:","javascript:","mailto:")): continue
        pairs.setdefault(src, set()).add(h)

# sitemap-listed pages (canonical inventory)
sm = open("sitemap_html.f",encoding="utf-8",errors="replace").read()
sitemap_paths = sorted(set(re.findall(r'href=["\']([a-zA-Z0-9_\-./]+)["\']', sm)))
print("SITEMAP_LISTS", len(sitemap_paths), "paths", file=sys.stderr)

def status(url):
    r = subprocess.run(["curl","-s","-o","/dev/null","-w","%{http_code} %{size_download}","--max-time","20",url], capture_output=True, text=True)
    code, _, size = r.stdout.partition(" ")
    return code, int(size or 0)

results = {}
checked = {}
for src, hrefs in sorted(pairs.items()):
    for h in sorted(hrefs):
        u = resolve(src, h)
        if u not in checked:
            checked[u] = status(u)
        code, size = checked[u]
        results.setdefault(src, []).append({"href": h, "url": u, "code": code, "size": size})

# sitemap pages as standalone (they live under /Domain/)
sm_results = []
for p in sitemap_paths:
    u = BASE + "/Domain/" + p if not p.startswith("http") else p
    code, size = status(u)
    sm_results.append({"path": p, "url": u, "code": code, "size": size})

json.dump({"links": results, "sitemap": sm_results}, open("crawl-results.json","w"), indent=1, ensure_ascii=False)

print("=== PER-SOURCE LINK STATUS (non-200 marked) ===")
bad = 0
for src in sorted(results):
    for r in sorted(results[src], key=lambda x: x["href"]):
        flag = "" if r["code"]=="200" else f"  <<{r['code']}>>"
        if r["code"]!="200": bad += 1
        print(f"{r['code']:>4} {r['size']:>7}  {src}  ->  {r['href']}{flag}")
print("NON200_COUNT", bad)
print()
print("=== SITEMAP-PAGE STATUS ===")
bad2 = 0
for r in sm_results:
    flag = "" if r["code"]=="200" else f"  <<{r['code']}>>"
    if r["code"]!="200": bad2 += 1
    print(f"{r['code']:>4} {r['size']:>7}  {r['path']}{flag}")
print("SITEMAP_NON200_COUNT", bad2)
