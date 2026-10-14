#!/usr/bin/env bash
# Dựng gói giao việc cho W1..W4 từ Plan và các file trong thư mục này.
# Chạy lại bất cứ lúc nào Plan hoặc file giao việc đổi. Mặc định ghi ra advance-web/giao-viec-block3/
# (ngoài repo). Dùng: bash dong-goi.sh [thư-mục-đích] [--nen]
# Không chép `.env` (chỉ `.env.example`), `node_modules` hay log.
#
# Tên người nhận (tùy chọn): nếu có file `<thư-mục-đích>/nguoi-nhan.txt` với mỗi dòng `W<số>=<Tên>` (ví dụ `W1=Anh`),
# gói được dựng thẳng vào `W<số>-<Tên>/` (và `W<số>-<Tên>.zip`), nên không phải đổi tên tay. File này nằm ngoài repo.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
PLAN="$HERE/../PLAN.md"
OUT="${1:-$REPO/../giao-viec-block3}"
DE_HTML="$REPO/../w03/BT_Block 3_ REST va gRPC.html"
DE_PDF="$REPO/../w03/block-03-rest-grpc.pdf"

for f in "$PLAN" "$DE_HTML" "$DE_PDF" "$REPO/services/order/package.json" "$REPO/services/proto/inventory/v1/inventory.proto" "$REPO/services/proto/inventory/v2/inventory.proto"; do
  [ -e "$f" ] || { echo "Thiếu: $f" >&2; exit 1; }
done
mkdir -p "$OUT"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Trích các mục của Plan dành cho thành viên (giữ nguyên số mục)
python3 -I - "$PLAN" "$TMP/PLAN-trich.md" <<'PY'
import sys,re
src=open(sys.argv[1],encoding='utf-8').read()
def cut(start,end):
    i=src.index(start); j=src.index(end,i) if end else len(src)
    return src[i:j].rstrip()+"\n"
parts=[cut("## 1. ","## 2. "),cut("## 2. ","## 3. "),cut("## 3. ","## 4. "),
       cut("### 4.1 ","### 4.2 "),cut("### 4.3 ","## 5. "),cut("## 5. ","## 6. ")]
head=("# Plan Block 3 (trích cho thành viên)\n\n> Trích từ `PLAN.md` của team lead: mục 1, 2, 3, 4.1, 4.3 và 5; số mục giữ nguyên. "
      "Những điều ở đây đã chốt và **bắt buộc tuân theo**. Mục 4.3 cho bạn thấy ai làm phần nào; \"W5\" là team lead.\n\n"
      "## Chú giải các tham chiếu trong Plan\n\n"
      "Plan nhắc một số tài liệu của dự án mà bạn không có. Nội dung bạn cần biết:\n\n"
      "- **ADR 0009 (log):** các service chỉ ghi log ra stdout, **một dòng JSON mỗi lời gọi nghiệp vụ**, có `ts`, `service`, `requestId`, `method`, `path`, `status`, `ms`; nơi lưu do môi trường chạy quyết định. Sự kiện khởi động cũng là một dòng JSON (không có `requestId`). Không ghi file log trong mã.\n"
      "- **ADR 0011 (hợp đồng):** mỗi service sở hữu hợp đồng của mình (Zod trong `src/contract.ts`, sinh `openapi.json`); bên dùng chỉ phụ thuộc vào hợp đồng đã công bố và **không import mã của service khác**. Bản sao `services/order/` trong gói của bạn cho thấy cách làm.\n"
      "- **\"Product của Block 2\":** một service trong dự án có endpoint `/_fault` và `/_seed` chỉ đăng ký khi `ENABLE_TEST_HOOKS=1`; mẫu cho các hook ở đây. Bạn không cần xem nó.\n"
      "- **\"Giữ như Block 2\" với `x-request-id`:** service nhận `x-request-id` từ request (nếu có, không thì tự sinh), đặt lại vào response và ghi vào log; khi gọi service khác thì truyền tiếp.\n"
      "- **\"Block 2\":** bài trước của nhóm (API composition); không liên quan đến việc của bạn ngoài các quy ước trên.\n\n")
