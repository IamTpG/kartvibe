# Tech Stack Decisions

> File này là nguồn sự thật về tech stack của project.
> Các thành viên đọc file này để biết môi trường họ đang thiết kế cho.

---

## Framework

**Chọn**: Node.js + Express

**Lý do**: Cả nhóm quen tay, hệ sinh thái lớn nhất, tài liệu phong phú, middleware ecosystem đủ mọi thứ cần thiết cho bài này (validation, logging, docs).

**Các lựa chọn đã cân nhắc**:

| Lựa chọn | Lý do không chọn |
|----------|-----------------|
| **Node.js + Fastify** | Nhanh hơn Express nhưng nhóm chưa quen API của Fastify (plugin system, schema tích hợp). Lợi thế về hiệu năng không cần thiết ở scale bài tập. |
| **Bun + Hono** | Runtime Bun còn mới, khả năng tương thích thư viện chưa ổn định. Rủi ro mất thời gian debug môi trường thay vì làm bài. |

---

## Approach

**Chọn**: Code-first — Zod + `@asteasolutions/zod-to-openapi`

**Lý do**: Viết Zod schema một lần, dùng cho cả hai mục đích: (1) validate request tại runtime và (2) tự động sinh OpenAPI 3.1 YAML để render docs. Đảm bảo validation và spec **không bao giờ lệch nhau** vì xuất phát từ cùng một nguồn — đây là yêu cầu bắt buộc của đề bài.

**Cách hoạt động**:
1. Mỗi endpoint có một Zod schema mô tả request body / query params / path params
2. Middleware dùng schema đó để validate request — request sai không chạm DB
3. `zod-to-openapi` đọc cùng schema đó để sinh `openapi.json` / render `/docs`

**Các lựa chọn đã cân nhắc**:

| Lựa chọn | Lý do không chọn |
|----------|-----------------|
| **Contract-first** (`express-openapi-validator`) | Phải viết và maintain file YAML tay song song với code. Nguy cơ schema trong YAML lệch với code nếu quên cập nhật — đây chính xác là lỗi thường gặp mà đề bài cảnh báo. |
| **Joi + joi-to-swagger** | Joi không có TypeScript types tự động. Thư viện `joi-to-swagger` ít được maintain, chưa hỗ trợ OpenAPI 3.1. |
| **tsoa (TypeScript decorators)** | Cần build step riêng, cấu hình phức tạp hơn. Overkill cho scope bài tập 1h. |

---

## ORM / Query Builder

**Chọn**: Prisma

**Lý do**: Tự động sinh TypeScript types từ `schema.prisma`, có migration tool tích hợp (`prisma migrate`), và Prisma Client API trực quan giúp viết query nhanh mà không cần nhớ SQL cho từng trường hợp. Phù hợp với scope và timeline của bài tập.

**Các lựa chọn đã cân nhắc**:

| Lựa chọn | Lý do không chọn |
|----------|-----------------|
| **`pg` trực tiếp** | Kiểm soát SQL tốt nhất nhưng phải tự viết boilerplate (connection pool, parameterized query, mapping row → object). Tốn thời gian hơn khi đề bài đã có sẵn schema rõ ràng. |
| **Drizzle ORM** | Type-safe và gần SQL hơn Prisma, nhưng nhóm chưa có kinh nghiệm. Tài liệu ít hơn Prisma, rủi ro mất thời gian tìm hiểu. |

---

## Logging

**Chọn**: pino-http

**Lý do**: Sinh structured JSON log (dễ grep, dễ parse), tích hợp sẵn cơ chế gắn `request_id` vào mọi dòng log trong cùng một request, hiệu năng cao nhất trong nhóm. Đáp ứng đúng yêu cầu đề bài: `request_id` phải xuất hiện đồng thời trong header response, error body, và log.

**Quy tắc bắt buộc**:
- `request_id` (UUID v4) được sinh cho mỗi request
- Trả về trong header: `X-Request-Id: <uuid>`
- Có mặt trong mọi dòng log liên quan đến request đó
- Có mặt trong body của mọi error response
- **Không bao giờ log**: password, token, nội dung header `Authorization`

**Nơi lưu log**: app chỉ ghi JSON ra **stdout**, không tự ghi file hay DB. Muốn lưu file: `npm run start:log` (`tee -a logs/server.log`, thư mục `logs/` nằm trong `.gitignore`). Tra log theo request: `grep <request_id> logs/server.log`.

