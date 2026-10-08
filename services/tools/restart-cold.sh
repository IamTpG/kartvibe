#!/usr/bin/env bash
# Khởi động lại TOÀN BỘ service (kèm móc đo, qua tools/start-measure.sh) để đo chế độ LẠNH (lần chạy đầu sau khi khởi động lại).
# Dùng: bash tools/restart-cold.sh [on|off]   (on/off = DATALOADER của GraphQL, mặc định on)
# Ghi results/cold-session.json và in COLD_SESSION=<id>; dán id đó vào ô "Cold session" của trang đo.
# KHÔNG gọi endpoint nghiệp vụ nào giữa lúc này và lần chạy lạnh (script chỉ dùng /health).
set -euo pipefail
cd "$(dirname "$0")/.."
MODE=${1:-on}
[ "$MODE" = on ] || [ "$MODE" = off ] || { echo "Tham số phải là on hoặc off" >&2; exit 2; }
bash stop-all.sh >/dev/null 2>&1 || true
sleep 1
DATALOADER=$MODE bash tools/start-measure.sh | grep -E "sẵn sàng|CHƯA|bỏ qua|Tạo" || true
ID="cold-$(date +%s)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
mkdir -p ../results
printf '{"coldSession":"%s","restartedAt":"%s","dataloader":"%s"}\n' "$ID" "$(date -u +%FT%TZ)" "$MODE" > ../results/cold-session.json
echo "COLD_SESSION=$ID  (DATALOADER=$MODE)"
