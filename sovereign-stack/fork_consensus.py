#!/usr/bin/env python3
"""fork_consensus.py — Aggressive task forking + consensus voting (stdlib-only).

Split a task into N parallel sub-requests across DIFFERENT lanes, collect
answers, and elect the majority cluster via token-set Jaccard similarity.
One dead lane never kills the mission; one hallucinating lane can't win
alone (majority required).
"""
from __future__ import annotations
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional, Tuple

from sovereign_router import SovereignRouter

_TOKEN = re.compile(r"[a-z0-9\u0590-\u05ff]{2,}", re.IGNORECASE)


def _tokens(s: str) -> set:
    return set(t.lower() for t in _TOKEN.findall(s or ""))


def similarity(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def consensus_vote(answers: List[str], sim_threshold: float = 0.45
                   ) -> Tuple[str, Dict[str, Any]]:
    """Elect the representative of the largest cluster. Returns (answer, meta)."""
    if not answers:
        raise RuntimeError("no answers to vote on")
    clusters: List[List[int]] = []
    for i, a in enumerate(answers):
        placed = False
        for cl in clusters:
            if similarity(answers[cl[0]], a) >= sim_threshold:
                cl.append(i)
                placed = True
                break
        if not placed:
            clusters.append([i])
    clusters.sort(key=len, reverse=True)
    best = clusters[0]
    meta = {"n": len(answers), "clusters": len(clusters),
            "top_size": len(best), "unanimous": len(clusters) == 1,
            "members": best}
    # representative: highest mean similarity inside winning cluster
    def mean_sim(idx: int) -> float:
        sims = [similarity(answers[idx], answers[j])
                for j in best if j != idx]
        return sum(sims) / len(sims) if sims else 1.0
    rep = max(best, key=mean_sim)
    return answers[rep], meta


def fork_execute(router: SovereignRouter, system: str, user: str,
                 forks: int = 3, max_tokens: int = 512,
                 spread_models: Optional[List[str]] = None
                 ) -> Tuple[str, Dict[str, Any]]:
    """Run the same prompt on N lanes concurrently; consensus decides.

    Router lanes are rotated per fork (round-robin over healthy routes) so a
    single provider's failure/bias cannot dominate.
    """
    routes = router.routes
    if not routes:
        raise RuntimeError("no routes configured")

    variants: List[Dict[str, str]] = []
    for i in range(min(forks, len(routes) * 2)):
        r = routes[i % len(routes)]
        variants.append({"model": (spread_models[i] if spread_models and
                                   i < len(spread_models) else r.get("model"))})

    def one(i: int) -> Optional[Dict[str, Any]]:
        r = routes[i % len(routes)]
        sub = SovereignRouter(routes=[r], timeout=router.timeout,
                              max_retries=2, breaker=router.breaker)
        try:
            return sub.route([{"role": "system", "content": system},
                              {"role": "user", "content": user}],
                             model=variants[i]["model"], max_tokens=max_tokens)
        except Exception:
            return None

    results: List[Optional[Dict[str, Any]]] = []
    with ThreadPoolExecutor(max_workers=min(forks, 8)) as ex:
        results = list(ex.map(one, range(min(forks, len(routes)))))
    oks = [r for r in results if r]
    if not oks:
        raise RuntimeError("[CRITICAL] all forks died — no lane produced output")
    answers = [r["content"] for r in oks]
    best, meta = consensus_vote(answers)
    meta["lanes"] = [r["lane"] for r in oks]
    meta["latency_s"] = max(r["latency_s"] for r in oks)
    return best, meta


if __name__ == "__main__":
    ans = ["the answer is 42 and the lane is green",
           "the answer is 42 because the rail is green",
           "banana entirely different output none match"]
    best, meta = consensus_vote(ans)
    print("elect:", best, "| meta:", meta)