**Lý do**: Đề bài chỉ yêu cầu `request_id` có trong log và tra cứu được, không yêu cầu lưu trữ. Ghi stdout là cách phổ biến (nơi lưu do môi trường chạy quyết định). Không lưu vào DB vì mỗi request phải thêm một lần ghi (kể cả request 400 vốn không được chạm DB), DB lỗi thì mất đúng log cần nhất (E1), và làm bẩn trạng thái seed. Chi tiết: `backend/IMPLEMENTATION_NOTES.md`.

**Các lựa chọn đã cân nhắc**:

| Lựa chọn | Lý do không chọn |
|----------|-----------------|
| **winston** | Linh hoạt hơn (nhiều transport: file, cloud…) nhưng overkill cho bài tập. Không tích hợp sẵn với Express request lifecycle bằng pino-http. |
| **morgan** | Chỉ log HTTP request đơn giản (`GET /carts 200 5ms`), không hỗ trợ gắn `request_id` vào từng dòng log theo request context. Cần viết thêm nhiều custom middleware để đạt yêu cầu đề bài. |

---

## Docs UI

**Chọn**: Swagger UI

**Lý do**: Phổ biến nhất, cho phép thử request trực tiếp từ trình duyệt mà không cần tool ngoài — tiện cho demo và nghiệm thu. Trang `/docs` chạy được là yêu cầu bắt buộc khi bàn giao.

**Các lựa chọn đã cân nhắc**:

| Lựa chọn | Lý do không chọn |
|----------|-----------------|
| **Scalar** | UX hiện đại hơn Swagger UI, cũng thử request được. Tuy nhiên ít quen thuộc với team — Swagger UI là chuẩn mực phổ biến hơn trong môi trường học thuật. |
| **Redoc** | Giao diện đẹp, dễ đọc nhưng **không thử request được** từ trình duyệt. Bất lợi khi demo live trong phần presentation. |

---

## Cấu trúc thư mục

**Chọn**: Chiều dọc (Vertical / Feature-based) — mỗi domain tự chứa toàn bộ các layer của nó.

**Lý do**: Đề bài ghi rõ *"chưa làm tuần này: đăng nhập, checkout, thanh toán"* — project chắc chắn sẽ có thêm domain mới ở các tuần sau. Cấu trúc chiều dọc cho phép thêm domain mới mà không đụng code cũ; cấu trúc chiều ngang sẽ làm mọi thư mục phình ra đồng thời mỗi tuần.

**Các lựa chọn đã cân nhắc**:

| Lựa chọn | Lý do không chọn |
|----------|-----------------|
| **Chiều ngang** (`routes/`, `services/`, `handlers/`) | Khi thêm `auth`, `orders`, `payments`, mỗi folder bị phình ra cùng lúc. Để làm 1 tính năng phải mở file ở 4 folder khác nhau — khó theo dõi khi số domain tăng. |

```
backend/
├── src/
│   ├── products/
│   │   ├── products.routes.ts      # Đăng ký route GET /products
│   │   ├── products.handler.ts     # Xử lý request, trả response
│   │   ├── products.service.ts     # Business logic
│   │   └── products.repository.ts # Query DB (Prisma)
│   ├── carts/
│   │   ├── carts.routes.ts         # POST /carts, GET /carts/:id
│   │   ├── carts.handler.ts
│   │   ├── carts.service.ts
│   │   └── carts.repository.ts
│   ├── items/
│   │   ├── items.routes.ts         # POST/PATCH/DELETE /carts/:id/items/:pid
│   │   ├── items.handler.ts
│   │   ├── items.service.ts
│   │   └── items.repository.ts
│   ├── shared/
│   │   ├── middleware/             # request_id, error handler
│   │   ├── errors.ts               # Error classes dùng chung
│   │   └── db.ts                   # Prisma client singleton
│   └── openapi/
│       ├── schemas/                # Zod schemas (validate + docs cùng nguồn)
│       └── registry.ts            # Cấu hình zod-to-openapi, sinh spec
├── prisma/
│   ├── schema.prisma               # DB schema
│   └── migrations/                 # Migration files tự động sinh bởi Prisma
├── seeds/
│   └── seed.ts                     # Seed data (5 products, 1 cart checked_out)
├── scripts/
│   ├── migrate.sh                  # Chạy prisma migrate deploy
│   ├── seed.sh                     # Chạy seed
│   └── reset.sh                    # Reset DB + seed lại
├── evidence/
│   ├── build-collection.mjs        # Sinh Postman collection + environment từ test matrix
│   └── run-all.sh                  # Reset DB + chạy newman (D → A → B → C); `run-all.sh e1` cho nhóm E
├── postman/                        # Collection/environment sinh ra bởi build-collection.mjs
├── logs/                           # Log ghi bởi `npm run start:log` (gitignore)
├── .env.example                    # Mẫu biến môi trường
├── IMPLEMENTATION_NOTES.md         # Các điểm tự quyết khi implement
└── README.md                       # Lệnh setup + chạy
```

