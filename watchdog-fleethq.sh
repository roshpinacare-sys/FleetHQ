#!/bin/bash
# watchdog-fleethq.sh — רובד-הגנה-שני (t77-7): המשגיח-הראשי-עלול-ליפול-עם-השרת;
# השומר-הזה-מקים-את-המשגיח-אם-נעלם. מבנה-שטוח-כמו-המשגיח-ששרד.
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/state/watchdog.log"
mkdir -p "$DIR/state"
while true; do
  if ! pgrep -f "supervise-fleethq.sh" >/dev/null 2>&1; then
    echo "$(date -u +%FT%TZ) supervisor-missing — relaunching (layer-2)" >> "$LOG"
    setsid nohup bash "$DIR/supervise-fleethq.sh" >> "$DIR/state/supervisor.log" 2>&1 < /dev/null &
  fi
  sleep 45
done
