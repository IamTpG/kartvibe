#!/usr/bin/env bash
# Script tắt tiến trình Inventory Service theo PID file
# Sử dụng: ./stop-inventory.sh [đường-dẫn-file-pid]
# Mặc định: services/.run/inventory.pid

PID_FILE="${1:-services/.run/inventory.pid}"

echo "======================================================================"
echo "[stop-inventory] Yêu cầu tắt Inventory Service"
echo "  - Đường dẫn file PID: ${PID_FILE}"
echo "======================================================================"

if [ ! -f "$PID_FILE" ]; then
  # Thử tìm tương đối từ thư mục hiện tại
  if [ -f "../../.run/inventory.pid" ]; then
    PID_FILE="../../.run/inventory.pid"
  elif [ -f "../.run/inventory.pid" ]; then
    PID_FILE="../.run/inventory.pid"
  elif [ -f ".run/inventory.pid" ]; then
    PID_FILE=".run/inventory.pid"
  else
    echo "[stop-inventory] LỖI: Không tìm thấy file PID tại '${PID_FILE}'."
    echo "Hướng dẫn:"
    echo "  1. Kiểm tra lại đường dẫn file PID mà start-all.sh đã tạo."
    echo "  2. Hoặc truyền trực tiếp đường dẫn: ./stop-inventory.sh <đường-dẫn-file-pid>"
    exit 1
  fi
fi

PID=$(cat "$PID_FILE" | tr -d '[:space:]')

if [ -z "$PID" ]; then
  echo "[stop-inventory] LỖI: File PID '${PID_FILE}' rỗng."
  exit 1
fi

echo "[stop-inventory] Tìm thấy PID: ${PID}"

if kill -0 "$PID" 2>/dev/null; then
  # start-all.sh chạy service bằng `npm start` trong một process group riêng: kill riêng PID của npm để lại tiến
  # trình node mồ côi vẫn phục vụ cổng 4006/4007. Nên dừng cả process group, như stop-all.sh.
  PGID=$(ps -o pgid= -p "$PID" 2>/dev/null | tr -d ' ')
  echo "[stop-inventory] Gửi tín hiệu dừng (SIGTERM) tới process group ${PGID:-?} (PID ${PID})..."
  if [ -n "$PGID" ]; then kill -TERM -- "-$PGID" 2>/dev/null || kill "$PID"; else kill "$PID"; fi
  for _ in 1 2 3 4 5 6 7 8; do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
  if kill -0 "$PID" 2>/dev/null; then
    echo "[stop-inventory] Tiến trình chưa tắt, gửi SIGKILL..."
    if [ -n "$PGID" ]; then kill -KILL -- "-$PGID" 2>/dev/null || kill -9 "$PID"; else kill -9 "$PID"; fi
    sleep 0.5
  fi
  if kill -0 "$PID" 2>/dev/null; then
    echo "[stop-inventory] LỖI: tiến trình PID ${PID} vẫn còn chạy; không xóa file PID."
    exit 1
  fi
  # Kiểm chứng thật: cổng REST của Inventory không còn phục vụ (không tin vào việc gửi tín hiệu).
  INV_PORT="${INVENTORY_PORT:-4006}"
  sleep 0.5
  if curl -fs --max-time 2 "http://localhost:${INV_PORT}/health" >/dev/null 2>&1; then
    echo "[stop-inventory] LỖI: PID ${PID} đã tắt nhưng cổng ${INV_PORT} vẫn trả lời /health (có tiến trình khác đang phục vụ)."
    exit 1
  fi
  rm -f "$PID_FILE"
  echo "[stop-inventory] THÀNH CÔNG: Inventory đã tắt (cổng ${INV_PORT} không còn trả lời) và đã xóa file PID."
  echo "Lưu ý: Tiến trình sẽ KHÔNG tự khởi động lại. Bây giờ bạn có thể chạy 'npm run down' để kiểm thử kịch bản Inventory down."
else
  echo "[stop-inventory] CẢNH BÁO: Tiến trình với PID ${PID} không còn chạy."
  rm -f "$PID_FILE"
fi
