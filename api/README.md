# Kartvibe API

Node.js + Express 5 · Zod (validate + OpenAPI cùng nguồn) · Prisma 7 · PostgreSQL · pino-http · Swagger UI.
Các lựa chọn kỹ thuật và lý do: xem [docs/decisions](../docs/decisions/README.md). Tổng quan dự án: [README gốc](../README.md).

## Yêu cầu
- Node.js ≥ 20 (đã thử trên 24), PostgreSQL ≥ 14

## Setup

```bash
# 1. Cài dependencies (tự chạy prisma generate)
npm install

# 2. Tạo file env và chỉnh DATABASE_URL nếu cần
cp .env.example .env

# 3. Tạo DB (chọn 1)
createdb kartvibe
#   hoặc: docker run -d --name kartvibe-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=kartvibe -p 5434:5432 postgres:17

# 4. Migration + seed
npm run migrate
npm run seed
```

## Chạy

```bash
npm run dev      # development (tsx watch)
npm run start    # production
npm run build    # type-check (tsc --noEmit)
```

```bash
npm run start:log   # như start, đồng thời ghi nối tiếp vào logs/server.log (đã gitignore)
grep <request_id> logs/server.log   # tra log theo request_id (kịch bản F2)
```

Log là JSON mỗi dòng ghi ra stdout (pino-http); app không tự ghi file hay DB.

- API: http://localhost:3000
- Swagger UI: http://localhost:3000/docs
- Spec OpenAPI 3.1: http://localhost:3000/openapi.json (hoặc `npm run openapi:generate` → `openapi.json`)

## Reset DB về trạng thái seed

```bash
npm run reset    # (alias: npm run db:reset) drop → migrate → seed
```

Lệnh này **xóa dữ liệu**. Nó in ra DB đích và từ chối chạy khi `NODE_ENV=production` hoặc DB không ở máy local (`scripts/guard-reset.mjs`).

Dữ liệu seed nằm ở `seeds/data/*.json` (mỗi bảng một file) (UUID cố định để evidence dùng lại; `build-collection.mjs` cũng đọc file này). Sau seed: `products = 5`, `carts = 2`, `cart_items = 2`; chi tiết từng fixture: [seeds/README.md](seeds/README.md).

## Nghiệm thu (evidence)

Server phải đang chạy ở terminal khác.

```bash
npm run evidence               # reset DB + newman chạy nhóm D → A → B → C (+ F áp dụng cho mọi request)
bash evidence/run-all.sh e1    # nhóm E: tắt Postgres thủ công rồi chạy
```

Collection/environment Postman được sinh bởi `evidence/build-collection.mjs` vào `postman/`.
**F2** (đối chiếu log): lấy `request_id` in ở console newman rồi `grep <request_id>` trên log của server.

## Cấu trúc

Theo chiều dọc (mỗi domain gồm routes/handler/service/repository): `src/products`, `src/carts`, `src/items`;
dùng chung ở `src/shared`; Zod schema + registry OpenAPI ở `src/openapi`.
