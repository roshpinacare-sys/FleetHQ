# Needs Validation — open records (Z-47)

Two records carry exact unresolved facts. No severity is assigned to them by law.

## runtime-dev-mode-on-public-default-lane

- **Missing fact:** whether the platform owner permits a production build on the public default lane (current platform policy mandates dev mode and forbids `bun run build`).
- **Local plan:** reproduce a dev-mode error page locally and record leaked diagnostics (bounded, no external traffic).
- **Deployment plan:** if permitted, build + serve production, switch default lane, re-audit response headers and diagnostics.

## runtime-deps-no-advisory-crosscheck

- **Missing fact:** authoritative advisory-DB cross-check for the bun.lock-resolved dependency set.
- **Local plan:** run an advisory scanner against the lockfile when tooling is available in the runtime.
- **Deployment plan:** wire scheduled advisory scanning into the CI estate (owner lane; propose-only for the sibling's workflow files).
