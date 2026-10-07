# 📋 Nhiệm vụ của Thạnh — API Contract Designer

> **Bối cảnh**: Nhóm 5 người đang làm bài tập môn Advanced Web. Đề bài yêu cầu xây dựng **Cart API** — RESTful API cho phép người dùng xem sản phẩm, tạo giỏ hàng, thêm/sửa/xóa items trong giỏ. Thạnh không cần viết code — chỉ cần thiết kế **toàn bộ API contract** đủ chi tiết để Phú (người implement) viết `openapi.yaml` và validation.

---

## 🎯 Nhiệm vụ của Thạnh

Thiết kế API contract hoàn chỉnh gồm: **6 endpoints**, **tất cả request/response schema**, **tất cả status codes**, **tất cả error codes**, và **ví dụ JSON** cho từng trường hợp.

Output: file `API_DESIGN.md`

---

## 🗺 Bức tranh toàn cảnh hệ thống

### Người dùng có thể làm gì?
1. Xem danh sách sản phẩm đang bán
2. Tạo một giỏ hàng mới (rỗng)
3. Xem giỏ hàng (gồm items và tổng tiền)
4. Thêm sản phẩm vào giỏ
5. Sửa số lượng sản phẩm trong giỏ
6. Xóa sản phẩm khỏi giỏ

### Chưa có trong tuần này (KHÔNG thiết kế):
- Đăng nhập / xác thực
- Checkout / thanh toán
- Cart được nhận diện bằng `cartId` trong URL (không cần token)

---

## 📡 6 Endpoints cần thiết kế

### Tổng quan

| # | Method | Path | Mô tả | Status thành công |
|---|--------|------|-------|-------------------|
| 1 | `GET` | `/products` | Lấy danh sách sản phẩm đang bán | 200 |
| 2 | `POST` | `/carts` | Tạo giỏ hàng mới rỗng | 201 |
| 3 | `GET` | `/carts/{cartId}` | Xem giỏ hàng với items và tổng tiền | 200 |
| 4 | `POST` | `/carts/{cartId}/items` | Thêm sản phẩm vào giỏ | 201 |
| 5 | `PATCH` | `/carts/{cartId}/items/{productId}` | Sửa số lượng sản phẩm | 200 |
| 6 | `DELETE` | `/carts/{cartId}/items/{productId}` | Xóa sản phẩm khỏi giỏ | 204 |

---

## 🔍 Chi tiết từng endpoint

### 1. `GET /products`

**Mục đích**: Lấy danh sách sản phẩm **đang bán** (`is_active = true`), có phân trang.

**Query parameters:**

| Tham số | Kiểu | Bắt buộc | Mặc định | Ràng buộc |
|---------|------|----------|----------|-----------|
| `limit` | integer | Không | 20 | Từ 1 đến 50 |
| `offset` | integer | Không | 0 | Từ 0 trở lên |

**Response 200** — danh sách sản phẩm:
```json
{
  "data": [
    {
      "id": "uuid",
      "sku": "SKU-001",
      "name": "Bút bi xanh",
      "price_cents": 5000,
      "stock": 100
    }
  ],
  "total": 3,
  "limit": 20,
  "offset": 0
}
```

> **Lưu ý**: Không trả `is_active` ra ngoài (client không cần biết). Không trả sản phẩm `is_active = false`.

---

### 2. `POST /carts`

**Mục đích**: Tạo giỏ hàng mới, rỗng, status = `'open'`.

**Request body**: Không có.

**Response 201:**
```json
{
  "id": "uuid-cart",
  "status": "open",
  "items": [],
  "subtotal_cents": 0
}
```

**Response header bắt buộc:**
```
Location: /carts/{cartId}
```

---

### 3. `GET /carts/{cartId}`

**Mục đích**: Lấy thông tin giỏ hàng, bao gồm tất cả items và tổng tiền.

**Path parameter:**

| Tham số | Kiểu | Ràng buộc |
|---------|------|-----------|
| `cartId` | string (uuid) | Phải là UUID hợp lệ |

**Response 200:**
```json
{
  "id": "uuid-cart",
  "status": "open",
  "items": [
    {
      "product_id": "uuid-product",
      "name": "Bút bi xanh",
      "price_cents": 5000,
      "quantity": 2,
      "subtotal_cents": 10000
    }
  ],
  "subtotal_cents": 10000
}
```

> **Lưu ý**: `subtotal_cents` ở item = `price_cents × quantity`. `subtotal_cents` ở cart = tổng tất cả item subtotal.

---

### 4. `POST /carts/{cartId}/items`

**Mục đích**: Thêm một sản phẩm vào giỏ.

**Path parameter:** `cartId` (uuid)

**Request body (bắt buộc):**
```json
{
  "product_id": "uuid-product",
  "quantity": 2
}
```

| Field | Kiểu | Bắt buộc | Ràng buộc |
|-------|------|----------|-----------|
| `product_id` | string (uuid) | ✅ | Phải là UUID hợp lệ |
| `quantity` | integer | ✅ | Từ 1 đến 10 |

**Không được phép**: thêm field lạ nào khác vào body (`additionalProperties: false`).

**Response 201**: Trả về **toàn bộ cart** (giống schema `GET /carts/{cartId}`)

---

### 5. `PATCH /carts/{cartId}/items/{productId}`

**Mục đích**: Cập nhật số lượng của một sản phẩm đã có trong giỏ.

**Path parameters:**
- `cartId` (uuid)
- `productId` (uuid)

**Request body (bắt buộc):**
```json
{
  "quantity": 3
}
```

