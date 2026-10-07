# 📋 Nhiệm vụ của Đạt — Business Logic Analyst

> **Bối cảnh**: Nhóm 5 người đang làm bài tập môn Advanced Web. Đề bài yêu cầu xây dựng **Cart API** — RESTful API cho phép người dùng xem sản phẩm, tạo giỏ hàng, thêm/sửa/xóa items. Đạt không cần viết code — chỉ cần thiết kế **luồng xử lý từng endpoint** đủ rõ để Phú (người implement) viết handler và service layer mà không cần đoán mò.

---

## 🎯 Nhiệm vụ của Đạt

Mô tả **từng bước xử lý** (step-by-step) cho 6 endpoints, bao gồm: thứ tự kiểm tra, điều kiện lỗi, cách tính `subtotal_cents`, và khi nào cần database transaction.

Output: file `BUSINESS_LOGIC.md`

---

## 🗃 Thông tin DB cần biết

Hệ thống có 3 bảng (Đạt không cần thiết kế DB, chỉ cần hiểu để mô tả logic):

**`products`**: `id`, `sku`, `name`, `price_cents`, `stock`, `is_active`
- `is_active = true` → đang bán; `is_active = false` → ngừng bán
- `stock` → số lượng tồn kho hiện tại

**`carts`**: `id`, `status`
- `status = 'open'` → giỏ đang mở, có thể ghi
- `status = 'checked_out'` → giỏ đã đóng, không được ghi

**`cart_items`**: `cart_id`, `product_id`, `quantity`
- Khóa chính kép `(cart_id, product_id)` → mỗi sản phẩm chỉ xuất hiện 1 lần trong 1 giỏ

---

## 🚦 Nguyên tắc validation (quan trọng)

**Có 2 tầng validation, theo đúng thứ tự này:**

### Tầng 1 — Schema validation (KHÔNG chạm DB)
Kiểm tra **format** của request:
- Kiểu dữ liệu: `quantity` phải là integer (không phải `"2"`)
- Giới hạn: `quantity` từ 1 đến 10
- Bắt buộc: `product_id` phải có mặt
- Không cho phép field lạ trong body
- `cartId`, `productId` trong URL phải là UUID hợp lệ

Nếu tầng 1 fail → **trả ngay 400 VALIDATION_ERROR**, không tiếp tục.

### Tầng 2 — Business validation (có chạm DB)
Kiểm tra **trạng thái dữ liệu** trong DB — chỉ chạy khi tầng 1 đã pass.

---

## 🔁 Luồng xử lý từng endpoint

### Endpoint 1: `GET /products`

```
1. [Schema] Kiểm tra query params: limit (integer, 1-50), offset (integer, ≥ 0)
   → Nếu sai: 400 VALIDATION_ERROR

2. [DB] SELECT từ products WHERE is_active = true
   LIMIT {limit} OFFSET {offset}

3. Trả 200 với danh sách sản phẩm + total + limit + offset
```

> Không có business rule đặc biệt. Nếu không có sản phẩm nào, trả `data: []`, `total: 0`.

---

### Endpoint 2: `POST /carts`

```
1. Không có request body, không cần validate

2. [DB] INSERT vào carts với id = new UUID, status = 'open'

3. Trả 201 với cart vừa tạo (items = [], subtotal_cents = 0)
   + header Location: /carts/{newCartId}
```

> Không bao giờ thất bại ở tầng business (không có điều kiện nào có thể vi phạm).

---

### Endpoint 3: `GET /carts/{cartId}`

```
1. [Schema] Kiểm tra cartId có phải UUID hợp lệ không
   → Nếu không: 400 VALIDATION_ERROR

2. [DB] SELECT cart WHERE id = cartId
   → Nếu không tìm thấy: 404 CART_NOT_FOUND

3. [DB] SELECT cart_items JOIN products
   WHERE cart_items.cart_id = cartId

4. Tính subtotal_cents:
   - Mỗi item: item_subtotal = price_cents × quantity
   - Cart subtotal = SUM(tất cả item_subtotal)

5. Trả 200 với cart đầy đủ
```

