#!/usr/bin/env bash
# Áp dụng migration (prisma migrate deploy). Cần DATABASE_URL trong .env.
set -euo pipefail
cd "$(dirname "$0")/.."
npx prisma migrate deploy
