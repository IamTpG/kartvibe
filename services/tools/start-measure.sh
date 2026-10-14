#!/usr/bin/env bash
# Chạy các service kèm các móc phục vụ demo lỗi, đo và test (không bật mặc định):
#   LATENCY_MS         độ trễ giả mỗi request nghiệp vụ của user, order, product, inventory (mặc định ở đây: 30 ms).
#                      Khi đo thời gian của Block 3 nên chạy LATENCY_MS=0 npm run start:measure để độ trễ giả không làm nhiễu số đo.
#   ENABLE_TEST_HOOKS  Product: /_fault (làm chậm hoặc lỗi), /_seed; Order và Inventory: /_reset; Inventory: /_fault
#                      (cần cho tools/block3 và trang web/public/order-compare.html)
# Dùng: bash tools/start-measure.sh   (hoặc npm run start:measure). Đặt LATENCY_MS=0 để chỉ bật điểm vào gây lỗi.
# Dừng bằng: bash stop-all.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export LATENCY_MS="${LATENCY_MS:-30}"
export ENABLE_TEST_HOOKS=1
exec bash start-all.sh
