#!/usr/bin/env python3
"""Rigorous analysis of exec-log.jsonl — no undefined variables, verifiable output."""
import json
import sys
from collections import Counter

SRC = '/home/z/my-project/tmp/exec-log.jsonl'
tags = Counter()
accounts = Counter()
broadcasts = []
parse_err = 0
total = 0

with open(SRC) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        total += 1
        try:
            d = json.loads(line)
        except Exception:
            parse_err += 1
            continue
        tag = str(d.get('tag') or d.get('step') or d.get('rail') or 'NO_TAG')
        tags[tag] += 1
        txid = d.get('txid') or d.get('tx_id') or d.get('txHash')
        ok = d.get('ok')
        if txid and ok is not False:
            broadcasts.append(d)
            accounts[str(d.get('account') or 'NO_ACCOUNT')] += 1

print(f'total entries: {total}, parse errors: {parse_err}, broadcast-like: {len(broadcasts)}')
print()
print('=== top 20 tags ===')
for t, n in tags.most_common(20):
    print(f'{n:7} {t}')
print()
print('=== broadcast-like by account (top 15) ===')
for a, n in accounts.most_common(15):
    print(f'{n:6} {a}')
print()
print('=== last 10 broadcast-like entries ===')
for d in broadcasts[-10:]:
    print(
        str(d.get('at'))[:19], '|',
        str(d.get('account'))[:18], '|',
        str(d.get('tag'))[:30], '| ok:', d.get('ok'),
        '| txid:', str(d.get('txid') or d.get('tx_id') or d.get('txHash'))[:24],
    )
