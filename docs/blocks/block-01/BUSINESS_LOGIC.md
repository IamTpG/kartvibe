# BUSINESS_LOGIC.md — Cart API

> **Người viết**: Đạt (Business Logic Analyst) · **Người đọc**: Phú (implement handler/service)
> Tài liệu này mô tả **thứ tự xử lý, mã lỗi, cách tính `subtotal_cents` và transaction** cho 6 endpoint. Schema response chi tiết do `API_DESIGN.md` (Thạnh) quyết định; bảng/seed do `DB_DESIGN.md` (Anh) quyết định.

---

## 0. Tóm tắt các quyết định

| # | Quyết định | Chọn | Lý do ngắn |
|---|-----------|------|-----------|
| D1 | Tính `subtotal_cents` ở đâu | **Application layer**, 1 hàm dùng chung `buildCartResponse(cartId)` | Cần `line_subtotal_cents` từng item; 1 query JOIN rồi cộng trong code, dễ test, GET/POST/PATCH dùng chung nên không lệch |
| D2 | Lưu `subtotal_cents` vào DB? | **Không** | Giá lấy từ `products`, tính lại mỗi lần để luôn đúng |
| D3 | Transaction | **Có**: `POST /items`, `PATCH /items/:pid`. **Không bắt buộc**: các endpoint còn lại | Check rồi ghi phải atomic (xem mục 4) |
| D4 | `limit`/`offset` sai | **400**, không tự clamp | Request sai phải bị báo, không âm thầm sửa |
| D5 | Thứ tự check trong `POST /items` | cart tồn tại → cart open → product tồn tại & active → chưa có trong cart → đủ stock | **Đã chốt (đổi so với bản đầu)**: khớp `API_DESIGN.md`/`DECISIONS.md`; xem mục 5 |
| D6 | `quantity` trong PATCH | Là **số lượng mới tuyệt đối**, không phải cộng thêm | Khớp body `{ quantity }` và stock check `stock >= quantity` |
| D7 | Giá | Luôn đọc từ DB, **không nhận `price` từ client** (body có `price` là field lạ → 400) | Tránh lỗi "tin client" |

---

## 1. Hai tầng validation

**Tầng 1 — Schema (KHÔNG chạm DB).** Chạy trong middleware, cùng nguồn schema với OpenAPI spec. Fail → **400 `VALIDATION_ERROR`**, `details` chỉ liệt kê field sai, trả ngay, không mở connection DB.
- `cartId`, `productId` (path): UUID hợp lệ
- `product_id`: bắt buộc, UUID · `quantity`: bắt buộc, **integer** (không phải `"2"`), 1–10
- `limit`: integer 1–50, mặc định 20 · `offset`: integer ≥ 0, mặc định 0
- Body không được có field lạ (`additionalProperties: false`); JSON hỏng (malformed) cũng → 400 `VALIDATION_ERROR`

**Tầng 2 — Business (có chạm DB).** Chỉ chạy khi tầng 1 pass. Mỗi lần fail trả **đúng 1 lỗi đầu tiên** theo thứ tự ở mục 3.

> Không để DB `CHECK` constraint làm nhiệm vụ validate. Nếu lọt, vi phạm sẽ thành 500 thay vì 400.

---

## 2. Luồng xử lý từng endpoint

### 2.1 `GET /products`
```
1. [Schema] limit (int 1-50, default 20), offset (int >= 0, default 0) → sai: 400 VALIDATION_ERROR
2. [DB]  SELECT ... FROM products WHERE is_active = true
         ORDER BY sku LIMIT {limit} OFFSET {offset}           -- ORDER BY để phân trang ổn định (sku UNIQUE)
3. [DB]  SELECT COUNT(*) FROM products WHERE is_active = true  -- total
4. 200 { data: [...], total, limit, offset }
```
- Không có business rule. Không có sản phẩm → `data: []`, `total: 0` (vẫn 200).
- Sản phẩm `stock = 0` nhưng `is_active = true` **vẫn được liệt kê** (đề chỉ lọc theo "đang bán").
- Không cần transaction.

### 2.2 `POST /carts`
```
1. Không có body, không validate
2. [DB] INSERT INTO carts (id, status) VALUES (gen uuid, 'open')
3. 201, header Location: /carts/{id}, body: { id, status:'open', items:[], subtotal_cents:0 }
```
- Không có lỗi business. Lỗi DB/hạ tầng → 500.

