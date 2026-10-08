# Hợp đồng chung (bản đề xuất) cho bài tập Block 2

> **Trạng thái: đề xuất, chưa chốt.** Người tổng hợp đọc, chỉnh, rồi mới gửi cho nhóm. Mục nào còn cần xác nhận được đánh dấu **[GIẢ ĐỊNH]** và tập hợp ở mục 11.
>
> Đây là tài liệu **chung** cho mọi luồng. Ai cũng làm theo đúng hình dạng JSON, tên field, cổng và cách đếm ở đây. Muốn đổi gì thì báo người tổng hợp, không tự đổi.
>
> Nguồn: `w02/BT_Block 2_ API composition.html` và `docs/blocks/block-02/ke-hoach-65-phut.md`.

Người phụ trách: Phú (P1, GraphQL, tổng hợp) · Đạt (P2, BFF và trang web) · Thạnh (P3, User và Order) · Luân (P4, Product) · Anh (P5, đo, đối chiếu, README, Plan).

## 1. Quy ước chung

| Mục | Quy ước |
|---|---|
| Cổng | web 4000 · user 4001 · order 4002 · product 4003 · BFF 4004 · GraphQL 4005 · Postgres 5434 |
| Postgres | Container `kartvibe-postgres`, `localhost:5434`, user `postgres`, mật khẩu `postgres` (dữ liệu giả, chỉ chạy cục bộ) |
| Ngôn ngữ | Node.js + Express + TypeScript (chạy bằng `tsx`) như `services/` hiện có |
| JSON | `camelCase`; id là **số nguyên** (kể cả trong GraphQL, dùng `Int`, không dùng `ID`) |
| Header | Mọi service đọc/ghi `x-request-id`; BFF và GraphQL sinh nếu thiếu rồi **chuyển tiếp** xuống service |
| CORS | `Access-Control-Allow-Origin: *` ở mọi service (cục bộ) |
| Nén | **Tắt** nén phản hồi (để so sánh byte công bằng) |
| Độ trễ giả | Biến `LATENCY_MS`: mã dịch vụ mặc định **0**, `tools/start-measure.sh` (`npm run start:measure`) đặt **30** cho demo và đo (xem [ADR 0009](../../decisions/0009-log-stdout-moc-do-sau-co.md)); áp cho mọi request nghiệp vụ của User, Order, Product (không áp cho `/health`, `/_metrics`, `/_fault`) |
| Dữ liệu | Hoàn toàn giả. Không có dữ liệu cá nhân thật |

## 2. Cơ sở dữ liệu và dữ liệu mẫu

### 2.1 Ba database riêng (cùng một server Postgres) **[GIẢ ĐỊNH: đủ để thỏa "mỗi service một CSDL riêng"]**

```sql
-- kartvibe_user
CREATE TABLE users (id int PRIMARY KEY, name text NOT NULL);

-- kartvibe_order   (không có khóa ngoại sang database khác)
CREATE TABLE orders (
  id int PRIMARY KEY, user_id int NOT NULL,
  status text NOT NULL, created_at timestamptz NOT NULL);
CREATE TABLE order_items (
  order_id int NOT NULL REFERENCES orders(id), item_index int NOT NULL,
  product_id int NOT NULL, quantity int NOT NULL,
  PRIMARY KEY (order_id, item_index));

-- kartvibe_product
CREATE TABLE products (
  id int PRIMARY KEY, sku text UNIQUE NOT NULL, name text NOT NULL,
  price int NOT NULL, thumbnail text NOT NULL, description text NOT NULL);
```

### 2.2 Hai cấu hình dữ liệu (biến `SIZE=S|L` khi seed)

| | S (nhỏ) | L (lớn) |
|---|---:|---:|
| Số đơn | 5 | 50 |
| Item mỗi đơn (`k`) | 3 | 4 |
| Số product (`n`) | 10 | 30 |
| Tổng item | 15 | 200 |
| Product khác nhau được dùng | 10 | 30 |

Chỉ có **1 người dùng** (`id = 1`), mọi đơn thuộc người dùng đó.

### 2.3 Công thức sinh (xác định, ai chạy cũng ra cùng kết quả)

Với đơn `o` (từ 1), item `i` (từ 0 đến `k-1`):

