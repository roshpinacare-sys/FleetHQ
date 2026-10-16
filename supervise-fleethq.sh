#!/bin/bash
# supervise-fleethq.sh — משגיח-החייאה של מטה-הצי (:3002) · תורת fix-not-close
# נמדד-חי (t77-5): OOM הרג את next-server (1.26GB RSS) והמטה-מת-שעות-בלי-מי-שיקימו.
# החוק: אם-3002-שותק — מקימים-תוך-שניות, לנצח. כל-החייאה-נרשמת. אפס-הדמיות.
# מגבלת-זיכרון: --max-old-space-size=768 — next-server-שמן-לא-בולע-את-הסנדבוקס.
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/state/supervisor.log"
mkdir -p "$DIR/state"

while true; do
  if ! curl -s -m 5 -o /dev/null http://127.0.0.1:3002 2>/dev/null; then
    echo "$(date -u +%FT%TZ) DOWN — reviving FleetHQ :3002" >> "$LOG"
    # שאריות-אקספרס-זומביות על אותו פורט — מפנים-בכנות לפני הקמה
    pkill -f "next dev -p 3002" 2>/dev/null && sleep 2
    rm -f "$DIR/.next/dev/lock"
    cd "$DIR" || exit 1
    NODE_OPTIONS="--max-old-space-size=768" setsid nohup ./node_modules/.bin/next dev -p 3002 >> /tmp/fleethq-3002.log 2>&1 < /dev/null &
    sleep 8
    if curl -s -m 8 -o /dev/null http://127.0.0.1:3002 2>/dev/null; then
      echo "$(date -u +%FT%TZ) REVIVED ok" >> "$LOG"
    else
      echo "$(date -u +%FT%TZ) REVIVE PENDING (compile may take longer — will re-check)" >> "$LOG"
    fi
  fi
  sleep 20
done