**Cách scale về sau**: Thêm `auth/`, `orders/`, `payments/` là thêm folder mới — không đụng code cũ.

---


---

## Database Design

> Chi tiết đầy đủ: [DB_DESIGN.md](./DB_DESIGN.md) — phụ trách: **Anh**

### Schema (3 bảng, giữ nguyên đề bài)

```sql
CREATE TABLE products (
  id          uuid PRIMARY KEY,
  sku         text UNIQUE NOT NULL,
  name        text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  stock       integer NOT NULL CHECK (stock >= 0),
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE carts (
  id     uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'open'
         CHECK (status IN ('open', 'checked_out'))
);

CREATE TABLE cart_items (
  cart_id    uuid REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  quantity   integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  PRIMARY KEY (cart_id, product_id)
);
```

### Seed data (UUID cố định để evidence script dùng lại)

| Alias | UUID | name | price_cents | stock | is_active |
|-------|------|------|-------------|-------|-----------|
| SP1 | `10000000-0000-4000-8000-000000000001` | Bút bi xanh | 5 000 | 3 | true |
| SP2 | `10000000-0000-4000-8000-000000000002` | Vở kẻ ngang | 15 000 | 50 | true |
| SP3 | `10000000-0000-4000-8000-000000000003` | Thước kẻ 30cm | 8 000 | 1 | true |
| SP4 | `10000000-0000-4000-8000-000000000004` | Bút xóa | 12 000 | 0 | true _(hết hàng)_ |
| SP5 | `10000000-0000-4000-8000-000000000005` | Compa | 25 000 | 10 | **false** _(ngừng bán)_ |
| CART_CLOSED | `20000000-0000-4000-8000-000000000001` | — | — | — | `checked_out` |

Trạng thái sạch sau seed: `products = 5`, `carts = 1`, `cart_items = 0`.

**Sắp xếp**: items trong cart theo `name, id` (khớp query bên dưới); danh sách `GET /products` theo `sku` tăng dần.

**Subtotal**: `subtotal_cents` không lưu DB — tính lại mỗi request: `SUM(price_cents × quantity)`. Giá luôn đọc từ `products`, không nhận từ client.

**Index**: Không thêm index bổ sung trong tuần 1 — PRIMARY KEY và UNIQUE đã đủ cho scale seed nhỏ.


---

## API Design

> Chi tiết đầy đủ: [API_DESIGN.md](./API_DESIGN.md) — phụ trách: **Thạnh**

### 6 Endpoints

| # | Method | Path | Body | Success |
|---|--------|------|------|---------|
| 1 | `GET` | `/products?limit=&offset=` | — | `200` |
| 2 | `POST` | `/carts` | — | `201` + header `Location` |
| 3 | `GET` | `/carts/{cartId}` | — | `200` |
| 4 | `POST` | `/carts/{cartId}/items` | `{ product_id, quantity }` | `201`, trả Cart |
| 5 | `PATCH` | `/carts/{cartId}/items/{productId}` | `{ quantity }` | `200`, trả Cart |
| 6 | `DELETE` | `/carts/{cartId}/items/{productId}` | — | `204` |

### Quy ước chung
- Header `X-Request-Id: <uuid>` có mặt trong **mọi** response (kể cả 204 và lỗi).
- Mọi request body có `additionalProperties: false` — field lạ → `400`.
- Body không ép kiểu: `"quantity": "2"` → `400`. Query param được ép kiểu từ chuỗi.

### Error contract (áp dụng cho mọi lỗi kể cả 500)

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request không hợp lệ",
  "details": [{ "field": "quantity", "issue": "must be >= 1" }],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

