# 📋 Nhiệm vụ của Luân — QA & Evidence Planner

> **Bối cảnh**: Nhóm 5 người đang làm bài tập môn Advanced Web. Đề bài yêu cầu xây dựng **Cart API** — RESTful API cho phép người dùng xem sản phẩm, tạo giỏ hàng, thêm/sửa/xóa items. Luân không cần viết code — chỉ cần **thiết kế toàn bộ kịch bản kiểm thử** và **format evidence script** đủ chi tiết để Phú (người implement) viết script chạy được trong buổi nghiệm thu.

---

## 🎯 Nhiệm vụ của Luân

Thiết kế **ma trận nghiệm thu đầy đủ**: mỗi kịch bản phải rõ về input, setup cần thiết và kết quả mong đợi. Phú dùng file này để viết evidence script.

Output: file `TEST_MATRIX.md`

---

## 🗺 Bức tranh toàn cảnh hệ thống (để Luân hiểu cần test gì)

### 6 Endpoints:
| # | Method | Path |
|---|--------|------|
| 1 | GET | `/products` |
| 2 | POST | `/carts` |
| 3 | GET | `/carts/{cartId}` |
| 4 | POST | `/carts/{cartId}/items` |
| 5 | PATCH | `/carts/{cartId}/items/{productId}` |
| 6 | DELETE | `/carts/{cartId}/items/{productId}` |

### Seed data mặc định (do Anh thiết kế, Luân cần dùng trong kịch bản):
- **5 products**:
  - SP1, SP2, SP3: `is_active = true`, `stock > 0` (đang bán, còn hàng)
  - SP4: `is_active = true`, `stock = 0` (đang bán, HẾT hàng)
  - SP5: `is_active = false`, `stock > 0` (ngừng bán)
- **1 cart** với `status = 'checked_out'` (đã thanh toán, không thể ghi thêm)

### Error contract (mọi lỗi đều có format này):
```json
{
  "code": "TÊN_LỖI",
  "message": "...",
  "details": [...],
  "request_id": "uuid"
}
```

---

## 🧪 Ma trận nghiệm thu đầy đủ

### Nhóm A: Validate schema (request sai format)

Các kịch bản này kiểm tra rằng API **không chạm DB** khi request sai format, luôn trả **400 VALIDATION_ERROR**.

| # | Kịch bản | Endpoint | Input | Kết quả mong đợi |
|---|----------|----------|-------|-----------------|
| A1 | `quantity = 0` (dưới min) | `POST /carts/:id/items` | `{"product_id": "<uuid>", "quantity": 0}` | `400` · `VALIDATION_ERROR` · details chỉ field `quantity` |
| A2 | `quantity = 11` (trên max) | `POST /carts/:id/items` | `{"product_id": "<uuid>", "quantity": 11}` | `400` · `VALIDATION_ERROR` · details chỉ field `quantity` |
| A3 | `quantity = "2"` (sai kiểu — string thay vì integer) | `POST /carts/:id/items` | `{"product_id": "<uuid>", "quantity": "2"}` | `400` · `VALIDATION_ERROR` · details chỉ field `quantity` |
| A4 | Thiếu `product_id` (field bắt buộc) | `POST /carts/:id/items` | `{"quantity": 2}` | `400` · `VALIDATION_ERROR` · details chỉ field `product_id` |
| A5 | Body có field lạ | `POST /carts/:id/items` | `{"product_id": "<uuid>", "quantity": 2, "price": 999}` | `400` · `VALIDATION_ERROR` · DB không thay đổi |
| A6 | `cartId` trong URL không phải UUID | `GET /carts/abc-123-not-uuid` | — | `400` · `VALIDATION_ERROR` · details chỉ field `cartId` |
| A7 | `quantity = 0` khi PATCH | `PATCH /carts/:id/items/:pid` | `{"quantity": 0}` | `400` · `VALIDATION_ERROR` |
| A8 | Body rỗng khi POST items | `POST /carts/:id/items` | `{}` | `400` · `VALIDATION_ERROR` |

---

### Nhóm B: Resource không tìm thấy (404)

