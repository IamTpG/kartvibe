#!/usr/bin/env bash
# Thu bằng chứng Block 3 (REST và gRPC giữa các service). Chạy từ bất kỳ đâu:  bash results/block-03/chay-lai.sh
#
# Script này KHỞI ĐỘNG LẠI các service ở chế độ đo (LATENCY_MS=0, ENABLE_TEST_HOOKS=1) rồi chạy toàn bộ kịch bản, và
# ghi output nguyên văn (kèm lệnh, thời điểm, mã thoát) vào results/block-03/. Số liệu nộp là số của lần chạy này, do
# team lead chạy; không gõ tay số nào vào báo cáo. Đường dẫn tuyệt đối và thư mục home được thay bằng <repo> và <home>.
#
# Cần: Docker với container kartvibe-postgres đang chạy (cổng 5434), Node.js, `npm install` đã chạy ở services/.
# Biến môi trường tùy chọn:
#   OUT_DIR     nơi ghi kết quả (mặc định results/block-03)
#   LATENCY_N   số mẫu đo thời gian mỗi cổng (mặc định 20, tối thiểu 5)
#   RUN_BY      nhãn người chạy ghi vào MANIFEST (mặc định "team lead")
# Mã thoát: số bước thất bại (0 là tất cả đạt).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SV="$ROOT/services"
OUT="${OUT_DIR:-$ROOT/results/block-03}"
N="${LATENCY_N:-20}"
RUN_BY="${RUN_BY:-team lead}"
FAILS=()
mkdir -p "$OUT"/{proto,snapshots,logs,compat,errors,payload,latency,regression}

san() { sed -e "s#$ROOT#<repo>#g" -e "s#${HOME:-/nonexistent}#<home>#g"; }

# step <tên> <file đầu ra> <lệnh hoặc hàm...>: chạy, ghi nguyên văn, ghi PASS/FAIL ra màn hình
step() {
  local name=$1 file=$2; shift 2
  echo ">> $name"
  {
    echo "# $name"
    echo "# lệnh: $*"
    echo "# bắt đầu: $(date -Is)"
    echo
    "$@"
    local rc=$?
    echo
    echo "# [exit $rc] kết thúc: $(date -Is)"
    exit $rc
  } 2>&1 | san > "$file"
  local rc=${PIPESTATUS[0]}
  if [ "$rc" -eq 0 ]; then echo "   [PASS] -> ${file#$ROOT/}"; else echo "   [FAIL exit $rc] -> ${file#$ROOT/}"; FAILS+=("$name"); fi
  return 0
}

wait_http() { local i; for i in $(seq 1 120); do curl -fs --max-time 1 "$1" >/dev/null 2>&1 && return 0; sleep 0.25; done; return 1; }
wait_tcp()  { local i; for i in $(seq 1 120); do (echo >/dev/tcp/127.0.0.1/"$1") 2>/dev/null && return 0; sleep 0.25; done; return 1; }
reset_all() { local p; for p in 4006 4002 4012 4022; do curl -s -o /dev/null --max-time 2 -X POST "localhost:$p/_reset"; done; }
post_order() { # cổng, thân JSON, [request-id]
  curl -s -w ' HTTP %{http_code}' -X POST "localhost:$1/orders" -H 'content-type: application/json' ${3:+-H "x-request-id: $3"} --data "$2"; echo
}

# Kênh gRPC của Order giữ trạng thái lỗi tạm thời (backoff) sau khi Inventory tắt rồi bật lại, nên vài lần gọi đầu có thể
# trả 503 ngay lập tức dù Inventory đã chạy. Thăm dò đến khi không còn 503 và ghi lại thời gian hồi phục (khác biệt thật
# giữa REST và gRPC: REST kết nối mới mỗi lần).
warm_grpc() {
  local port t0 n code
  for port in 4012 4022; do
    t0=$(date +%s.%N); n=0
    while :; do
      n=$((n + 1))
      code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:$port/orders" -H 'content-type: application/json' --data '{"sku":"SKU-ZERO","quantity":1}')
      [ "$code" != "503" ] && break
      [ "$n" -gt 300 ] && break
      sleep 0.3
    done
    echo "cổng $port hồi phục: HTTP $code sau $n lần thử, $(echo "$(date +%s.%N) - $t0" | bc) s"
  done
}

