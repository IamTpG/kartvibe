#!/usr/bin/env bash
# Sao chép bài nộp Block 2 từ kartvibe sang thư mục nộp trong w02 (không nén).
# Dùng:  bash docs/blocks/block-02/xuat-bai.sh <STT nhóm> <MSSV> [<MSSV>...]
#        ví dụ: bash docs/blocks/block-02/xuat-bai.sh 6 23127086 23127170 23127244 23127262 23127280
# Ra:    <thư mục chứa kartvibe>/w02/<STT>-Block02-<MSSV>-<MSSV>.../   (giống w01/6-Block01-...)
# Chạy lại được: thư mục đích đã có (có README.md, REPORT.md, services/) sẽ được thay mới; thư mục khác dạng thì không đụng.
# Lấy tệp từ thư mục làm việc (không cần commit); loại node_modules, logs, .run, .env và tệp trạng thái của công cụ.
# Không đưa dự án nào khác trong repo vào thư mục nộp.
set -euo pipefail
[ "$#" -ge 2 ] || { sed -n 2,5p "$0" >&2; exit 2; }
STT=$1; shift
NAME="$STT-Block02-$(IFS=-; echo "$*")"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
W02="$(cd "$ROOT/.." && pwd)/w02"
DEST="$W02/$NAME"
[ -d "$W02" ] || { echo "Không thấy thư mục $W02" >&2; exit 1; }

if [ -e "$DEST" ]; then
  [ -f "$DEST/REPORT.md" ] && [ -f "$DEST/README.md" ] && [ -d "$DEST/services" ] || { echo "LỖI: $DEST đã tồn tại nhưng không giống một thư mục nộp do script này tạo; không ghi đè." >&2; exit 1; }
  rm -rf "$DEST"
fi
mkdir -p "$DEST"

EXCLUDES=(--exclude node_modules --exclude logs --exclude .run --exclude dist --exclude '.env' --exclude '.env.local' --exclude '*.log' --exclude .git)
for d in services web; do rsync -a "${EXCLUDES[@]}" "$ROOT/$d/" "$DEST/$d/"; done
# results: chỉ bằng chứng; bỏ tệp trạng thái hoặc dẫn xuất của công cụ
rsync -a "${EXCLUDES[@]}" --exclude cold-session.json --exclude summary.json "$ROOT/results/" "$DEST/results/"
# tài liệu của block: Plan, hợp đồng, trình bày, sơ đồ (không đưa ghi chú nội bộ và tệp dựng)
mkdir -p "$DEST/docs/blocks/block-02"
for f in PLAN.md hop-dong-chung.md TRINH-BAY.md so-do-kien-truc.md so-do-kien-truc.html; do cp "$HERE/$f" "$DEST/docs/blocks/block-02/$f"; done
# Liên kết tới ADR (docs/decisions) không nằm trong thư mục nộp: giữ chữ, bỏ liên kết, trong bản sao
sed -i -E 's#\[([^]]+)\]\(\.\./\.\./decisions/[^)]+\)#\1#g' "$DEST"/docs/blocks/block-02/*.md
# README và REPORT ở gốc thư mục nộp
cp "$HERE/README.nop-bai.md" "$DEST/README.md"
cp "$HERE/REPORT.md" "$HERE/REPORT.html" "$DEST/"

# --- kiểm tra an toàn ---
bad=0
leaks="$(find "$DEST" \( -name '.env' -o \( -name '.env.*' ! -name '.env.example' \) -o -name node_modules -o -name api \) -print)"
[ -z "$leaks" ] || { echo "LỖI: còn tệp không được phép:" >&2; echo "$leaks" >&2; bad=1; }
[ "$(ls "$DEST/results/raw" 2>/dev/null | wc -l)" -gt 0 ] || { echo "LỖI: thiếu results/raw" >&2; bad=1; }
[ -d "$DEST/results/evidence/waterfall" ] || echo "CẢNH BÁO: chưa có results/evidence/waterfall (ảnh waterfall là sản phẩm bắt buộc của đề)" >&2
grep -q "CẦN BỔ SUNG" "$DEST/REPORT.md" && echo "CẢNH BÁO: REPORT.md còn ghi chú 'CẦN BỔ SUNG' (xóa sau khi chèn ảnh waterfall)" >&2
python3 -I - "$DEST" <<'PY' || bad=1
import re, sys
from pathlib import Path
root = Path(sys.argv[1]); broken = []
for md in root.rglob('*.md'):
    if 'node_modules' in md.parts: continue
    text = re.sub(r'`[^`\n]*`', '', re.sub(r'```.*?```', '', md.read_text(encoding='utf8'), flags=re.S))
    for target in re.findall(r'\]\(([^)\s#]+)', text):
        if re.match(r'[a-z]+:', target): continue
        if not (md.parent / target).exists(): broken.append(f'{md.relative_to(root)} -> {target}')
if broken:
    print('LỖI: liên kết tương đối bị hỏng:', *broken, sep='\n  ', file=sys.stderr); sys.exit(1)
print('liên kết tương đối: ổn')
PY
[ "$bad" = 0 ] || { echo "Có lỗi, xem $DEST" >&2; exit 1; }
echo "Đã tạo $DEST ($(du -sh "$DEST" | cut -f1), $(find "$DEST" -type f | wc -l) tệp)"
