# Bảng đo thô (từ `results/raw`)

Tạo bởi `node services/tools/report.mjs`. Mỗi ô ấm là **median [min–max]** của các lần chạy ấm; lần lạnh báo riêng. 96 bản ghi.

## Cách đếm
- **Request client** và **payload**: hàm bọc `fetch` trong trang đếm các lời gọi tới cổng 4001–4005, không tính `/health`, `/_metrics`, `/_fault`, tệp tĩnh; payload là tổng byte thân phản hồi (nén tắt). Ảnh thumbnail không được tải (chỉ là chuỗi).
- **Service call / DB query của từng service**: `/_metrics` của service, reset trước mỗi lần chạy, đọc sau khi xong. BFF và GraphQL chỉ báo `requests` (không có DB).
- **Thời gian hoàn tất**: từ lúc bắt đầu tải đến sau lần cập nhật DOM cuối (mọi đơn đã hiển thị đủ tên product), `performance.mark('screen-complete')`. Không gồm thời gian reset/đọc metrics/lưu kết quả.
- **Lạnh**: lần chạy đầu sau khi khởi động lại các service (không khởi động lại Postgres); **ấm**: các lần sau trong cùng phiên.

## Dữ liệu S · client web

| Biến thể | Lạnh: ms / req / byte | Ấm: ms | Ấm: request client | Ấm: byte | user req/DB | order req/DB | product req/DB | bff req | graphql req | Lần ấm | Một phần |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 712 / 17 / 5093 | 655 [647–662] | 17 | 5093 | 1 / 1 | 1 / 2 | 15 / 15 | 0 | 0 | 5 | 0 |
| bff | 144 / 1 / 1670 | 80 [73–83] | 1 | 1670 | 1 / 1 | 1 / 2 | 1 / 1 | 1 | 0 | 5 | 0 |
| graphql-naive | 209 / 1 / 1651 | 98 [87–102] | 1 | 1651 | 1 / 1 | 1 / 2 | 15 / 15 | 0 | 1 | 5 | 0 |
| graphql-fixed | 166 / 1 / 1651 | 85 [83–89] | 1 | 1651 | 1 / 1 | 1 / 2 | 1 / 1 | 0 | 1 | 5 | 0 |

## Dữ liệu S · client mobile

| Biến thể | Lạnh: ms / req / byte | Ấm: ms | Ấm: request client | Ấm: byte | user req/DB | order req/DB | product req/DB | bff req | graphql req | Lần ấm | Một phần |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 647 / 16 / 5059 | 608 [594–611] | 16 | 5059 | 0 / 0 | 1 / 2 | 15 / 15 | 0 | 0 | 5 | 0 |
| bff | 144 / 1 / 1523 | 81 [76–86] | 1 | 1523 | 0 / 0 | 1 / 2 | 1 / 1 | 1 | 0 | 5 | 0 |
| graphql-naive | 228 / 1 / 1504 | 104 [95–108] | 1 | 1504 | 0 / 0 | 1 / 2 | 15 / 15 | 0 | 1 | 5 | 0 |
| graphql-fixed | 172 / 1 / 1504 | 84 [79–85] | 1 | 1504 | 0 / 0 | 1 / 2 | 1 / 1 | 0 | 1 | 5 | 0 |

## Dữ liệu L · client web

| Biến thể | Lạnh: ms / req / byte | Ấm: ms | Ấm: request client | Ấm: byte | user req/DB | order req/DB | product req/DB | bff req | graphql req | Lần ấm | Một phần |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 7706 / 202 / 66964 | 7516 [7503–7549] | 202 | 66964 | 1 / 1 | 1 / 2 | 200 / 200 | 0 | 0 | 5 | 0 |
| bff | 157 / 1 / 20124 | 90 [81–93] | 1 | 20124 | 1 / 1 | 1 / 2 | 1 / 1 | 1 | 0 | 5 | 0 |
| graphql-naive | 424 / 1 / 20105 | 205 [196–289] | 1 | 20105 | 1 / 1 | 1 / 2 | 200 / 200 | 0 | 1 | 5 | 0 |
| graphql-fixed | 179 / 1 / 20105 | 88 [87–97] | 1 | 20105 | 1 / 1 | 1 / 2 | 1 / 1 | 0 | 1 | 5 | 0 |

## Dữ liệu L · client mobile