```
productId = ((o * 7 + i * 11) % n) + 1
quantity  = ((o + i) % 3) + 1
status    = ["PENDING","PAID","SHIPPED","DELIVERED","CANCELLED"][(o - 1) % 5]
createdAt = 2026-01-01T00:00:00.000Z cộng (o - 1) ngày
```
Trong một đơn các `productId` luôn khác nhau; giữa các đơn có lặp.

Người dùng 1: `{ id: 1, name: "Người dùng 1" }`. Product `id`:
```
sku = "SKU-" + id (3 chữ số)         name = "Sản phẩm " + id (2 chữ số)
price = 10000 + id * 500             thumbnail = "https://img.example.test/p/{id}.jpg"
description = "Mô tả sản phẩm {id}. " lặp 6 lần
```
Đường dẫn `thumbnail` là **chuỗi giả, không bao giờ được tải** (xem mục 7).

Ví dụ (S): đơn 1 gồm `(product 8, qty 2), (9, 3), (10, 1)`; đơn 2 gồm `(5,3), (6,1), (7,2)`.

## 3. Hợp đồng REST của ba service

Mọi service có thêm: `GET /health` → `200 {"status":"ok"}` · `GET /_metrics` → `200 {"service":"user","requests":n,"dbQueries":m}` · `POST /_metrics/reset` → `204`. Bộ đếm **không** tính `/health`, `/_metrics`, `/_metrics/reset`, `/_fault`.

Lỗi luôn có dạng `{"code":"...","message":"..."}`; không lộ stack trace.

### User Service (4001)
```
GET /users/:id → 200 {"id":1,"name":"Người dùng 1"}
                 404 {"code":"USER_NOT_FOUND","message":"..."}
```

### Order Service (4002)
```
GET /orders?userId=1 → 200 {"data":[
  {"id":1,"userId":1,"status":"PENDING","createdAt":"2026-01-01T00:00:00.000Z",
   "items":[{"productId":8,"quantity":2},{"productId":9,"quantity":3},{"productId":10,"quantity":1}]}, ...]}
```
- Sắp xếp theo `id` tăng dần; `items` theo `item_index`. Không có đơn thì `200 {"data":[]}`. `userId` sai kiểu thì `400 VALIDATION_ERROR`.
- Mỗi lời gọi dùng **đúng 2 truy vấn DB** (lấy đơn, rồi lấy tất cả item của các đơn đó).

### Product Service (4003)
```
GET /products/:id → 200 {"id":8,"sku":"SKU-008","name":"Sản phẩm 08","price":14000,
                         "thumbnail":"https://img.example.test/p/8.jpg","description":"..."}
                    404 {"code":"PRODUCT_NOT_FOUND","message":"..."}

GET /products?ids=8,9,10 → 200 {"data":[ ...các product... ]}      (endpoint lấy nhiều)
```
Quy tắc endpoint lấy nhiều: `ids` là danh sách số nguyên cách nhau dấu phẩy; **id trùng chỉ tính một**; id không tồn tại thì **bỏ qua** (không lỗi); kết quả sắp theo `id` tăng dần (client tự ghép theo `id`); tối đa 200 id (vượt thì `400`); sai định dạng thì `400 VALIDATION_ERROR`. Một lời gọi = **1 request, 1 truy vấn DB** (`WHERE id = ANY(...)`). Lời gọi `GET /products/:id` = 1 request, 1 truy vấn.

### Gây lỗi (chỉ Product Service; chỉ có khi `ENABLE_TEST_HOOKS=1`, `tools/start-measure.sh` bật)
```
POST /_fault {"latencyMs":1500,"error":false}   → bật chậm thêm 1500 ms
POST /_fault {"latencyMs":0,"error":true}       → mọi request nghiệp vụ trả 500 {"code":"INTERNAL_ERROR",...}
POST /_fault {}                                 → xóa lỗi
GET  /_fault                                    → trạng thái hiện tại
```
Áp dụng cho cả `GET /products/:id` và `GET /products?ids=`.

## 4. Hợp đồng BFF (4004)

Chỉ gọi service qua REST (không truy vấn DB). `PRODUCT_TIMEOUT_MS` mặc định **1000**.