---

### Endpoint 4: `POST /carts/{cartId}/items` ⭐ (phức tạp nhất)

```
1. [Schema] Kiểm tra:
   - cartId trong URL: phải là UUID
   - body.product_id: bắt buộc, phải là UUID
   - body.quantity: bắt buộc, integer, 1-10
   - Không có field lạ trong body
   → Bất kỳ lỗi nào: 400 VALIDATION_ERROR

2. [DB] SELECT cart WHERE id = cartId
   → Nếu không tìm thấy: 404 CART_NOT_FOUND

3. [Business] Kiểm tra cart.status == 'open'
   → Nếu 'checked_out': 409 CART_CLOSED

4. [DB] SELECT product WHERE id = product_id
   → Nếu không tìm thấy HOẶC is_active = false: 422 PRODUCT_UNAVAILABLE

5. [Business] Kiểm tra product.stock >= quantity
   → Nếu không đủ: 409 INSUFFICIENT_STOCK

6. [DB] SELECT cart_item WHERE cart_id = cartId AND product_id = product_id
   → Nếu đã tồn tại: 409 ITEM_ALREADY_IN_CART

7. [DB - Transaction] INSERT vào cart_items

8. Tính lại subtotal_cents (giống Endpoint 3 bước 4)

9. Trả 201 với toàn bộ cart
```

> **Thứ tự bước 2-6 rất quan trọng** — không được đảo ngược. Phải check cart tồn tại trước khi check cart status, phải check product trước khi check stock.

---

### Endpoint 5: `PATCH /carts/{cartId}/items/{productId}` ⭐

```
1. [Schema] Kiểm tra:
   - cartId trong URL: phải là UUID
   - productId trong URL: phải là UUID
   - body.quantity: bắt buộc, integer, 1-10
   - Không có field lạ trong body
   → Bất kỳ lỗi nào: 400 VALIDATION_ERROR

2. [DB] SELECT cart WHERE id = cartId
   → Nếu không tìm thấy: 404 CART_NOT_FOUND

3. [Business] Kiểm tra cart.status == 'open'
   → Nếu 'checked_out': 409 CART_CLOSED

4. [DB] SELECT cart_item WHERE cart_id = cartId AND product_id = productId
   → Nếu không tìm thấy: 404 ITEM_NOT_FOUND

5. [DB] SELECT product WHERE id = productId
   (Sản phẩm đã trong giỏ thì chắc chắn tồn tại, nhưng cần lấy stock và price)

6. [Business] Kiểm tra product.stock >= new_quantity
   → Nếu không đủ: 409 INSUFFICIENT_STOCK

7. [DB - Transaction] UPDATE cart_items SET quantity = new_quantity
   WHERE cart_id = cartId AND product_id = productId

8. Tính lại subtotal_cents

9. Trả 200 với toàn bộ cart
```

> **Lưu ý**: PATCH không kiểm tra `PRODUCT_UNAVAILABLE` hay `ITEM_ALREADY_IN_CART` — sản phẩm đã có trong giỏ rồi. Chỉ kiểm tra stock.

---

### Endpoint 6: `DELETE /carts/{cartId}/items/{productId}`

```
1. [Schema] Kiểm tra:
   - cartId trong URL: phải là UUID
   - productId trong URL: phải là UUID
   → Bất kỳ lỗi nào: 400 VALIDATION_ERROR

2. [DB] SELECT cart WHERE id = cartId
   → Nếu không tìm thấy: 404 CART_NOT_FOUND

3. [Business] Kiểm tra cart.status == 'open'
   → Nếu 'checked_out': 409 CART_CLOSED

4. [DB] SELECT cart_item WHERE cart_id = cartId AND product_id = productId
   → Nếu không tìm thấy: 404 ITEM_NOT_FOUND

5. [DB] DELETE FROM cart_items
   WHERE cart_id = cartId AND product_id = productId

6. Trả 204 (không có body)
```

