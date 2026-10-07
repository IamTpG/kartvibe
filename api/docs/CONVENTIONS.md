# API conventions

Quy ước chung của `api`: định dạng request/response, định dạng lỗi, cách tổ chức mã. Quy tắc nghiệp vụ (khi nào trả lỗi nào) nằm ở [docs/domain](../../docs/domain/README.md); danh sách endpoint và schema chi tiết lấy từ `/openapi.json`.

## 1. Quy ước chung

- Body request và response là `application/json`.
- Mọi response, kể cả `204` và lỗi, có header `X-Request-Id: <uuid>`. Server luôn tự sinh, **bỏ qua** `X-Request-Id` client gửi lên.
- Request body không được có field lạ (`additionalProperties: false`): field lạ → 400. Response schema cũng không có field thừa, để kiểm tra khớp spec bắt được việc lộ field nội bộ (ví dụ `is_active`).
- Query param lạ cũng bị từ chối: `GET /products?page=2` → 400 (`field: "page"`).
- Không field nào trong request hay response được là `null`; gửi `null` → 400.
- Body không ép kiểu: `"quantity": "2"` → 400. Query param được ép kiểu từ chuỗi (`limit=20`).
- Tên field dùng `snake_case` trong JSON (`product_id`, `price_cents`).
- Tiền là số nguyên cent (`*_cents`), không dùng số thực.
- Giá luôn đọc từ DB; client không gửi `price_cents`.
- `POST` tạo mới trả `201`; `POST /carts` kèm header `Location`. `DELETE` thành công trả `204`, không body.

## 2. Error contract

Mọi lỗi, kể cả `500`, route không tồn tại và JSON hỏng, đều trả đúng dạng:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request không hợp lệ",
  "details": [{ "field": "quantity", "issue": "must be <= 10" }],
  "request_id": "7f3c2a9e-1b4d-4c8a-9e21-5d6f0a3b8c10"
}
```

| Field | Kiểu | Ghi chú |
|---|---|---|
| `code` | string (enum) | Client rẽ nhánh theo field này |
| `message` | string | Chỉ để hiển thị, câu chữ có thể đổi |
| `details` | `{ field, issue }[]` | Luôn là mảng; không có chi tiết thì `[]` |
| `request_id` | string (uuid) | Trùng `X-Request-Id` và dòng log của request |

`500` **không được** chứa stack trace, câu SQL, tên bảng hay message gốc của thư viện. Chi tiết chỉ ghi vào log.

### Mã lỗi ↔ HTTP status

Nguồn trong mã: `api/src/shared/errors.ts`.

| Mã lỗi | Status | `details` | Khi nào |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | mỗi lỗi schema một phần tử | Sai schema (body, path, query) |
| `CART_NOT_FOUND` | 404 | `[]` | `cartId` hợp lệ nhưng không có trong DB |
| `ITEM_NOT_FOUND` | 404 | `[]` | Sản phẩm không có trong giỏ (PATCH, DELETE), kể cả product không tồn tại |
| `ROUTE_NOT_FOUND` | 404 | `[]` | Đường dẫn ngoài các endpoint |
| `METHOD_NOT_ALLOWED` | 405 | `[]` | Method sai, ví dụ `PUT /carts` |
| `CART_CLOSED` | 409 | `[]` | Ghi vào cart `checked_out` |
| `ITEM_ALREADY_IN_CART` | 409 | `[]` | Sản phẩm đã có trong giỏ (POST) |
| `INSUFFICIENT_STOCK` | 409 | `[{ field: "quantity", issue }]` | `quantity > stock` (POST, PATCH) |
| `PRODUCT_UNAVAILABLE` | 422 | `[]` | `product_id` không tồn tại hoặc `is_active = false` (POST) |
| `INTERNAL_ERROR` | 500 | `[]` | Lỗi không lường trước (DB tắt, bug) |

Thêm mã lỗi mới: thêm vào `ErrorCode` và `DEFAULTS` trong `errors.ts`, vào bảng này, và vào schema lỗi của OpenAPI.

### `details` của `VALIDATION_ERROR`

`field` là đúng tên param hoặc field trong body (`quantity`, `product_id`, `cartId`, `productId`, `limit`, `offset`). Lỗi ở cấp cả body (JSON hỏng, thiếu body, sai Content-Type) dùng `field: "body"`. Lỗi của path, query và body được gộp vào một `VALIDATION_ERROR`.

| Trường hợp | `issue` |
|---|---|
| Thiếu field bắt buộc | `is required` |
| Field lạ | `is not allowed` |
| Sai kiểu | `must be integer` / `must be string` |
| Dưới min / trên max | `must be >= 1` / `must be <= 10` |
| Không phải UUID | `must be a valid UUID` |
| JSON hỏng | `must be valid JSON` |
| Sai Content-Type | `must be application/json` |

Lỗi của thư viện validator được ánh xạ sang định dạng trên, không để định dạng mặc định lọt ra. Test nghiệm thu chỉ nên so `code` và `field`; `issue` để người đọc.

## 3. Thứ tự xử lý lỗi

1. **Schema trước, không chạm DB.** Request sai schema bị chặn ở middleware `validate` và không mở kết nối DB.
2. Sau đó mới tới kiểm tra nghiệp vụ. Một request vi phạm nhiều quy tắc chỉ trả **lỗi đầu tiên** theo thứ tự của endpoint đó; thứ tự cụ thể nằm trong tài liệu domain (ví dụ [cart](../../docs/domain/cart.md)).
3. Lỗi không phải lỗi nghiệp vụ đã biết rơi vào `500 INTERNAL_ERROR`.

Hai request đồng thời thêm cùng sản phẩm vào cùng giỏ phải trả `409 ITEM_ALREADY_IN_CART`, không phải `500`.

### Status theo endpoint

| Endpoint | 200 | 201 | 204 | 400 | 404 | 409 | 422 | 500 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `GET /products` | x | | | x | | | | x |
| `POST /carts` | | x | | | | | | x |
| `GET /carts/{cartId}` | x | | | x | x | | | x |
| `POST /carts/{cartId}/items` | | x | | x | x | x | x | x |
| `PATCH /carts/{cartId}/items/{productId}` | x | | | x | x | x | | x |
| `DELETE /carts/{cartId}/items/{productId}` | | | x | x | x | x | | x |

## 4. Cấu trúc module

Mỗi domain là một thư mục trong `api/src/` (lý do: [ADR 0006](../../docs/decisions/0006-feature-based-structure.md)):

```
src/<domain>/
  <domain>.routes.ts       gắn route, middleware validate
  <domain>.handler.ts      lớp HTTP: đọc request, gọi service, trả response
  <domain>.service.ts      quy tắc nghiệp vụ, transaction, ném AppError
  <domain>.repository.ts   truy vấn Prisma, nhận client hoặc transaction
