#!/usr/bin/env bash
# Chạy toàn bộ ma trận nghiệm thu (D → A → B → C) bằng newman. Nhóm E (tắt Postgres) chạy riêng:
#   bash evidence/run-all.sh e1
# Cần server đang chạy (npm run start) trên BASE_URL (mặc định http://localhost:3000).
set -euo pipefail
cd "$(dirname "$0")/.."
BASE_URL="${BASE_URL:-http://localhost:3000}"
node evidence/build-collection.mjs

FOLDERS=(--folder "D - Happy Path" --folder "A - Schema Validation" --folder "B - 404 Not Found" --folder "C - Business Rules")
if [ "${1:-}" = "e1" ]; then
  FOLDERS=(--folder "E - Server Error 500")
else
  echo "==> Reset DB"
  bash scripts/reset.sh
fi

mkdir -p evidence/output
npx newman run postman/kartvibe-api.postman_collection.json \
  -e postman/kartvibe-api.postman_environment.json \
  --env-var "baseUrl=$BASE_URL" \
  "${FOLDERS[@]}" \
  --reporters cli,json --reporter-json-export evidence/output/newman-report.json