restart_stack() {
  (cd "$SV" && bash stop-all.sh >/dev/null 2>&1
   rm -f logs/order.log logs/order-grpc.log logs/order-grpc-v1.log logs/inventory.log logs/inventory-grpc-v1.log
   LATENCY_MS=0 bash tools/start-measure.sh)
}
restart_inventory() { (cd "$SV" && LATENCY_MS=0 bash tools/start-measure.sh >/dev/null 2>&1); wait_http localhost:4006/health && wait_tcp 4007 && warm_grpc; }

echo "=== Thu bằng chứng Block 3: $(date -Is) ==="
step "khởi động lại các service ở chế độ đo" "$OUT/manifest-khoi-dong.txt" restart_stack
# Chỉ đợi service còn thư mục (nộp thiếu user, product, bff, graphql vẫn chạy được; start-all.sh bỏ qua thư mục thiếu).
have() { [ -d "$SV/$1" ]; }
PORTS=(4002 4006 4012 4022)
have user && PORTS+=(4001); have product && PORTS+=(4003); have bff && PORTS+=(4004); have graphql && PORTS+=(4005)
for p in "${PORTS[@]}"; do wait_http "localhost:$p/health" || echo "CẢNH BÁO: cổng $p chưa trả lời /health"; done
wait_tcp 4007 || echo "CẢNH BÁO: cổng gRPC 4007 chưa mở"

# ---------------------------------------------------------------- môi trường
env_info() {
  echo "người chạy: $RUN_BY"
  echo "thời điểm: $(date -Is)"
  echo "nhánh: $(git -C "$ROOT" branch --show-current 2>/dev/null), commit: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null)"
  echo "hệ điều hành: $(uname -sr)"
  echo "node $(node -v), npm $(npm -v)"
  for p in @grpc/grpc-js grpc-tools ts-proto @bufbuild/protobuf; do
    echo "$p $(node -p "require('$SV/node_modules/$p/package.json').version" 2>/dev/null)"
  done
  echo "cấu hình đo: LATENCY_MS=0, ENABLE_TEST_HOOKS=1, mẫu đo thời gian mỗi cổng: $N"
  echo "tiến trình: $(cd "$SV" && ls .run | sed 's/\.pid//' | tr '\n' ' ')"
}
step "môi trường và phiên bản" "$OUT/MANIFEST.txt" env_info

# ---------------------------------------------------------------- proto và sinh code
proto_step() {
  local rc=0 w before after
  echo "== diff -u proto v1 -> v2"
  diff -u "$SV/proto/inventory/v1/inventory.proto" "$SV/proto/inventory/v2/inventory.proto"
  echo; echo "== sha256 của proto"
  sha256sum "$SV/proto/inventory/v1/inventory.proto" "$SV/proto/inventory/v2/inventory.proto"
  echo; echo "== diff -u mã sinh v1 -> v2 (tools/block3/generated)"
  diff -u "$SV/tools/block3/generated/v1/inventory.ts" "$SV/tools/block3/generated/v2/inventory.ts"
  echo; echo "== sinh lại code cho từng gói: kỳ vọng mã đã commit KHÔNG đổi"
  for w in kartvibe-inventory-service kartvibe-order-service kartvibe-tools-block3 kartvibe-inventory-v1-service kartvibe-order-v1-service kartvibe-tools-compat; do
    echo "--- npm run codegen -w $w"
    case $w in
      kartvibe-inventory-service)   f="$SV/inventory/src/generated/inventory.ts" ;;
      kartvibe-order-service)       f="$SV/order/src/generated/inventory.ts" ;;
      kartvibe-tools-block3)        f="$SV/tools/block3/generated/v2/inventory.ts" ;;
      kartvibe-inventory-v1-service) f="$SV/inventory-v1/src/generated/inventory.ts" ;;
      kartvibe-order-v1-service)    f="$SV/order-v1/src/generated/inventory.ts" ;;
      kartvibe-tools-compat)        f="$SV/tools/compat/test/generated/v2/inventory.ts" ;;
    esac
    before=$(sha256sum "$f" | cut -d' ' -f1)
    (cd "$SV" && npm run codegen -w "$w" 2>&1 | tail -3)
    after=$(sha256sum "$f" | cut -d' ' -f1)
    if [ "$before" = "$after" ]; then echo "KHÔNG ĐỔI  $w"; else echo "ĐÃ ĐỔI    $w ($before -> $after)"; rc=1; fi
  done
  return $rc
}
step "proto v1/v2, diff và sinh code" "$OUT/proto/proto-va-sinh-code.txt" proto_step