src/shared/                dùng chung: db, errors, db-errors, logger, middleware
src/openapi/               schemas/ (Zod, vừa validate vừa sinh spec) và registry.ts
```

Trách nhiệm từng lớp, một chiều `routes → handler → service → repository`:

| Lớp | Được làm | Không làm |
|---|---|---|
| routes | Khai báo path, method, `validate({...})`, chặn method sai bằng `methodNotAllowed` | Logic nghiệp vụ |
| handler | Lấy dữ liệu đã validate từ `res.locals`, gọi service, đặt status và header | Truy vấn DB, quy tắc nghiệp vụ |
| service | Kiểm tra quy tắc theo đúng thứ tự, mở transaction, ném `AppError(code, details)` | Biết về `req` và `res` |
| repository | Truy vấn Prisma, nhận `Tx` hoặc client để chạy trong transaction | Ném lỗi nghiệp vụ |

Tài nguyên con nằm trong module của tài nguyên cha: mục trong giỏ (`/carts/:id/items`) thuộc `src/carts/`, không có module `items` riêng. Một domain không import `service` hoặc `repository` của domain khác; cần gì thì đi qua giao diện công khai của domain đó.

Lỗi nghiệp vụ luôn là `AppError`; middleware lỗi cuối chuỗi biến nó thành error contract. Không tự `res.status(...).json(lỗi)` trong handler.

### Thêm một domain mới
1. Tạo thư mục `src/<domain>/` với bốn file như trên.
2. Khai báo Zod schema trong `src/openapi/schemas/<domain>.ts` và đăng ký endpoint trong `registry.ts`.
3. Gắn router vào `src/app.ts`, trước `notFoundHandler`.
4. Thêm mã lỗi mới (nếu có) theo mục 2.
5. Viết tài liệu domain trong `docs/domain/<domain>.md`, thêm vào bảng ở `docs/domain/README.md`.

### Hạn chế hiện tại
- Schema Zod nằm tập trung ở `src/openapi/schemas/` và mỗi domain mới phải sửa `registry.ts`.