---

## 📊 Bảng tổng hợp thứ tự validation

| Bước | POST /items | PATCH /items/:pid | DELETE /items/:pid |
|------|------------|-------------------|--------------------|
| 1 | Schema (400) | Schema (400) | Schema (400) |
| 2 | Cart tồn tại (404) | Cart tồn tại (404) | Cart tồn tại (404) |
| 3 | Cart open (409) | Cart open (409) | Cart open (409) |
| 4 | Product tồn tại & active (422) | Item tồn tại (404) | Item tồn tại (404) |
| 5 | Đủ stock (409) | Đủ stock (409) | DELETE |
| 6 | Chưa có item (409) | UPDATE | |
| 7 | INSERT | | |

---

## 🧮 Cách tính `subtotal_cents`

`subtotal_cents` là tổng tiền của giỏ hàng. **Không lưu vào DB**, tính mỗi lần trả response.

```
cart.subtotal_cents = SUM(
  item.price_cents × item.quantity
  for each item in cart
)
```

**Ví dụ**: Giỏ có 2 items:
- Bút bi xanh: `price_cents = 5000`, `quantity = 2` → `10000`
- Vở kẻ ngang: `price_cents = 15000`, `quantity = 1` → `15000`
- **`subtotal_cents = 25000`**

**Quan trọng**: `price_cents` lấy từ bảng `products` trong DB, **không bao giờ** lấy từ client.

**Nơi tính**: Có thể tính trong SQL (với `SUM(p.price_cents * ci.quantity)`) hoặc trong application sau khi query. Đạt cần quyết định cái nào và ghi vào output.

---

## 🔐 Khi nào cần Database Transaction?

Transaction đảm bảo tính toàn vẹn dữ liệu — nếu một bước fail thì rollback tất cả.

| Endpoint | Cần transaction? | Lý do |
|----------|-----------------|-------|
| `GET /products` | ❌ | Chỉ đọc |
| `POST /carts` | ❌ | Chỉ 1 INSERT đơn giản |
| `GET /carts/{cartId}` | ❌ | Chỉ đọc |
| `POST /carts/{cartId}/items` | ✅ Nên có | Check stock → INSERT: phải atomic để tránh race condition |
| `PATCH /carts/{cartId}/items/{productId}` | ✅ Nên có | Check stock → UPDATE: phải atomic |
| `DELETE /carts/{cartId}/items/{productId}` | ❌ | 1 DELETE đơn giản |

> **Race condition**: Nếu 2 request cùng lúc check stock (còn 1 cái) và cùng thấy đủ, rồi cùng INSERT — kết quả sẽ sai. Transaction + SELECT FOR UPDATE ngăn điều này.

---

## 📝 Format output: `BUSINESS_LOGIC.md`

Đạt nộp file chứa:
1. Luồng xử lý từng endpoint (dạng numbered list như trên)
2. Bảng thứ tự validation
3. Quyết định: tính `subtotal_cents` ở DB hay application?
4. Quyết định: có dùng transaction không, ở endpoint nào?

---

## ⚠️ Lưu ý quan trọng

1. **Đừng dựa vào lỗi DB**: Nếu vi phạm constraint DB (ví dụ `quantity` > 10), DB sẽ throw error → server trả 500. Phải validate trước ở tầng 1 để trả 400 đúng.
2. **Đừng tin client về giá**: `price_cents` phải đọc từ bảng `products`, không được lấy từ request body.
3. **Thứ tự check business rule ảnh hưởng đến UX**: Nếu check stock trước khi check item đã tồn tại, người dùng sẽ thấy lỗi stock trước — rồi fix xong lại thấy lỗi item đã tồn tại. Thứ tự trong flow phải nhất quán và hợp lý.