### `GET /bff/web/dashboard?userId=1`
```json
{
  "user": {"id": 1, "name": "Người dùng 1"},
  "orders": [
    {"id": 1, "status": "PENDING", "createdAt": "2026-01-01T00:00:00.000Z",
     "items": [
       {"productId": 8, "quantity": 2, "product": {"name": "Sản phẩm 08", "price": 14000}}
     ]}
  ],
  "partial": false,
  "errors": []
}
```

### `GET /bff/mobile/orders?userId=1`
```json
{
  "orders": [
    {"id": 1, "status": "PENDING",
     "items": [ {"product": {"name": "Sản phẩm 08", "thumbnail": "https://img.example.test/p/8.jpg"}} ]}
  ],
  "partial": false,
  "errors": []
}
```
Mobile **không** có thông tin người dùng, nên BFF mobile không gọi User Service.

### Cách BFF gọi service (yêu cầu thiết kế)
User và Order gọi **song song**; sau đó gọi Product **một lần** bằng endpoint lấy nhiều với danh sách id **đã loại trùng**.

### Khi Product chậm hoặc lỗi (policy chung, mục 6)
Mọi `product` của request đó thành `null`, `"partial": true`, và `errors` có một phần tử:
```json
{"code": "PRODUCT_UNAVAILABLE", "message": "...", "productIds": [8, 9, 10]}
```
Không điền tên hay giá giả. Nếu **User hoặc Order** lỗi thì trả `502 {"code":"UPSTREAM_ERROR",...}` (ngoài phạm vi bài).

## 5. Hợp đồng GraphQL (4005, `POST /graphql`)

### Schema
```graphql
type Query {
  user(id: Int!): User
  orders(userId: Int!): [Order!]!
}
type User      { id: Int!  name: String! }
type Order     { id: Int!  status: String!  createdAt: String!  items: [OrderItem!]! }
type OrderItem { productId: Int!  quantity: Int!  product: Product }
type Product   { id: Int!  name: String!  price: Int!  thumbnail: String!  description: String! }
```
`OrderItem.product` **nullable** để biểu diễn lỗi một phần. Tổng tiền không nằm trong hợp đồng (trang tự tính để hiển thị).

### Hai query
```graphql
# web
query Web($userId: Int!) {
  user(id: $userId) { id name }
  orders(userId: $userId) { id status createdAt items { productId quantity product { name price } } }
}
# mobile
query Mobile($userId: Int!) {
  orders(userId: $userId) { id status items { product { name thumbnail } } }
}
```
Phần `data` của kết quả có **cùng hình dạng** với phần thân BFF tương ứng (bỏ `partial` và `errors`). Nhờ vậy một bộ đối chiếu duy nhất dùng được cho cả hai.

### Hành vi bắt buộc của resolver
| Công tắc `DATALOADER` | `OrderItem.product` làm gì |
|---|---|
| `off` (ngây thơ) | Gọi `GET /products/:id` **riêng cho từng item** (tái hiện N+1) |
| `on` (đã sửa) | **Gom id trong một request, loại trùng**, gọi `GET /products?ids=` **một lần**; loader tạo **mới cho mỗi request** |

Khi Product lỗi/chậm quá timeout: `product` thành `null` ở các item bị ảnh hưởng và có mục trong mảng `errors` của GraphQL với `extensions.code = "PRODUCT_UNAVAILABLE"`.

## 6. Policy lỗi và các kịch bản **[GIẢ ĐỊNH]**

**Chọn: trả dữ liệu một phần có đánh dấu lỗi**, giống nhau ở BFF và GraphQL. Không thay tên hoặc giá bằng giá trị giả.

| Kịch bản | Thiết lập | Kết quả mong đợi |
|---|---|---|
| Product chậm vừa phải | `latencyMs: 500` | Dữ liệu đầy đủ, thời gian lâu hơn |
| Product chậm quá timeout | `latencyMs: 1500` (timeout 1000) | Hết thời gian chờ → `product: null`, `partial: true`, thời gian xấp xỉ timeout |
| Product lỗi | `error: true` | `product: null`, `partial: true`, trả ngay |

Trang hiển thị phần thiếu bằng dấu "—"; không hiển thị tên hay giá thay thế.

