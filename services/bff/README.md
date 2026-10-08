# BFF (`services/bff`)

## Kiểm tra ngay, không cần service thật

Từ gốc workspace:

```sh
cd services/bff
npm ci
npm run build
npm test
```

Kết quả đạt: TypeScript không báo lỗi và dòng cuối bắt đầu bằng `BFF integration passed:`. Test tự dựng User/Order/Product và BFF trên các cổng localhost tạm, rồi tự dừng. Nó kiểm tra:

| Tình huống | Kết quả cần thấy |
|---|---|
| Web dashboard | JSON có `user`, `orders`, `partial`, `errors` |
| Mobile orders | Không gọi User; mỗi order chỉ có `id`, `status`, `items`; product chỉ có `name`, `thumbnail` |
| ID product lặp | 3 item với 2 ID chỉ tạo một lời gọi `/products?ids=8,9` |
| Trace | Cả ba service nhận cùng `x-request-id` |
| Product trả 500 | `partial: true`, product là `null`, lỗi chứa `[8,9]` |
| Product quá timeout hoặc thiếu ID | Trả một phần; chỉ ID thiếu thành `null` nếu batch vẫn trả product khác |
| User/Order lỗi, user ID sai, đơn rỗng | Lần lượt trả 502, 400, và danh sách rỗng hợp lệ |
| Metrics BFF | 9 request nghiệp vụ, 0 DB query |

Test này xác nhận logic BFF trên dữ liệu giả lập; chưa phải bằng chứng đo toàn hệ thống hoặc CSDL thật.

## Chạy với service thật

Khởi động User `4001`, Order `4002`, Product `4003` theo README của các service đó. Sau đó, tại `services/bff`:

```sh
npm ci
npm start
```

Giữ terminal BFF đang chạy. Ở terminal khác:

```sh
curl 'http://localhost:4004/health'
curl 'http://localhost:4004/bff/web/dashboard?userId=1'
curl 'http://localhost:4004/bff/mobile/orders?userId=1'
curl 'http://localhost:4004/_metrics'
curl -X POST 'http://localhost:4004/_metrics/reset'
```

Kết quả cần thấy: health trả `{"status":"ok"}`; hai endpoint trả `partial:false` và `errors:[]` khi Product bình thường. Sau hai lần gọi nghiệp vụ, `/_metrics` trả `requests:2`, `dbQueries:0`; reset trả HTTP 204. Với cùng `x-request-id` trong log User/Order/Product, mỗi request BFF chỉ có một lời gọi Product dạng `/products?ids=...`. Mobile không tạo log User.

Để thử policy lỗi, chạy ở terminal khác:

```sh
curl -X POST 'http://localhost:4003/_fault' -H 'Content-Type: application/json' -d '{"latencyMs":0,"error":true}'
curl 'http://localhost:4004/bff/web/dashboard?userId=1'
curl -X POST 'http://localhost:4003/_fault' -H 'Content-Type: application/json' -d '{}'
```

Lần gọi BFF ở giữa phải có `partial:true`, `product:null`, `errors[0].code` là `PRODUCT_UNAVAILABLE`. Có thể thử quá thời gian chờ bằng fault `{"latencyMs":1500,"error":false}` rồi cũng xóa fault bằng `{}` sau khi kiểm tra.

## Hợp đồng và cấu hình

BFF nghe cổng `4004` (biến `PORT`). Có thể đổi URL nguồn bằng `USER_SERVICE_URL`, `ORDER_SERVICE_URL`, `PRODUCT_SERVICE_URL`. `PRODUCT_TIMEOUT_MS` mặc định `1000`; `UPSTREAM_TIMEOUT_MS` mặc định `5000`.

Web gọi User và Order song song. Mobile chỉ gọi Order. Sau đó BFF loại trùng product ID và gọi Product batch một lần. Nếu Product lỗi, quá thời gian chờ hoặc thiếu ID, các product tương ứng là `null`, `partial: true` và `errors` liệt kê ID bị ảnh hưởng. User/Order lỗi trả `502 UPSTREAM_ERROR`.

Mỗi request nghiệp vụ được ghi một dòng JSON ra stdout (`start-all.sh` ghi vào `services/logs/bff.log`). `x-request-id` được sinh nếu client không gửi và được chuyển xuống ba service để ghép call graph. Bộ đếm `/_metrics` chỉ tính hai route nghiệp vụ, không tính health hay metrics.

Call graph của một request: chạy `npm run trace` ở `services/`; công cụ đọc `{bff,user,order,product}.log` trong `LOG_DIR` (mặc định `services/logs`) theo `x-request-id` và ghi `results/evidence/call-graph-bff-<size>.md`.
