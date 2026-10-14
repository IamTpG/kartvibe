#!/usr/bin/env bash
# Chạy nền tám tiến trình: user 4001, order 4002, product 4003, bff 4004, graphql 4005, inventory 4006 (REST) và 4007
# (gRPC, cùng tiến trình), order-grpc 4012, order-grpc-v1 4022 (web ở ../web chạy riêng: cd ../web && npm start).
# order, order-grpc và order-grpc-v1 là Order chạy ở ba chế độ gọi Inventory (REST, gRPC, gRPC với proto v1 đóng băng);
# xem docs/blocks/block-03/PLAN.md. inventory-grpc-v1 (cổng 4008) không do script này chạy: bật tay khi thử client mới
# với server cũ. Thư mục chưa có thì bỏ qua. Dừng bằng: bash stop-all.sh
#
# Các service chỉ ghi log ra stdout; script này đóng vai hạ tầng log cục bộ: ghi stdout của từng service
# vào $LOG_DIR/<tên>.log (mặc định services/logs/, không commit). PID nằm ở services/.run/.
# Script này chạy các service như bình thường: không độ trễ giả, không điểm vào gây lỗi. Muốn demo lỗi hoặc đo/test
# thì cắm thêm các móc bằng tools/start-measure.sh (npm run start:measure): LATENCY_MS, ENABLE_TEST_HOOKS (Product:
# /_fault, /_seed; Order và Inventory: /_reset; Inventory: /_fault).
# NO_DOCKER=1 bỏ qua bước kiểm tra/khởi động Postgres (dùng khi chạy dịch vụ giả hoặc DB đã chạy sẵn).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .run
LOG_DIR="${LOG_DIR:-$PWD/logs}"
mkdir -p "$LOG_DIR"

if [ "${NO_DOCKER:-}" != "1" ]; then
  if ! docker info >/dev/null 2>&1; then
    echo "Docker không chạy. Hãy bật Docker Desktop (hoặc đặt NO_DOCKER=1 nếu không cần DB)." >&2
    exit 1
  fi
  if ! docker ps --format '{{.Names}}' | grep -qx kartvibe-postgres; then
    echo "==> Khởi động container kartvibe-postgres"
    docker start kartvibe-postgres >/dev/null
  fi
fi
# Product Service có thể tự chuyển sang dữ liệu trong bộ nhớ nếu không kết nối được Postgres. Chạy thật thì
# nên báo lỗi ngay thay vì âm thầm dùng dữ liệu khác, nên bắt buộc dùng Postgres thật.
export REQUIRE_POSTGRES="${REQUIRE_POSTGRES:-1}"

# Mỗi service một database riêng trong cùng container Postgres: tạo nếu thiếu (an toàn khi chạy lại).
if [ "${NO_DOCKER:-}" != "1" ]; then
  for db in kartvibe_user kartvibe_order kartvibe_product kartvibe_inventory; do
    if ! docker exec kartvibe-postgres psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>/dev/null | grep -q 1; then
      echo "==> Tạo database $db"
      docker exec kartvibe-postgres psql -U postgres -c "CREATE DATABASE $db" >/dev/null
    fi
  done
fi
[ -d node_modules ] || npm install

# Lệnh chạy một thư mục: `npm start` nếu có script start, nếu không thì tsx src/index.ts.
launch_cmd() {
  local dir=$1
  if [ -f "$dir/package.json" ] && grep -q '"start"' "$dir/package.json"; then
    echo "npm start --silent"
  elif [ -f "$dir/src/index.ts" ]; then
    echo "$PWD/node_modules/.bin/tsx src/index.ts"
  else
    echo ""
  fi
}

STARTED=()
start() { # tên, thư mục, cổng
  local name=$1 dir=$2 port=$3
  if [ ! -d "$dir" ]; then echo "$name: bỏ qua (chưa có thư mục $dir)"; return; fi
  local cmd; cmd=$(launch_cmd "$dir")
  if [ -z "$cmd" ]; then echo "$name: bỏ qua (không tìm thấy lệnh chạy trong $dir)"; return; fi
  if [ -f ".run/$name.pid" ] && kill -0 "$(cat ".run/$name.pid")" 2>/dev/null; then
    echo "$name đã chạy (pid $(cat ".run/$name.pid"))"; STARTED+=("$name:$port"); return
  fi
  # Gói nhận từ người khác có thể chưa cài thư viện và không thuộc workspace.
  if [ -f "$dir/package.json" ] && grep -q '"dependencies"' "$dir/package.json" && [ ! -d "$dir/node_modules" ] && ! grep -q "\"$(basename "$dir")\"" package.json; then
    echo "$name: npm install trong $dir"; (cd "$dir" && npm install --silent)
  fi
  ( cd "$dir" && PORT=$port exec setsid $cmd ) >>"$LOG_DIR/$name.log" 2>&1 &
  echo $! >".run/$name.pid"
  echo "$name: pid $! cổng $port (log $LOG_DIR/$name.log)"
  STARTED+=("$name:$port")
}

start user    user    4001
INVENTORY_PROTOCOL=rest start order order 4002
start product product 4003
start bff     bff     4004
start graphql graphql 4005
# Block 3: Inventory (REST 4006, gRPC 4007) và hai bản Order gọi nó bằng gRPC. Gán biến ngay trước lời gọi hàm
# `start` thì tiến trình con nhận được; `order-grpc` dùng chung thư mục `order`, nên PID và log mang tên riêng.
start inventory inventory 4006
INVENTORY_PROTOCOL=grpc start order-grpc order 4012
INVENTORY_PROTOCOL=grpc start order-grpc-v1 order-v1 4022


for item in "${STARTED[@]}"; do
  name=${item%%:*}; port=${item##*:}
  ready=0
  for _ in $(seq 1 60); do
    if curl -fs "http://localhost:$port/health" >/dev/null 2>&1 || curl -fs "http://localhost:$port/" >/dev/null 2>&1; then ready=1; break; fi
    sleep 0.25
  done
  [ "$ready" = 1 ] && echo "sẵn sàng: $name :$port" || echo "CHƯA phản hồi: $name :$port (xem $LOG_DIR/$name.log)"
done

# Cổng gRPC của Inventory (4007) không có /health HTTP, nên chờ kết nối TCP riêng.
for item in "${STARTED[@]}"; do
  [ "${item%%:*}" = "inventory" ] || continue
  ready=0
  for _ in $(seq 1 60); do
    if (echo >/dev/tcp/127.0.0.1/4007) 2>/dev/null; then ready=1; break; fi
    sleep 0.25
  done
  [ "$ready" = 1 ] && echo "sẵn sàng: inventory-grpc :4007" || echo "CHƯA phản hồi: inventory-grpc :4007 (xem $LOG_DIR/inventory.log)"
done