| Status | `code` |
|--------|--------|
| 400 | `VALIDATION_ERROR` |
| 404 | `CART_NOT_FOUND` / `ITEM_NOT_FOUND` |
| 409 | `CART_CLOSED` / `ITEM_ALREADY_IN_CART` / `INSUFFICIENT_STOCK` |
| 422 | `PRODUCT_UNAVAILABLE` |
| 500 | `INTERNAL_ERROR` |
| 404 | `ROUTE_NOT_FOUND` — ngoài 6 endpoint (vd. `GET /foo`) |
| 405 | `METHOD_NOT_ALLOWED` — vd. `PUT /carts` |

`500` **không được** chứa stack trace, câu SQL hay message gốc thư viện.

### Thứ tự trả lỗi (vi phạm nhiều rule, chỉ trả lỗi đầu tiên)

| Endpoint | Thứ tự |
|----------|--------|
| `POST .../items` | `VALIDATION_ERROR` → `CART_NOT_FOUND` → `CART_CLOSED` → `PRODUCT_UNAVAILABLE` → `ITEM_ALREADY_IN_CART` → `INSUFFICIENT_STOCK` |
| `PATCH .../items/:pid` | `VALIDATION_ERROR` → `CART_NOT_FOUND` → `CART_CLOSED` → `ITEM_NOT_FOUND` → `INSUFFICIENT_STOCK` |
| `DELETE .../items/:pid` | `VALIDATION_ERROR` → `CART_NOT_FOUND` → `CART_CLOSED` → `ITEM_NOT_FOUND` |


---

## Business Logic

> Chi tiết đầy đủ: [BUSINESS_LOGIC.md](./BUSINESS_LOGIC.md) — phụ trách: **Đạt**

### Hai tầng validation (thứ tự bắt buộc)

**Tầng 1 — Schema** (không chạm DB, chạy trong middleware từ Zod schema):
- `cartId`, `productId` phải là UUID hợp lệ
- `product_id`: bắt buộc, UUID · `quantity`: bắt buộc, **integer** (không phải `"2"`), `1–10`
- `limit`: integer `1–50`, default `20` · `offset`: integer `≥ 0`, default `0`
- `additionalProperties: false` — field lạ trong body → `400`
- JSON hỏng → `400 VALIDATION_ERROR`

**Tầng 2 — Business** (có chạm DB, chỉ chạy khi tầng 1 pass):
- Chỉ trả **1 lỗi đầu tiên** theo thứ tự cố định

### Thứ tự validation Business

> Đã chốt: ở `POST /items`, `ITEM_ALREADY_IN_CART` đứng **trước** `INSUFFICIENT_STOCK` (khớp bảng "Thứ tự trả lỗi" ở mục API Design). `PATCH` không check lại `is_active` nên không có `422`.

| Bước | `POST /items` | `PATCH /items/:pid` | `DELETE /items/:pid` |
|------|--------------|---------------------|----------------------|
| 1 | Schema → `400` | Schema → `400` | Schema → `400` |
| 2 | Cart tồn tại → `404 CART_NOT_FOUND` | Cart tồn tại → `404` | Cart tồn tại → `404` |
| 3 | Cart open → `409 CART_CLOSED` | Cart open → `409` | Cart open → `409` |
| 4 | Product tồn tại & active → `422 PRODUCT_UNAVAILABLE` | Item trong giỏ → `404 ITEM_NOT_FOUND` | Item trong giỏ → `404` |
| 5 | Chưa có item → `409 ITEM_ALREADY_IN_CART` | Đủ stock → `409 INSUFFICIENT_STOCK` | DELETE → `204` |
| 6 | Đủ stock → `409 INSUFFICIENT_STOCK` | UPDATE → `200` | |
| 7 | INSERT → `201` | | |

### Tính `subtotal_cents`

Hàm `buildCartResponse(cartId)` dùng chung cho `GET /carts/:id`, `POST /items` (201), `PATCH /items/:pid` (200):

```sql
SELECT p.id AS product_id, p.sku, p.name, p.price_cents, ci.quantity
FROM cart_items ci JOIN products p ON p.id = ci.product_id
WHERE ci.cart_id = $1
ORDER BY p.name, p.id;
```
```
line_subtotal_cents = price_cents × quantity (mỗi item)
cart.subtotal_cents = SUM(line_subtotal_cents)   -- rỗng → 0
```

### Transaction

| Endpoint | Transaction? | Lý do |
|----------|:-----------:|-------|
| `POST /carts/{cartId}/items` | ✅ | `SELECT cart FOR UPDATE` → check → INSERT phải atomic |
| `PATCH /carts/{cartId}/items/{productId}` | ✅ | `SELECT cart FOR UPDATE` → check stock → UPDATE phải atomic |
| Các endpoint còn lại | ❌ | Chỉ đọc hoặc 1 INSERT/DELETE đơn giản |

