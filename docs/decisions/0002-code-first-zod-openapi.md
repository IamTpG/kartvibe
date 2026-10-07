# 0002. Hợp đồng API theo hướng code-first: Zod + zod-to-openapi

- **Trạng thái:** chấp nhận
- **Nguồn:** Block 1

## Quyết định
Mỗi endpoint có Zod schema cho body, query và path params. Cùng schema đó dùng để (1) validate request lúc chạy và (2) sinh OpenAPI 3.1 (`openapi.json`, trang `/docs`) bằng `@asteasolutions/zod-to-openapi`. Request sai bị chặn trước khi chạm DB.

## Lý do
Validation và spec xuất phát từ một nguồn nên không thể lệch nhau, đây là yêu cầu bắt buộc của Block 1. `zod-to-openapi` 9.x yêu cầu `zod ^4`, nên dùng zod 4.

## Các lựa chọn đã cân nhắc
| Lựa chọn | Lý do không chọn |
|---|---|
| Contract-first (`express-openapi-validator`) | Phải viết và duy trì YAML tay song song với code; dễ lệch khi quên cập nhật. |
| Joi + joi-to-swagger | Joi không sinh TypeScript types tự động; `joi-to-swagger` ít được bảo trì, chưa hỗ trợ OpenAPI 3.1. |
| tsoa (decorators) | Cần build step riêng, cấu hình phức tạp, quá mức cho bài tập. |

## Hệ quả
Khi thêm domain, schema nằm ở `api/src/openapi/schemas/` và phải đăng ký thêm vào `registry.ts`.
