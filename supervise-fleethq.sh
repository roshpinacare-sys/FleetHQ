#!/bin/bash
# supervise-fleethq.sh v2 — משגיח-החייאה של מטה-הצי (:3002) · תורת fix-not-close
# שרשרת-השורש-שנמדדה (t77-5→t77-6c→t77-7):
#  dev-mode → קימפול-על-ביקוש → פצצת-זיכרון 1.26GB → OOM → מוות-שעות
#  next start + output:standalone → תצורה-שבורה (מתריע-בעצמו) → קריסה
#  הפתרון: שרת-standalone אמיתי (node .next/standalone/server.js) + מגבלת זיכרון
# v2 (t77-7, נמדד-חי): בנייה-מקומית-נכשלת-בOOM-מערכת (3000-אוחז-1.2GB) →
#   נסיגת-בנייה (פעם/10ד׳ — לא-מפציץ-זיכרון-בכל-מחזור) · נפילה-מבוקרת ל-dev
#   מוגבל-700MB (שירות-עכשיו, ה-standalone ייבנה-כשהזיכרון-יתפנה) ·
#   self-heal ל-node_modules (bun install) · ניקוי-מנעול-.next/dev ·
#   subshell-cd (ה-v1: cd-בתוך-הלולאה = יציאה-קטלנית || exit 1)
#  חיות = פורט-קשור (ss) לא-HTTP · הריגה-מדויקת-לפי-pid-של-הפורט · 3000-הוא-קודש
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/state/supervisor.log"
mkdir -p "$DIR/state"
LAST_BUILD=0

while true; do
  if ! ss -tln 2>/dev/null | grep -q ":3002 "; then
    echo "$(date -u +%FT%TZ) DOWN (no listener) — reviving FleetHQ :3002" >> "$LOG"
    P3002=$(ss -tlnp 2>/dev/null | grep ":3002 " | grep -oP 'pid=\K[0-9]+' | head -1)
    [ -n "$P3002" ] && kill "$P3002" 2>/dev/null
    pkill -f "next dev -p 3002" 2>/dev/null
    sleep 2
    rm -f "$DIR/.next/dev/lock" 2>/dev/null
    if [ -f "$DIR/.next/standalone/server.js" ]; then
      echo "$(date -u +%FT%TZ) standalone present — starting" >> "$LOG"
    else
      NOW=$(date +%s)
      if [ $((NOW - LAST_BUILD)) -gt 600 ] && [ -x "$DIR/node_modules/.bin/next" ]; then
        LAST_BUILD=$NOW
        echo "$(date -u +%FT%TZ) no standalone — building once (memory-capped, backoff 10m)" >> "$LOG"
        (cd "$DIR" && NODE_OPTIONS="--max-old-space-size=800" ./node_modules/.bin/next build >> "$DIR/state/build.log" 2>&1 \
          && cp -r "$DIR/.next/static" "$DIR/.next/standalone/.next/static") || true
      elif [ ! -x "$DIR/node_modules/.bin/next" ]; then
        echo "$(date -u +%FT%TZ) node_modules missing — bun install" >> "$LOG"
        (cd "$DIR" && bun install >> "$DIR/state/build.log" 2>&1) || true
      fi
    fi
    if [ -f "$DIR/.next/standalone/server.js" ]; then
      (cd "$DIR/.next/standalone" && HOSTNAME=127.0.0.1 PORT=3002 NODE_ENV=production NODE_OPTIONS="--max-old-space-size=512" \
        setsid nohup node server.js >> "$DIR/state/standalone-3002.log" 2>&1 < /dev/null &)
      sleep 6
    else
      # נפילה-מבוקרת: dev מוגבל-זיכרון — שירות-עכשיו; ה-standalone ייבנה בנסיגה-הבאה
      echo "$(date -u +%FT%TZ) standalone unavailable — dev fallback (capped 700MB)" >> "$LOG"
      (cd "$DIR" && NODE_ENV=development NODE_OPTIONS="--max-old-space-size=700" \
        setsid nohup ./node_modules/.bin/next dev -p 3002 >> "$DIR/state/dev-3002.log" 2>&1 < /dev/null &)
      sleep 8
    fi
    if ss -tln 2>/dev/null | grep -q ":3002 "; then
      echo "$(date -u +%FT%TZ) REVIVED ok (listener bound)" >> "$LOG"
    else
      echo "$(date -u +%FT%TZ) REVIVE PENDING (will re-check)" >> "$LOG"
    fi
  fi
  sleep 20
done
