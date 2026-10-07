#!/usr/bin/env bash
# Reset DB về trạng thái sạch: drop schema → migrate → seed.
# Từ chối chạy khi NODE_ENV=production hoặc DB không ở máy local (xem guard-reset.mjs).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/guard-reset.mjs
npx prisma migrate reset --force
bash scripts/seed.sh
