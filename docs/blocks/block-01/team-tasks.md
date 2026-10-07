# 🛒 Cart API — Phân công công việc nhóm 5 người

> **Đề bài**: Xây dựng RESTful Cart API với OpenAPI spec, validation, error contract và logging.
> **Người tổng hợp & implement**: **Phú** — quyết định stack, tổng hợp toàn bộ output của nhóm để code.

---

## Nguyên tắc phân công

- Mỗi người ra **quyết định + tài liệu thiết kế**, không cần code.
- Output của mỗi người là **tài liệu đầu vào** để người tổng hợp implement.
- Không có dependency chéo: ai cũng có thể bắt đầu ngay từ đầu.
- Deadline gợi ý: tất cả nộp output trước khi người tổng hợp bắt đầu code.

---

## 👤 Thành viên #1 — Phú (Tech Lead + Implementer)

**Vai trò**: Ra quyết định về tech stack & tổng hợp toàn bộ để implement.

### Quyết định cần đưa ra:
- [ ] Chọn **runtime & framework** (Node.js/Express, Fastify, Hono, Bun…)
- [ ] Chọn **approach**: contract-first (`express-openapi-validator`) hay code-first (`zod` + `zod-to-openapi`)
- [ ] Chọn **ORM / query builder** (Drizzle, Prisma, Knex, pg trực tiếp…)
- [ ] Chọn **thư viện logging** (pino-http, winston, morgan)
- [ ] Chọn **docs UI** (Swagger UI, Redoc, Scalar)
- [ ] Quyết định **cấu trúc thư mục** project

### Output cần nộp:
> **`DECISIONS.md`** — ghi rõ mọi lựa chọn + lý do 1-2 câu cho từng cái.

---

## 👤 Thành viên #2 — Anh (Database Designer)

**Vai trò**: Thiết kế DB schema, migration và seed data.

> ⚡ Không cần code thật — chỉ cần thiết kế chi tiết để người implement viết migration.

### Công việc:
- [ ] Xác nhận lại 3 bảng đề bài yêu cầu:
  ```sql
  products (id, sku, name, price_cents, stock, is_active)
  carts (id, status)
  cart_items (cart_id, product_id, quantity)
  ```
- [ ] Thiết kế **seed data** đầy đủ:
  - 5 products: 3 đang bán còn hàng, 1 `stock = 0`, 1 `is_active = false`
  - 1 cart có `status = 'checked_out'`
  - Đặt giá `price_cents` cụ thể (để kiểm tra `subtotal_cents` tính tay được)
- [ ] Liệt kê các **index** cần thiết (nếu có)
- [ ] Xác định script cần có: `migrate`, `seed`, `reset`

### Output cần nộp:
> **`DB_DESIGN.md`** — bảng schema, bảng seed data với số liệu cụ thể, danh sách script cần tạo.

---

## 👤 Thành viên #3 — Thạnh (API Contract Designer)

**Vai trò**: Thiết kế toàn bộ OpenAPI 3.1 spec (cấu trúc, không cần viết YAML hoàn chỉnh).

> ⚡ Không cần viết YAML đầy đủ — chỉ cần thiết kế đủ chi tiết để người implement viết spec.

### Công việc:
- [ ] Thiết kế **6 endpoints** theo đề bài:
  | Endpoint | Method | Success | Body |
  |----------|--------|---------|------|
  | `/products` | GET | 200 | `?limit&offset` |
  | `/carts` | POST | 201 + Location header | — |
  | `/carts/{cartId}` | GET | 200 | — |
  | `/carts/{cartId}/items` | POST | 201 | `{product_id, quantity}` |
  | `/carts/{cartId}/items/{productId}` | PATCH | 200 | `{quantity}` |
  | `/carts/{cartId}/items/{productId}` | DELETE | 204 | — |
- [ ] Thiết kế **response schema** cho Cart object (bao gồm `items[]` và `subtotal_cents`)
- [ ] Thiết kế **error response schema** theo error contract:
  ```json
  { "code": "...", "message": "...", "details": [...], "request_id": "..." }
  ```
- [ ] Liệt kê **tất cả status codes** cho từng endpoint (200/201/204/400/404/409/422/500)
- [ ] Liệt kê **tất cả error codes** (VALIDATION_ERROR, CART_NOT_FOUND, ITEM_NOT_FOUND, PRODUCT_UNAVAILABLE, INSUFFICIENT_STOCK, ITEM_ALREADY_IN_CART, CART_CLOSED)

### Output cần nộp:
> **`API_DESIGN.md`** — bảng endpoint, schema dạng bảng hoặc JSON ví dụ, bảng error codes.

