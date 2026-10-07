# DB Design — Cart API tuần 1

**Phụ trách:** Anh — Database Designer.  
**Phạm vi:** thiết kế để Phú viết migration, seed và scripts; chưa triển khai hay nghiệm thu PostgreSQL/API.

**Căn cứ:** [đề bài](slide-extracted.txt), [phân công nhóm](team-tasks.md), [task của Anh](tasks/anh-database.md). Các giá trị seed dưới đây là lựa chọn thiết kế, không phải số liệu bắt buộc từ đề bài. Bảng này thay cho các ví dụ seed trong tài liệu giao việc.

## 1. Schema

Giữ nguyên cột, kiểu, default và constraint trong đề bài. Không thêm bảng người dùng, thanh toán, cột tổng tiền hoặc trigger nghiệp vụ.

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

| Bảng | Ý nghĩa và ràng buộc |
|---|---|
| `products` | UUID duy nhất; SKU duy nhất; giá nguyên dương; stock không âm; mặc định đang bán. |
| `carts` | UUID duy nhất; mặc định `open`; chỉ nhận `open` hoặc `checked_out`. |
| `cart_items` | Một dòng cho mỗi cặp giỏ/sản phẩm; quantity từ 1 đến 10; cả hai ID bắt buộc vì thuộc PRIMARY KEY. |

- Quan hệ: một cart có nhiều cart_items; một product có thể xuất hiện trong nhiều cart.
- Xóa cart: PostgreSQL tự xóa các cart_items của cart đó. Xóa product đang được tham chiếu bị FK chặn; không thêm cascade phía product.
- UUID của cart mới do application sinh; migration không thêm default UUID hoặc extension. Seed dùng UUID v4 cố định ở mục 2.
- `price_cents` là giá theo đơn vị cent, lưu số nguyên để tránh sai số số thực. Đề bài chưa chỉ định loại tiền; không diễn giải các giá trị này thành VND.
- `subtotal_cents` không lưu DB. Tính từ giá hiện tại trong `products` nhân quantity rồi cộng lại; cart rỗng có tổng bằng 0. Giá không lấy từ client. Đạt/Phú quyết định tính ở SQL hay application; nếu tính SQL, ép giá sang `bigint` trước phép nhân để tránh tràn `integer`.
- Constraint không thay thế validation API: UUID/body sai phải bị chặn trước khi truy cập DB. Kiểm tra product active, đủ stock, cart open và thứ tự mã lỗi thuộc service; schema không tự kiểm tra các rule này.

## 2. Seed data

### 2.1. `products`

Alias `SP1` đến `SP5` tương ứng biến `PRODUCT_1_ID` đến `PRODUCT_5_ID` trong evidence script. Alias không phải cột DB.

| Alias | id | sku | name | price_cents | stock | is_active |
|---|---|---|---|---:|---:|---|
| SP1 | 10000000-0000-4000-8000-000000000001 | SKU-001 | Bút bi xanh | 5000 | 3 | true |
| SP2 | 10000000-0000-4000-8000-000000000002 | SKU-002 | Vở kẻ ngang | 15000 | 50 | true |
| SP3 | 10000000-0000-4000-8000-000000000003 | SKU-003 | Thước kẻ 30cm | 8000 | 1 | true |
| SP4 | 10000000-0000-4000-8000-000000000004 | SKU-004 | Bút xóa | 12000 | 0 | true |
| SP5 | 10000000-0000-4000-8000-000000000005 | SKU-005 | Compa | 25000 | 10 | false |

**Lý do chọn:**

- SP1–SP3: đúng 3 sản phẩm đang bán còn hàng. SP4 đang bán nhưng hết hàng; SP5 ngừng bán dù còn hàng.
- SP1 stock = 3: happy path của Luân thêm quantity = 2 rồi PATCH lên 3 vẫn hợp lệ. SP1 đã nằm trong giỏ từ D5 nên không dùng cho test vượt stock (xem C3).
- SP3 stock = 1: có thêm fixture vượt stock với quantity = 2, khớp ví dụ trong phân công nhóm.
- SP1 và SP2 có giá dễ kiểm tra tổng tiền. UUID/SKU ổn định giúp evidence chạy lại sau reset.
- Sau seed, `GET /products` không phân trang giới hạn nhỏ phải có **4 sản phẩm active**, gồm cả SP4 hết hàng. Chỉ lọc `is_active = true`, không tự thêm điều kiện `stock > 0`.

