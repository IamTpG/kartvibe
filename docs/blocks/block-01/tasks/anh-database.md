# 📋 Nhiệm vụ của Anh — Database Designer

> **Bối cảnh**: Nhóm 5 người đang làm bài tập môn Advanced Web. Đề bài yêu cầu xây dựng **Cart API** — một API cho phép người dùng xem sản phẩm, tạo giỏ hàng, thêm/sửa/xóa sản phẩm trong giỏ. Backend dùng PostgreSQL. Anh không cần viết code — chỉ cần thiết kế đủ chi tiết để Phú (người implement) viết migration và seed.

---

## 🎯 Nhiệm vụ của Anh

Thiết kế toàn bộ **database schema**, **seed data cụ thể** và **danh sách scripts** cần có.

Output: file `DB_DESIGN.md`

---

## 📐 Schema bắt buộc (do đề bài quy định)

Đề bài đã cho sẵn 3 bảng, Anh không được thay đổi cấu trúc cột:

### Bảng `products`
```sql
CREATE TABLE products (
  id          uuid PRIMARY KEY,
  sku         text UNIQUE NOT NULL,
  name        text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  stock       integer NOT NULL CHECK (stock >= 0),
  is_active   boolean NOT NULL DEFAULT true
);
```

**Giải thích từng cột:**
- `id`: UUID, khóa chính
- `sku`: Mã sản phẩm (stock keeping unit), không được trùng
- `name`: Tên sản phẩm hiển thị
- `price_cents`: Giá tính bằng **xu** (cents), không phải đồng — ví dụ 25000 = 250đ. Lý do: tránh lỗi làm tròn số thực (floating point)
- `stock`: Số lượng tồn kho, không được âm
- `is_active`: `true` = đang bán, `false` = ngừng bán

### Bảng `carts`
```sql
CREATE TABLE carts (
  id     uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'open'
         CHECK (status IN ('open', 'checked_out'))
);
```

**Giải thích:**
- `status = 'open'`: Giỏ hàng đang mở, có thể thêm/sửa/xóa items
- `status = 'checked_out'`: Giỏ đã thanh toán, không được ghi thêm

### Bảng `cart_items`
```sql
CREATE TABLE cart_items (
  cart_id    uuid REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  quantity   integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  PRIMARY KEY (cart_id, product_id)
);
```

**Giải thích:**
- Khóa chính kép `(cart_id, product_id)`: mỗi sản phẩm chỉ xuất hiện **1 lần** trong 1 giỏ
- `ON DELETE CASCADE`: nếu cart bị xóa, toàn bộ items trong cart đó cũng xóa theo
- `quantity` từ 1 đến 10: ràng buộc ở tầng DB

---

## 🌱 Seed data cần thiết

Đề bài yêu cầu seed data đủ để **kiểm thử mọi kịch bản**. Anh cần thiết kế **giá trị cụ thể** (không để trống).

### Yêu cầu seed data từ đề bài:
- **5 products** bao gồm:
  - 3 sản phẩm đang bán (`is_active = true`) và còn hàng (`stock > 0`)
  - 1 sản phẩm còn bán (`is_active = true`) nhưng **hết hàng** (`stock = 0`)
  - 1 sản phẩm **ngừng bán** (`is_active = false`), stock không quan trọng
- **1 cart** với `status = 'checked_out'` (để test lỗi ghi vào cart đã đóng)

### Yêu cầu đặc biệt về giá:
`price_cents` phải là số **cụ thể và tính tay được** — vì trong ma trận nghiệm thu có kịch bản: "Thêm 2 sản phẩm vào giỏ rồi GET cart, kiểm tra `subtotal_cents` bằng tổng tính tay". Ví dụ nếu thêm sản phẩm A (qty=2, price=15000) và B (qty=1, price=25000) thì `subtotal_cents` phải đúng bằng `2×15000 + 1×25000 = 55000`.

### Template seed data Anh cần điền:

| Tên cột | SP1 | SP2 | SP3 | SP4 (hết hàng) | SP5 (ngừng bán) |
|---------|-----|-----|-----|----------------|-----------------|
| id | UUID | UUID | UUID | UUID | UUID |
| sku | ? | ? | ? | ? | ? |
| name | ? | ? | ? | ? | ? |
| price_cents | ? | ? | ? | ? | ? |
| stock | ? (≥1) | ? (≥1) | ? (≥1) | **0** | ? |
| is_active | true | true | true | true | **false** |

**Gợi ý**: Đặt tên sản phẩm thực tế (ví dụ: Bút bi, Vở kẻ ngang, Thước kẻ…) và giá hợp lý để dễ tính tay.

---

## 🔑 Index cần thiết

Anh cần quyết định có nên thêm index không (ngoài PRIMARY KEY mặc định). Gợi ý để Anh cân nhắc:

| Index | Lý do có thể cần |
|-------|-----------------|
| `products(is_active)` | `GET /products` chỉ lấy sản phẩm đang bán, filter thường xuyên |
| `cart_items(cart_id)` | `GET /carts/{cartId}` join với cart_items theo cart_id |

Với scale bài tập (vài chục dòng), index không bắt buộc — nhưng Anh nên ghi rõ quyết định có hay không và lý do.

---

## 📜 Scripts cần thiết

Đề bài yêu cầu `README` có đủ lệnh. Anh cần mô tả **mỗi script làm gì**, Phú sẽ implement:

| Script | Mô tả |
|--------|-------|
| `migrate` | Tạo bảng (chạy lần đầu hoặc khi DB trống) |
| `seed` | Chèn dữ liệu mẫu (5 products, 1 cart checked_out) vào DB đã có bảng |
| `reset` | Xóa toàn bộ dữ liệu (TRUNCATE hoặc DROP + recreate) rồi chạy lại seed |

**Lưu ý**: Reset script quan trọng khi chạy evidence — cần bắt đầu từ trạng thái sạch.

---

## 📝 Format output: `DB_DESIGN.md`

```markdown
# DB Design

## Schema
[3 bảng như đề bài, không thay đổi]

## Seed Data

### products
| id | sku | name | price_cents | stock | is_active |
|----|-----|------|-------------|-------|-----------|
| <uuid-1> | SKU-001 | Bút bi xanh | 5000 | 100 | true |
| <uuid-2> | SKU-002 | Vở kẻ ngang | 15000 | 50 | true |
| <uuid-3> | SKU-003 | Thước kẻ 30cm | 8000 | 30 | true |
| <uuid-4> | SKU-004 | Bút xóa | 12000 | 0 | true |
| <uuid-5> | SKU-005 | Compa | 25000 | 10 | false |

### carts
| id | status |
|----|--------|
| <uuid-cart-1> | checked_out |

## Index
[Quyết định có thêm index không và lý do]

## Scripts
- **migrate**: [mô tả]
- **seed**: [mô tả]
- **reset**: [mô tả]

## Ghi chú kiểm thử
- Thêm SP1 (qty=2) + SP2 (qty=1) → subtotal_cents phải = 2×5000 + 1×15000 = 25000
```

---

## ⚠️ Lưu ý quan trọng

1. **Không nhận `price_cents` từ client** — API phải luôn đọc giá từ DB. Đây là lỗi thường gặp được đề bài cảnh báo.
2. `subtotal_cents` là tổng tiền giỏ hàng = SUM(`price_cents × quantity`) cho tất cả items trong cart. Giá trị này được tính khi query GET /carts/{cartId}, không lưu vào DB.
3. Seed data phải có UUID hợp lệ (dạng `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) — có thể dùng UUID cố định để dễ reference trong test.
