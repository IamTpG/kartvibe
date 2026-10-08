#!/usr/bin/env bash
# Dừng các tiến trình do start-all.sh khởi động và dọn PID/log trong .run/.
cd "$(dirname "$0")"
for f in .run/*.pid; do
  [ -e "$f" ] || continue
  pid=$(cat "$f")
  if kill -0 "$pid" 2>/dev/null; then
    pgid=$(ps -o pgid= -p "$pid" | tr -d ' ')
    kill -TERM -- "-$pgid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    echo "đã dừng $(basename "$f" .pid) (pid $pid)"
  fi
done
rm -rf .run
