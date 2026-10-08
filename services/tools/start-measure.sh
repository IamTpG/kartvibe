#!/usr/bin/env bash
# Chạy các service kèm các móc phục vụ demo lỗi, đo và test (không bật mặc định):
#   LATENCY_MS         độ trễ giả mỗi request nghiệp vụ của user, order, product (mặc định ở đây: 30 ms)
#   ENABLE_TEST_HOOKS  Product: /_fault (làm chậm hoặc lỗi), /_seed
# Dùng: bash tools/start-measure.sh   (hoặc npm run start:measure). Đặt LATENCY_MS=0 để chỉ bật điểm vào gây lỗi.
# Dừng bằng: bash stop-all.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export LATENCY_MS="${LATENCY_MS:-30}"
export ENABLE_TEST_HOOKS=1
exec bash start-all.sh