### 2.3 `GET /carts/{cartId}`
```
1. [Schema] cartId là UUID → sai: 400 VALIDATION_ERROR
2. [DB]  SELECT cart WHERE id = cartId → không có: 404 CART_NOT_FOUND
3. buildCartResponse(cartId)   -- xem mục 6
4. 200 cart
```
- Cart `checked_out` **vẫn đọc được** (chỉ chặn ghi).

### 2.4 `POST /carts/{cartId}/items` ⭐
```
1. [Schema] cartId UUID; body {product_id: UUID bắt buộc, quantity: int 1-10 bắt buộc}; không field lạ
            → sai: 400 VALIDATION_ERROR (request KHÔNG chạm DB)

   BEGIN
2. [DB]  SELECT cart WHERE id = cartId FOR UPDATE
         → không có: 404 CART_NOT_FOUND
3. [Biz] cart.status = 'open'?
         → 'checked_out': 409 CART_CLOSED
4. [DB]  SELECT product WHERE id = product_id
         → không có HOẶC is_active = false: 422 PRODUCT_UNAVAILABLE
5. [DB]  SELECT 1 FROM cart_items WHERE cart_id AND product_id
         → đã có: 409 ITEM_ALREADY_IN_CART
6. [Biz] product.stock >= quantity?
         → không đủ: 409 INSUFFICIENT_STOCK
7. [DB]  INSERT INTO cart_items (cart_id, product_id, quantity)
   COMMIT

8. buildCartResponse(cartId)
9. 201 cart (toàn bộ cart, kèm items[] và subtotal_cents)
```
- Mọi nhánh lỗi ở bước 2–6 → `ROLLBACK` rồi trả lỗi (chưa ghi gì nên rollback chỉ để giải phóng lock).
- **Phòng thủ**: nếu INSERT vẫn dính unique violation (`23505`, hai request trùng nhau lọt qua) → map thành **409 ITEM_ALREADY_IN_CART**, không để thành 500.
- Stock **không bị trừ** khi thêm vào giỏ (chưa có checkout). Stock chỉ dùng để chặn số lượng.

### 2.5 `PATCH /carts/{cartId}/items/{productId}` ⭐
```
1. [Schema] cartId, productId UUID; body {quantity: int 1-10 bắt buộc}; không field lạ
            → sai: 400 VALIDATION_ERROR

   BEGIN
2. [DB]  SELECT cart FOR UPDATE            → không có: 404 CART_NOT_FOUND
3. [Biz] cart.status = 'open'?             → không: 409 CART_CLOSED
4. [DB]  SELECT cart_item WHERE cart_id AND product_id
                                           → không có: 404 ITEM_NOT_FOUND
5. [DB]  SELECT product WHERE id = productId             -- lấy stock
6. [Biz] product.stock >= new_quantity?    → không: 409 INSUFFICIENT_STOCK
7. [DB]  UPDATE cart_items SET quantity = new_quantity WHERE cart_id AND product_id
   COMMIT

8. buildCartResponse(cartId)
9. 200 cart
```
- PATCH **không** check `PRODUCT_UNAVAILABLE` / `ITEM_ALREADY_IN_CART` (item đã có trong giỏ). Chỉ check stock.
- Gửi quantity bằng quantity hiện tại → vẫn 200 (idempotent), không báo lỗi.
- `productId` hợp lệ (UUID) nhưng không có trong giỏ — kể cả product không tồn tại — đều là **404 ITEM_NOT_FOUND**.

### 2.6 `DELETE /carts/{cartId}/items/{productId}`
```
1. [Schema] cartId, productId UUID → sai: 400 VALIDATION_ERROR
2. [DB]  SELECT cart                       → không có: 404 CART_NOT_FOUND
3. [Biz] cart.status = 'open'?             → không: 409 CART_CLOSED
4. [DB]  SELECT cart_item WHERE cart_id AND product_id
                                           → không có: 404 ITEM_NOT_FOUND
5. [DB]  DELETE FROM cart_items WHERE cart_id AND product_id
6. 204, không body
```
- Xóa lần 2 (đã xóa rồi) → 404 ITEM_NOT_FOUND (không idempotent theo kiểu 204).
- Cách gọn: `DELETE ... RETURNING` và nếu 0 row thì trả 404; vẫn phải check cart + status trước để phân biệt `CART_NOT_FOUND` / `CART_CLOSED` / `ITEM_NOT_FOUND`.

---

## 3. Bảng thứ tự validation

