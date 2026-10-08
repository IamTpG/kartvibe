# Plan Block 2: API composition

> Viết **trước khi hiện thực BFF và GraphQL** (tạo lúc 2026-10-08 09:28, theo đồng hồ máy). Nhóm đã nhận hợp đồng chi tiết `hop-dong-chung.md` và kế hoạch `ke-hoach-65-phut.md` trước khi bắt đầu; Plan này ghi lại các quyết định đã chốt với agent. Mục "Chưa xác nhận" liệt kê những gì nhóm tự giả định.

## Quyết định đã chốt

| # | Quyết định | Nội dung |
|---|---|---|
| 1 | Dữ liệu | 3 database riêng (`kartvibe_user`, `kartvibe_order`, `kartvibe_product`) trong cùng một Postgres. Hai cấu hình: S (5 đơn × 3 item, 10 product) và L (50 đơn × 4 item, 30 product). Product lặp giữa các đơn; công thức sinh xác định (hợp đồng, mục 2) |
| 2 | Hợp đồng REST | `GET /users/:id`, `GET /orders?userId=`, `GET /products/:id`, `GET /products?ids=` (endpoint lấy nhiều, loại id trùng, một truy vấn) |
| 3 | BFF | Hai endpoint: `/bff/web/dashboard` và `/bff/mobile/orders`; User và Order gọi song song, Product gọi một lần với id đã loại trùng |
| 4 | GraphQL | Một endpoint `POST /graphql`, hai query (web, mobile). Hai trạng thái bằng công tắc `DATALOADER=off\|on`: ngây thơ (N+1) và đã sửa (batching + dedup trong một request, loader tạo mới cho mỗi request) |
| 5 | **Policy lỗi** | **Trả dữ liệu một phần có đánh dấu lỗi** cho cả BFF và GraphQL. `product` thành `null`; BFF thêm `partial: true` và `errors`; GraphQL dùng mảng `errors` với `extensions.code = PRODUCT_UNAVAILABLE`. Không điền tên hoặc giá giả. Timeout gọi Product 1000 ms. User hoặc Order lỗi thì lỗi toàn bộ (ngoài phạm vi) |
| 6 | Cách đếm | Request client: hàm bọc `fetch` đếm lời gọi API (không tính `/_metrics`, `/health`, tệp tĩnh, ảnh; ảnh không được tải). DB query và service call: bộ đếm `/_metrics` của từng service, reset trước mỗi lần chạy. Payload: tổng byte thân phản hồi, tắt nén |
| 7 | Màn hình hoàn tất | Từ lúc bấm tải đến lần cập nhật DOM cuối khi mọi đơn đã hiển thị đủ tên product (`performance.mark`), dùng chung cho trang web và trang mobile |
| 8 | Lạnh/ấm | Lạnh: khởi động lại các service (không khởi động lại Postgres), chạy lần 1. Ấm: 5 lần sau. Báo median và [min, max] |
| 9 | Đối chiếu dữ liệu | Baseline, BFF, GraphQL trả cùng dữ liệu dashboard; response mobile chỉ có `orders[].id`, `status`, `items[].product.name`, `items[].product.thumbnail` |
| 10 | Trace | `x-request-id` truyền từ BFF/GraphQL xuống service; mỗi service log JSON một dòng mỗi lời gọi; trace N+1 = lọc log Product theo `requestId` |

## Thứ tự hiện thực

Baseline → BFF → GraphQL (bản có N+1, rồi bản đã sửa) → đo → làm Product chậm/lỗi. Các luồng chạy song song theo hợp đồng; tích hợp và đo ở cuối.

## Chưa xác nhận (giả định của nhóm)

- Ba database trong cùng một server Postgres được coi là "mỗi service một CSDL riêng".
- Baseline gọi Product mỗi item một lần (không loại trùng ở client).
- Tổng tiền không nằm trong hợp đồng (trang tự tính để hiển thị).
- Ngưỡng 5 lần chạy là đề xuất của bài tập, không phải quy chuẩn.
- Trang mobile không gọi User Service vì danh sách đơn mobile không có thông tin người dùng.
