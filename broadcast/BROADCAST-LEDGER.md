# broadcast ledger — append-only record of staged drafts and gate states

One line per event. Newest last. This file records; it does not legislate —
the law stays in README.md beside it.

## 2026-10-13T10:48Z — draft staged: sovereign-loop-proof

- what: `drafts/2026-10-13-sovereign-loop-proof/` — the first real post draft of
  the content rail (Hebrew, "רשת שמודדת את עצמה — הוכחת הלולאה הריבונית של
  SAOS-NET"), package + post.md + dryrun-receipt.json.
- gate state: everything before the signature executed and receipted
  (structure, exposure-law 0 findings, voice-law 0 findings, live chain-read);
  the sign step is fail-closed per the law — the custody bridge has not
  deployed the posting WIF into the runtime env on this machine, and the law
  forbids importing key material from plaintext.
- owner release applied: 2026-10-10 (README.md, recorded verbatim) — covers the
  lane up to the dryrun-sign gate; the signature stays the boundary.
- public book (measured same morning): Domain/content/published.json is no
  longer empty — the published-ledger lane (Domain/.github/workflows/
published-ledger.yml, first live books 2026-10-13T10:31Z) now measures the
  live chain publications keylessly via public RPC and rewrites the book every
  30 minutes (20 posts at first measure: STEEM:10 + HIVE:10). The book is a
  live ledger, so staged drafts are NOT injected into it — their lawful place
  is here in broadcast/ with an honest pending-sign-gate state, and the panel
  renders that state when a draft path is wired into the book.
- root cause this closes (measured): no writer for content/published.json
  existed in any fleet repo from its creation (2026-10-12T17:09:30Z) until the
  published-ledger lane went live 2026-10-13T10:31Z; the panel consumed an
  empty stub the whole time. This shift additionally gives the panel honest
  empty-vs-unreachable states and a three-node RPC fallback.
- by: shift 27-d (pulse-steem).
