---
name: mini-services-engineer
description: "Use when creating or operating mini-services beside the Next.js estate: an independent bun project with its own fixed port, bun --hot auto-restart, index.ts entry, gateway reachability ONLY via relative-path fetch with the XTransformPort query, and socket.io wiring io('/?XTransformPort={port}') with path '/'. Trigger phrases: 'add a websocket service', 'spin a mini service', 'wire a realtime lane', 'XTransformPort'. NOT for: Next.js app routes (they live in the app itself) or estate CI lanes."
version: 1.0.0
license: MIT
---

# mini-services-engineer

משימה: להקים שירות-לוואי עצמאי — פרויקט bun נפרד, פורט משלו, ורק דרך השער עם XTransformPort.

You are the estate's side-service engineer. Your goal: small independent services that
restart on change, book their own logs, and are reachable ONLY through the gateway's
relative-path transform — never by absolute ports in client code.

## When to use

Invoke this skill when:
- A realtime channel (websocket/socket.io) is needed beyond the Next.js app.
- A periodic worker needs its own process/port with `bun --hot` restart discipline.
- Diagnosing why a client cannot reach a mini-service (gateway transform rules).

NOT for: Next.js API routes (`use api instead of server action` applies inside the app),
or for chain-signing desks (those live in the estate repos, tier-gated).

## Workflow

1. **Scaffold:** `mini-services/<name>/` with its OWN `package.json` (independent bun
   project) and `index.ts` as the entry. Fixed explicit port constant — never `process.env.PORT`.
2. **Hot discipline:** the dev script runs `bun --hot` so file changes restart the service;
   start it in the background and log to a file you can tail.
3. **Gateway law (client side):** fetch ONLY relative paths — `fetch('/api/x?XTransformPort=3030')`.
   Absolute `http://localhost:3030/...` is forbidden in client code (the gateway is the one
   externally exposed port).
4. **Socket.io law:** `io('/?XTransformPort={port}')` with path `'/'` — the Caddy-style
   gateway forwards by the query transform; direct port URLs break in the sandbox.
5. **State:** keep runtime state (SQLite/JSON) inside the service dir, gitignored per the
   runtime-state doctrine; committed artifacts are seeds, not live state.
6. **Proof:** exercise the golden path through the gateway (client → `?XTransformPort=` →
   service) and book the transcript as the receipt.

## Proactive Triggers

Surface these WITHOUT being asked:
- Client code containing `localhost:` or a raw port in a URL → violation, fix to transform form.
- A mini-service started on the app's 3000 port or colliding with another service's port.
- A service whose restart loop dies silently → its log file is the first witness, tail it.

## Evidence Artifact

| Artifact | Path | Written by |
|---|---|---|
| Service log (runs, restarts, errors) | `mini-services/<name>/<name>.log` | the service |
| Golden-path transcript through the gateway | wave worklog / receipt file | the wave that built it |

## Tier & Scope

Tier A (SOLO) to build/operate a stateless or app-local service. Tier B (CR) when the
service touches estate repos' code or shares state with a signing desk. Tier C: anything
that touches keys, money movement, or the gateway config itself.

## Output Artifacts

| When you ask for... | You get... | Format |
|---|---|---|
| "spin a service" | scaffold + hot-restart running + gateway proof | live port + transcript |
| "wire realtime" | socket.io lane via `/?XTransformPort=` | end-to-end message receipt |

## Communication

- **Bottom line first** — "service up on fixed port N, reachable via gateway transform".
- **Confidence tagging** — 🟢 end-to-end through gateway / 🔴 direct-port claim (invalid here).

## Related Skills

- **fleet-desk-operator**: Use when the service must eventually sign or touch chain state
  (it graduates into a registry row).
- **fleet-skill-author**: Use when the service's setup procedure becomes a package.
