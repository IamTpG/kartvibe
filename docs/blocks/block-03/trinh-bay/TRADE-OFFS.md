# Trade-off: các quyết định (bản nháp rút gọn để review)

Mỗi quyết định theo dạng **Vấn đề, các lựa chọn, ưu và nhược**. Lựa chọn A luôn là cái nhóm **đã chọn**. Chỉ dùng các phương án đã ghi trong `PLAN.md` hoặc ADR 0012; những phương án do tôi tự đề xuất đã bỏ khỏi phần chính.

**Đề xuất:**
- **Phần 1 (6 quyết định quan trọng)** là nội dung cho slide Trade-off. Chúng bám các yêu cầu chấm của đề: lỗi thiếu hàng, field mới và client cũ, deadline, so sánh công bằng, đo payload.
- **Phần 2 (8 quyết định còn lại)** chỉ để trong tài liệu cho giảng viên xem thêm, không đưa lên slide.

---

# Phần 1. Quyết định quan trọng (đưa lên slide)

## 1. Thiếu hàng (D4, D5)

**Vấn đề:** Gửi tín hiệu "hết hàng" từ Inventory sang Order thế nào để Client vẫn nhận 409 ở cả hai đường REST và gRPC?

- **A. gRPC: `FAILED_PRECONDITION` kèm metadata `x-error-code: OUT_OF_STOCK`; REST: 409 (đã chọn)**
  + Đối xứng với REST 409: cùng ra 409 ở ngoài.
  + Dùng cơ chế lỗi của gRPC; reply chỉ chứa dữ liệu khi thành công (không cần field trạng thái).
  − Phải tự quy ước thêm khóa `x-error-code` (gRPC không có mã `OUT_OF_STOCK`).
- **B. Trả thành công, báo hết hàng bằng field trong reply, ví dụ `reserved=false` (cả REST lẫn gRPC)**
  + Không cần quy ước khóa metadata tự đặt; mọi thứ nằm trong reply.
  − Reply phải có thêm field trạng thái; hai đường xử lý hai kiểu; lỗi lẫn với thành công (status vẫn `OK`).

## 2. Field mới `available` (D6, D7)

**Vấn đề:** Làm sao phân biệt `available = 0` (còn 0 hàng) với trường hợp server không gửi `available`?

- **A. `optional`; khi vắng thì ghi `absent`, không suy ra 0 (đã chọn)**
  + Phân biệt được "bằng 0" và "không có thông tin".
  − Client phải xử lý thêm trường hợp vắng.
- **B. Không `optional`, vắng được hiểu là 0**
  + Đơn giản.
  − Server cũ bị hiểu thành "hết hàng".

## 3. Giữ nguyên package proto

**Vấn đề:** File phiên bản 2 đặt ở package nào để client cũ vẫn chạy?

- **A. Giữ nguyên package `kartvibe.inventory` cho cả hai phiên bản (đã chọn)**
  + Địa chỉ lời gọi không đổi, client cũ vẫn gọi được.
  − Tương thích ở mức dây chưa chắc tương thích nghiệp vụ.
- **B. Đặt phiên bản 2 ở package khác**
  + Tách hẳn hai phiên bản.
  − Client cũ không gọi được (đã thử); phải chạy song song hai package.

## 4. Quá hạn mà hàng vẫn bị giữ (D8, D14)

**Vấn đề:** Order đặt deadline 500 ms rồi bỏ cuộc, nhưng Inventory vẫn xử lý xong và giữ hàng. Xử lý thế nào?

- **A. Deadline 500 ms, không bù trừ, chỉ ghi log (đã chọn)**
  + Mọi request kết thúc trong thời gian hữu hạn; đơn giản, đúng phạm vi bài.
  − Hàng bị giữ mà không có đơn, và không có cách nhả.
- **B. Bù trừ (hoàn hàng) hoặc idempotency**
  + Không để hàng bị giữ vô ích.
  − Cần cơ chế bù trừ và idempotency; ngoài phạm vi (Block 7 và Block 9).

## 5. Hai bản Order để so sánh (D13)

**Vấn đề:** Làm sao để khác biệt giữa REST và gRPC ở chặng 2 chỉ do giao thức?

- **A. Hai tiến trình Order cùng mã nguồn, chọn giao thức lúc khởi động (đã chọn)**
  + Khác biệt chỉ có thể do giao thức; log tách theo tên tiến trình.
  − Nhiều tiến trình, dùng chung database nên kịch bản phải chạy tuần tự.
