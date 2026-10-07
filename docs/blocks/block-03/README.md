# Block 3: REST và gRPC giữa các service

> **Đây là ghi chú chuẩn bị, chưa phải bản chụp nộp bài.** Nội dung dựa trên phần tóm tắt trong kế hoạch môn học; yêu cầu chi tiết của giảng viên có thể khác.

## Trạng thái xác nhận

| Điều chưa rõ | Đã xác nhận với giảng viên? |
|---|---|
| Inventory Service có sẵn hay nhóm tự dựng | chưa |
| Order gọi Inventory những thao tác nào (kiểm tra tồn kho, giữ hàng...) | chưa |
| Dùng thư viện/công cụ gRPC nào | chưa |
| "Kiểm tra client cũ" làm bằng cách nào | chưa |

## Kế hoạch ghi gì

- **Chủ đề:** REST cho browser, gRPC giữa các service.
- **Bài thực hành:** chuyển kết nối từ Order sang Inventory từ REST sang gRPC, giữ API cho browser. Thêm field, kiểm tra client cũ, so sánh payload và trải nghiệm phát triển.
- **Bằng chứng:** demo cùng một luồng nghiệp vụ qua REST ở browser và gRPC nội bộ; giải thích ưu điểm và giới hạn.
- **Kết luận kỹ thuật:** chọn giao thức theo nơi tích hợp và nhu cầu; API cho browser không cần dùng cùng giao thức với service nội bộ.

## Kịch bản phỏng đoán (chưa xác nhận)

Order Service cần biết tồn kho trước khi tạo đơn, nên gọi Inventory Service (ví dụ `CheckStock(sku)` hoặc `Reserve(sku, quantity)`). Hiện tại lời gọi này là REST/JSON; bài thực hành đổi nó sang gRPC trong khi browser vẫn gọi REST như cũ.

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

## Checklist khi duyệt kết quả của agent
- [ ] Hợp đồng `.proto` nằm ở một chỗ, và cả hai phía sinh code từ cùng file đó?
- [ ] Đã thử client cũ gọi server mới (và ngược lại) sau khi thêm field?
- [ ] Browser vẫn gọi REST như cũ, chỉ lời gọi nội bộ đổi sang gRPC?
- [ ] Có số liệu so sánh payload và nêu rõ điều kiện đo?
- [ ] Giải thích được giới hạn của gRPC trong bài toán này?

## Chuẩn bị trước (không phụ thuộc yêu cầu thật)
- [ ] Đọc khái niệm trên và tự trả lời 4 câu hỏi.
- [ ] Viết thử một file `.proto` nhỏ và sinh code (không gắn vào dự án).
- [ ] Làm thử một lần "thêm field" và quan sát hành vi của client cũ.
