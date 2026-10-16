# reef Rung 3 — guarded agent episode · 2026-10-03T15:48:22Z
CR-0027: the CR-0023 booked condition — agent bash ONLY through the CR-0019 guard, inside the reef record→verify→reward loop.
- closed: **true** · serve: started+verified dead
- episode: status=FINAL · reward=1 (file=493 vs truth=493) · final=493
- turns: 4 · receipts: 4 · bash: 3 · denies: 0 · guard selftest allow=true deny=true
- receipts: 25ea574d… 1bd93b4a… e1ab8d60… 86654adc…
| row | status | detail |
|---|---|---|
| episode | EPISODE-COMPLETE | status=FINAL reward=1 turns=4 bash=3 denies=0 |
| serve | SERVE-WINDOW-CLOSED | SIGTERM → verified dead, pgrep reef.service = 0 processes |
store: /tmp/reef-run/.reef/agent-record/<hash(rung3-guarded-agent)>.sqlite3 — shared ledger dir with Rung 2 (basic-arithmetic).