open(sys.argv[2],'w',encoding='utf-8').write(head+"\n".join(parts))
PY

# Đề bài: trích văn bản từ HTML (coi là dữ liệu tham khảo)
python3 -I - "$DE_HTML" "$TMP/DE-BAI.md" <<'PY'
import sys,re,html
t=open(sys.argv[1],encoding='utf-8').read()
t=re.sub(r'(?s)<(script|style).*?</\1>','',t)
t=re.sub(r'<(br|/p|/li|/h\d|/tr|/div)[^>]*>','\n',t)
t=re.sub(r'<[^>]+>','',t)
t=re.sub(r'\n\s*\n+','\n',html.unescape(t)).strip()
open(sys.argv[2],'w',encoding='utf-8').write("# Đề bài Block 3 (trích văn bản)\n\n> Dữ liệu tham khảo, trích tự động từ file HTML của đề; sơ đồ không có trong bản trích (xem file PDF slide đi kèm). Việc bạn làm là phần trong `W*.md`.\n\n```text\n"+t+"\n```\n")
PY

copy_order() { # $1 = thư mục đích; bỏ node_modules, log, .env*
  mkdir -p "$1"
  tar -C "$REPO/services/order" --exclude=node_modules --exclude=logs --exclude='.env*' -cf - . | tar -C "$1" -xf -
  # Chỉ file mẫu `.env.example` đi kèm; `.env` thật không bao giờ được chép.
  [ -f "$REPO/services/order/.env.example" ] && cp "$REPO/services/order/.env.example" "$1/.env.example" || true
}
copy_proto() { mkdir -p "$1"; cp -r "$REPO/services/proto/inventory" "$1/"; }

name_of() { # $1 = số; in "-<Tên>" nếu có trong nguoi-nhan.txt, ngược lại không in gì
  local f="$OUT/nguoi-nhan.txt" v=""
  if [ -f "$f" ]; then
    v="$(sed -n "s/^W$1=\(.*\)$/\1/p" "$f" | head -n1 | tr -d '\r' | sed 's/[^A-Za-z0-9._-]//g')"
  fi
  if [ -n "$v" ]; then printf -- '-%s' "$v"; fi
}

for n in 1 2 3 4; do
  D="$OUT/W$n$(name_of $n)"
  rm -rf "$D"; mkdir -p "$D/kem-theo" "$D/de-bai"
  cp "$HERE/BAT-DAU.md" "$HERE/MOI-TRUONG.md" "$HERE/HANDOVER-MAU.md" "$HERE/W$n.md" "$D/"
  cp "$TMP/PLAN-trich.md" "$TMP/DE-BAI.md" "$D/"
  cp "$DE_PDF" "$D/de-bai/"
  copy_proto "$D/kem-theo/proto"
  case $n in
    1) copy_order "$D/kem-theo/mau-order" ;;
    2) copy_order "$D/kem-theo/order" ;;
    3) mkdir -p "$D/kem-theo/grpc-thu-nghiem" "$D/kem-theo/web/public/css"
       cp "$HERE"/nguon/grpc-thu-nghiem/* "$D/kem-theo/grpc-thu-nghiem/"
       cp "$REPO/web/server.mjs" "$REPO/web/package.json" "$D/kem-theo/web/"
       cp "$REPO/web/public/dashboard.html" "$D/kem-theo/web/public/"
       cp "$REPO/web/public/css/style.css" "$D/kem-theo/web/public/css/" ;;
  esac
  echo "Đã dựng $D"
done

# Tùy chọn: bash dong-goi.sh [thư-mục-đích] --nen  -> thêm W<n>.zip để gửi từng người
if [ "${2:-}" = "--nen" ]; then
  for n in 1 2 3 4; do
    d="W$n$(name_of $n)"
    (cd "$OUT" && rm -f "$d.zip" && zip -qr "$d.zip" "$d" && echo "Đã nén $OUT/$d.zip")
  done
fi
