# Decisions (ADR)

Mỗi quyết định kỹ thuật là một file `NNNN-tên-ngắn.md`. Khi đổi ý, viết ADR mới và đánh dấu ADR cũ là "bị thay thế"; không sửa hay xóa lịch sử.

Trạng thái: đề xuất · chấp nhận · bị thay thế bởi NNNN

| # | Quyết định | Trạng thái |
|---|---|---|
| [0001](0001-express-tsx.md) | Node.js + Express, chạy TypeScript bằng tsx | chấp nhận |
| [0002](0002-code-first-zod-openapi.md) | Hợp đồng API code-first: Zod + zod-to-openapi | chấp nhận |
| [0003](0003-prisma.md) | Prisma làm ORM | chấp nhận |
| [0004](0004-logging-pino-request-id.md) | Logging pino-http, stdout, `request_id` | chấp nhận |
| [0005](0005-swagger-ui.md) | Swagger UI cho tài liệu API | chấp nhận |
| [0006](0006-feature-based-structure.md) | Tổ chức mã theo domain | chấp nhận |
| [0007](0007-postman-newman-evidence.md) | Bằng chứng nghiệm thu bằng Postman + newman | chấp nhận |
| [0008](0008-row-lock-cart.md) | Khóa dòng cart khi sửa giỏ hàng | chấp nhận |
| [0009](0009-log-stdout-moc-do-sau-co.md) | Log ra stdout, gom ngoài mã sản phẩm; móc đo và test sau cờ môi trường | chấp nhận |
| [0010](0010-mot-repo-hai-du-an-doc-lap.md) | Một repo, hai dự án độc lập (`api` và `services` + `web`) | chấp nhận |
| [0011](0011-hop-dong-openapi-do-service-so-huu.md) | Hợp đồng do từng service sở hữu: Zod → OpenAPI 3.1, bên tiêu thụ sinh kiểu từ spec | chấp nhận |
