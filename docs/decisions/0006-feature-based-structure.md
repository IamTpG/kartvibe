# 0006. Tổ chức mã theo domain (vertical / feature-based)

- **Trạng thái:** chấp nhận
- **Nguồn:** Block 1

## Quyết định
Mỗi domain tự chứa các lớp của nó (`routes`, `handler`, `service`, `repository`). Phần dùng chung ở `shared/`, schema và OpenAPI ở `openapi/`.

```
api/src/
  products/ carts/           mỗi thư mục: *.routes, *.handler, *.service, *.repository
                             (carts gồm cả mục trong giỏ: /carts/:id/items)
  shared/                    middleware, errors, db
  openapi/                   schemas/, registry.ts
```

## Lý do
Project chắc chắn có thêm domain ở các block sau (đăng nhập, checkout, thanh toán). Thêm domain là thêm thư mục, không đụng code cũ.

## Các lựa chọn đã cân nhắc
| Lựa chọn | Lý do không chọn |
|---|---|
| Chiều ngang (`routes/`, `services/`, `handlers/`) | Khi thêm domain, mọi thư mục phình ra cùng lúc; làm một tính năng phải mở file ở nhiều thư mục. |

## Ghi chú
Cập nhật sau Block 1: ban đầu có module `items` riêng, nhưng nó import trực tiếp `service` và `repository` của `carts`. Vì mục trong giỏ chỉ có nghĩa bên trong giỏ (khóa chính chứa `cart_id`, route nằm dưới `/carts/:id`), `items` đã được gộp vào `carts`. Điều còn lại: schema zod vẫn nằm ngoài module (`src/openapi/schemas/`); xem xét khi thêm `orders`.