| Field | Kiểu | Bắt buộc | Ràng buộc |
|-------|------|----------|-----------|
| `quantity` | integer | ✅ | Từ 1 đến 10 |

**Không được phép**: thêm field lạ nào khác (`additionalProperties: false`).

**Response 200**: Trả về **toàn bộ cart** (giống schema `GET /carts/{cartId}`)

---

### 6. `DELETE /carts/{cartId}/items/{productId}`

**Mục đích**: Xóa một sản phẩm khỏi giỏ.

**Path parameters:**
- `cartId` (uuid)
- `productId` (uuid)

**Request body**: Không có.

**Response 204**: Không có body.

---

## ❌ Error Contract (bắt buộc áp dụng cho MỌI lỗi)

Tất cả lỗi (kể cả lỗi 500) phải trả về **cùng một format JSON**:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request body không hợp lệ",
  "details": [
    { "field": "quantity", "issue": "must be >= 1" }
  ],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

| Field | Mô tả |
|-------|-------|
| `code` | Chuỗi cố định, client dùng để xử lý logic (switch/case) |
| `message` | Thông báo đọc được, chỉ để hiển thị cho người dùng |
| `details` | Mảng chi tiết lỗi (có thể rỗng `[]`) |
| `request_id` | UUID được sinh ra cho mỗi request |

> **Lỗi 500 KHÔNG được chứa**: stack trace, câu SQL, tên biến nội bộ, hay bất kỳ thông tin hệ thống nào.

---

## 📊 Bảng đầy đủ: Status codes × Endpoints

| Endpoint | 200 | 201 | 204 | 400 | 404 | 409 | 422 | 500 |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `GET /products` | ✅ | | | ✅ | | | | ✅ |
| `POST /carts` | | ✅ | | | | | | ✅ |
| `GET /carts/{cartId}` | ✅ | | | ✅ | ✅ | | | ✅ |
| `POST /carts/{cartId}/items` | | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ |
| `PATCH /carts/{cartId}/items/{productId}` | ✅ | | | ✅ | ✅ | ✅ | ✅ | ✅ |
| `DELETE /carts/{cartId}/items/{productId}` | | | ✅ | ✅ | ✅ | ✅ | | ✅ |

---

## 🏷 Danh sách đầy đủ Error Codes

| HTTP Status | `code` | Khi nào xảy ra |
|-------------|--------|----------------|
| 400 | `VALIDATION_ERROR` | Request sai schema: kiểu sai, thiếu field bắt buộc, field lạ, UUID không hợp lệ |
| 404 | `CART_NOT_FOUND` | `cartId` là UUID hợp lệ nhưng không có trong DB |
| 404 | `ITEM_NOT_FOUND` | `productId` không có trong giỏ hàng đó (khi PATCH hoặc DELETE) |
| 409 | `INSUFFICIENT_STOCK` | Số lượng muốn đặt vượt quá `stock` trong DB |
| 409 | `ITEM_ALREADY_IN_CART` | POST item nhưng sản phẩm đó đã có trong giỏ rồi |
| 409 | `CART_CLOSED` | Cố ghi vào cart có `status = 'checked_out'` |
| 422 | `PRODUCT_UNAVAILABLE` | Sản phẩm không tồn tại hoặc `is_active = false` |
| 500 | `INTERNAL_ERROR` | Lỗi server không mong đợi (DB sập, exception chưa handle…) |

---

## 🔬 Ví dụ JSON cho từng error code

### 400 — VALIDATION_ERROR (quantity sai)
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request body không hợp lệ",
  "details": [{ "field": "quantity", "issue": "must be >= 1" }],
  "request_id": "abc-123"
}
```

### 400 — VALIDATION_ERROR (cartId không phải UUID)
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Tham số URL không hợp lệ",
  "details": [{ "field": "cartId", "issue": "must be a valid UUID" }],
  "request_id": "abc-123"
}
```

### 404 — CART_NOT_FOUND
```json
{
  "code": "CART_NOT_FOUND",
  "message": "Không tìm thấy giỏ hàng",
  "details": [],
  "request_id": "abc-123"
}
```

### 409 — CART_CLOSED
```json
{
  "code": "CART_CLOSED",
  "message": "Giỏ hàng đã được thanh toán, không thể chỉnh sửa",
  "details": [],
  "request_id": "abc-123"
}
```

### 422 — PRODUCT_UNAVAILABLE
```json
{
  "code": "PRODUCT_UNAVAILABLE",
  "message": "Sản phẩm không tồn tại hoặc đã ngừng bán",
  "details": [],
  "request_id": "abc-123"
}
```

### 500 — INTERNAL_ERROR
```json
{
  "code": "INTERNAL_ERROR",
  "message": "Đã có lỗi xảy ra, vui lòng thử lại sau",
  "details": [],
  "request_id": "abc-123"
}
```

---

## 📝 Format output: `API_DESIGN.md`

Thạnh nộp file chứa:
1. Bảng tổng quan 6 endpoints
2. Chi tiết từng endpoint: path params, query params, request body schema, response schema với ví dụ JSON
3. Bảng status codes × endpoints
4. Bảng error codes đầy đủ với ví dụ JSON

---

## ⚠️ Lưu ý quan trọng

- **`additionalProperties: false`** bắt buộc cho tất cả request body — field lạ phải bị từ chối với 400.
- **UUID**: `cartId` và `productId` trong path đều phải validate là UUID format trước khi query DB.
- **Validation xảy ra trước khi chạm DB**: nếu request sai schema, trả 400 ngay, không query DB.
- **Response 201 của POST item và PATCH item đều trả toàn bộ cart** — không phải chỉ trả item vừa thay đổi.