### 2.2. `carts`

| Alias | id | status |
|---|---|---|
| CHECKED_OUT_CART_ID | 20000000-0000-4000-8000-000000000001 | checked_out |

### 2.3. `cart_items`

Không seed dòng nào. Giỏ đóng dùng để thử từ chối ghi; giỏ mở và items được tạo qua API trong evidence script. Test PATCH/DELETE giỏ đóng phải kiểm tra cart status trước item tồn tại, theo flow của Đạt.

**Trạng thái sạch sau seed/reset:** `products = 5`, `carts = 1`, `cart_items = 0`.

## 3. Index

**Quyết định: không tạo index bổ sung trong tuần 1.**

| Index | Nguồn / quyết định | Lý do |
|---|---|---|
| `products(id)` | PostgreSQL tạo từ PRIMARY KEY | Lookup product theo UUID. |
| `products(sku)` | PostgreSQL tạo từ UNIQUE | Bảo đảm SKU duy nhất. |
| `carts(id)` | PostgreSQL tạo từ PRIMARY KEY | Lookup cart theo UUID. |
| `cart_items(cart_id, product_id)` | PostgreSQL tạo từ PRIMARY KEY kép | Chặn item trùng; hỗ trợ lookup theo cart và theo cả cặp ID. |
| `cart_items(cart_id)` | Không thêm | Trùng tiền tố trái của index PRIMARY KEY kép; không cần index riêng cho GET cart. |
| `products(is_active)` | Không thêm | Seed nhỏ, boolean ít chọn lọc; chưa có bằng chứng cần tối ưu. |
| `cart_items(product_id)` | Không thêm | FK không tự tạo index phía tham chiếu; tuần này chưa có API quản trị/xóa product cần tối ưu đường truy vấn này. |

Chỉ cân nhắc thêm index khi dữ liệu/truy vấn thực tế và `EXPLAIN ANALYZE` cho thấy cần; không thêm vì dự phòng.

## 4. Thiết kế scripts

`migrate`, `seed`, `reset` dưới đây là **tên chức năng cần triển khai**, chưa phải lệnh đã chạy được. Phú chọn cú pháp lệnh và migration runner theo `DECISIONS.md`; nhiệm vụ này không chốt runtime/ORM.

| Script | Điều kiện đầu vào | Hành vi phải triển khai | Kết quả |
|---|---|---|---|
| `migrate` | DB dành cho bài tập đã được tạo, kết nối được | Chạy DDL mục 1 trong một transaction: `products`, `carts`, rồi `cart_items`. Migration runner ghi nhận phiên bản; chạy lại phiên bản đã áp dụng thì bỏ qua. Không DROP hay xóa dữ liệu. | Có đủ 3 bảng và constraint, chưa có seed trên DB mới. |
| `seed` | Đủ 3 bảng; không có request ghi đồng thời | **Đã chốt khi implement (khác bản thiết kế đầu):** trong một transaction xóa sạch `cart_items`, `carts`, `products` rồi chèn đúng 5 products và 1 cart ở mục 2 (idempotent). Chỉ dùng cho DB dev/test. | Đúng trạng thái sạch `5 / 1 / 0`; chạy lại nhiều lần cho cùng kết quả. |
| `reset` | DB dev/test; dừng evidence/server ghi đồng thời | **Đã chốt khi implement:** `prisma migrate reset --force` (drop schema, áp lại migration) rồi chạy `seed` (mục trên, tự là một transaction). Prisma từ chối chạy lệnh này khi được gọi bởi AI agent nếu không có consent của người dùng. | Xóa giỏ/items phát sinh, khôi phục đúng fixture. Không để DB bị xóa sạch nếu chèn seed thất bại. |

**An toàn và lỗi:**

- `reset` là thao tác xóa dữ liệu. Script phải từ chối môi trường production và yêu cầu xác nhận đúng DB đích trước khi xóa. Không dùng `CASCADE`, không DROP DATABASE, không đụng bảng ngoài phạm vi.
- Kết nối thất bại, điều kiện đầu vào sai hoặc SQL lỗi: trả exit code khác 0; rollback transaction nếu đã bắt đầu; không báo thành công khi chạy dở.
- Seed chỉ dùng DB test, không chạy cùng request ghi. `reset` phải khóa thao tác xóa và reseed trong cùng transaction; không dựa vào hai script chạy nối tiếp nhưng commit riêng.
- Đọc cấu hình kết nối từ môi trường; không ghi password/connection string chứa secret vào tài liệu hay log. Log kết quả có thể ghi tên script và số dòng.