| Biến thể | Lạnh: ms / req / byte | Ấm: ms | Ấm: request client | Ấm: byte | user req/DB | order req/DB | product req/DB | bff req | graphql req | Lần ấm | Một phần |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 7609 / 201 / 66930 | 7478 [7451–7512] | 201 | 66930 | 0 / 0 | 1 / 2 | 200 / 200 | 0 | 0 | 5 | 0 |
| bff | 159 / 1 / 19332 | 86 [84–89] | 1 | 19332 | 0 / 0 | 1 / 2 | 1 / 1 | 1 | 0 | 5 | 0 |
| graphql-naive | 435 / 1 / 19313 | 225 [204–278] | 1 | 19313 | 0 / 0 | 1 / 2 | 200 / 200 | 0 | 1 | 5 | 0 |
| graphql-fixed | 178 / 1 / 19313 | 92 [82–96] | 1 | 19313 | 0 / 0 | 1 / 2 | 1 / 1 | 0 | 1 | 5 | 0 |

## Từng lần chạy (thô)

| Cấu hình | Chế độ | Lần | ms | Request client | Byte | Một phần | user req/DB | order req/DB | product req/DB | bff req | graphql req |
|---|---|---:|---:|---:|---:|---|---|---|---|---:|---:|
| L/mobile/baseline | lạnh | 1 | 7609 | 201 | 66930 | không | 0/0 | 1/2 | 200/200 | 0 | 0 |
| L/mobile/baseline | ấm | 1 | 7512 | 201 | 66930 | không | 0/0 | 1/2 | 200/200 | 0 | 0 |
| L/mobile/baseline | ấm | 2 | 7507 | 201 | 66930 | không | 0/0 | 1/2 | 200/200 | 0 | 0 |
| L/mobile/baseline | ấm | 3 | 7472 | 201 | 66930 | không | 0/0 | 1/2 | 200/200 | 0 | 0 |
| L/mobile/baseline | ấm | 4 | 7451 | 201 | 66930 | không | 0/0 | 1/2 | 200/200 | 0 | 0 |
| L/mobile/baseline | ấm | 5 | 7478 | 201 | 66930 | không | 0/0 | 1/2 | 200/200 | 0 | 0 |
| L/mobile/bff | lạnh | 1 | 159 | 1 | 19332 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| L/mobile/bff | ấm | 1 | 86 | 1 | 19332 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| L/mobile/bff | ấm | 2 | 89 | 1 | 19332 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| L/mobile/bff | ấm | 3 | 84 | 1 | 19332 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| L/mobile/bff | ấm | 4 | 88 | 1 | 19332 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| L/mobile/bff | ấm | 5 | 84 | 1 | 19332 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| L/mobile/graphql-naive | lạnh | 1 | 435 | 1 | 19313 | không | 0/0 | 1/2 | 200/200 | 0 | 1 |
| L/mobile/graphql-naive | ấm | 1 | 273 | 1 | 19313 | không | 0/0 | 1/2 | 200/200 | 0 | 1 |
| L/mobile/graphql-naive | ấm | 2 | 278 | 1 | 19313 | không | 0/0 | 1/2 | 200/200 | 0 | 1 |
| L/mobile/graphql-naive | ấm | 3 | 210 | 1 | 19313 | không | 0/0 | 1/2 | 200/200 | 0 | 1 |
| L/mobile/graphql-naive | ấm | 4 | 204 | 1 | 19313 | không | 0/0 | 1/2 | 200/200 | 0 | 1 |
| L/mobile/graphql-naive | ấm | 5 | 225 | 1 | 19313 | không | 0/0 | 1/2 | 200/200 | 0 | 1 |
| L/mobile/graphql-fixed | lạnh | 1 | 178 | 1 | 19313 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| L/mobile/graphql-fixed | ấm | 1 | 91 | 1 | 19313 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| L/mobile/graphql-fixed | ấm | 2 | 96 | 1 | 19313 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| L/mobile/graphql-fixed | ấm | 3 | 92 | 1 | 19313 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| L/mobile/graphql-fixed | ấm | 4 | 93 | 1 | 19313 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| L/mobile/graphql-fixed | ấm | 5 | 82 | 1 | 19313 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| L/web/baseline | lạnh | 1 | 7706 | 202 | 66964 | không | 1/1 | 1/2 | 200/200 | 0 | 0 |
| L/web/baseline | ấm | 1 | 7549 | 202 | 66964 | không | 1/1 | 1/2 | 200/200 | 0 | 0 |
| L/web/baseline | ấm | 2 | 7548 | 202 | 66964 | không | 1/1 | 1/2 | 200/200 | 0 | 0 |
| L/web/baseline | ấm | 3 | 7503 | 202 | 66964 | không | 1/1 | 1/2 | 200/200 | 0 | 0 |
| L/web/baseline | ấm | 4 | 7516 | 202 | 66964 | không | 1/1 | 1/2 | 200/200 | 0 | 0 |
| L/web/baseline | ấm | 5 | 7504 | 202 | 66964 | không | 1/1 | 1/2 | 200/200 | 0 | 0 |
| L/web/bff | lạnh | 1 | 157 | 1 | 20124 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| L/web/bff | ấm | 1 | 93 | 1 | 20124 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| L/web/bff | ấm | 2 | 90 | 1 | 20124 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| L/web/bff | ấm | 3 | 91 | 1 | 20124 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| L/web/bff | ấm | 4 | 88 | 1 | 20124 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| L/web/bff | ấm | 5 | 81 | 1 | 20124 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| L/web/graphql-naive | lạnh | 1 | 424 | 1 | 20105 | không | 1/1 | 1/2 | 200/200 | 0 | 1 |
| L/web/graphql-naive | ấm | 1 | 289 | 1 | 20105 | không | 1/1 | 1/2 | 200/200 | 0 | 1 |
| L/web/graphql-naive | ấm | 2 | 205 | 1 | 20105 | không | 1/1 | 1/2 | 200/200 | 0 | 1 |
| L/web/graphql-naive | ấm | 3 | 228 | 1 | 20105 | không | 1/1 | 1/2 | 200/200 | 0 | 1 |
| L/web/graphql-naive | ấm | 4 | 200 | 1 | 20105 | không | 1/1 | 1/2 | 200/200 | 0 | 1 |
| L/web/graphql-naive | ấm | 5 | 196 | 1 | 20105 | không | 1/1 | 1/2 | 200/200 | 0 | 1 |
| L/web/graphql-fixed | lạnh | 1 | 179 | 1 | 20105 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |
| L/web/graphql-fixed | ấm | 1 | 97 | 1 | 20105 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |
| L/web/graphql-fixed | ấm | 2 | 88 | 1 | 20105 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |
| L/web/graphql-fixed | ấm | 3 | 92 | 1 | 20105 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |
| L/web/graphql-fixed | ấm | 4 | 87 | 1 | 20105 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |
| L/web/graphql-fixed | ấm | 5 | 87 | 1 | 20105 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |
| S/mobile/baseline | lạnh | 1 | 647 | 16 | 5059 | không | 0/0 | 1/2 | 15/15 | 0 | 0 |
| S/mobile/baseline | ấm | 1 | 594 | 16 | 5059 | không | 0/0 | 1/2 | 15/15 | 0 | 0 |
| S/mobile/baseline | ấm | 2 | 611 | 16 | 5059 | không | 0/0 | 1/2 | 15/15 | 0 | 0 |
| S/mobile/baseline | ấm | 3 | 610 | 16 | 5059 | không | 0/0 | 1/2 | 15/15 | 0 | 0 |
| S/mobile/baseline | ấm | 4 | 608 | 16 | 5059 | không | 0/0 | 1/2 | 15/15 | 0 | 0 |
| S/mobile/baseline | ấm | 5 | 604 | 16 | 5059 | không | 0/0 | 1/2 | 15/15 | 0 | 0 |
| S/mobile/bff | lạnh | 1 | 144 | 1 | 1523 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| S/mobile/bff | ấm | 1 | 81 | 1 | 1523 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| S/mobile/bff | ấm | 2 | 82 | 1 | 1523 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| S/mobile/bff | ấm | 3 | 80 | 1 | 1523 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| S/mobile/bff | ấm | 4 | 86 | 1 | 1523 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| S/mobile/bff | ấm | 5 | 76 | 1 | 1523 | không | 0/0 | 1/2 | 1/1 | 1 | 0 |
| S/mobile/graphql-naive | lạnh | 1 | 228 | 1 | 1504 | không | 0/0 | 1/2 | 15/15 | 0 | 1 |
| S/mobile/graphql-naive | ấm | 1 | 104 | 1 | 1504 | không | 0/0 | 1/2 | 15/15 | 0 | 1 |
| S/mobile/graphql-naive | ấm | 2 | 108 | 1 | 1504 | không | 0/0 | 1/2 | 15/15 | 0 | 1 |
| S/mobile/graphql-naive | ấm | 3 | 99 | 1 | 1504 | không | 0/0 | 1/2 | 15/15 | 0 | 1 |
| S/mobile/graphql-naive | ấm | 4 | 95 | 1 | 1504 | không | 0/0 | 1/2 | 15/15 | 0 | 1 |
| S/mobile/graphql-naive | ấm | 5 | 104 | 1 | 1504 | không | 0/0 | 1/2 | 15/15 | 0 | 1 |
| S/mobile/graphql-fixed | lạnh | 1 | 172 | 1 | 1504 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| S/mobile/graphql-fixed | ấm | 1 | 83 | 1 | 1504 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| S/mobile/graphql-fixed | ấm | 2 | 85 | 1 | 1504 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| S/mobile/graphql-fixed | ấm | 3 | 84 | 1 | 1504 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| S/mobile/graphql-fixed | ấm | 4 | 84 | 1 | 1504 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| S/mobile/graphql-fixed | ấm | 5 | 79 | 1 | 1504 | không | 0/0 | 1/2 | 1/1 | 0 | 1 |
| S/web/baseline | lạnh | 1 | 712 | 17 | 5093 | không | 1/1 | 1/2 | 15/15 | 0 | 0 |
| S/web/baseline | ấm | 1 | 655 | 17 | 5093 | không | 1/1 | 1/2 | 15/15 | 0 | 0 |
| S/web/baseline | ấm | 2 | 659 | 17 | 5093 | không | 1/1 | 1/2 | 15/15 | 0 | 0 |
| S/web/baseline | ấm | 3 | 647 | 17 | 5093 | không | 1/1 | 1/2 | 15/15 | 0 | 0 |
| S/web/baseline | ấm | 4 | 662 | 17 | 5093 | không | 1/1 | 1/2 | 15/15 | 0 | 0 |
| S/web/baseline | ấm | 5 | 648 | 17 | 5093 | không | 1/1 | 1/2 | 15/15 | 0 | 0 |
| S/web/bff | lạnh | 1 | 144 | 1 | 1670 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| S/web/bff | ấm | 1 | 80 | 1 | 1670 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| S/web/bff | ấm | 2 | 83 | 1 | 1670 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| S/web/bff | ấm | 3 | 80 | 1 | 1670 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| S/web/bff | ấm | 4 | 78 | 1 | 1670 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| S/web/bff | ấm | 5 | 73 | 1 | 1670 | không | 1/1 | 1/2 | 1/1 | 1 | 0 |
| S/web/graphql-naive | lạnh | 1 | 209 | 1 | 1651 | không | 1/1 | 1/2 | 15/15 | 0 | 1 |
| S/web/graphql-naive | ấm | 1 | 98 | 1 | 1651 | không | 1/1 | 1/2 | 15/15 | 0 | 1 |
| S/web/graphql-naive | ấm | 2 | 102 | 1 | 1651 | không | 1/1 | 1/2 | 15/15 | 0 | 1 |
| S/web/graphql-naive | ấm | 3 | 87 | 1 | 1651 | không | 1/1 | 1/2 | 15/15 | 0 | 1 |
| S/web/graphql-naive | ấm | 4 | 102 | 1 | 1651 | không | 1/1 | 1/2 | 15/15 | 0 | 1 |
| S/web/graphql-naive | ấm | 5 | 95 | 1 | 1651 | không | 1/1 | 1/2 | 15/15 | 0 | 1 |
| S/web/graphql-fixed | lạnh | 1 | 166 | 1 | 1651 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |
| S/web/graphql-fixed | ấm | 1 | 87 | 1 | 1651 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |
| S/web/graphql-fixed | ấm | 2 | 89 | 1 | 1651 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |
| S/web/graphql-fixed | ấm | 3 | 85 | 1 | 1651 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |
| S/web/graphql-fixed | ấm | 4 | 85 | 1 | 1651 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |
| S/web/graphql-fixed | ấm | 5 | 83 | 1 | 1651 | không | 1/1 | 1/2 | 1/1 | 0 | 1 |

## Giới hạn phép đo
- Cùng một máy chạy cả service, DB và trình duyệt; độ trễ mỗi service là **giả lập cố định** (LATENCY_MS), nên chênh lệch tuyệt đối không phản ánh môi trường thật.
- Chỉ khởi động lại ứng dụng khi đo lạnh; cache của Postgres và hệ điều hành vẫn còn.
- Ngưỡng 5 lần ấm là đề xuất của bài tập, không phải quy chuẩn; mẫu nhỏ nên khoảng [min–max] quan trọng hơn median.
- "Hoàn tất" là DOM đã cập nhật xong, không bảo đảm trình duyệt đã vẽ xong.
