# Sơ đồ Block 3 (archify)

Mười một file HTML tự đứng một mình (mở thẳng bằng trình duyệt): một sơ đồ kiến trúc, chín luồng (mỗi luồng một file) và một sơ đồ ER. Mười file đầu vẽ bằng archify (nguồn JSON ở `nguon/`); sơ đồ ER (`11-...`) **vẽ tay bằng SVG**, vì archify không có loại ER và node của nó không chứa được danh sách cột; nó không qua `validate` hay `visual-check` của archify (chỉ được chụp bằng Chrome để xem ở 1440×900, sáng và tối). Sơ đồ này có nút **Chế độ sáng/tối** ở góc phải: mặc định giao diện sáng (không theo hệ thống), lựa chọn được nhớ trong `localStorage` của trình duyệt.

| File | Nội dung |
|---|---|
| `01-kien-truc.html` | Kiến trúc: ba bản Order, Inventory, hai database, server cũ, trang web |
| `02-luong-du-hang-rest.html` | Đặt hàng đủ hàng, Order gọi Inventory bằng REST |
| `03-luong-du-hang-grpc.html` | Đặt hàng đủ hàng, Order gọi Inventory bằng gRPC |
| `04-luong-het-hang.html` | Hết hàng: `FAILED_PRECONDITION` kèm `x-error-code` hoặc REST 409, cùng ra 409 |
| `05-luong-du-lieu-sai.html` | Dữ liệu sai: validate hai tầng (Order, Inventory) |
| `06-luong-inventory-cham-qua-han.html` | Inventory chậm, Order quá hạn nhưng hàng vẫn bị giữ (D14) |
| `07-luong-inventory-tat.html` | Inventory tắt: 503 trong thời gian hữu hạn |
| `08-luong-inventory-bat-lai.html` | Inventory bật lại: kênh gRPC hồi phục chậm hơn REST |
| `09-luong-client-cu-server-moi.html` | Client cũ (proto v1) gọi server mới (proto v2) |
| `10-luong-client-moi-server-cu.html` | Client mới (proto v2) gọi server cũ (proto v1): field vắng |
| `11-er-co-so-du-lieu.html` | ER: `stock`, `reservations` (database `kartvibe_inventory`) và `purchase_orders` (database `kartvibe_order`); các quan hệ là tham chiếu logic, hệ thống không có khóa ngoại nào |

Mã tương ứng và cách chạy: [`../../../ARCHITECTURE.md`](../../../ARCHITECTURE.md) (mục "Đặt hàng"), [`../../../../services/README.md`](../../../../services/README.md).

## Dựng lại

Cần skill `archify` (`~/.claude/skills/archify`). Sửa JSON trong `nguon/` rồi chạy (từ thư mục này):

```bash
A=~/.claude/skills/archify/bin/archify.mjs
node $A deliver architecture nguon/01-kien-truc.json 01-kien-truc.html --quality showcase --json
node $A deliver sequence nguon/03-luong-du-hang-grpc.json 03-luong-du-hang-grpc.html --quality showcase --json   # tương tự cho các luồng
```

Ghi chú: nội dung viết bằng tiếng Việt; vì skill chỉ hỗ trợ giao diện người xem bằng tiếng Anh và tiếng Trung, thanh công cụ của trình xem (Light, Present, Export...) hiển thị tiếng Anh.
