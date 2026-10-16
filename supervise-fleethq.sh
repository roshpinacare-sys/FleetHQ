#!/bin/bash
# supervise-fleethq.sh — משגיח-החייאה של מטה-הצי (:3002) · תורת fix-not-close
# נמדד-חי (t77-5): OOM הרג next-server-dev (1.26GB RSS) — פתרון-שורשי: production
# build (אין-קימפול-על-ביקוש = אין-פצצת-זיכרון) · t77-6c: בדיקת-חיות = פורט-קשור
# (לא-HTTP) · הריגה-מדויקת-לפי-pid-של-הפורט (אף-פעם-לא-רחבה — 3000-הוא-קודש).
# מבנה-שטוח-זהה-ל-supervise-economy.sh — היחיד-ששרד-נמדד-בסנדבוקס-הזה.
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/state/supervisor.log"
mkdir -p "$DIR/state"

while true; do
  if ! ss -tln 2>/dev/null | grep -q ":3002 "; then
    echo "$(date -u +%FT%TZ) DOWN (no listener) — reviving FleetHQ :3002 (production)" >> "$LOG"
    P3002=$(ss -tlnp 2>/dev/null | grep ":3002 " | grep -oP 'pid=\K[0-9]+' | head -1)
    [ -n "$P3002" ] && kill "$P3002" 2>/dev/null
    sleep 2
    rm -f "$DIR/.next/dev/lock" 2>/dev/null
    cd "$DIR" || exit 1
    NODE_OPTIONS="--max-old-space-size=512" setsid nohup ./node_modules/.bin/next start -p 3002 >> "$DIR/state/fleethq-3002.log" 2>&1 < /dev/null &
    sleep 6
    if ss -tln 2>/dev/null | grep -q ":3002 "; then
      echo "$(date -u +%FT%TZ) REVIVED ok (listener bound)" >> "$LOG"
    else
      echo "$(date -u +%FT%TZ) REVIVE PENDING (will re-check)" >> "$LOG"
    fi
  fi
  sleep 20
done
