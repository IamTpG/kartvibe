# API Design — Cart API

> **Người phụ trách**: Thạnh · **Người dùng tài liệu**: Phú (viết `openapi.yaml` / zod schema + validation)
> **Chuẩn**: OpenAPI 3.1 · **Content-Type**: `application/json` cho mọi body request/response

> [!NOTE]
> Các giá trị seed (UUID, giá, stock) đã **đồng bộ với `DB_DESIGN.md` / `DECISIONS.md`** và là dữ liệu thật mà `seeds/seed.ts` nạp.
> Thứ tự trả lỗi (mục 6) cần khớp với `BUSINESS_LOGIC.md` của Đạt. Chỗ nào lệch thì sửa ở cả hai file.

---

## 1. Tổng quan endpoint

| # | operationId | Method | Path | Body | Thành công |
|---|-------------|--------|------|------|------------|
| 1 | `listProducts` | `GET` | `/products?limit=&offset=` | — | `200` |
| 2 | `createCart` | `POST` | `/carts` | — | `201` + header `Location` |
| 3 | `getCart` | `GET` | `/carts/{cartId}` | — | `200` |
| 4 | `addCartItem` | `POST` | `/carts/{cartId}/items` | `AddItemRequest` | `201`, trả `Cart` |
| 5 | `updateCartItem` | `PATCH` | `/carts/{cartId}/items/{productId}` | `UpdateItemRequest` | `200`, trả `Cart` |
| 6 | `removeCartItem` | `DELETE` | `/carts/{cartId}/items/{productId}` | — | `204`, không body |

**Quy ước chung**

- Mọi response (kể cả `204` và lỗi) có header `X-Request-Id: <uuid>`. Server luôn tự sinh, **bỏ qua** `X-Request-Id` client gửi lên.
- Không field nào trong request hay response được phép `null`. Gửi `null` → `400`.
- Mọi request body có `additionalProperties: false` → field lạ bị `400`.
- Mọi response schema cũng `additionalProperties: false` để kiểm tra khớp spec bắt được field thừa (vd. lộ `is_active`).
- Giá luôn đọc từ DB. Client **không bao giờ** gửi `price_cents`.

---

## 2. Dữ liệu seed dùng trong ví dụ

| Ký hiệu | id | sku | name | price_cents | stock | is_active |
|---------|----|-----|------|-------------|-------|-----------|
| SP1 | `10000000-0000-4000-8000-000000000001` | SKU-001 | Bút bi xanh | 5000 | **3** | true |
| SP2 | `10000000-0000-4000-8000-000000000002` | SKU-002 | Vở kẻ ngang | 15000 | 50 | true |
| SP3 | `10000000-0000-4000-8000-000000000003` | SKU-003 | Thước kẻ 30cm | 8000 | **1** | true |
| SP4 | `10000000-0000-4000-8000-000000000004` | SKU-004 | Bút xóa | 12000 | **0** | true |
| SP5 | `10000000-0000-4000-8000-000000000005` | SKU-005 | Compa | 25000 | 10 | **false** |

| Cart | id | status | items |
|------|----|--------|-------|
| CART_CLOSED | `20000000-0000-4000-8000-000000000001` | `checked_out` | _(rỗng)_ |

- SP1 (stock = 3) và SP3 (stock = 1) để test `INSUFFICIENT_STOCK` với quantity hợp lệ (≤ 10). Nếu mọi SP đang bán có stock ≥ 10 thì không test được vì quantity tối đa là 10. Lưu ý: SP đã nằm trong giỏ + `quantity > stock` ra `ITEM_ALREADY_IN_CART` (xem mục 6), nên test vượt stock dùng SP chưa có trong giỏ (vd. SP3, quantity = 2).
- Cart đã checkout **không có item**. PATCH/DELETE trên cart đó vẫn ra `409 CART_CLOSED` vì cart được kiểm tra trước item (mục 6).
- UUID không tồn tại dùng trong ví dụ: `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`.

---

## 3. Schema

### 3.1 Request

**`AddItemRequest`** — body của `POST /carts/{cartId}/items`

| Field | Kiểu | Bắt buộc | Ràng buộc |
|-------|------|----------|-----------|
| `product_id` | string | ✅ | `format: uuid` |
| `quantity` | integer | ✅ | `1` – `10` |

