#!/usr/bin/env bash
# Nạp seed data (idempotent: xóa sạch rồi nạp lại 5 products + 1 cart checked_out).
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsx seeds/seed.ts
