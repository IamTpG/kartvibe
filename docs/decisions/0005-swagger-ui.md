# 0005. Dùng Swagger UI làm giao diện tài liệu API

- **Trạng thái:** chấp nhận
- **Nguồn:** Block 1

## Quyết định
Trang `/docs` dùng `swagger-ui-express`; spec tại `/openapi.json`.

## Lý do
Phổ biến nhất, cho phép thử request trực tiếp trên trình duyệt, tiện demo và nghiệm thu. `/docs` chạy được là yêu cầu bàn giao.

## Các lựa chọn đã cân nhắc
| Lựa chọn | Lý do không chọn |
|---|---|
| Scalar | UX hiện đại, cũng thử request được, nhưng nhóm ít quen hơn Swagger UI. |
| Redoc | Đẹp, dễ đọc nhưng không thử request được trên trình duyệt; bất lợi khi demo trực tiếp. |