## 7. Đo lường

### 7.1 Tên chuẩn
- Biến thể: `baseline`, `bff`, `graphql-naive` (`DATALOADER=off`), `graphql-fixed` (`DATALOADER=on`).
- Client: `web`, `mobile`. Kích thước: `S`, `L`. Chế độ: `cold`, `warm`.
- Cấu hình cần đo: 4 × 2 × 2 = **16**, mỗi cái 1 lần lạnh + 5 lần ấm.

### 7.2 Định nghĩa các chỉ số
| Chỉ số | Cách đếm |
|---|---|
| **Số request từ client** | Hàm bọc `apiFetch` trong trang đếm các lời gọi tới 4001–4005. **Không tính** `/_metrics`, `/_metrics/reset`, `/health`, tệp tĩnh và ảnh. Ảnh `thumbnail` **không được tải** (chỉ hiển thị chuỗi/`alt`), vì ảnh sẽ làm sai số request |
| **DB query, service call từng service** | `GET /_metrics` của từng service sau mỗi lần chạy; `POST /_metrics/reset` ở tất cả service **trước** mỗi lần chạy. "Service call" của User/Order/Product = `requests`; BFF và GraphQL cũng báo `requests` riêng (`dbQueries` luôn 0) |
| **Thời gian màn hình hoàn tất** | `t0` = `performance.now()` lúc bấm "Tải"; `t1` = ngay sau lần cập nhật DOM cuối, khi **mọi đơn đã hiển thị đủ tên product** (hoặc "—" nếu lỗi một phần); đánh dấu bằng `performance.mark('screen-complete')`. Dùng chung cho trang web và trang mobile |
| **Payload** | Tổng `byteLength` của thân phản hồi nhận được ở client (`arrayBuffer`), cộng mọi lời gọi tính ở mục "số request" |

### 7.3 Quy trình
1. **Lạnh:** dừng rồi khởi động lại User, Order, Product, BFF, GraphQL (không khởi động lại Postgres), chờ `/health`, rồi chạy **lần 1**. Ghi riêng, ghi rõ là lạnh.
2. **Ấm:** **5 lần** tiếp theo trong cùng phiên trang; mỗi lần reset bộ đếm. `fetch` dùng `cache: 'no-store'`.
3. Báo **median và [min, max]** của 5 lần ấm; lần lạnh báo riêng.
4. Giữ **nguyên** dữ liệu, trường hiển thị và chế độ chạy giữa các biến thể. Một máy, tab ở nền trước, không chạy việc nặng khác.
5. Ngưỡng 5 lần là đề xuất của bài, ghi vào giới hạn phép đo.

### 7.4 Dạng kết quả thô (mỗi lần chạy một bản ghi, lưu tại `results/raw/`)
```json
{"variant":"bff","client":"web","size":"L","mode":"warm","run":3,
 "clientRequests":1,"payloadBytes":0,"completeMs":0,"partial":false,
 "services":{"user":{"requests":1,"dbQueries":1},"order":{"requests":1,"dbQueries":2},
             "product":{"requests":1,"dbQueries":1},"bff":{"requests":1,"dbQueries":0}}}
```
(Các số `0` là chỗ trống minh họa, không phải kết quả.)

### 7.5 Số kỳ vọng tính tay (để kiểm tra nhanh, **không phải kết quả đo**)
Đo thật mới là bằng chứng. Nếu số đo lệch khỏi bảng này, hãy tìm nguyên nhân thay vì sửa bảng.

| Biến thể / client | Request client | Gọi User | Gọi Order (DB) | Gọi Product (DB) |
|---|---:|---:|---:|---:|
| baseline web, S | 17 | 1 | 1 (2) | 15 (15) |
| baseline web, L | 202 | 1 | 1 (2) | 200 (200) |
| baseline mobile, S | 16 | 0 | 1 (2) | 15 (15) |
| baseline mobile, L | 201 | 0 | 1 (2) | 200 (200) |
| bff / graphql-fixed, web | 1 | 1 | 1 (2) | **1** (1) |
| bff / graphql-fixed, mobile | 1 | 0 | 1 (2) | **1** (1) |
| graphql-naive, web, S / L | 1 | 1 | 1 (2) | 15 / 200 (15 / 200) |
| graphql-naive, mobile, S / L | 1 | 0 | 1 (2) | 15 / 200 (15 / 200) |