> **Lưu ý trade-off**: Stock không bị trừ khi thêm vào giỏ (chỉ trừ khi checkout — chưa làm tuần này). Hai giỏ khác nhau cùng thêm product `stock = 1` đều thành công — đây là hành vi chấp nhận được, cần đề cập trong phần trade-off của presentation.

### Phòng thủ lỗi DB

- `23505` (unique violation trên INSERT cart_items) → map thành `409 ITEM_ALREADY_IN_CART`
- `23503` (FK violation — product bị xóa giữa chừng) → `422 PRODUCT_UNAVAILABLE`
- `23514` (CHECK violation) → bug ở tầng 1, trả `500` và log để sửa
- Mọi exception khác → `500 INTERNAL_ERROR` (không có stack trace trong body)


---

## Test Matrix & Evidence

> Chi tiết đầy đủ: [TEST_MATRIX.md](./TEST_MATRIX.md) — phụ trách: **Luân**

### Format script: Postman Collection + newman CLI

Collection/environment được **sinh tự động** bởi `evidence/build-collection.mjs` (đừng sửa tay file JSON); `npm run evidence` = reset DB + newman. Chạy tay: `npx newman run postman/cart-api.postman_collection.json -e postman/cart-api.postman_environment.json`

### Biến môi trường Postman

| Biến | Giá trị | Mục đích |
|------|---------|---------|
| `{{baseUrl}}` | `http://localhost:3000` | Base URL |
| `{{product1Id}}` | `10000000-0000-4000-8000-000000000001` | SP1 — Bút bi xanh, price=5000, **stock=3** |
| `{{product2Id}}` | `10000000-0000-4000-8000-000000000002` | SP2 — Vở kẻ ngang, price=15000, stock=50 |
| `{{product3Id}}` | `10000000-0000-4000-8000-000000000003` | SP3 — Thước kẻ 30cm, price=8000, **stock=1** |
| `{{product4Id}}` | `10000000-0000-4000-8000-000000000004` | SP4 — stock=0, test INSUFFICIENT_STOCK |
| `{{product5Id}}` | `10000000-0000-4000-8000-000000000005` | SP5 — is_active=false, test PRODUCT_UNAVAILABLE |
| `{{checkedOutCartId}}` | `20000000-0000-4000-8000-000000000001` | Cart đã checkout, test CART_CLOSED |
| `{{notFoundUuid}}` | `99999999-9999-4999-8999-999999999999` | UUID hợp lệ nhưng không có trong DB |
| `{{activeCartId}}` | *(tự động gán)* | ID cart mới tạo ở D3, dùng xuyên suốt |

> ✅ Đã đồng bộ: seed (`seeds/seed.ts`) và Postman environment dùng đúng bộ UUID ở bảng trên. `sku` = `SKU-001` … `SKU-005`.

> **Điều chỉnh so với `TEST_MATRIX.md`** (do `ITEM_ALREADY_IN_CART` đứng trước `INSUFFICIENT_STOCK`): C3 dùng **SP3 qty=2** (stock=1) thay vì SP1 qty=4, vì SP1 đã nằm trong giỏ từ D5; C3b = thêm SP3 qty=1 rồi PATCH qty=2. Thêm C4b (SP1 qty=4 → `ITEM_ALREADY_IN_CART`).

### Nhóm kịch bản và thứ tự chạy

```
npm run db:reset
  → D (Happy Path: D1-D9)  — tạo activeCartId, kiểm tra subtotal_cents
  → A (Schema Validation: A1-A10)  — 400, DB không đổi ở A5
  → B (Not Found: B1-B5)  — 404 CART_NOT_FOUND / ITEM_NOT_FOUND
  → C (Business Rules: C1-C7)  — 409/422
  → F (Spec Conformance)  — schema + request_id đối chiếu log
  → E (Server Error: E1)  — tắt PostgreSQL thủ công, chạy riêng
```

### Kịch bản tóm tắt