frozen_step() {
  local rc=0 out r
  for w in order-v1:kartvibe-order-v1-service inventory-v1:kartvibe-inventory-v1-service; do
    echo "== ${w%%:*}"
    out=$(cd "$SV" && npm run verify-frozen -w "${w##*:}" 2>&1); r=$?
    echo "$out" | grep -E "PASS|FAIL|SKIP"
    [ "$r" -eq 0 ] || rc=1
    echo; echo "== FROZEN.sha256 của ${w%%:*}"; cat "$SV/${w%%:*}/FROZEN.sha256"; echo
  done
  return $rc
}
step "đóng băng client cũ (order-v1) và server cũ (inventory-v1)" "$OUT/compat/verify-frozen.txt" frozen_step

# ---------------------------------------------------------------- snapshot trước/sau, ba cổng
snap_step() { reset_all; (cd "$SV/tools/block3" && node scenarios.mjs); local rc=$?; mkdir -p "$OUT/snapshots"; cp "$SV"/tools/block3/snapshots/*.json "$OUT/snapshots/" 2>/dev/null; return $rc; }
step "snapshot status và body, REST (4002) so gRPC (4012) so gRPC cũ (4022)" "$OUT/snapshots/scenarios.txt" snap_step

# ---------------------------------------------------------------- log nội bộ REST (trước) và gRPC (sau)
trace_step() {
  reset_all
  post_order 4002 '{"sku":"SKU-OK","quantity":2}' evidence-rest
  post_order 4012 '{"sku":"SKU-OK","quantity":2}' evidence-grpc
  post_order 4022 '{"sku":"SKU-OK","quantity":2}' evidence-grpc-v1
  sleep 1
  local id f
  for id in evidence-rest evidence-grpc evidence-grpc-v1; do
    echo; echo "== requestId $id (mỗi dòng: service, direction, protocol, status, clientVersion, available)"
    for f in order order-grpc order-grpc-v1 inventory; do
      grep -h "\"$id\"" "$SV/logs/$f.log" 2>/dev/null | python3 -I -c "
import sys,json
for l in sys.stdin:
    d=json.loads(l)
    keep={k:d[k] for k in ('service','direction','protocol','method','path','status','grpcStatus','clientVersion','available','reservationId','errorCode') if k in d}
    print('[$f.log]',json.dumps(keep,ensure_ascii=False))"
    done
  done
}
step "log lời gọi nội bộ: REST (trước) và gRPC (sau), cùng requestId" "$OUT/logs/trace-theo-requestId.txt" trace_step

# ---------------------------------------------------------------- lỗi: chậm, D14, tắt
slow_step() { reset_all; (cd "$SV/tools/block3" && node slow.mjs); }
step "Inventory chậm 2000 ms: 504 trong thời gian hữu hạn" "$OUT/errors/inventory-cham.txt" slow_step

d14_step() {
  local c
  echo "Làm chậm Inventory 2000 ms, đặt hàng qua gRPC; deadline của Order là 500 ms."
  reset_all
  echo "trước: $(docker exec kartvibe-postgres psql -U postgres -d kartvibe_inventory -tAc "select 'reservations='||count(*)||' SKU-OK='||(select available from stock where sku='SKU-OK') from reservations")"
  curl -s -o /dev/null -X POST localhost:4006/_fault -H 'content-type: application/json' -d '{"delayMs":2000}'
  local t0=$(date +%s.%N)
  post_order 4012 '{"sku":"SKU-OK","quantity":2}' d14-probe
  echo "Order trả lời sau $(echo "$(date +%s.%N) - $t0" | bc) s"
  sleep 3
  echo "sau 3 s: $(docker exec kartvibe-postgres psql -U postgres -d kartvibe_inventory -tAc "select 'reservations='||count(*)||' SKU-OK='||(select available from stock where sku='SKU-OK') from reservations")"
  curl -s -o /dev/null -X POST localhost:4006/_fault -H 'content-type: application/json' -d '{"delayMs":0}'
  echo; echo "Nếu reservations tăng dù Order đã trả 504 thì Reserve ĐÃ chạy xong sau khi client bỏ cuộc (D14: không bù trừ)."
  echo; echo "log Inventory cho requestId d14-probe:"; grep -h '"d14-probe"' "$SV/logs/inventory.log"
  reset_all
  return 0
}
step "D14: Reserve đã chạy hay chưa khi Order thấy quá hạn" "$OUT/errors/d14-reserve-sau-qua-han.txt" d14_step

down_step() {
  local rc=0
  bash "$SV/tools/block3/stop-inventory.sh" "$SV/.run/inventory.pid" || return 1
  (cd "$SV/tools/block3" && node down.mjs) || rc=1
  echo; echo "== khởi động lại Inventory và đo thời gian hồi phục của kênh gRPC"
  restart_inventory
  return $rc
}
step "Inventory tắt: 503 trong thời gian hữu hạn" "$OUT/errors/inventory-tat.txt" down_step

# ---------------------------------------------------------------- tương thích: client cũ/mới x server cũ/mới
compat_step() {
  local rc=0 C="node $SV/tools/compat/compat.mjs --evidence-dir $OUT/compat" pid
  cd "$SV" || return 1
  echo "### 1. order-grpc-v1 (client cũ, proto v1) x Inventory thật (v2): client v1, available không có"
  reset_all
  $C --order http://localhost:4022 --label client-cu_server-moi --expect-client v1 --expect-available none --order-log logs/order-grpc-v1.log --inventory-log logs/inventory.log || rc=1
  echo; echo "### 2. order-grpc (client mới) x Inventory thật (v2): client v2, available là số"
  reset_all
  $C --order http://localhost:4012 --label client-moi_server-moi --expect-client v2 --expect-available number --order-log logs/order-grpc.log --inventory-log logs/inventory.log || rc=1
  echo; echo "### 2b. giữ phần hàng cuối (SKU-LOW): available = 0 phải CÓ MẶT và bằng 0"
  reset_all
  post_order 4012 '{"sku":"SKU-LOW","quantity":1}' last-unit
  sleep 0.5
  grep -h '"last-unit"' logs/order-grpc.log | grep outbound | python3 -I -c "
import sys,json
for l in sys.stdin:
    d=json.loads(l); print('available có mặt:', 'available' in d, '| giá trị:', d.get('available'))"
  echo; echo "### 3. order-grpc (client mới) x inventory-grpc-v1 (server cũ, proto v1): client v2, available = absent"
  bash "$SV/tools/block3/stop-inventory.sh" "$SV/.run/inventory.pid" || rc=1
  : > logs/inventory-grpc-v1.log
  (GRPC_PORT=4007 setsid npm start -w kartvibe-inventory-v1-service --silent >> logs/inventory-grpc-v1.log 2>&1 &)
  wait_tcp 4007 || { echo "inventory-grpc-v1 không mở được cổng 4007"; rc=1; }
  warm_grpc
  $C --order http://localhost:4012 --label client-moi_server-cu --expect-client v2 --expect-available absent --order-log logs/order-grpc.log --inventory-log logs/inventory-grpc-v1.log || rc=1
  pid=$(ss -ltnp 2>/dev/null | grep ":4007 " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
  [ -n "$pid" ] && kill "$pid"
  sleep 1
  echo; echo "### khôi phục Inventory thật"
  restart_inventory
  # compat.mjs tự ghi các file compat-*.txt (kèm đường dẫn tuyệt đối tới log): che trước khi lưu.
  local f
  for f in "$OUT"/compat/compat-*.txt; do [ -f "$f" ] && san < "$f" > "$f.tmp" && mv "$f.tmp" "$f"; done
  return $rc
}
step "ma trận tương thích client cũ/mới x server cũ/mới (compat.mjs)" "$OUT/compat/ma-tran.txt" compat_step

# ---------------------------------------------------------------- đồng thời
conc_step() {
  local target
  echo "10 request song song vào SKU-LOW (tồn 1) trên từng cổng; kỳ vọng đúng 1 thành công (201) và 9 hết hàng (409)"
  for target in 4002 4012 4022; do
    reset_all
    echo "cổng $target: $(seq 1 10 | xargs -P 10 -I{} curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:$target/orders -H 'content-type: application/json' --data '{"sku":"SKU-LOW","quantity":1}' | sort | uniq -c | tr '\n' ' ')"
  done
  reset_all
}
step "đồng thời: một thành công khi giữ phần hàng cuối" "$OUT/errors/dong-thoi.txt" conc_step

# ---------------------------------------------------------------- payload, thời gian
step "payload lớp 1 (message đã serialize)" "$OUT/payload/payload.txt" bash -c "cd '$SV/tools/block3' && node --import tsx payload.ts && cp out/payload-measurement.md '$OUT/payload/payload-measurement.md'"
lat_step() { reset_all; (cd "$SV/tools/block3" && node latency.mjs --n "$N") && cp "$SV/tools/block3/out/latency-measurement.json" "$OUT/latency/latency-measurement.json"; }
step "thời gian phản hồi ($N mẫu mỗi cổng, median và [min, max])" "$OUT/latency/latency.txt" lat_step

# ---------------------------------------------------------------- hồi quy Block 2
step "contracts:check" "$OUT/regression/contracts-check.txt" bash -c "cd '$SV' && npm run contracts:check"
step "test:tools" "$OUT/regression/test-tools.txt" bash -c "cd '$SV' && npm run test:tools"
step "build (tsc mọi workspace)" "$OUT/regression/build.txt" bash -c "cd '$SV' && npm run build"
# Bước này cần đủ user, product, bff, graphql. Thiếu thì ghi rõ BỎ QUA (không tính là PASS, không tính là FAIL).
MISSING=""; for d in user product bff graphql; do have "$d" || MISSING="$MISSING $d"; done
if [ -z "$MISSING" ]; then
  step "Block 2: check hợp đồng (80 kiểm tra)" "$OUT/regression/block2-check.txt" bash -c "cd '$SV' && npm run check -- --size S"
else
  echo ">> Block 2: check hợp đồng (80 kiểm tra)"
  printf '# BỎ QUA: không chạy được vì thiếu service:%s\n# Không có bằng chứng hồi quy Block 2 cho mục này.\n' "$MISSING" > "$OUT/regression/block2-check.txt"
  echo "   [SKIP] thiếu:$MISSING -> ${OUT#$ROOT/}/regression/block2-check.txt"
fi
step "GET /orders của Block 2 vẫn đúng" "$OUT/regression/get-orders.txt" bash -c "cd '$SV' && npm run seed:s -w kartvibe-order-service >/dev/null 2>&1; curl -s 'localhost:4002/orders?userId=1' | python3 -I -c \"import sys,json;d=json.load(sys.stdin)['data'];print(len(d),'đơn; đơn đầu:',d[0]['id'],d[0]['status'],len(d[0]['items']),'items'); sys.exit(0 if len(d)==5 and d[0]['id']==1 and d[0]['status']=='PENDING' and len(d[0]['items'])==3 else 1)\""

# ---------------------------------------------------------------- log thô
copy_logs() { local f; for f in order order-grpc order-grpc-v1 inventory inventory-grpc-v1; do [ -f "$SV/logs/$f.log" ] && san < "$SV/logs/$f.log" > "$OUT/logs/$f.log"; done; for f in order order-grpc order-grpc-v1 inventory inventory-grpc-v1; do [ -f "$OUT/logs/$f.log" ] && echo "  $f.log: $(wc -l < "$OUT/logs/$f.log") dòng"; done; }
step "thu log của các service" "$OUT/logs/danh-sach-log.txt" copy_logs

echo
echo "=== Kết quả: ${#FAILS[@]} bước thất bại ==="
for s in "${FAILS[@]}"; do echo "  - $s"; done
echo "Output: ${OUT#$ROOT/}/ (các service vẫn đang chạy; dừng bằng: bash services/stop-all.sh)"
exit ${#FAILS[@]}