- **B. Một bản Order, chọn giao thức theo từng request (flag)**
  + Chỉ một tiến trình.
  − Thêm đường điều khiển ẩn vào API ngoài, vi phạm nguyên tắc giữ nguyên chặng 1.

## 6. Đo payload (D11)

**Vấn đề:** So sánh kích thước dữ liệu REST và gRPC bằng đại lượng nào cho công bằng?

- **A. Lớp 1: message đã serialize (JSON body so với message Protobuf) (đã chọn)**
  + Cùng một đại lượng cho cả hai bên, đúng yêu cầu của đề.
  − Không phải byte trên dây (không có header, khung HTTP/2).
- **B. Wire bytes (lớp 3)**
  + Sát thực tế mạng.
  − Header HTTP/1.1 và HTTP/2 làm chênh lệch khó diễn giải; cần bắt gói.

---

# Phần 2. Các quyết định còn lại (chỉ để tham khảo)

| Vấn đề | Đã chọn | Phương án khác | Ghi chú |
|---|---|---|---|
| **Công cụ gRPC cho Node (D9)** | `@grpc/grpc-js` + `grpc-tools` + `ts-proto` (có bước sinh code) | `@grpc/proto-loader` (không sinh code); `buf` hoặc `protoc` cài ngoài npm | Có sinh code thật nên có lỗi compile để quan sát; đổi lại phải ghim phiên bản công cụ |
| **Giữ hàng nguyên tử** | Một câu `UPDATE ... WHERE available >= q` trong transaction | (gợi ý) đọc rồi ghi; `SELECT ... FOR UPDATE` | Không thể bán vượt tồn kho khi nhiều request đồng thời; dựa vào mức cô lập mặc định (READ COMMITTED), chỉ một SKU mỗi lần |
| **Kiểm dữ liệu** | Hai tầng: Order kiểm hình dạng, Inventory kiểm miền giá trị | (gợi ý) Order kiểm tất cả; chỉ Inventory kiểm | Nhánh `INVALID_ARGUMENT` thành 400 chạy được đầu cuối; đổi lại luật nằm ở hai nơi |
| **Server cũ `inventory-v1`** | Server tối thiểu trong bộ nhớ, build từ proto v1, đóng băng | Bỏ qua (đề ghi "nếu còn thời gian") | Đủ để quan sát field vắng; không phải Inventory thật |
| **Log Inventory** | Ghi log khi kết thúc phản hồi, kể cả khi Client đã bỏ cuộc | Cách ban đầu thiếu dòng cho request bị bỏ cuộc | Thấy được hàng đã bị giữ sau khi Order trả 504 |
| **Kênh gRPC sau khi Inventory khởi động lại** | Để nguyên mặc định, dùng lại một kênh | (gợi ý) chỉnh backoff; tạo kênh mới mỗi lần gọi | Vài lần gọi đầu trả 503; REST không bị. ADR ghi đây là hệ quả, không phải một quyết định riêng |
| **Database cho Inventory (D2)** | Database riêng `kartvibe_inventory` | Lưu trong bộ nhớ | Khớp mô hình mỗi service một database |
| **Nơi đặt code (D1)** | `services/` | `api/`; làm riêng rồi tích hợp sau | Có sẵn khung log, health, hợp đồng; công thấp nhất |

Các ô nhãn "(gợi ý)" là phương án tôi tự thêm, nhóm chưa ghi lại hay thử.

---

## Cần bạn xác nhận

1. Phần 1 (6 quyết định) có đúng là các quyết định quan trọng không, hay muốn thay một vài cái?
2. Slide Trade-off hiện có 4 slide (cách kiểm chứng, thêm field, báo lỗi hết hàng, chậm hoặc lỗi). Mapping đề xuất:
   - Quyết định 1 là slide "Báo lỗi hết hàng".
   - Quyết định 2 và 3 là slide "Thêm field".
   - Quyết định 4 là slide "Chậm hoặc lỗi".
   - Quyết định 5 là slide "Cách nhóm kiểm chứng".
   - Quyết định 6 (đo payload) chưa có slide; có thể thêm một slide hoặc gộp vào slide "Bằng chứng".
3. Phần 2 để trong tài liệu (file này, hoặc chuyển vào `REPORT.md`): bạn muốn đặt ở đâu cho giảng viên dễ thấy?
