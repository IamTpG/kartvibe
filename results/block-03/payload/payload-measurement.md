# Báo cáo đo Payload Lớp 1 (Serialized Message)

- **Thời điểm đo:** `2026-10-14T15:53:51.163Z`
- **Đại lượng đo:** Lớp 1 (Message đã serialize: JSON string bytes vs Protobuf binary bytes) theo D11 và W4.md.
- **Không bao gồm:** HTTP/1.1 hoặc HTTP/2 wire headers/framing (lớp 3).
- **Nguồn dữ liệu:** phản hồi thật của Inventory http://localhost:4006 (reservationId `RSV-1`).
- **Dữ liệu:** SKU = `"SKU-OK"`, quantity = `2`, reservationId = `"RSV-1"`, available = `8`.

## Bảng so sánh Payload (Request & Reply)

| Chiều | Giao thức / Định dạng | Payload đã serialize (bytes) | Các trường chứa trong payload | Chi tiết nội dung / JSON |
|---|---|---|---|---|
| **Request** | **REST (JSON)** | **29** | `sku`, `quantity` | `{"sku":"SKU-OK","quantity":2}` |
| **Request** | **Protobuf (v1 & v2)** | **10** | `sku` (tag 1), `quantity` (tag 2) | `ReserveRequest` binary |
| **Reply** | **REST (JSON)** | **25** | `reservationId` | `{"reservationId":"RSV-1"}` |
| **Reply** | **Protobuf v1** | **7** | `reservation_id` (tag 1) | `ReserveReply` (không có `available`) |
| **Reply** | **Protobuf v2** (có `available`) | **9** | `reservation_id` (tag 1), `available` (tag 2) | `ReserveReply` (có `available = 8`) |
| **Reply** | **Protobuf v2** (vắng `available`) | **7** | `reservation_id` (tag 1) | `ReserveReply` (field vắng - optional presence) |

## Nhận xét chi phí trường mới và khác biệt:

1. **Request:**
   - REST JSON mang tên trường `"sku"` và `"quantity"` dưới dạng chuỗi text: **29 bytes**.
   - Protobuf mã hóa tag số (1 byte tag + len chuỗi, 1 byte tag + varint quantity): **10 bytes**.
   - Protobuf Request tiết kiệm khoảng **65.5%** kích thước so với REST JSON.

2. **Reply:**
   - REST baseline: chỉ trả về `reservationId` (25 bytes).
   - Protobuf v1: chỉ gồm `reservation_id` (7 bytes).
   - Protobuf v2 (khi có `available = 8`): **9 bytes**.
   - Chi phí thêm trường `optional int32 available` trong Protobuf v2:
     - Thêm đúng **2 bytes** (1 byte tag 2 [field 2, wire type 0 = 0x10] + 1 byte varint giá trị 8).
     - Khi trường `available` vắng (`undefined`), Protobuf v2 chỉ tốn **7 bytes** (bằng đúng v1), chứng minh cơ chế presence không tốn dung lượng khi không truyền.
