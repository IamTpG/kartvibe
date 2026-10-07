# Sân thử Block 2 (baseline)

> **Đây là sân thử để học và đo, không phải yêu cầu của giảng viên.** Kịch bản dưới đây là phỏng đoán, chưa xác nhận với giảng viên. Mã nằm trên nhánh `lab/block-02-03`, không thuộc `api` và có thể bỏ đi bất cứ lúc nào.

Mục đích: có sẵn một dashboard "chậm có chủ đích" để tự đo bốn chỉ số của Block 2 (request từ browser, truy vấn DB, lần gọi service, thời gian) trước khi làm BFF hoặc GraphQL, rồi so sánh trước/sau. Ghi chú lý thuyết: [docs/blocks/block-02](../docs/blocks/block-02/README.md).

## Kịch bản

Dashboard của một người dùng cần ba nguồn dữ liệu và gọi **tuần tự**:

```
browser ──▶ user    GET /users/1
        ──▶ order   GET /orders?userId=1        (các đơn, mỗi đơn có items [{productId, quantity}])
        ──▶ product GET /products/:id           (một lời gọi cho MỖI item, không dedupe)
```

Với dữ liệu mặc định (20 đơn × 3 item) có 62 request tuần tự: 1 (user) + 1 (orders) + 60 (product).

| Thành phần | Thư mục | Cổng | Schema DB | Endpoint |
|---|---|---|---|---|
| User Service | `services/user` | 4001 | `user_svc` | `GET /users/:id` |
| Order Service | `services/order` | 4002 | `order_svc` | `GET /orders?userId=` |
| Product Service | `services/product` | 4003 | `product_svc` | `GET /products/:id` |
| Dashboard | `web` | 4000 | | trang tĩnh `index.html` |

Mỗi service còn có `GET /health`, `GET /_metrics` (`{ requests, dbQueries }`) và `POST /_metrics/reset`. Cố ý **không** có endpoint lấy nhiều sản phẩm cùng lúc, để bài toán N+1 còn nguyên. JSON dùng `camelCase` (khác với `api` dùng `snake_case`).

Mỗi service chỉ truy cập schema của mình và không có khóa ngoại giữa các schema (mỗi service sở hữu dữ liệu của nó). Cả ba dùng chung một database `kartvibe_lab` trong container `kartvibe-postgres`.

## Chạy

Cần container Postgres đang chạy (xem [README gốc](../README.md)) và database `kartvibe_lab`:

```bash
docker exec kartvibe-postgres psql -U postgres -c "CREATE DATABASE kartvibe_lab"   # chỉ lần đầu
cd services
npm install          # cài cho cả ba service (npm workspaces)
npm run seed         # nạp dữ liệu (idempotent: drop và tạo lại 3 schema)
bash start-all.sh    # chạy nền user, order, product, web; log ở services/.run/
```

Mở http://localhost:4000, bấm "Tải dashboard" và xem tab Network của DevTools (waterfall). Dừng bằng `bash stop-all.sh` (xóa luôn `.run/`).

Chạy từng service thủ công: `cd services/user && npm run dev` (tương tự `order`, `product`); web: `cd web && npm start`. Type-check: `npm run build` trong `services/`.

## Đo

```bash
cd services
node measure.mjs                 # mặc định 5 lần, in từng lần và trung vị
node measure.mjs --runs 10 --user-id 1
```

`measure.mjs` chạy đúng luồng tuần tự của trang web, reset bộ đếm trước mỗi lần. Để thêm cách gọi mới (ví dụ BFF), thêm một hàm vào đối tượng `modes` trong file rồi chạy `--mode <tên>`.

| Chỉ số | Cách tính |
|---|---|
| `browserRequests` | Số request client gửi đi (đếm phía client) |
| `dbQueries` | Tổng truy vấn DB của ba service (đếm trong wrapper `pg`) |
| `serviceCalls` | Tổng request mà ba service xử lý (không tính `/health`, `/_metrics`) |
| `ms` | Thời gian cả luồng, đo bằng `performance.now()` |

Hiện `browserRequests` bằng `serviceCalls` vì browser gọi thẳng service. Khi có BFF, hai số này sẽ tách ra.

### Baseline đã đo (20 đơn × 3 item, độ trễ 50 ms)

| Chỉ số | Đo được (trung vị 5 lần) | Phép tính tay |
|---|---:|---|
| `browserRequests` | 62 | 1 + 1 + 60 |
| `dbQueries` | 63 | 1 (user) + 2 (order: đơn, rồi item) + 60 (product) |
| `serviceCalls` | 62 | bằng số request |
| `ms` | ~3414 | 62 × (50 ms trễ giả + ~5 ms xử lý) |

Quy mô khác cho kết quả tuyến tính: 5 đơn (15 item) cho 17 / 18 / 17 / ~937 ms; 40 đơn (120 item) cho 122 / 123 / 122 / ~6652 ms.

## Đổi quy mô và độ trễ

Biến môi trường (không cần file `.env`, các service không đọc `.env`):

| Biến | Mặc định | Dùng ở | Ý nghĩa |
|---|---|---|---|
| `ORDERS` | 20 | seed | Số đơn |
| `ITEMS_PER_ORDER` | 3 | seed | Số item mỗi đơn (không lớn hơn `PRODUCTS`) |
| `PRODUCTS` | 30 | seed | Số sản phẩm |
| `LATENCY_MS` | 50 | service | Độ trễ giả mỗi request nghiệp vụ |
| `LAB_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5434/kartvibe_lab` | seed, service | Kết nối DB |
| `PORT` | 4001-4003 / 4000 | service, web | Cổng |

Ví dụ: `ORDERS=40 npm run seed`; `LATENCY_MS=100 bash start-all.sh`. Dữ liệu sinh bằng hạt giống cố định nên chạy lại cho cùng kết quả; sản phẩm được tham chiếu nhiều lần giữa các đơn (với mặc định: 26 sản phẩm khác nhau cho 60 item), đây là điều cần cho việc gom lời gọi sau này. Đổi quy mô rồi chạy lại `npm run seed` là đủ, không cần khởi động lại service.

## Hạn chế

- Đơn giản hơn thực tế: một người dùng, không đăng nhập, dữ liệu nhỏ, độ trễ cố định. Số liệu chỉ có ý nghĩa để **so sánh trước/sau**, không phải con số tuyệt đối.
- Ba service dùng chung một database (khác schema) cho tiện; thực tế mỗi service thường có DB riêng.
- Trang web chỉ kiểm tra bằng cách chạy logic JavaScript của nó với DOM giả; chưa mở bằng trình duyệt thật.
