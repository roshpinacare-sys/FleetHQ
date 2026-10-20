#!/bin/bash
# extract links from a file and normalize
python3 - "$1" <<'PY'
import sys, re, posixpath
f = sys.argv[1]
html = open(f, encoding='utf-8', errors='replace').read()
links = re.findall(r'(?:href|src|fetch|data-src)\s*[=(]\s*["\']([^"\']+)["\']', html)
# also fetch('...') patterns
links += re.findall(r'fetch\(\s*[`\'"]([^`\'"]+)[`\'"]', html)
out = set()
for l in links:
    if l.startswith('#') or l.startswith('data:') or l.startswith('javascript:') or l.startswith('mailto:'):
        continue
    if l.startswith('{') or '$' in l or '${' in l:
        continue
    out.add(l)
for l in sorted(out):
    print(l)
PY