**`UpdateItemRequest`** — body của `PATCH /carts/{cartId}/items/{productId}`

| Field | Kiểu | Bắt buộc | Ràng buộc |
|-------|------|----------|-----------|
| `quantity` | integer | ✅ | `1` – `10` |

**Path & query parameters**

| Tên | Vị trí | Kiểu | Bắt buộc | Mặc định | Ràng buộc |
|-----|--------|------|----------|----------|-----------|
| `cartId` | path | string | ✅ | — | `format: uuid` |
| `productId` | path | string | ✅ | — | `format: uuid` |
| `limit` | query | integer | ❌ | `20` | `1` – `50` |
| `offset` | query | integer | ❌ | `0` | `>= 0` |

- Query param không có trong spec (vd. `?page=2`) → `400`.
- Query được ép kiểu từ chuỗi (`?limit=10` hợp lệ). **Body không ép kiểu** (`"quantity": "2"` → `400`).

### 3.2 Response

**`Product`**

| Field | Kiểu | Ghi chú |
|-------|------|---------|
| `id` | string (uuid) | |
| `sku` | string | |
| `name` | string | |
| `price_cents` | integer | `> 0` |
| `stock` | integer | `>= 0` |

Không trả `is_active` (endpoint chỉ trả SP đang bán).

**`ProductList`**

| Field | Kiểu | Ghi chú |
|-------|------|---------|
| `data` | `Product[]` | Sắp xếp theo `sku` tăng dần |
| `total` | integer | Tổng số SP đang bán (không phụ thuộc limit/offset) |
| `limit` | integer | Giá trị đã áp dụng (kể cả default) |
| `offset` | integer | Giá trị đã áp dụng |

**`CartItem`**

| Field | Kiểu | Ghi chú |
|-------|------|---------|
| `product_id` | string (uuid) | |
| `sku` | string | |
| `name` | string | |
| `price_cents` | integer | Giá hiện tại đọc từ `products` |
| `quantity` | integer | `1` – `10` |
| `subtotal_cents` | integer | `price_cents × quantity` |

**`Cart`**

| Field | Kiểu | Ghi chú |
|-------|------|---------|
| `id` | string (uuid) | |
| `status` | string | enum: `open`, `checked_out` |
| `items` | `CartItem[]` | Sắp xếp theo `name`, rồi `id` tăng dần; cart rỗng → `[]` |
| `subtotal_cents` | integer | Tổng `subtotal_cents` của items; cart rỗng → `0` |

**`Error`** — xem mục 5.

---

## 4. Chi tiết từng endpoint

### 4.1 `GET /products`

Trả danh sách sản phẩm `is_active = true` (gồm cả SP hết hàng như SP4), phân trang.

| Status | code | Khi nào |
|--------|------|---------|
| `200` | — | OK |
| `400` | `VALIDATION_ERROR` | `limit` ngoài 1–50 hoặc không phải số nguyên; `offset` âm; query lạ |
| `500` | `INTERNAL_ERROR` | Lỗi server |

**Ví dụ** `GET /products?limit=2&offset=0` → `200`

```json
{
  "data": [
    { "id": "10000000-0000-4000-8000-000000000001", "sku": "SKU-001", "name": "Bút bi xanh", "price_cents": 5000, "stock": 3 },
    { "id": "10000000-0000-4000-8000-000000000002", "sku": "SKU-002", "name": "Vở kẻ ngang", "price_cents": 15000, "stock": 50 }
  ],
  "total": 4,
  "limit": 2,
  "offset": 0
}
```

**Ví dụ** `GET /products?limit=100` → `400`

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request không hợp lệ",
  "details": [{ "field": "limit", "issue": "must be <= 50" }],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

---

### 4.2 `POST /carts`

Tạo cart rỗng, `status = open`. Không nhận body (nếu client gửi body thì bỏ qua).

| Status | code | Khi nào |
|--------|------|---------|
| `201` | — | Tạo thành công. Header `Location: /carts/{id}` |
| `500` | `INTERNAL_ERROR` | Lỗi server |

**Ví dụ** → `201`, header `Location: /carts/3f2c8e1a-5b7d-4c9e-8a1f-6d2b4e7c9a10`

```json
{
  "id": "3f2c8e1a-5b7d-4c9e-8a1f-6d2b4e7c9a10",
  "status": "open",
  "items": [],
  "subtotal_cents": 0
}
```

