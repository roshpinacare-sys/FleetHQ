#!/usr/bin/env python
"""rung3_guarded_episode.py — reef Rung 3: the guarded agent-bash episode (CR-0027, Z-60).

Rung 2 (CR-0023) proved the reef record→verify→reward loop with a single-shot
inference and NO agent bash. Rung 3 closes the booked condition: an agent loop
whose bash executes ONLY through the CR-0019 command-guard (GuardedLocalEnvironment,
imported from the fleet tree — in-tree enforcement, resets cannot erase it).

One episode:
  fixture  — deterministic task files under /tmp/reef-rung3/task (sum known)
  solve    — multi-turn agent loop: each turn is a reef inference_with_record
             (receipt per turn); fenced bash executes ONLY via the guard;
             the agent finishes with `FINAL: <int>` after writing answer.txt
  verify   — deterministic local verifier: answer.txt vs the sum recomputed
             from the task dir at verify time
  learn    — one reef report grading the attempt, references = ALL turn
             receipts (the causal chain: every model turn links to the reward)

Laws bound in:
  GUARD-IN-PATH   every model-authored bash goes through GuardedLocalEnvironment;
                  denies are receipts (per-run SWE_GUARD_LOG), never silent
  GUARD-LIVENESS  each run proves allow + scoped-deny before the agent starts
  KEYLESS-TIER-B  no keys in env; upstream is the CR-0015 shim
  FAIL-LOUD       no ghost episodes: no receipts → no report; upstream death
                  mid-episode → report reward 0 with the reason booked
  RECORD→REWARD   the report references every inference receipt it grades

Output: one JSON result line on stdout AND a copy at /tmp/reef-rung3/episode-result.json
(the desk parses the file — minisweagent's import banner pollutes stdout).
Exit 0 = episode completed (reward 0 is an honest outcome); 1 = infrastructure failure.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
import time
from pathlib import Path

WORK = Path(os.environ.get("REEF_RUNG3_WORK", "/tmp/reef-rung3"))
GUARD_LOG = WORK / "guard-denies.jsonl"
RESULT_FILE = WORK / "episode-result.json"
SCENARIO = "rung3-guarded-agent"
MAX_TURNS = 6
MAX_OUTPUT_CHARS = 800

# --- guard import FIRST, with the per-run deny log already scoped -------------
os.environ["SWE_GUARD_LOG"] = str(GUARD_LOG)
GUARD_DIR = Path(__file__).resolve().parent.parent / "swe-guard"
sys.path.insert(0, str(GUARD_DIR))

FENCE = re.compile(r"```bash\s*\n(.*?)```", re.DOTALL | re.IGNORECASE)
FINAL = re.compile(r"FINAL:\s*(-?\d+)")

TASK_FILES = {"part_1.num": 17, "part_2.num": 23, "part_3.num": 391, "part_4.num": 58, "part_5.num": 4}

SYSTEM = (
    "You are the roshpinacare fleet's rung-3 reef agent (CR-0027). "
    "You act through a local bash shell wrapped by the fleet command-guard: reads are free, "
    "mutations must stay under /tmp, secret material is off-limits, destructive patterns are refused "
    "(denied commands exit 126 with a policy message — adapt within policy).\n"
    "Protocol — each turn reply with EXACTLY ONE of:\n"
    "1. A single bash command inside a ```bash fenced block (it runs through the guard; you see exit code and output).\n"
    "2. `FINAL: <integer>` — only after you have written the answer file.\n"
    "Nothing else. No prose outside the fence or the FINAL line.\n"
    "You MUST inspect the task files with bash before answering — never guess the sum."
)


def fail(stage: str, detail: str) -> int:
    res = {"ok": False, "stage": stage, "detail": detail, "scenario": SCENARIO}
    WORK.mkdir(parents=True, exist_ok=True)
    RESULT_FILE.write_text(json.dumps(res, indent=2) + "\n")
    print(json.dumps(res))
    return 1


def main() -> int:
    t0 = time.time()
    WORK.mkdir(parents=True, exist_ok=True)

    # ---- guard liveness (real enforcement receipts, clearly labeled self-test) ----
    from guard_env import GuardedLocalEnvironment  # noqa: E402  (in-tree, CR-0019)

    guard = GuardedLocalEnvironment()
    r_allow = guard.execute({"command": "echo guard-liveness-allow"}, cwd=str(WORK))
    r_deny = guard.execute({"command": "echo x > /etc/reef-rung3-liveness-probe"}, cwd=str(WORK))
    guard_selftest = {
        "allow_ok": r_allow["returncode"] == 0 and "guard-liveness-allow" in r_allow["output"],
        "deny_ok": r_deny["returncode"] == 126 and "COMMAND-GUARD DENY" in r_deny["output"],
    }
    if not (guard_selftest["allow_ok"] and guard_selftest["deny_ok"]):
        return fail("guard-selftest", f"guard failed liveness: {guard_selftest}")

    # ---- fixture (deterministic; verifier recomputes truth from disk anyway) ----
    task_dir = WORK / "task"
    if task_dir.exists():
        shutil.rmtree(task_dir)
    task_dir.mkdir(parents=True)
    for name, val in TASK_FILES.items():
        (task_dir / name).write_text(f"{val}\n")

    answer_path = WORK / "answer.txt"
    if answer_path.exists():
        answer_path.unlink()

    task_text = (
        "The directory /tmp/reef-rung3/task contains text files, each holding one integer. "
        f"Compute the sum of ALL the integers and write ONLY that integer to /tmp/reef-rung3/answer.txt. "
        f"Your working directory is {WORK}. Finish with `FINAL: <the integer you wrote>`."
    )

    # ---- reef client (service assumed up — the desk owns the serve-window) ----
    from reef_client import ReefClient  # noqa: E402

    service_url = os.environ.get("REEF_SERVICE_URL", "http://127.0.0.1:8900")
    token = os.environ.get("REEF_TOKEN", "reef-rung3-local")
    client = ReefClient(service_url, token=token, timeout_s=120.0)

    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": task_text},
    ]

    receipts: list[str] = []
    turns = []
    bash_calls = 0
    denies = 0
    final_line: int | None = None
    status = "RUNNING"
    upstream_fail = None

    for turn in range(1, MAX_TURNS + 1):
        t_turn = time.time()
        try:
            body, receipt = client.inference_with_record(
                SCENARIO,
                "/v1/chat/completions",
                {"model": "z-ai", "messages": messages},
            )
        except Exception as e:  # upstream death — fail loud, no ghost turn
            upstream_fail = f"turn {turn}: {type(e).__name__}: {str(e)[:200]}"
            status = "UPSTREAM-FAIL"
            break
        receipts.append(receipt)
        try:
            content = body["choices"][0]["message"]["content"] or ""
        except Exception:
            content = ""
        turns.append({"turn": turn, "receipt": receipt, "ms": int((time.time() - t_turn) * 1000), "chars": len(content)})

        # Parser law (run-3 lesson, booked): the model often emits MULTIPLE fences
        # (one command + one fenced "FINAL: n"). Fenced content is command text —
        # a FINAL inside a fence is NOT protocol speech. FINAL only counts in the
        # fence-free remainder; the first non-FINAL command block is executed
        # (one command per turn), extras are suppressed and counted.
        blocks = [b.strip() for b in FENCE.findall(content) if b.strip()]
        rest = FENCE.sub("", content)
        m_final = FINAL.search(rest)
        cmd_blocks = [b for b in blocks if not FINAL.search(b)]
        extra_blocks = max(0, len(blocks) - len(cmd_blocks) - (1 if blocks and not cmd_blocks else 0))
        turns[-1]["blocks"] = len(blocks)
        turns[-1]["extra_blocks_suppressed"] = extra_blocks

        if cmd_blocks:
            cmd = cmd_blocks[0]
            bash_calls += 1
            r = guard.execute({"command": cmd}, cwd=str(WORK))
            rc = r.get("returncode", -1)
            if rc == 126:
                denies += 1
            out = (r.get("output") or "")[:MAX_OUTPUT_CHARS]
            messages.append({"role": "assistant", "content": f"```bash\n{cmd}\n```"})
            tail = f"\n({extra_blocks} extra fenced block(s) suppressed — ONE command per turn; re-issue later if needed)" if extra_blocks else ""
            messages.append({"role": "user", "content": f"guard exit {rc}\n{out}{tail}"})
        elif m_final:
            candidate = int(m_final.group(1))
            if answer_path.exists():
                final_line = candidate
                status = "FINAL"
                break
            # FINAL without its artifact is a protocol violation, not a finish:
            # the attempt continues (the verifier still grades the final state)
            messages.append({"role": "assistant", "content": content[:400]})
            messages.append({"role": "user", "content": (
                "FINAL rejected: /tmp/reef-rung3/answer.txt does not exist. "
                "Use bash to read the task files, compute the sum, write ONLY the integer to "
                "/tmp/reef-rung3/answer.txt, then reply FINAL: <integer>."
            )})
        else:
            messages.append({"role": "assistant", "content": content[:400]})
            messages.append({"role": "user", "content": "Reply with ONE ```bash fenced command, or `FINAL: <integer>` when the answer file is written."})

    if status == "RUNNING":
        status = "TURNS-EXHAUSTED"

    # ---- verifier: deterministic, truth recomputed from the task dir NOW ----
    try:
        truth = sum(int((task_dir / n).read_text().strip()) for n in os.listdir(task_dir) if n.endswith(".num"))
        file_value = int(answer_path.read_text().strip()) if answer_path.exists() else None
        reward = 1 if (file_value is not None and file_value == truth) else 0
        verifier = {"ok": True, "truth": truth, "file_value": file_value, "note": "truth recomputed from task dir at verify time"}
    except Exception as e:
        truth = file_value = reward = None
        verifier = {"ok": False, "detail": str(e)[:200]}
        status = status if status == "UPSTREAM-FAIL" else "VERIFIER-FAIL"

    # ---- learn: report the graded attempt (references = ALL turn receipts) ----
    # Wire contract (reef/service/wire.py ReportPayload): score | feedback |
    # references | metadata — anything else is canonicalized away server-side
    # (the Z-58 run's 'reward' key silently dropped; the declared field is `score`).
    reported = False
    if receipts:
        metadata = {
            "turns": len(turns),
            "bash_calls": bash_calls,
            "guard_denies": denies,
            "final_line": final_line,
            "file_value": file_value,
            "expected": truth,
            "status": status,
            "guard": "CR-0019 GuardedLocalEnvironment (in-tree agents/swe-guard/guard_env.py)",
        }
        if status == "UPSTREAM-FAIL":
            metadata["reason"] = f"upstream failure mid-episode ({upstream_fail}) — graded 0, fail loud"
        payload = {
            "score": float(reward if reward is not None else 0),
            "feedback": f"guarded bash episode: {len(turns)} turns, {bash_calls} guard-executed bash calls, {denies} denies; file={file_value} vs truth={truth} (status {status})",
            "metadata": metadata,
        }
        try:
            client.report(SCENARIO, payload, references=receipts)
            reported = True
        except Exception as e:
            upstream_fail = upstream_fail or f"report failed: {type(e).__name__}: {str(e)[:160]}"

    res = {
        "ok": status not in ("UPSTREAM-FAIL", "VERIFIER-FAIL"),
        "scenario": SCENARIO,
        "status": status,
        "reward": reward,
        "expected": truth,
        "file_value": file_value,
        "final_line": final_line,
        "final_matches_file": (final_line == file_value) if (final_line is not None and file_value is not None) else None,
        "turns": turns,
        "bash_calls": bash_calls,
        "guard_denies": denies,
        "guard_selftest": guard_selftest,
        "receipts": receipts,
        "reported": reported,
        "upstream_fail": upstream_fail,
        "guard_source": str(GUARD_DIR / "guard_env.py"),
        "work": str(WORK),
        "ms": int((time.time() - t0) * 1000),
    }
    RESULT_FILE.write_text(json.dumps(res, indent=2) + "\n")
    print(json.dumps(res))
    return 0


if __name__ == "__main__":
    sys.exit(main())