| # | Kịch bản | Endpoint | Setup cần | Input | Kết quả mong đợi |
|---|----------|----------|-----------|-------|-----------------|
| B1 | `cartId` hợp lệ nhưng không tồn tại trong DB | `GET /carts/{cartId}` | Dùng UUID ngẫu nhiên không có trong DB | `cartId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"` | `404` · `CART_NOT_FOUND` |
| B2 | `cartId` không tồn tại khi thêm item | `POST /carts/{cartId}/items` | Tương tự B1 | — | `404` · `CART_NOT_FOUND` |
| B3 | Xóa item không có trong giỏ | `DELETE /carts/{cartId}/items/{productId}` | Tạo cart mới, dùng `productId` hợp lệ nhưng chưa thêm vào giỏ | — | `404` · `ITEM_NOT_FOUND` |
| B4 | PATCH item không có trong giỏ | `PATCH /carts/{cartId}/items/{productId}` | Tương tự B3 | `{"quantity": 2}` | `404` · `ITEM_NOT_FOUND` |

---

### Nhóm C: Business rules vi phạm (409 / 422)

| # | Kịch bản | Endpoint | Setup cần | Input | Kết quả mong đợi |
|---|----------|----------|-----------|-------|-----------------|
| C1 | Thêm sản phẩm ngừng bán (SP5) | `POST /carts/{cartId}/items` | Tạo cart mới, dùng id của SP5 | `{"product_id": "<id_SP5>", "quantity": 1}` | `422` · `PRODUCT_UNAVAILABLE` |
| C2 | Thêm sản phẩm hết hàng (SP4, stock=0) | `POST /carts/{cartId}/items` | Tạo cart mới, dùng id của SP4 | `{"product_id": "<id_SP4>", "quantity": 1}` | `409` · `INSUFFICIENT_STOCK` |
| C3 | Thêm sản phẩm vượt tồn kho | `POST /carts/{cartId}/items` | Dùng SP1 có stock = N | `{"product_id": "<id_SP1>", "quantity": N+1}` | `409` · `INSUFFICIENT_STOCK` |
| C4 | Thêm sản phẩm đã có trong giỏ | `POST /carts/{cartId}/items` | Tạo cart, thêm SP1 vào rồi thêm SP1 lần nữa | `{"product_id": "<id_SP1>", "quantity": 1}` | `409` · `ITEM_ALREADY_IN_CART` |
| C5 | Ghi vào cart đã checkout | `POST /carts/{cartId}/items` | Dùng cart seed có `status='checked_out'` | `{"product_id": "<id_SP1>", "quantity": 1}` | `409` · `CART_CLOSED` |
| C6 | PATCH trên cart đã checkout | `PATCH /carts/{cartId}/items/{productId}` | Tương tự C5 | `{"quantity": 2}` | `409` · `CART_CLOSED` |
| C7 | DELETE trên cart đã checkout | `DELETE /carts/{cartId}/items/{productId}` | Tương tự C5 | — | `409` · `CART_CLOSED` |

---

### Nhóm D: Happy path (luồng thành công)

| # | Kịch bản | Sequence | Kết quả mong đợi |
|---|----------|----------|-----------------|
| D1 | Xem danh sách sản phẩm | `GET /products` | `200` · Chỉ trả SP có `is_active=true` · Không trả SP5 (ngừng bán) |
| D2 | Xem sản phẩm với phân trang | `GET /products?limit=2&offset=0` rồi `GET /products?limit=2&offset=2` | `200` · Mỗi page ≤ 2 items |
| D3 | Tạo cart mới | `POST /carts` | `201` · Body có `id`, `status='open'`, `items=[]`, `subtotal_cents=0` · Header `Location: /carts/{id}` |
| D4 | Xem cart rỗng | `POST /carts` → `GET /carts/{id}` | `200` · `items=[]` · `subtotal_cents=0` |
| D5 | Thêm 1 item và kiểm tra subtotal | `POST /carts` → `POST /carts/:id/items` (SP1, qty=2) → `GET /carts/:id` | `subtotal_cents = price_SP1 × 2` (tính tay từ seed data) |
| D6 | Thêm 2 items và kiểm tra subtotal tổng | Tiếp theo D5, thêm SP2 (qty=1) | `subtotal_cents = price_SP1×2 + price_SP2×1` |
| D7 | Sửa số lượng | PATCH SP1 thành qty=3 | `200` · cart trả về, `subtotal_cents` cập nhật |
| D8 | Xóa item | DELETE SP2 khỏi giỏ | `204` · Không có body |
| D9 | Xem cart sau khi xóa | `GET /carts/:id` | SP2 không còn trong `items[]` |

---

### Nhóm E: Server error (500)

| # | Kịch bản | Setup cần | Input | Kết quả mong đợi |
|---|----------|-----------|-------|-----------------|
| E1 | Tắt PostgreSQL rồi gọi API | Stop PostgreSQL service trước khi gọi | Bất kỳ request nào | `500` · `INTERNAL_ERROR` · **Không có** stack trace, SQL, tên biến · Có `request_id` |

