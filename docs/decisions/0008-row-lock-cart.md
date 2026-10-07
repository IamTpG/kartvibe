# 0008. Khóa dòng cart (`SELECT ... FOR UPDATE`) khi sửa giỏ hàng

- **Trạng thái:** chấp nhận
- **Nguồn:** Block 1

## Quyết định
Trong transaction của `POST` và `PATCH` item, khóa dòng `carts` bằng `SELECT ... FOR UPDATE` để hai request đồng thời trên cùng một giỏ không chạy xen kẽ. Không khóa `FOR SHARE` trên `products`.

Lỗi DB lọt qua được map phòng thủ: `23505` → 409, `23503` → 422; `23514` và các lỗi khác → 500.

## Lý do
Tránh race condition khi hai request cùng cart kiểm tra rồi ghi.

## Ghi chú
Quyết định này chỉ giải quyết đồng thời trên **một cart**. Kiểm soát đồng thời trên tồn kho (nhiều giỏ cùng mua một sản phẩm) là vấn đề khác và sẽ cần ADR riêng khi tới block về đồng thời.
