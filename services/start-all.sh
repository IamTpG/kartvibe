#!/usr/bin/env bash
# Chạy nền user, order, product và web; PID và log ghi vào services/.run/.
# Dừng bằng: bash stop-all.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .run

if ! docker ps --format '{{.Names}}' | grep -qx kartvibe-postgres; then
  echo "==> Khởi động container kartvibe-postgres"
  docker start kartvibe-postgres >/dev/null
fi
[ -d node_modules ] || npm install

start() { # tên, thư mục, lệnh...
  local name=$1 dir=$2; shift 2
  if [ -f ".run/$name.pid" ] && kill -0 "$(cat ".run/$name.pid")" 2>/dev/null; then
    echo "$name đã chạy (pid $(cat ".run/$name.pid"))"; return
  fi
  ( cd "$dir" && exec setsid "$@" ) >".run/$name.log" 2>&1 &
  echo $! >".run/$name.pid"
  echo "$name: pid $! (log .run/$name.log)"
}

start user    user    ../node_modules/.bin/tsx src/server.ts
start order   order   ../node_modules/.bin/tsx src/server.ts
start product product ../node_modules/.bin/tsx src/server.ts
start web     ../web  node server.mjs

for url in 4001 4002 4003 4000; do
  for _ in $(seq 1 40); do
    curl -fs "http://localhost:$url/health" >/dev/null 2>&1 || curl -fs "http://localhost:$url/" >/dev/null 2>&1 && break
    sleep 0.25
  done
done
echo "Đã chạy: user :4001, order :4002, product :4003, web :4000"
