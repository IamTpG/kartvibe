# Block 2: API composition (User, Order, Product + BFF + GraphQL)

Ba service REST (mỗi service một database riêng), hai cách ghép dữ liệu ở server (BFF và GraphQL) và hai trang web (dashboard, mobile) để so với baseline là trình duyệt gọi trực tiếp rồi tự ghép. Giải thích lựa chọn của nhóm: [`REPORT.md`](REPORT.md) (bản HTML: [`REPORT.html`](REPORT.html)).

## Nội dung

```
README.md  REPORT.md  REPORT.html
services/     năm service (user, order, product, bff, graphql), công cụ kiểm tra và đo (tools/), start-all.sh
web/          trang dashboard và mobile, bộ chạy đo trong trang
results/      bằng chứng: evidence/ (bảng đo, trace N+1, call graph, waterfall), verification/ (đối chiếu, lỗi), raw/ (96 lần đo gốc)
docs/blocks/block-02/   Plan, hợp đồng chung, ghi chú trình bày, sơ đồ
```

## Yêu cầu

- Node.js 22 trở lên (đã chạy trên 24) và npm.
- Docker (chỉ để chạy Postgres 17).
- Các cổng 4000 đến 4005, 4010 và 5434 còn trống.

## Chạy

```bash
# 1. Postgres (một lần). Ba database của các service do start-all.sh tự tạo.
docker run -d --name kartvibe-postgres -e POSTGRES_PASSWORD=postgres -p 5434:5432 postgres:17

# 2. Năm service (terminal 1)
cd services
npm install
npm run start:measure        # kèm độ trễ giả 30 ms và /_fault của Product, cần cho demo lỗi và các kiểm tra
npm run seed:s               # dữ liệu nhỏ (5 đơn, 15 item); npm run seed:l cho dữ liệu lớn (50 đơn, 200 item)

# 3. Trang web (terminal 2)
cd web
npm start                    # http://localhost:4000/dashboard.html
```

Mở http://localhost:4000/dashboard.html (hoặc `/mobile.html`), chọn chế độ (Baseline REST, BFF, GraphQL DataLoader tắt, GraphQL đã sửa), bấm **Tải dữ liệu**. Trang hiện số request của client, payload, thời gian hoàn tất và bảng số liệu phía từng service. Ba nút ở cuối làm Product bình thường, chậm 1500 ms hoặc lỗi 500.

Dừng: `bash stop-all.sh` trong `services/`, và Ctrl+C ở terminal web. `bash start-all.sh` chạy năm service không có độ trễ giả và không có `/_fault`.

## Kiểm tra (trong `services/`, khi đã `start:measure` và `seed:s`)

| Lệnh | Kiểm tra |
|---|---|
| `npm run check -- --size S` | Cả năm service đúng hợp đồng (80 kiểm tra) |
| `npm run check:equality` | Baseline = BFF = GraphQL cho web và mobile; mobile chỉ có trường mobile |
| `npm run check:live -- S on --faults` | Đối chiếu và kịch bản Product chậm hoặc lỗi |
| `npm run contracts:check` | `openapi.json` và kiểu sinh ra khớp với mã |
| `npm run test:tools` | Test của bộ đo và của hợp đồng |
| `npm run trace -- --size S` | Dựng trace N+1 và call graph BFF từ log thật vào `results/evidence/` |

## Đo lại (tùy chọn)

`npm run matrix` trong `services/` chạy 16 cấu hình (4 biến thể × 2 client × 2 cỡ dữ liệu), mỗi cấu hình 1 lần lạnh + 5 lần ấm, bằng trình duyệt mặc định. Giữ cửa sổ trình duyệt ở nền trước và không làm việc khác trong lúc chạy. Nếu `results/raw/` đã có dữ liệu thì thêm `--clean` (kết quả cũ được chuyển sang thư mục sao lưu, không xóa). Xong chạy `npm run report` để tạo lại `results/evidence/measurements.md`. Chi tiết: [`services/README.md`](services/README.md) và [`services/tools/README.md`](services/tools/README.md).

## Lưu ý

- Toàn bộ dữ liệu là giả; mật khẩu Postgres `postgres`/`postgres` chỉ dùng cục bộ. Không có file `.env` nào trong thư mục này; mỗi service có `.env.example`, không bắt buộc sao chép.
- Độ trễ mỗi service là giả lập cố định và mọi thứ chạy trên một máy, nên chênh lệch tuyệt đối trong bảng đo không phản ánh môi trường thật. Xem mục "Giới hạn" trong [`REPORT.md`](REPORT.md).
