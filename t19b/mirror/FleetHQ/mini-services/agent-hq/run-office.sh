#!/usr/bin/env bash
# Fleet HQ · agent-hq — sovereign bootstrap (idempotent).
# תפקיד הסקריפט: להחיות את המשרד משכפול טרי של FleetHQ בכל מכונה —
# תלויות, מפתחות (כספת או .env), ספריית נתונים (שכפול Domain), ואז exec לתהליך.
# אפשר להריץ שוב ושוב — הוא לא הורס שום דבר שכבר קיים.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "[run-office] root: $ROOT"

# ---- 1) Bun must exist ------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: bun לא נמצא — agent-hq רץ על Bun >= 1.2."
  echo "התקנה:"
  echo "  curl -fsSL https://bun.sh/install | bash"
  echo "ואז פתחו טרמינל חדש (או: export PATH=\"\$HOME/.bun/bin:\$PATH\") והריצו שוב."
  exit 1
fi
echo "[run-office] bun $(bun --version)"

# ---- 2) Dependencies (cheap, always) ---------------------------------------
echo "[run-office] bun install ..."
bun install

# ---- 3) Vault first (it produces the .env files) — AUTONOMOUS ----------------
# ריבונות מלאה: הפענוח לא תלוי בבעלים. auto-unseal.sh מוצא את מפתח הפענוח
# (VAULT_PASSPHRASE או upload/pat.env), מושך את הכספת החתומה הכי טרייה מהריפו
# הפרטי (fleet-vault), ומפיק את קובצי ה-.env במדיניות מיזוג שלא דורסת קיים.
if [ -f "$ROOT/vault/auto-unseal.sh" ]; then
  echo "[run-office] autonomous vault unseal ..."
  bash "$ROOT/vault/auto-unseal.sh" || echo "[run-office] continuing with existing .env (keyless honest mode)"
elif [ -n "${VAULT_PASSPHRASE:-}" ] && [ -f "$ROOT/vault/vault.sh" ]; then
  echo "[run-office] opening sealed vault (manual passphrase) ..."
  VAULT_PASSPHRASE="$VAULT_PASSPHRASE" bash "$ROOT/vault/vault.sh" open || echo "vault open failed — continuing with existing .env"
fi

# ---- 4) .env fallback + loud key warning ------------------------------------
if [ ! -f "$ROOT/.env" ]; then
  if   [ -f "$ROOT/.env.example" ];     then cp "$ROOT/.env.example" "$ROOT/.env";
  elif [ -f "$ROOT/../.env.example" ];  then cp "$ROOT/../.env.example" "$ROOT/.env";
  fi
  if [ -f "$ROOT/.env" ]; then
    chmod 600 "$ROOT/.env"
    cat <<'WARN'

========================================================================
!! אזהרה: .env חדש הועתק מ-.env.example והמפתחות בו ריקים !!
מלאו לפחות חלק מהשורות האלה (ככל שיותר — השרשרת חזקה יותר):
  XAI_API_KEY          (xAI Grok — מוח ראשון)
  OPENROUTER_API_KEY   (OpenRouter — בריכת מודלים חינמיים)
  KILO_API_KEY         (אופציונלי — Kilo עובד גם ללא מפתח)
  LLM7_API_KEY         (טוקן חינמי מ-token.llm7.io)
  POLLINATIONS_TOKEN   (אופציונלי — Pollinations עובד גם ללא מפתח)
  OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL (נקודת קצה OpenAI-compatible)
מוחות keyless (Kilo + Pollinations) שומרים על המשרד חי גם עם .env ריק —
אבל זה בסיס צנוע. העריכו את .env (הרשאות 600) והפעילו מחדש. לעולם אל תעשו commit ל-.env.
========================================================================
WARN
  fi
fi

# ---- 5) Data dir: AGENT_HQ_DATA_DIR or a Domain clone -----------------------
if [ -z "${AGENT_HQ_DATA_DIR:-}" ]; then
  if [ -d /home/z/my-project/Domain ]; then
    export AGENT_HQ_DATA_DIR=/home/z/my-project/Domain
    echo "[run-office] AGENT_HQ_DATA_DIR unset -> using sandbox clone: $AGENT_HQ_DATA_DIR"
  elif [ -d "$ROOT/Domain" ]; then
    export AGENT_HQ_DATA_DIR="$ROOT/Domain"
    echo "[run-office] AGENT_HQ_DATA_DIR unset -> using existing ./Domain"
  else
    echo "[run-office] no data dir found -> cloning roshpinacare-sys/Domain into ./Domain ..."
    if git clone https://github.com/roshpinacare-sys/Domain "$ROOT/Domain"; then
      export AGENT_HQ_DATA_DIR="$ROOT/Domain"
      echo "[run-office] Domain cloned OK (זה הדיסק הקבוע של המשרד — הספרים נשמרים שם בקומיטים)"
    else
      echo "[run-office] WARN: git clone of Domain failed — falling back to demo-data (sim-grade books, no persistence)"
      export AGENT_HQ_DATA_DIR="$ROOT/demo-data"
    fi
  fi
else
  echo "[run-office] AGENT_HQ_DATA_DIR pre-set: $AGENT_HQ_DATA_DIR"
fi

# ---- 6) Ignite the office ---------------------------------------------------
echo "[run-office] booting foreman (socket.io on :${AGENT_HQ_PORT:-3010}, path '/') ..."
exec bun run index.ts