| Bước | POST /items | PATCH /items/:pid | DELETE /items/:pid |
|------|-------------|-------------------|--------------------|
| 1 | Schema → 400 | Schema → 400 | Schema → 400 |
| 2 | Cart tồn tại → 404 `CART_NOT_FOUND` | Cart tồn tại → 404 `CART_NOT_FOUND` | Cart tồn tại → 404 `CART_NOT_FOUND` |
| 3 | Cart open → 409 `CART_CLOSED` | Cart open → 409 `CART_CLOSED` | Cart open → 409 `CART_CLOSED` |
| 4 | Product tồn tại & active → 422 `PRODUCT_UNAVAILABLE` | Item trong giỏ → 404 `ITEM_NOT_FOUND` | Item trong giỏ → 404 `ITEM_NOT_FOUND` |
| 5 | Chưa có item → 409 `ITEM_ALREADY_IN_CART` | Đủ stock → 409 `INSUFFICIENT_STOCK` | DELETE → 204 |
| 6 | Đủ stock → 409 `INSUFFICIENT_STOCK` | UPDATE → 200 | |
| 7 | INSERT → 201 | | |

**Quy tắc chung:** schema (400) → tồn tại trên URL (404) → trạng thái (409 `CART_CLOSED`) → tham chiếu trong body (422) → xung đột dữ liệu (409 trùng → 409 stock).

### Bảng mã lỗi ↔ status

| Code | Status | Khi nào |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Sai schema (body, path, query) |
| `CART_NOT_FOUND` | 404 | `cartId` hợp lệ nhưng không có trong DB |
| `ITEM_NOT_FOUND` | 404 | Product không nằm trong giỏ (PATCH/DELETE) |
| `PRODUCT_UNAVAILABLE` | 422 | `product_id` không tồn tại hoặc `is_active = false` (POST) |
| `INSUFFICIENT_STOCK` | 409 | `quantity > stock` (POST/PATCH) |
| `ITEM_ALREADY_IN_CART` | 409 | Product đã có trong giỏ (POST) |
| `CART_CLOSED` | 409 | Ghi vào cart `checked_out` |
| `INTERNAL_ERROR` ⚠️ | 500 | Mọi lỗi không lường trước (DB tắt, bug) |

> ⚠️ `INTERNAL_ERROR` chưa có trong danh sách mã lỗi của đề — cần Thạnh đưa vào `API_DESIGN.md` để 500 cũng theo error contract (`code`, `message` chung chung, `details: []`, `request_id`). Log đầy đủ lỗi + stack **chỉ ở server**, kèm `request_id`.

---

## 4. Transaction

| Endpoint | Transaction? | Lý do |
|----------|:-----------:|-------|
| `GET /products` | ❌ | Chỉ đọc |
| `POST /carts` | ❌ | 1 INSERT |
| `GET /carts/{cartId}` | ❌ | Chỉ đọc |
| `POST /carts/{cartId}/items` | ✅ | Check (cart/product/stock/trùng) rồi INSERT phải atomic |
| `PATCH /carts/{cartId}/items/{productId}` | ✅ | Check stock rồi UPDATE phải atomic |
| `DELETE /carts/{cartId}/items/{productId}` | ❌ (tùy chọn) | 1 DELETE; có thể bọc chung helper nếu muốn |

**Cách khóa (isolation mặc định READ COMMITTED là đủ):**
- `SELECT cart ... FOR UPDATE` — serialize mọi thao tác ghi trên **cùng một giỏ**. Chặn: hai request cùng thêm 1 product (không còn dựa vào PK để báo lỗi), và cart bị đóng giữa lúc check và ghi.
- Không khóa dòng `products` (không `FOR SHARE`): stock không bị trừ khi thêm vào giỏ nên không cần giữ; đọc product trong cùng transaction là đủ. _Đã chốt khi implement._

**Lưu ý trung thực về race stock:** vì stock **không bị trừ** khi thêm vào giỏ, hai giỏ khác nhau cùng thêm product `stock = 1` đều thành công — đây là hành vi **chấp nhận được** ở bài này (stock chỉ trừ lúc checkout, chưa làm tuần này). Transaction ở đây bảo vệ tính nhất quán *trong một giỏ*, không phải "giữ hàng" giữa các giỏ. Nên ghi vào phần trade-off của presentation.

---

## 5. Lưu ý về thứ tự check (UX) — cần Phú biết

Với `POST /items`, thứ tự **đã chốt** là **trùng item → stock** (khớp `API_DESIGN.md` mục 6 và `DECISIONS.md`). Lý do: lỗi "đã có trong giỏ" là lỗi gốc hơn — user được hướng sang PATCH ngay, không phải sửa số lượng rồi mới biết là trùng. Hệ quả cho test: SP đã có trong giỏ + `quantity > stock` → `ITEM_ALREADY_IN_CART` (xem C4b trong evidence). Test vượt stock phải dùng SP chưa có trong giỏ (vd. SP3, stock = 1, quantity = 2).