---

## 👤 Thành viên #4 — Đạt (Business Logic Analyst)

**Vai trò**: Thiết kế toàn bộ business rule và luồng xử lý cho từng endpoint.

> ⚡ Không cần code — chỉ cần viết logic đủ rõ để người implement hiểu ngay.

### Công việc:
- [ ] Với **mỗi endpoint**, viết flow xử lý dạng numbered list:
  - Bước validate schema (dừng ở đây nếu sai → 400)
  - Bước check DB (dừng nếu không tìm thấy → 404)
  - Bước check business rule (theo thứ tự nào? → 409/422)
  - Bước ghi DB và trả response
- [ ] Đặc biệt làm rõ **thứ tự check** khi có nhiều rule:
  - `POST /carts/{cartId}/items`: kiểm tra cart tồn tại → cart open → product tồn tại & active → đủ stock → item chưa có → thêm
  - `PATCH /carts/{cartId}/items/{productId}`: tương tự
- [ ] Thiết kế **subtotal_cents** được tính ở đâu (DB query hay application layer?)
- [ ] Xác định **transaction** nào cần dùng DB transaction

### Output cần nộp:
> **`BUSINESS_LOGIC.md`** — flow xử lý từng endpoint, bảng thứ tự validation, quyết định về subtotal và transaction.

---

## 👤 Thành viên #5 — Luân (QA & Evidence Planner)

**Vai trò**: Thiết kế kịch bản test và script nghiệm thu.

> ⚡ Không cần code script — chỉ cần thiết kế đủ chi tiết để người implement viết script.

### Công việc:
- [ ] Thiết kế **ma trận nghiệm thu đầy đủ** (bao phủ cả 2 bảng trong đề bài):

  **Request sai:**
  | Kịch bản | Endpoint | Input | Kết quả mong đợi |
  |----------|----------|-------|-----------------|
  | quantity = 0 | POST /carts/:id/items | `{"quantity": 0, ...}` | 400 VALIDATION_ERROR |
  | quantity = 11 | ... | ... | ... |
  | quantity = "2" | ... | ... | ... |
  | Thiếu product_id | ... | ... | ... |
  | Field lạ trong body | ... | ... | ... |
  | cartId không phải uuid | ... | ... | ... |
  | cartId không tồn tại | ... | ... | 404 CART_NOT_FOUND |

  **Business logic:**
  | Kịch bản | Setup cần | Kết quả mong đợi |
  |----------|-----------|-----------------||
  | Thêm 2 product, GET cart | Seed data cụ thể | subtotal_cents = X |
  | Product is_active = false | Seed sẵn | 422 PRODUCT_UNAVAILABLE |
  | Vượt stock | Seed stock = 1, thêm qty = 2 | 409 INSUFFICIENT_STOCK |
  | Cart checked_out | Seed sẵn | 409 CART_CLOSED |
  | PostgreSQL tắt | — | 500 đúng contract, không có stack trace |

- [ ] Thiết kế **format script** nghiệm thu (curl? HTTPie? .http file? Postman collection?)
- [ ] Liệt kê **thứ tự chạy** các kịch bản (reset DB trước, seed, rồi test từng nhóm)

### Output cần nộp:
> **`TEST_MATRIX.md`** — bảng đầy đủ, format script chọn, thứ tự chạy.

---

## 📋 Tổng hợp output

| Thành viên | Output file | Phú dùng để làm gì |
|------------|-------------|---------------------|
| Phú | `DECISIONS.md` | Xác định tech stack trước khi implement |
| Anh | `DB_DESIGN.md` | Viết migration + seed |
| Thạnh | `API_DESIGN.md` | Viết `openapi.yaml` |
| Đạt | `BUSINESS_LOGIC.md` | Viết handler/service layer |
| Luân | `TEST_MATRIX.md` | Viết evidence script |

> [!IMPORTANT]
> **Thứ tự implement của Phú**: `DECISIONS.md` → DB migration → `openapi.yaml` → validation middleware → handlers (theo BUSINESS_LOGIC.md) → logging → evidence script (theo TEST_MATRIX.md)

---

## 🎤 Gợi ý cho Presentation

Theo đề bài yêu cầu 4 phần:
1. **Problem**: Cart API cần gì để nhóm khác dùng mà không đọc source?
2. **Solution**: Contract-first hay code-first, thư viện đã chọn và lý do.
3. **Demo**: Gửi request sai từ `/docs`, chỉ response lỗi và log có cùng `request_id`.
4. **Evidence & trade-off**: Kết quả ma trận; kịch bản chưa kiểm tra.