---

### 4.3 `GET /carts/{cartId}`

Đọc được cả cart `open` và `checked_out`.

| Status | code | Khi nào |
|--------|------|---------|
| `200` | — | OK |
| `400` | `VALIDATION_ERROR` | `cartId` không phải UUID |
| `404` | `CART_NOT_FOUND` | `cartId` hợp lệ nhưng không có trong DB |
| `500` | `INTERNAL_ERROR` | Lỗi server |

**Ví dụ** — cart đã thêm SP1 × 2 và SP2 × 1 → `200`

```json
{
  "id": "3f2c8e1a-5b7d-4c9e-8a1f-6d2b4e7c9a10",
  "status": "open",
  "items": [
    { "product_id": "10000000-0000-4000-8000-000000000001", "sku": "SKU-001", "name": "Bút bi xanh", "price_cents": 5000, "quantity": 2, "subtotal_cents": 10000 },
    { "product_id": "10000000-0000-4000-8000-000000000002", "sku": "SKU-002", "name": "Vở kẻ ngang", "price_cents": 15000, "quantity": 1, "subtotal_cents": 15000 }
  ],
  "subtotal_cents": 25000
}
```

Tính tay: `2 × 5000 + 1 × 15000 = 25000`.

**Ví dụ** `GET /carts/abc` → `400`

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request không hợp lệ",
  "details": [{ "field": "cartId", "issue": "must be a valid UUID" }],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

**Ví dụ** `GET /carts/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee` → `404`

