# Web (`web`): dashboard, mobile và so sánh Order

## Cấu trúc

```
web/
  server.mjs                 server tĩnh: chỉ phục vụ các tệp trong public/ (quét lúc khởi động); thêm /_logs khi ENABLE_TEST_HOOKS=1
  logs.mjs                   tra log của service theo requestId (cho /_logs; test ở test/logs.test.mjs)
  public/
    dashboard.html mobile.html order-compare.html
    css/style.css
    js/app.js                tải dữ liệu ba chế độ và vẽ
    js/demo.js               bảng số liệu phía service, lịch sử so sánh, nút lỗi Product
    js/order-compare.js      trang order-compare: gửi cùng một POST /orders tới các bản Order, điều khiển Inventory
    js/order-compare-logic.js chuẩn hóa, so sánh phản hồi và tóm tắt dòng log (hàm thuần; test ở test/order-compare-logic.test.mjs)
    measure/measure-client.js  bộ đo dùng chung cho trình duyệt và Node (tools/ import tệp này)
    measure/runner.js        bảng chạy đo trong trang
```

Thêm tệp `.html`, `.js`, `.css` vào `public/` là đủ, không phải sửa server.

## Kiểm tra cú pháp và trang tĩnh ngay

Web là một server tĩnh nhỏ, chạy riêng khỏi các service (không do `start-all.sh` chạy). Từ gốc workspace:

```sh
node --check web/public/js/app.js
node --check web/server.mjs
node --check web/logs.mjs
cd web
npm start
```

Log của web (một dòng khi khởi động) ra terminal đang chạy nó, không ghi vào `services/logs`.

Mở hai URL dưới đây. Nếu các service 4001–4005 chưa chạy, trang vẫn phải mở và nút **Tải dữ liệu** phải hiện thông báo lỗi kết nối rõ ràng; chưa thể kiểm tra dữ liệu hay số đo.

- `http://localhost:4000/dashboard.html` — dữ liệu web đầy đủ.
- `http://localhost:4000/mobile.html` — bản gọn, chỉ mã/trạng thái đơn và tên/thumbnail product.

## Kiểm tra đủ ba chế độ khi các service đã chạy

Khởi động User `4001`, Order `4002`, Product `4003`, BFF `4004` và GraphQL `4005` theo README tương ứng. Mở từng trang, giữ `User ID = 1`, chọn chế độ rồi bấm **Tải dữ liệu**:

| Chế độ | Dashboard web | Mobile | Điều cần kiểm tra |
|---|---:|---:|---|
| Baseline REST, bộ dữ liệu S | 17 request | 16 request | Waterfall tuần tự: User (chỉ web) → Order → 15 Product |
| BFF | 1 request | 1 request | Nội dung giống baseline; mobile không có user, giá, số lượng, ngày tạo |
| GraphQL | 1 request | 1 request | Nội dung giống baseline/BFF; bật `DATALOADER=off` rồi `on` ở GraphQL để so N+1 |

Các số trên là **kỳ vọng tính từ hợp đồng**, không phải kết quả đo. Với bộ dữ liệu L, baseline kỳ vọng 202 request web và 201 request mobile. Nếu số thực tế khác, ghi lại số thực tế và tìm nguyên nhân.

Để xem waterfall và mốc hoàn tất: mở DevTools → Network, bật **Disable cache**, tải lại trang rồi bấm **Tải dữ liệu**. Lọc theo cổng 4001–4005 để bỏ file tĩnh và các lệnh metrics. Trong Console, chạy `performance.getEntriesByName('screen-complete').at(-1)` để xem mark của lượt vừa tải. Ô chỉ số trên trang hiện request, byte payload và thời gian từ lúc bấm đến khi DOM render xong. Ở mobile, thumbnail là chuỗi văn bản nên không tạo request ảnh.

Nếu Product lỗi/chậm quá timeout, trang BFF/GraphQL phải hiện trạng thái **Một phần** và dấu `—` ở product thiếu. Baseline có thể hiện lỗi toàn lượt vì nó gọi trực tiếp từng Product; đây là hành vi hiện tại của trang baseline.

## Cách trang đo và tích hợp với bộ đo

Mỗi trang có ba chế độ: baseline REST, BFF, GraphQL. Baseline gọi tuần tự từng product, kể cả ID lặp. Mobile baseline không gọi User vì trang không dùng dữ liệu đó. GraphQL gửi hai query trong hợp đồng; để so N+1, khởi động GraphQL với `DATALOADER=off` hoặc `on`.

Nút **Tải dữ liệu** đếm request nghiệp vụ và số byte thân phản hồi ở browser. Mốc `performance.mark('screen-complete')` được đặt sau khi DOM đã render tất cả đơn/product. Bản mobile chỉ in chuỗi URL thumbnail, không tải ảnh. Bộ đo có thể gọi `window.Dashboard.loadDashboard()` và nhận `{data, clientRequests, payloadBytes, completeMs, partial}`. Hỗ trợ `?mode=bff&userId=1&auto=1`.

Các URL service dùng hostname của trang và cổng 4001–4005 theo hợp đồng. Để đo, đặt tab ở foreground, tắt cache trong DevTools, reset metrics của từng service trước mỗi lượt và không tính việc tải file tĩnh.

## Trang `order-compare.html`

Gửi **cùng một** `POST /orders` tới các bản Order (REST `4002`, gRPC `4012`, gRPC cũ `4022` nếu đang chạy), tuần tự, rồi hiện status, body và thời gian đo ở trình duyệt (chỉ để tham khảo). Kết luận **GIỐNG NHAU** hoặc **KHÁC** sau khi thay `orderId`; cột bắt buộc không trả lời thì tính là KHÁC. Mở http://localhost:4000/order-compare.html (sau `npm start`).

- Trang gọi **Order** (có CORS) và ba hook của **Inventory** (`POST :4006/_reset` nạp lại tồn kho, `POST :4006/_fault` làm chậm, `POST :4006/_shutdown` tắt cả REST và gRPC; nút **Tắt Inventory** hỏi xác nhận và trang không bật lại được, phải chạy lại `LATENCY_MS=0 npm run start:measure` trong `services/`), nên cần `ENABLE_TEST_HOOKS=1` (`npm run start:measure` trong `services/`). Các bản Order dùng chung tồn kho: bấm "Nạp lại tồn kho" trước mỗi lần thử.
- Phản hồi ở trên **không chứng minh** giao thức bên trong là gRPC; chỉ log chứng minh được. Vì vậy mỗi cột có khung **Bên trong (từ log)**: trang gọi `GET /_logs?requestId=…` của `web/server.mjs` (đọc các `services/logs/*.log` theo `requestId`, `LOG_DIR` đổi được thư mục) và hiện các dòng của Order và Inventory (`protocol`, `grpcStatus` hoặc status, `errorCode`, `clientVersion`, `available`). Endpoint này **chỉ bật khi chạy `ENABLE_TEST_HOOKS=1 npm start`** (không có thì trả 404 và trang báo cách bật). Dòng log Inventory của request quá hạn tới muộn hơn: bấm **Làm mới log**. Khung này không thay bằng chứng ở `results/block-03/`.
- Test của tra log: `node --test web/test/logs.test.mjs`.
- Test của hàm so sánh: `node --test web/test/order-compare-logic.test.mjs` (Node báo cảnh báo `MODULE_TYPELESS_PACKAGE_JSON`, vô hại; đừng thêm `"type": "module"` vào `web/package.json` vì `measure-client.js` dùng chung với Node dưới dạng CommonJS).
