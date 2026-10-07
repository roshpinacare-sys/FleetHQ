# Security & Sanitization Notes

This document is the public record of what this repository contains, what it deliberately
does **not** contain, and how the demo/live separation works. If you fork or deploy Fleet HQ,
this is the checklist to keep your own deployment equally safe.

## What is in this repository

- **Source code only**: the foreman service (`foreman/`) and the web office (`web/`).
- **Synthetic demo books** (`foreman/demo-data/`): every file starts with a
  `"notice": "DEMO DATA — SYNTHETIC"` field. Accounts, numbers, IDs and verdicts in those
  files are invented placeholders (e.g. `demo-pool-a`, `demo-verify`).
- **No credentials of any kind.** No API keys, tokens, passwords, or private URLs exist in
  this repository. The LLM key is read from the process environment only
  (`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`), and the `z-ai-web-dev-sdk`
  integration is loaded dynamically if installed locally — it is not a declared dependency.

## What is deliberately NOT here

- **No real data books.** The live mode reads whatever directory `AGENT_HQ_DATA_DIR`
  points at — *your* copy, on *your* machine. The default is `foreman/data/` which does not
  exist in a fresh checkout (create it; it is git-ignored).
- **No real account names, balances, chain identifiers, or endpoints.** Nothing in the
  code or the demo data references any production system.
- **No write access to your books.** The agent toolset is read-and-report only:
  `list_books`, `read_book`, `measure`, `cross_check`, `write_report` (into the office's
  in-memory library), `message`, `ask_human`. There is no shell tool, no arbitrary file
  write, and no network tool.

## Demo vs live, in one table

| | Demo (`sim`) | Live (`live`) |
|---|---|---|
| Agents | scripted scenario | real LLM calls |
| Books | bundled `demo-data/` (synthetic) | `AGENT_HQ_DATA_DIR` (yours) |
| Labeling | `DEMO · SIMULATION` watermark + badge, always visible | `Live crew · real model agents` badge |
| Network | listens on loopback via your own proxy | same |

## Deployment checklist

1. Never commit `foreman/data/` — it is in `.gitignore`; keep it that way.
2. Provide keys via environment (`.env` is git-ignored; see `.env.example`).
3. Put the foreman behind your own proxy/firewall. The socket surface trusts the local
   network; do not expose raw port 3010 to the internet.
4. If you extend the toolset with write/networking tools, gate them behind the same
   `ask_human` decision flow — that is the pattern this project is built around.

## Reporting

Open an issue for anything you find. Thank you.
