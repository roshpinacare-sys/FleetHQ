#!/bin/bash
# supervise-fleethq.sh — משגיח-החייאה של מטה-הצי (:3002) · תורת fix-not-close
# שרשרת-השורש-שנמדדה (t77-5→t77-6c):
#  dev-mode → קימפול-על-ביקוש → פצצת-זיכרון 1.26GB → OOM → מוות-שעות
#  next start + output:standalone → תצורה-שבורה (מתריע-בעצמו) → קריסה
#  הפתרון: שרת-standalone אמיתי (node .next/standalone/server.js) + מגבלת 512MB
#  חיות = פורט-קשור (ss) לא-HTTP · הריגה-מדויקת-לפי-pid-של-הפורט · 3000-הוא-קודש
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/state/supervisor.log"
mkdir -p "$DIR/state"

while true; do
  if ! ss -tln 2>/dev/null | grep -q ":3002 "; then
    echo "$(date -u +%FT%TZ) DOWN (no listener) — reviving FleetHQ :3002 (standalone)" >> "$LOG"
    P3002=$(ss -tlnp 2>/dev/null | grep ":3002 " | grep -oP 'pid=\K[0-9]+' | head -1)
    [ -n "$P3002" ] && kill "$P3002" 2>/dev/null
    sleep 2
    if [ ! -f "$DIR/.next/standalone/server.js" ]; then
      echo "$(date -u +%FT%TZ) no standalone build — building once (memory-capped)" >> "$LOG"
      (cd "$DIR" && NODE_OPTIONS="--max-old-space-size=900" ./node_modules/.bin/next build >> "$DIR/state/build.log" 2>&1 \
        && cp -r "$DIR/.next/static" "$DIR/.next/standalone/.next/static") || true
    fi
    if [ -f "$DIR/.next/standalone/server.js" ]; then
      cd "$DIR/.next/standalone" || exit 1
      HOSTNAME=127.0.0.1 PORT=3002 NODE_ENV=production NODE_OPTIONS="--max-old-space-size=512" \
        setsid nohup node server.js >> "$DIR/state/standalone-3002.log" 2>&1 < /dev/null &
      sleep 6
    fi
    if ss -tln 2>/dev/null | grep -q ":3002 "; then
      echo "$(date -u +%FT%TZ) REVIVED ok (listener bound)" >> "$LOG"
    else
      echo "$(date -u +%FT%TZ) REVIVE PENDING (will re-check)" >> "$LOG"
    fi
  fi
  sleep 20
done