---

## 6. Tính `subtotal_cents` (quyết định D1, D2)

**Một query duy nhất, tính trong code:**
```sql
SELECT p.id AS product_id, p.sku, p.name, p.price_cents, ci.quantity
FROM cart_items ci JOIN products p ON p.id = ci.product_id
WHERE ci.cart_id = $1
ORDER BY p.name, p.id;
```
```
for each row:  line_subtotal_cents = price_cents × quantity
cart.subtotal_cents = SUM(line_subtotal_cents)      -- giỏ rỗng → 0
```
- Hàm `buildCartResponse(cartId)` dùng cho `GET`, `POST items` (201) và `PATCH items` (200) → cùng một logic, không lệch.
- `price_cents` **luôn từ bảng `products`**, không từ client.
- Là số nguyên cents, không dùng float.
- Giỏ `checked_out` hay sản phẩm sau đó bị ngừng bán vẫn hiện trong `items[]` và vẫn tính vào subtotal.

**Ví dụ kiểm tra tay** (số minh họa, thay bằng seed thật của Anh):

| Product | price_cents | quantity | line_subtotal_cents |
|---------|-----------:|--------:|-------------------:|
| Bút bi xanh | 5000 | 2 | 10000 |
| Vở kẻ ngang | 15000 | 1 | 15000 |
| | | **subtotal_cents** | **25000** |

---

## 7. Lỗi hạ tầng và lỗi DB lọt qua

- Mọi exception không phải lỗi nghiệp vụ đã biết → middleware cuối cùng trả **500 `INTERNAL_ERROR`** theo error contract; **không** có stack trace, câu SQL, connection string hay secret trong body.
- Kịch bản "tắt PostgreSQL": lỗi kết nối/timeout rơi vào nhánh này, `request_id` trong body = `X-Request-Id` = dòng log lỗi.
- Lỗi của thư viện validator phải được **map** sang format `{code, message, details, request_id}`, không để format mặc định lọt ra.
- Map thêm lỗi Postgres đã biết cho chắc, **chỉ áp dụng cho INSERT vào `cart_items`**: `23505` (trùng PK) → 409 `ITEM_ALREADY_IN_CART`; `23503` (FK, product bị xóa giữa chừng) → 422 `PRODUCT_UNAVAILABLE`.
- Vi phạm `CHECK` (`23514`) nghĩa là tầng 1 bị lọt → coi là bug, trả 500 và log rõ để sửa validation, không map thành 400 để che lỗi.

---

## 7b. Edge case đã cân nhắc

| Tình huống | Xử lý |
|-----------|-------|
| PATCH item mà product sau đó bị ngừng bán (`is_active=false`) | Vẫn cho sửa, chỉ check stock (đúng đề). Ghi vào trade-off: chưa kiểm tra |
| Request vừa sai schema vừa sai nghiệp vụ | Chỉ trả 400 (tầng 1 chặn trước) |
| Nhiều lỗi nghiệp vụ cùng lúc | Chỉ trả **lỗi đầu tiên** theo bảng mục 3 |
| Đường dẫn không tồn tại / sai method | Ngoài 6 endpoint; nếu có thì cũng trả JSON theo error contract (cần Thạnh đặt code) |
| Product `stock = 0` nhưng đang bán | POST luôn → 409 `INSUFFICIENT_STOCK` (vì `quantity >= 1`) |

---

## 8. Việc cần đối chiếu với các bạn khác

| Với ai | Cần thống nhất |
|--------|----------------|
| Thạnh | Thêm `INTERNAL_ERROR` (500); shape `GET /products` (`data/total/limit/offset`); shape item trong cart (`product_id, sku, name, price_cents, quantity, line_subtotal_cents`); 400 cho `limit/offset` sai; 404 cho `ITEM_NOT_FOUND` ở PATCH/DELETE |
| Anh | Seed có cart `checked_out`, product `stock = 0`, product `is_active = false`, 1 product `stock = 1` (để test vượt stock bằng `quantity = 2`) |
| Luân | Thêm kịch bản: DELETE item rồi DELETE lần 2 → 404; PATCH cùng quantity → 200; PATCH item không có trong giỏ → 404 `ITEM_NOT_FOUND`; PATCH vượt stock → 409; `limit=0`/`limit=51` → 400 |
| Phú | Tách `buildCartResponse`, một `AppError` có `{status, code, message, details}`, và helper `withTransaction` cho POST/PATCH items |