**Luồng setup Phú cần đưa vào README:**

1. Tạo DB dành riêng cho bài tập, cấu hình kết nối ngoài mã nguồn.
2. Chạy lệnh `migrate` rồi `seed` bằng script đã triển khai.
3. Khởi động API, chạy evidence.
4. Muốn chạy lại từ fixture sạch: ngừng thao tác ghi, chạy `reset`, rồi chạy lại evidence; không cần migrate lại khi schema không đổi.

## 5. Ghi chú kiểm thử cho Luân và Phú

Đây là **kết quả mong đợi**, chưa phải kết quả API thật. D5–D9 dùng cùng một giỏ mở mới; các case lỗi dùng giỏ mở mới riêng, trừ case giỏ đóng.

| Case | Dữ liệu / thao tác | Kết quả mong đợi |
|---|---|---|
| D1 | Liệt kê products từ seed, limit mặc định | 4 active products, có SP4, không có SP5. |
| D3–D4 | Tạo và đọc giỏ rỗng | `items = []`, `subtotal_cents = 0`. |
| D5 | Thêm SP1, quantity = 2 | `5000 × 2 = 10000` cents. |
| D6 | Giữ SP1 quantity = 2, thêm SP2 quantity = 1 | `5000 × 2 + 15000 × 1 = 25000` cents. |
| D7 | PATCH SP1 thành quantity = 3, giữ SP2 quantity = 1 | `5000 × 3 + 15000 × 1 = 30000` cents. |
| D8–D9 | Xóa SP2, còn SP1 quantity = 3 | DELETE trả 204; GET còn tổng `5000 × 3 = 15000` cents. |
| C1 | Thêm SP5, quantity = 1 | 422 `PRODUCT_UNAVAILABLE`; stock còn không làm product active. |
| C2 | Thêm SP4, quantity = 1 | 409 `INSUFFICIENT_STOCK`. |
| C3 | Thêm SP3 (chưa có trong giỏ) quantity = 2 (stock = 1) | 409 `INSUFFICIENT_STOCK`; request đúng schema quantity. SP1 quantity = 4 **không** dùng được nếu SP1 đã có trong giỏ (D5): thứ tự lỗi trả `ITEM_ALREADY_IN_CART` trước. |
| C4 | Thêm SP1 quantity = 1, rồi POST cùng product lần nữa | 409 `ITEM_ALREADY_IN_CART`; không cộng dồn quantity. |
| C5–C7 | POST/PATCH/DELETE với `CHECKED_OUT_CART_ID` và input hợp lệ | 409 `CART_CLOSED`, dù cart seed không có items. |

- Không dùng SP2 stock = 50 rồi gửi quantity = 51 để test stock: request đó sai schema, phải trả 400 thay vì 409.
- Template API có ví dụ `total = 3`; với fixture này, tổng active là 4. Thạnh cần đồng bộ example khi viết `API_DESIGN.md`.
- So sánh DB trước/sau request sai chứng minh **không đổi dữ liệu**, chưa chứng minh **không truy cập DB**. Evidence cho yêu cầu sau cần kiểm tra số query hoặc spy tầng DB; không đổi scope schema vì mục đích này.
- Thiết kế DB không thêm giữ hàng/trừ stock hay checkout. Quyết định transaction và khóa cho API nằm ở `BUSINESS_LOGIC.md`, không coi transaction đơn thuần là đủ ngăn mọi race condition.

**Kết quả kiểm tra:**

- Python assertions: 3 câu `CREATE TABLE` khớp đề bài sau chuẩn hóa khoảng trắng; 6 UUID v4 hợp lệ, duy nhất; seed đúng constraint và phân bố trạng thái.
- Phép tính độc lập: tổng active = 4; subtotal D5–D9 lần lượt 10000, 25000, 30000, 15000 cents; request vượt stock vẫn đúng schema. Các liên kết tài liệu nguồn đều tồn tại.
- Review độc lập: **PASS**, không có lỗi chặn bàn giao. Lưu ý Phú giữ TRUNCATE và reseed trong transaction tường minh; Thạnh đồng bộ example `total = 4` theo fixture này.

**Giới hạn nghiệm thu:** chưa chạy PostgreSQL, migration, seed/reset thật hoặc API. Các kiểm tra tài liệu không thay thế nghiệm thu ứng dụng.