| Nhóm | # | Kịch bản | Kết quả |
|------|---|----------|---------|
| **D** | D5 | Thêm SP1 qty=2 | `subtotal_cents = 10 000` |
| **D** | D6 | Thêm SP2 qty=1 | `subtotal_cents = 25 000` (2×5000+1×15000) |
| **D** | D7 | PATCH SP1 qty=3 | `subtotal_cents = 30 000` |
| **D** | D8-D9 | Xóa SP2, GET lại | `subtotal_cents = 15 000` |
| **A** | A1-A3 | quantity 0/11/"2" | `400 VALIDATION_ERROR`, details chỉ `quantity` |
| **A** | A5 | Field lạ + GET xác nhận | `400`, DB không đổi |
| **A** | A6 | cartId không phải UUID | `400 VALIDATION_ERROR` |
| **C** | C1 | SP ngừng bán | `422 PRODUCT_UNAVAILABLE` |
| **C** | C2 | SP hết hàng | `409 INSUFFICIENT_STOCK` |
| **C** | C3 | qty > stock | `409 INSUFFICIENT_STOCK` |
| **C** | C4 | SP đã có trong giỏ | `409 ITEM_ALREADY_IN_CART` |
| **C** | C5-C7 | Ghi vào cart checked_out | `409 CART_CLOSED` |
| **E** | E1 | Tắt PostgreSQL | `500 INTERNAL_ERROR`, không có stack trace |
| **F** | F2 | So `X-Request-Id` header ↔ body ↔ log | Trùng khớp 100% |

## Phiên bản thư viện

> Kiểm tra ngày 2026-10-01 bằng `npm show <package> version`.

| Package | Version | Ghi chú |
|---------|---------|---------|
| `express` | `^5.2.1` | |
| `zod` | `^4.x` | Đổi từ 3.x: `zod-to-openapi` 9.x có peer dependency `zod ^4` |
| `@asteasolutions/zod-to-openapi` | `^9.1.0` | |
| `swagger-ui-express` | `^5.0.1` | |
| `@prisma/client` | `^7.10.0` | ⚠️ Không dùng `8.x` — đang là RC, chưa stable |
| `prisma` | `^7.10.0` | Phải cùng version với `@prisma/client` |
| `pino-http` | `^11.0.0` | |
| `tsx` | `^4.x` | Chạy TypeScript trực tiếp (thay `nodemon`), không có build step |
| `typescript` | `^7.x` | Chỉ để type-check (`npm run build` = `tsc --noEmit`) |
| `@prisma/adapter-pg` | `^7.10.0` | Prisma 7 bắt buộc driver adapter; cùng version với `prisma` |

> Bỏ `uuid`: `request_id` dùng `crypto.randomUUID()` (UUID v4), cart id do Prisma sinh (`uuid(4)`).

---

## Lệnh chạy dự kiến (sẽ ghi đầy đủ trong README)

```bash
# Cài dependencies
npm install

# Setup DB lần đầu
npm run migrate
npm run seed

# Chạy server
npm run dev         # development (tsx watch)
npm run start       # production (tsx)
npm run start:log   # như start, đồng thời ghi log vào logs/server.log

# Reset DB về trạng thái seed mặc định
npm run reset       # alias: npm run db:reset

# Chạy evidence script (reset DB + newman; server phải đang chạy)
npm run evidence
```

---

## Quyết định bổ sung khi implement

**Đã đồng bộ vào các tài liệu con** (nếu nhóm không đồng ý điểm nào thì báo lại để sửa code và tài liệu cùng lúc):

| Việc | Đã chốt | Tài liệu đã cập nhật |
|------|---------|----------------------|
| Thứ tự lỗi `POST /items` | `ITEM_ALREADY_IN_CART` → `INSUFFICIENT_STOCK` | `BUSINESS_LOGIC.md` (D5, flow, bảng thứ tự, mục 5) |
| `PATCH` có trả `422`? | Không | `API_DESIGN.md` |
| Seed | Theo bảng ở mục Database Design | `API_DESIGN.md` mục 2 và ví dụ; `DB_DESIGN.md` đã khớp |
| Test C3/C3b | Dùng SP3; thêm C3a, C4b, C8, A11, A12, B6, B7 | `TEST_MATRIX.md`, `DB_DESIGN.md` mục 5 |
| Sắp xếp | cart items: `name, id`; products: `sku` | `API_DESIGN.md`, `BUSINESS_LOGIC.md` |
| Khóa `FOR SHARE` trên products | Không dùng | `BUSINESS_LOGIC.md` |
| `seed`/`reset` | `seed` idempotent (xóa rồi nạp); `reset` = `prisma migrate reset` + seed | `DB_DESIGN.md` mục 4 |
