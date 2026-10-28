#!/usr/bin/env python3
"""Merge corpus-batch1.json into content-corpus.json with engine-law validation."""
import json, re, sys

CORPUS = '/tmp/steem-partial/mini-services/saos-engine/content-corpus.json'
BATCH = '/home/z/my-project/ops-z/corpus-batch1.json'
OPS = '/tmp/steem-partial/mini-services/saos-engine/state/content-ops.json'

# Banned substrings from content.mjs sanitizeDraft (post-symbol-law they auto-rewrite
# colons/dashes/quotes, but we pre-clean anyway to match house style)
BANNED = ["headcorner", "saos", "צבא", "army of accounts", "our accounts", "multi-account",
          "we control", "our fleet", "guaranteed profit", "price target", "in today's world",
          "in conclusion", "—", "–", "‒", "―"]
GENERIC = ["in this article", "in this post", "in this guide", "let's dive", "lets dive",
           "as we all know", "it's no secret", "it is no secret", "in the ever-evolving",
           "ever-evolving world", "in today's fast-paced", "in the world of", "welcome to the future",
           "have you ever wondered", "have you ever asked", "are you tired of", "unlock the",
           "unleash the", "embark on a journey", "delve into", "dive into the world", "a tapestry of",
           "to sum up", "at the end of the day", "game-changer", "game changer", "the digital landscape",
           "revolutionize the way", "in the realm of"]

def words(s): return len(re.findall(r"[A-Za-z']+", s))
def sim(a, b):
    STOP = {'the','a','an','of','on','in','and','to','is','it','that','my','what','how'}
    A = set(re.findall(r"[a-z']+", a.lower())) - STOP
    B = set(re.findall(r"[a-z']+", b.lower())) - STOP
    if not A or not B: return 0.0
    return len(A & B) / len(A | B)

corpus = json.load(open(CORPUS))
batch = json.load(open(BATCH))
ops = json.load(open(OPS))
print(f"corpus: {len(corpus)} entries | batch: {len(batch)} | spentTitles: {len(ops.get('spentTitles', []))}")

spent = set(ops.get('spentTitles', []))
existing_titles = {e['title'] for e in corpus}
existing_ids = {e['id'] for e in corpus}
existing_topic_voice = {(e['voice'], e['topic']) for e in corpus}

errors = []
for e in batch:
    eid = e.get('id', '?')
    t, b, tags = e.get('title',''), e.get('body',''), e.get('tags', [])
    if eid in existing_ids: errors.append(f"{eid}: id collision")
    if len(t) < 12: errors.append(f"{eid}: title too short")
    wc = words(b)
    if wc < 300: errors.append(f"{eid}: body {wc} words < 300")
    if len(tags) < 2: errors.append(f"{eid}: tags < 2")
    blob = (t + '\n' + b).lower()
    for w in BANNED:
        if w in blob: errors.append(f"{eid}: banned {w!r}")
    open140 = (t + '\n' + b[:140]).lower()
    for g in GENERIC:
        if g in open140: errors.append(f"{eid}: generic opener {g!r}")
    # similarity vs all spent + existing corpus titles
    for st in list(spent) + list(existing_titles):
        if sim(t, st) >= 0.55:
            errors.append(f"{eid}: title sim {sim(t, st):.2f} vs spent {st[:50]!r}")
    # duplicate (voice, topic)
    if (e.get('voice'), e.get('topic')) in existing_topic_voice:
        errors.append(f"{eid}: voice/topic dup {e.get('voice')}/{e.get('topic')}")

if errors:
    print(f"\n{len(errors)} ERRORS:")
    for x in errors: print("  " + x)
    sys.exit(1)

merged = corpus + batch
json.dump(merged, open(CORPUS, 'w'), ensure_ascii=False, indent=1)
wcs = [words(e['body']) for e in batch]
print(f"OK — merged {len(batch)} entries. corpus: {len(corpus)} -> {len(merged)}")
print(f"batch body words: min={min(wcs)} max={max(wcs)} total={sum(wcs)}")