---

### Nhóm F: Khớp spec (schema conformance)

| # | Kịch bản | Cách kiểm tra | Kết quả mong đợi |
|---|----------|--------------|-----------------|
| F1 | Response thật khớp với OpenAPI spec | Dùng tool so sánh response với spec (hoặc kiểm tra thủ công) | Tất cả fields có đúng kiểu, không thiếu field bắt buộc |
| F2 | `request_id` xuất hiện đồng thời trong response và log | Gọi request tạo lỗi, lấy `request_id` trong response, grep trong log | Tìm thấy đúng `request_id` đó trong log |

---

## 📜 Format script nghiệm thu

Luân cần quyết định dùng format nào để Phú viết script:

### Lựa chọn 1: Shell script (curl)
```bash
#!/bin/bash
BASE="http://localhost:3000"

echo "=== A1: quantity = 0 ==="
CART=$(curl -s -X POST $BASE/carts | jq -r '.id')
curl -s -X POST $BASE/carts/$CART/items \
  -H "Content-Type: application/json" \
  -d '{"product_id":"'$PRODUCT_1_ID'","quantity":0}'
echo ""
```

- ✅ Chạy được không cần install thêm
- ✅ Dễ tích hợp vào CI
- ❌ Khó đọc, khó debug

### Lựa chọn 2: HTTPie (`.sh` dễ đọc hơn)
```bash
http POST localhost:3000/carts/$CART/items \
  product_id=$PRODUCT_1_ID quantity:=0
```

- ✅ Syntax rõ hơn curl
- ❌ Cần install `httpie`

### Lựa chọn 3: `.http` file (VS Code REST Client)
```http
### A1: quantity = 0
POST http://localhost:3000/carts/{{cartId}}/items
Content-Type: application/json

{
  "product_id": "{{product1Id}}",
  "quantity": 0
}
```

- ✅ Đọc được trong VS Code
- ✅ Không cần install gì thêm nếu dùng VS Code
- ❌ Không chạy tự động được (cần click từng request)

### Lựa chọn 4: Postman Collection (`.json`)
- ✅ UI đẹp, dễ share
- ❌ Cần install Postman

**Gợi ý**: Chọn **curl script** vì chạy được ngay trên mọi máy khi nghiệm thu.

---

## 🗂 Thứ tự chạy script

Script phải chạy theo thứ tự này để không bị phụ thuộc lẫn nhau:

```
1. reset DB (xóa toàn bộ data, chạy lại seed)
2. [Nhóm D] Happy path — kiểm tra luồng thành công trước
   → Lấy ID của cart/product từ bước này dùng cho nhóm sau
3. reset DB
4. [Nhóm A] Schema validation — không phụ thuộc ID cụ thể
5. [Nhóm B] 404 errors — cần tạo cart mới hoặc dùng UUID random
6. [Nhóm C] Business rules — cần dùng seed data (cart checked_out, SP4, SP5)
7. [Nhóm E] Server error — tắt PostgreSQL, chạy 1 request, bật lại
8. [Nhóm F] Schema conformance — chạy sau khi có response thật
```

---

## 📝 Format output: `TEST_MATRIX.md`

Luân nộp file chứa:
1. Tất cả bảng kịch bản trên (điền đầy đủ ID cụ thể từ seed data của Anh nếu có)
2. Quyết định format script (curl / httpie / .http / Postman)
3. Thứ tự chạy các nhóm kịch bản
4. Danh sách biến cần có trước khi chạy (BASE_URL, PRODUCT_1_ID, PRODUCT_4_ID, PRODUCT_5_ID, CHECKED_OUT_CART_ID)

---

## ⚠️ Lưu ý quan trọng

1. **Kịch bản A5 (field lạ)**: phải kiểm tra DB không thay đổi sau request — nghĩa là GET lại cart và xác nhận item count không tăng.
2. **Kịch bản D6 (subtotal)**: cần tính tay trước rồi ghi vào test case, ví dụ: `subtotal_cents phải = 10000 + 15000 = 25000`.
3. **Kịch bản E1**: phải khởi động lại PostgreSQL sau khi test xong để các kịch bản sau chạy được.
4. **Kịch bản F2 (request_id)**: `request_id` là UUID ngẫu nhiên mỗi request — phải lấy từ response body rồi grep trong log ngay sau đó.
5. Script phải **chạy lại được** — tức là sau khi reset DB, chạy lại từ đầu phải cho cùng kết quả.
