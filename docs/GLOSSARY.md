# Glossary

Thuật ngữ dùng trong tài liệu và mã. Cột "Trong mã" cho biết tên tương ứng trong API hoặc database.

## Nghiệp vụ

| Thuật ngữ | Trong mã | Ý nghĩa |
|---|---|---|
| Sản phẩm | `products` | Mặt hàng có thể bán |
| SKU | `sku` | Mã sản phẩm, duy nhất (ví dụ `SKU-001`) |
| Đang bán | `is_active = true` | Sản phẩm được liệt kê và được thêm vào giỏ. Ngừng bán thì không |
| Tồn kho | `stock` | Số lượng còn trong kho. Hiện **không bị trừ** khi thêm vào giỏ |
| Giỏ hàng | `carts` | Tập các sản phẩm khách chọn mua |
| Mục trong giỏ (item) | `cart_items` | Một dòng gồm sản phẩm và số lượng. Mỗi sản phẩm tối đa một dòng trong một giỏ |
| Giỏ mở | `status = open` | Giỏ còn cho phép thêm, sửa, xóa item |
| Giỏ đã checkout | `status = checked_out` | Giỏ đã chốt: vẫn đọc được, mọi thao tác ghi bị từ chối. Chưa có chức năng checkout, trạng thái này hiện chỉ có trong dữ liệu seed |
| Checkout | chưa có | Chốt giỏ thành đơn hàng; sẽ trừ tồn kho |
| Tổng phụ (subtotal) | `subtotal_cents` | Của item: `price_cents × quantity`. Của giỏ: tổng các item. Không lưu DB, tính lại mỗi lần |
| Cent | `*_cents` | Tiền lưu bằng số nguyên theo đơn vị nhỏ nhất, tránh sai số số thực |

## API

| Thuật ngữ | Ý nghĩa |
|---|---|
| Error contract | Định dạng cố định của mọi lỗi: `code`, `message`, `details`, `request_id`. Xem [CONVENTIONS](../api/docs/CONVENTIONS.md) |
| `request_id` | UUID do server sinh cho mỗi request; có ở header `X-Request-Id`, body lỗi và log |
| Validation tầng 1 (schema) | Kiểm tra định dạng request, không chạm DB; sai thì 400 |
| Validation tầng 2 (nghiệp vụ) | Kiểm tra quy tắc có chạm DB; trả lỗi đầu tiên theo thứ tự |
| Code-first | Viết Zod schema trong mã rồi sinh OpenAPI từ đó, thay vì viết spec trước. Xem [ADR 0002](decisions/0002-code-first-zod-openapi.md) |
| Handler / service / repository | Ba lớp trong một module: HTTP, nghiệp vụ, truy vấn DB |

## Dữ liệu và kiểm thử

| Thuật ngữ | Ý nghĩa |
|---|---|
| Seed | Dữ liệu mẫu nạp vào DB; idempotent (xóa rồi nạp lại) |
| Fixture / alias | Bản ghi seed có tên gọi cố định để test tham chiếu (`SP1`..`SP5`, `CART_CLOSED`); alias không phải cột DB |
| Reset | Xóa schema, migrate lại, seed lại. Xóa dữ liệu |
| Nghiệm thu (evidence) | Chạy bộ test Postman bằng newman để chứng minh hành vi; xem [TESTING](../api/docs/TESTING.md) |
| Row lock | Khóa dòng bằng `SELECT ... FOR UPDATE` để các thao tác trên cùng một giỏ chạy tuần tự. Xem [ADR 0008](decisions/0008-row-lock-cart.md) |
| Race condition | Hai thao tác đồng thời cho kết quả sai do xen kẽ |

## Giao tiếp giữa service (REST và gRPC)

| Thuật ngữ | Ý nghĩa |
|---|---|
| gRPC | Gọi hàm từ xa chạy trên HTTP/2, dùng Protobuf; trình duyệt không gọi trực tiếp được. Xem [ADR 0012](decisions/0012-rest-browser-grpc-noi-bo.md) |
| Protobuf (`.proto`) | Ngôn ngữ mô tả message và service, cùng định dạng nhị phân; từ file `.proto` sinh code cho cả hai phía |
| Field number (tag) | Số định danh field trên dây; tên field không nằm trong payload. Đổi số hoặc kiểu field là thay đổi phá vỡ |
| Presence | Biết một field đã được đặt hay chưa; `optional` cho presence, nên `0` và vắng phân biệt được |
| Deadline | Thời điểm tối đa client chờ một lời gọi gRPC; quá hạn thì client nhận `DEADLINE_EXCEEDED` |
| Trailing metadata | Cặp key-value đi kèm kết quả lời gọi gRPC (ở đây `x-error-code`) |
| Wire-compatible / business-compatible | Giải mã được với nhau (wire) khác với hiểu giống nhau (nghiệp vụ); Protobuf chỉ bảo đảm vế đầu |
| Client cũ | Client build từ proto trước khi thêm field và không build lại; vẫn phải chạy với server mới |

## Quy trình tài liệu

| Thuật ngữ | Ý nghĩa |
|---|---|
| Block | Một đơn vị nội dung của môn học; mỗi buổi gồm 2 block. Các block được thực hiện riêng nên thêm hoặc bớt block không ảnh hưởng tới các block khác |
| ADR | Architecture Decision Record: một quyết định kỹ thuật, một file, có trạng thái |
| Tài liệu gốc | Tài liệu phản ánh trạng thái hiện tại; mã tuân theo nó |
| Bản chụp (snapshot) | Nguyên bản tài liệu của một block, không sửa sau khi chốt |
