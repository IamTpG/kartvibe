# Block 3: REST và gRPC giữa các service

Đề bài: `../w03/BT_Block 3_ REST va gRPC.html` và `block-03-rest-grpc.pdf` (ngoài repo, cạnh thư mục repo). Bài chuyển giao tiếp nội bộ giữa
Order API và Inventory Service từ REST sang gRPC, **giữ nguyên API mà browser dùng**, thêm một field vào schema, kiểm tra client cũ,
rồi quan sát payload và developer experience.

## Tài liệu của block

| File | Nội dung |
|---|---|
| [`PLAN.md`](PLAN.md) | Quyết định đã chốt (D1 đến D15, kèm phương án đã không chọn), hợp đồng chung, phân việc, truy vết tiêu chí của đề |
| [`REPORT.md`](REPORT.md) | Báo cáo: Problem, Solution, Demo, Evidence, Trade-off, giới hạn của phép đo |
| [`so-do/`](so-do/) | Sơ đồ kiến trúc và chín luồng (HTML tự đứng một mình, vẽ bằng archify) |
| [`giao-viec/`](giao-viec/) | Gói giao việc cho bốn thành viên (W1 đến W4), phần của team lead (W5) và script đóng gói |
| [`../../decisions/0012-rest-browser-grpc-noi-bo.md`](../../decisions/0012-rest-browser-grpc-noi-bo.md) | ADR: REST cho browser, gRPC giữa Order và Inventory |
| [`../../../results/block-03/`](../../../results/block-03/) | Bằng chứng; chạy lại bằng `results/block-03/chay-lai.sh` |

## Mã tương ứng

`services/inventory` (REST 4006, gRPC 4007), `services/order` (`order` 4002 và `order-grpc` 4012, cùng mã nguồn), `services/order-v1`
(client cũ, 4022, đóng băng), `services/inventory-v1` (server cũ, 4008), `services/proto` (hợp đồng gRPC), `services/tools/block3`
(kịch bản snapshot, lỗi, đo), `services/tools/compat` (kiểm client cũ/mới), `web/public/order-compare.html` (trang so sánh).
Sơ đồ: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md), mục "Đặt hàng". Cách chạy: [`../../../services/README.md`](../../../services/README.md).

## Trạng thái xác nhận

Yêu cầu lấy từ đề bài thật (không còn là phỏng đoán). Các điểm đề để nhóm tự quyết đã được chốt trong `PLAN.md`: cách biểu diễn thiếu hàng ở gRPC
(`FAILED_PRECONDITION` kèm `x-error-code`), field thêm vào (`optional int32 available = 2`), cách chứng minh client cũ (Order build từ proto v1, đóng băng
bằng hash), đại lượng đo payload (message đã serialize), công cụ gRPC (`grpc-tools`, `ts-proto`, `@grpc/grpc-js`, phiên bản ghim).

## Khái niệm

| Khái niệm | Ý nghĩa |
|---|---|
| HTTP/JSON (REST) | Văn bản JSON qua HTTP; dễ đọc, dễ thử bằng curl và browser |
| RPC | Gọi hàm từ xa như gọi hàm cục bộ; hợp đồng là danh sách hàm và kiểu dữ liệu |
| Protobuf | Định dạng nhị phân và ngôn ngữ mô tả hợp đồng (`.proto`); từ đó sinh code client và server |
| gRPC | RPC chạy trên HTTP/2, dùng Protobuf |
| Unary / streaming | Unary: một yêu cầu, một phản hồi. Streaming: server stream, client stream hoặc hai chiều |
| Schema evolution | Thay đổi hợp đồng theo thời gian mà không làm hỏng client cũ |

### Điểm cần nhớ về gRPC
- **Trình duyệt thường không gọi trực tiếp gRPC** được; cần lớp trung gian (gRPC-Web qua proxy) hoặc dùng REST. Đó là lý do "REST cho browser, gRPC giữa các service".
- Hợp đồng sinh code ở cả hai phía, nên sai kiểu bị phát hiện lúc biên dịch thay vì lúc chạy.
- gRPC có khái niệm **deadline** (thời hạn cho một lời gọi) và bộ **status code** riêng; hai điều này quay lại ở các block về timeout và resilience.

## Schema evolution với Protobuf

Trong Protobuf, danh tính của một field là **số thứ tự**, không phải tên. Hệ quả:

| Thay đổi | Tương thích? |
|---|---|
| Thêm field mới với số **mới** | Có. Client cũ bỏ qua field lạ; client mới gặp server cũ thấy giá trị mặc định |
| Đổi tên field (giữ số) | Có trên dây truyền, nhưng đổi tên có thể làm vỡ code sinh ra |
| Đổi **số** hoặc **kiểu** của field | Không. Dữ liệu bị hiểu sai |
| Xóa field rồi dùng lại số đó cho field khác | Không. Dùng `reserved` để cấm tái sử dụng |

Lưu ý: ở proto3, field thiếu có giá trị mặc định (0, chuỗi rỗng...), nên "không gửi" và "gửi 0" dễ lẫn nhau, trừ khi đánh dấu `optional`.

### So sánh với REST/JSON trong dự án này
Thêm field vào response JSON thường tương thích với client biết bỏ qua field lạ. Nhưng dự án hiện có bộ test nghiệm thu kiểm tra response giỏ hàng với `additionalProperties: false` (xem `api/evidence/build-collection.mjs`), nên **thêm field vào response `Cart` sẽ làm test hiện tại thất bại**. Đây là ví dụ thật về "client nghiêm ngặt vỡ khi server thêm field", đáng dùng khi trình bày.

## Cách so sánh payload và trải nghiệm phát triển

| Tiêu chí | Cách đo/đánh giá gợi ý |
|---|---|
| Kích thước payload | Cùng một dữ liệu: số byte JSON (ví dụ `curl -w '%{size_download}'`) so với số byte Protobuf đã mã hóa |
| Độ trễ | Cùng số lần gọi, cùng điều kiện; đo nhiều lần rồi lấy trung vị |
| Trải nghiệm phát triển | Bao nhiêu bước để thêm một field; lỗi kiểu bắt được ở đâu; công cụ debug (curl so với công cụ riêng của gRPC) |
| Khả năng quan sát | Đọc được request/response khi gỡ lỗi không |

Không nên kết luận về hiệu năng từ một lần chạy hay từ dữ liệu quá nhỏ.

## Câu hỏi tự kiểm tra

1. Vì sao browser vẫn dùng REST trong khi service nội bộ dùng gRPC?
2. Thêm một field vào message Protobuf thì client cũ còn chạy không? Đổi số của một field thì sao?
3. `reserved` dùng để làm gì?
4. Nêu hai lợi thế và hai giới hạn của gRPC so với REST/JSON.

<details><summary>Gợi ý trả lời</summary>

1. Trình duyệt không hỗ trợ gRPC gốc (cần gRPC-Web và proxy); REST/JSON thì mọi client đều dùng được và dễ debug.
2. Thêm field với số mới thì client cũ vẫn chạy (bỏ qua field lạ). Đổi số hoặc kiểu thì phá vỡ vì danh tính field nằm ở số.
3. Cấm tái sử dụng số hoặc tên của field đã xóa, để dữ liệu cũ không bị hiểu thành field khác.
4. Lợi thế: hợp đồng chặt và sinh code, payload nhỏ/nhanh hơn, có streaming. Giới hạn: không gọi trực tiếp từ browser, khó đọc và debug hơn, cần công cụ riêng.
</details>