```json
{
  "code": "CART_NOT_FOUND",
  "message": "Không tìm thấy giỏ hàng",
  "details": [],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

---

### 4.4 `POST /carts/{cartId}/items`

Thêm 1 sản phẩm chưa có trong cart. Muốn đổi số lượng SP đã có thì dùng PATCH.

| Status | code | Khi nào |
|--------|------|---------|
| `201` | — | Thêm thành công, trả `Cart` |
| `400` | `VALIDATION_ERROR` | Sai schema: `cartId`/`product_id` không phải UUID, thiếu field, `quantity` sai kiểu hoặc ngoài 1–10, field lạ, JSON hỏng |
| `404` | `CART_NOT_FOUND` | Cart không tồn tại |
| `409` | `CART_CLOSED` | Cart `checked_out` |
| `409` | `ITEM_ALREADY_IN_CART` | SP đã có trong cart |
| `409` | `INSUFFICIENT_STOCK` | `quantity > stock` |
| `422` | `PRODUCT_UNAVAILABLE` | `product_id` không có trong DB hoặc `is_active = false` |
| `500` | `INTERNAL_ERROR` | Lỗi server |

**Request** → `201`, body là `Cart` (giống ví dụ 4.3)

```json
{ "product_id": "10000000-0000-4000-8000-000000000001", "quantity": 2 }
```

**Ví dụ** `{ "product_id": "…0001", "quantity": 0 }` → `400` (chỉ 1 detail cho `quantity`)

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request không hợp lệ",
  "details": [{ "field": "quantity", "issue": "must be >= 1" }],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

**Ví dụ** `{ "quantity": 2, "price_cents": 1 }` → `400` (thiếu `product_id` + field lạ)

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request không hợp lệ",
  "details": [
    { "field": "product_id", "issue": "is required" },
    { "field": "price_cents", "issue": "is not allowed" }
  ],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

**Ví dụ** SP5 (ngừng bán) → `422`

```json
{
  "code": "PRODUCT_UNAVAILABLE",
  "message": "Sản phẩm không tồn tại hoặc đã ngừng bán",
  "details": [],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

**Ví dụ** SP3 (chưa có trong giỏ) với `quantity: 2` (stock = 1) → `409`

```json
{
  "code": "INSUFFICIENT_STOCK",
  "message": "Không đủ hàng trong kho",
  "details": [{ "field": "quantity", "issue": "exceeds available stock (1)" }],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

**Ví dụ** thêm SP1 lần thứ hai → `409`

```json
{
  "code": "ITEM_ALREADY_IN_CART",
  "message": "Sản phẩm đã có trong giỏ, dùng PATCH để đổi số lượng",
  "details": [],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

**Ví dụ** ghi vào cart `20000000-…-000000000001` → `409`

```json
{
  "code": "CART_CLOSED",
  "message": "Giỏ hàng đã checkout, không thể chỉnh sửa",
  "details": [],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

---

### 4.5 `PATCH /carts/{cartId}/items/{productId}`

Đặt lại `quantity` (giá trị tuyệt đối, không phải cộng thêm) cho SP đã có trong cart. So `quantity` mới với `stock` hiện tại.

| Status | code | Khi nào |
|--------|------|---------|
| `200` | — | Cập nhật thành công, trả `Cart` |
| `400` | `VALIDATION_ERROR` | `cartId`/`productId` không phải UUID; `quantity` thiếu, sai kiểu, ngoài 1–10; field lạ |
| `404` | `CART_NOT_FOUND` | Cart không tồn tại |
| `404` | `ITEM_NOT_FOUND` | SP không có trong cart này |
| `409` | `CART_CLOSED` | Cart `checked_out` |
| `409` | `INSUFFICIENT_STOCK` | `quantity > stock` |
| `500` | `INTERNAL_ERROR` | Lỗi server |

> PATCH **không** trả `422`: SP đã nằm trong cart, không check lại `is_active`. (Đã chốt.)

**Request** → `200`, body là `Cart`

```json
{ "quantity": 3 }
```

**Ví dụ** PATCH SP2 khi SP2 chưa có trong cart → `404`

```json
{
  "code": "ITEM_NOT_FOUND",
  "message": "Sản phẩm không có trong giỏ hàng",
  "details": [],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

---

### 4.6 `DELETE /carts/{cartId}/items/{productId}`

| Status | code | Khi nào |
|--------|------|---------|
| `204` | — | Xóa thành công, không body |
| `400` | `VALIDATION_ERROR` | `cartId`/`productId` không phải UUID |
| `404` | `CART_NOT_FOUND` | Cart không tồn tại |
| `404` | `ITEM_NOT_FOUND` | SP không có trong cart này |
| `409` | `CART_CLOSED` | Cart `checked_out` |
| `500` | `INTERNAL_ERROR` | Lỗi server |

---

## 5. Error contract

Mọi lỗi (kể cả `500`, route không tồn tại, JSON hỏng) đều trả đúng dạng này:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request không hợp lệ",
  "details": [{ "field": "quantity", "issue": "must be <= 10" }],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

| Field | Kiểu | Bắt buộc | Ghi chú |
|-------|------|----------|---------|
| `code` | string (enum) | ✅ | Client rẽ nhánh theo field này |
| `message` | string | ✅ | Chỉ để hiển thị, có thể đổi câu chữ |
| `details` | `{ field, issue }[]` | ✅ | Luôn là mảng; không có chi tiết → `[]` |
| `request_id` | string (uuid) | ✅ | Trùng với header `X-Request-Id` và dòng log |

### 5.1 Bảng error code

| Status | `code` | `message` | `details` |
|--------|--------|-----------|-----------|
| 400 | `VALIDATION_ERROR` | Request không hợp lệ | Mỗi lỗi schema 1 phần tử |
| 404 | `CART_NOT_FOUND` | Không tìm thấy giỏ hàng | `[]` |
| 404 | `ITEM_NOT_FOUND` | Sản phẩm không có trong giỏ hàng | `[]` |
| 409 | `CART_CLOSED` | Giỏ hàng đã checkout, không thể chỉnh sửa | `[]` |
| 409 | `ITEM_ALREADY_IN_CART` | Sản phẩm đã có trong giỏ, dùng PATCH để đổi số lượng | `[]` |
| 409 | `INSUFFICIENT_STOCK` | Không đủ hàng trong kho | `[{ field: "quantity", issue }]` |
| 422 | `PRODUCT_UNAVAILABLE` | Sản phẩm không tồn tại hoặc đã ngừng bán | `[]` |
| 500 | `INTERNAL_ERROR` | Đã có lỗi xảy ra, vui lòng thử lại sau | `[]` |
| 404 | `ROUTE_NOT_FOUND` | Không tìm thấy endpoint | `[]` — ngoài spec, vd. `GET /foo` |
| 405 | `METHOD_NOT_ALLOWED` | Method không được hỗ trợ | `[]` — ngoài spec, vd. `PUT /carts` |

`500` **không được** chứa stack trace, câu SQL, tên bảng/biến hay message gốc của thư viện. Chi tiết đó chỉ ghi vào log.

### 5.2 Quy ước `details` cho `VALIDATION_ERROR`

`field` là đúng tên param hoặc tên field trong body (`quantity`, `product_id`, `cartId`, `productId`, `limit`, `offset`). Lỗi ở cấp cả body (JSON hỏng, thiếu body, sai Content-Type) dùng `field: "body"`.

| Trường hợp | `issue` |
|------------|---------|
| Thiếu field bắt buộc | `is required` |
| Field lạ | `is not allowed` |
| Sai kiểu | `must be integer` / `must be string` |
| Dưới min / trên max | `must be >= 1` / `must be <= 10` |
| Không phải UUID | `must be a valid UUID` |
| JSON hỏng | `must be valid JSON` |
| Sai Content-Type | `must be application/json` |

Validator trả lỗi theo format riêng → Phú map sang bảng trên. Script nghiệm thu chỉ nên so `code` và `field`; `issue` để người đọc.

---

## 6. Ma trận status × endpoint và thứ tự trả lỗi

| Endpoint | 200 | 201 | 204 | 400 | 404 | 409 | 422 | 500 |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `GET /products` | ✅ | | | ✅ | | | | ✅ |
| `POST /carts` | | ✅ | | | | | | ✅ |
| `GET /carts/{cartId}` | ✅ | | | ✅ | ✅ | | | ✅ |
| `POST /carts/{cartId}/items` | | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ |
| `PATCH /carts/{cartId}/items/{productId}` | ✅ | | | ✅ | ✅ | ✅ | | ✅ |
| `DELETE /carts/{cartId}/items/{productId}` | | | ✅ | ✅ | ✅ | ✅ | | ✅ |

Request vi phạm nhiều rule cùng lúc chỉ trả **lỗi đầu tiên** theo thứ tự sau (validation schema luôn chạy trước, không chạm DB):

| Endpoint | Thứ tự |
|----------|--------|
| `POST …/items` | `VALIDATION_ERROR` → `CART_NOT_FOUND` → `CART_CLOSED` → `PRODUCT_UNAVAILABLE` → `ITEM_ALREADY_IN_CART` → `INSUFFICIENT_STOCK` |
| `PATCH …/items/{productId}` | `VALIDATION_ERROR` → `CART_NOT_FOUND` → `CART_CLOSED` → `ITEM_NOT_FOUND` → `INSUFFICIENT_STOCK` |
| `DELETE …/items/{productId}` | `VALIDATION_ERROR` → `CART_NOT_FOUND` → `CART_CLOSED` → `ITEM_NOT_FOUND` |

`ITEM_ALREADY_IN_CART` đứng trước `INSUFFICIENT_STOCK`: SP đã có trong giỏ thì báo người dùng chuyển sang PATCH, không bắt họ sửa số lượng rồi mới biết là trùng. (Đã chốt; `BUSINESS_LOGIC.md` đã cập nhật theo.)

Hai request POST cùng SP vào cùng cart đồng thời → DB báo trùng khóa chính → phải trả `409 ITEM_ALREADY_IN_CART`, không phải `500`.

---

## 7. Phụ lục: khung `components` cho `openapi.yaml`

Dùng nếu nhóm chọn contract-first. Nếu chọn code-first, đây là mô tả để viết zod schema tương ứng.

```yaml
openapi: 3.1.0
info:
  title: Cart API
  version: 1.0.0
servers:
  - url: http://localhost:3000

components:
  parameters:
    CartId:
      name: cartId
      in: path
      required: true
      schema: { type: string, format: uuid }
    ProductId:
      name: productId
      in: path
      required: true
      schema: { type: string, format: uuid }
    Limit:
      name: limit
      in: query
      required: false
      schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
    Offset:
      name: offset
      in: query
      required: false
      schema: { type: integer, minimum: 0, default: 0 }

  headers:
    XRequestId:
      description: UUID của request, trùng với request_id trong error body và log
      schema: { type: string, format: uuid }
    Location:
      description: Đường dẫn tới cart vừa tạo
      schema: { type: string, examples: ['/carts/3f2c8e1a-5b7d-4c9e-8a1f-6d2b4e7c9a10'] }

  schemas:
    AddItemRequest:
      type: object
      additionalProperties: false
      required: [product_id, quantity]
      properties:
        product_id: { type: string, format: uuid }
        quantity: { type: integer, minimum: 1, maximum: 10 }

    UpdateItemRequest:
      type: object
      additionalProperties: false
      required: [quantity]
      properties:
        quantity: { type: integer, minimum: 1, maximum: 10 }

    Product:
      type: object
      additionalProperties: false
      required: [id, sku, name, price_cents, stock]
      properties:
        id: { type: string, format: uuid }
        sku: { type: string }
        name: { type: string }
        price_cents: { type: integer, minimum: 1 }
        stock: { type: integer, minimum: 0 }

    ProductList:
      type: object
      additionalProperties: false
      required: [data, total, limit, offset]
      properties:
        data: { type: array, items: { $ref: '#/components/schemas/Product' } }
        total: { type: integer, minimum: 0 }
        limit: { type: integer, minimum: 1, maximum: 50 }
        offset: { type: integer, minimum: 0 }

    CartItem:
      type: object
      additionalProperties: false
      required: [product_id, sku, name, price_cents, quantity, subtotal_cents]
      properties:
        product_id: { type: string, format: uuid }
        sku: { type: string }
        name: { type: string }
        price_cents: { type: integer, minimum: 1 }
        quantity: { type: integer, minimum: 1, maximum: 10 }
        subtotal_cents: { type: integer, minimum: 1 }

    Cart:
      type: object
      additionalProperties: false
      required: [id, status, items, subtotal_cents]
      properties:
        id: { type: string, format: uuid }
        status: { type: string, enum: [open, checked_out] }
        items: { type: array, items: { $ref: '#/components/schemas/CartItem' } }
        subtotal_cents: { type: integer, minimum: 0 }

    ErrorDetail:
      type: object
      additionalProperties: false
      required: [field, issue]
      properties:
        field: { type: string }
        issue: { type: string }

    Error:
      type: object
      additionalProperties: false
      required: [code, message, details, request_id]
      properties:
        code:
          type: string
          enum:
            - VALIDATION_ERROR
            - CART_NOT_FOUND
            - ITEM_NOT_FOUND
            - CART_CLOSED
            - ITEM_ALREADY_IN_CART
            - INSUFFICIENT_STOCK
            - PRODUCT_UNAVAILABLE
            - INTERNAL_ERROR
            - ROUTE_NOT_FOUND
            - METHOD_NOT_ALLOWED
        message: { type: string }
        details: { type: array, items: { $ref: '#/components/schemas/ErrorDetail' } }
        request_id: { type: string, format: uuid }

  responses:
    Cart:
      description: Cart đầy đủ kèm items và subtotal
      headers:
        X-Request-Id: { $ref: '#/components/headers/XRequestId' }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Cart' }
    Error:
      description: Lỗi theo error contract
      headers:
        X-Request-Id: { $ref: '#/components/headers/XRequestId' }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
```

**Ví dụ một operation dùng các component trên:**

```yaml
paths:
  /carts/{cartId}/items:
    post:
      operationId: addCartItem
      parameters:
        - $ref: '#/components/parameters/CartId'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/AddItemRequest' }
            examples:
              valid:
                value: { product_id: 10000000-0000-4000-8000-000000000001, quantity: 2 }
      responses:
        '201': { $ref: '#/components/responses/Cart' }
        '400': { $ref: '#/components/responses/Error' }
        '404': { $ref: '#/components/responses/Error' }
        '409': { $ref: '#/components/responses/Error' }
        '422': { $ref: '#/components/responses/Error' }
        '500': { $ref: '#/components/responses/Error' }
```

Mỗi response lỗi nên kèm `examples` riêng theo từng `code` (lấy từ mục 4) để trang `/docs` hiển thị đủ ví dụ.

---

## 8. Việc cần chốt với các thành viên khác

| Với | Nội dung |
|-----|----------|
| Anh | ✅ Đã đồng bộ: UUID, giá, stock ở mục 2 khớp `DB_DESIGN.md` (SP1 stock = 3, SP3 stock = 1, cart checked_out không có item) |
| Đạt | ✅ Đã chốt: PATCH không trả 422; `ITEM_ALREADY_IN_CART` trước `INSUFFICIENT_STOCK` |
| Phú | ✅ Đã chốt code-first (Zod); query ép kiểu, body không ép kiểu; lỗi validator đã map sang mục 5.2 |
| Luân | Kịch bản so theo `code` + `details[].field`; dùng UUID mục 2 làm biến script |