Điều kiện đạt: ở `graphql-fixed` số call tới Product **không tăng theo số đơn** (S và L đều là 1).

## 8. Log và trace (cho "trace N+1" và "call graph BFF")

Mỗi service ghi **một dòng JSON mỗi lời gọi nghiệp vụ** ra stdout; `start-all.sh` ghi stdout của từng service vào `services/logs/<service>.log` (xem [ADR 0009](../../decisions/0009-log-stdout-moc-do-sau-co.md)):
```json
{"ts":"...","service":"product","requestId":"...","method":"GET","path":"/products/8","status":200,"ms":31}
```
- Trace N+1 = lọc `product.log` theo `requestId` của một request GraphQL: ngây thơ ra N dòng, đã sửa ra 1 dòng.
- Call graph BFF = các dòng cùng `requestId` ở User, Order, Product.

## 9. Bộ đối chiếu dữ liệu

Với cùng người dùng 1 và cùng kích thước:
- **Web:** dữ liệu ghép từ baseline (ghép như trang web) = phần thân BFF web = `data` GraphQL web, sau khi bỏ `partial` và `errors`. Thứ tự đơn theo `id`, item theo thứ tự trong đơn.
- **Mobile:** BFF mobile và GraphQL mobile chỉ được có **đúng** các khóa: `orders[].id`, `orders[].status`, `orders[].items[].product.name`, `orders[].items[].product.thumbnail`. Mọi khóa khác là lỗi. Giá trị phải trùng với phần tương ứng của web.
- Kịch bản lỗi một phần: `product` là `null` ở đúng các item bị ảnh hưởng, `partial` là `true`, không có tên hay giá giả.

## 10. Bàn giao

Mỗi luồng giao **một gói thư mục nguyên vẹn** (qua Drive hoặc git), đặt đúng đường dẫn:

| Luồng | Đường dẫn trong repo | Gói phải kèm |
|---|---|---|
| User + Order | `services/user/`, `services/order/` | README lệnh chạy; seed S và L; ảnh chụp `curl` mẫu đúng mục 3 |
| Product | `services/product/` | README; seed S và L; chứng minh `ids=` chỉ tốn 1 truy vấn; thử `_fault` cả ba chế độ |
| BFF + trang web | `services/bff/`, `web/` | README; hai endpoint đúng mục 4; hai trang (web và mobile) có công tắc chế độ |
| GraphQL | `services/graphql/` | README; hai query; log cho thấy N+1 khi `off` và 1 lời gọi khi `on` |
| Bộ đo + đối chiếu + tài liệu | `services/measure.mjs`, `web/measure-client.js`, `tests/`, `docs/` | README chạy lại toàn bộ; mẫu bảng kết quả |

**Khi người tổng hợp nhận gói:** giải nén đúng đường dẫn, `npm install`, khởi động, rồi chạy nhanh các lệnh `curl` trong README của gói để kiểm tra khớp mục 3/4/5 trước khi tích hợp. Một script kiểm tra tự động theo hợp đồng sẽ làm việc này nhanh hơn; nó chưa được viết.

## 11. Các điểm còn mở (cần bạn xác nhận hoặc hỏi giảng viên)

1. "Mỗi service một CSDL riêng" có nghĩa 3 database trong cùng một Postgres là đủ không?
2. Baseline gọi Product **mỗi item một lần** (không loại trùng). Nếu muốn baseline mạnh hơn (loại trùng ở client) thì bảng 7.5 đổi.
3. Policy lỗi "trả một phần" và timeout 1000 ms là lựa chọn của người soạn.
4. Khi User hoặc Order lỗi: hiện chọn `502` toàn bộ, ngoài phạm vi.
5. Bỏ tổng tiền khỏi hợp đồng (trang tự tính để hiển thị) để việc đếm lời gọi Product không bị nhân đôi ở GraphQL ngây thơ.
6. Có được mang mã chuẩn bị sẵn và dùng thư viện GraphQL/batching sẵn không (đã được cho phép theo bạn, ghi lại để chắc).
