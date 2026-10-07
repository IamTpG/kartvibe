# Kartvibe

Ứng dụng web thực hành cho môn **Phát triển ứng dụng web nâng cao**. Dự án được xây dựng từng bước qua các block của môn học, bắt đầu từ một REST API giỏ hàng.

## Trạng thái

| Thành phần | Trạng thái |
|---|---|
| `api`: REST API giỏ hàng (sản phẩm, giỏ, mục trong giỏ, tính tổng tiền) | Có, đã qua bộ test nghiệm thu |
| Đăng nhập, checkout, thanh toán, trừ tồn kho | Chưa làm |
| Frontend, BFF/GraphQL, worker, broker, cache | Chưa làm, sẽ thêm khi tới block tương ứng |

Kiến trúc và các thành phần có thể thêm: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Công nghệ

Node.js 20+ (đã thử trên 24), Express 5, TypeScript (chạy bằng `tsx`), Zod (validate và sinh OpenAPI từ cùng một schema), Prisma 7, PostgreSQL 17, pino-http, Swagger UI. Lý do chọn: [docs/decisions/](docs/decisions/README.md).

## Bắt đầu nhanh

Cần Node.js và Docker (hoặc một PostgreSQL ≥ 14 tự cài). Chạy trong thư mục `api/`:

```bash
cd api
npm install

# 1. Tạo PostgreSQL bằng Docker (cổng 5434; DB `kartvibe` được tạo sẵn)
docker run -d --name kartvibe-postgres \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=kartvibe \
  -p 5434:5432 postgres:17

# 2. Tạo file cấu hình từ mẫu rồi chỉnh nếu cần
cp .env.example .env

# 3. Áp dụng migration và nạp dữ liệu mẫu
npm run migrate
npm run seed

# 4. Chạy server
npm run dev
```

Sau đó mở:
- Swagger UI: http://localhost:3000/docs
- OpenAPI 3.1: http://localhost:3000/openapi.json
- Thử nhanh: `curl http://localhost:3000/products`

Các lần sau chỉ cần `docker start kartvibe-postgres` rồi `npm run dev`. Lệnh khác (`reset`, `start:log`, `build`...) và cách xử lý lỗi cổng: [api/README.md](api/README.md).

## API tóm tắt

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/products` | Liệt kê sản phẩm đang bán, có phân trang |
| `POST` | `/carts` | Tạo giỏ hàng |
| `GET` | `/carts/{cartId}` | Xem giỏ, kèm tổng tiền |
| `POST` | `/carts/{cartId}/items` | Thêm sản phẩm vào giỏ |
| `PATCH` | `/carts/{cartId}/items/{productId}` | Đổi số lượng |
| `DELETE` | `/carts/{cartId}/items/{productId}` | Xóa khỏi giỏ |

Chi tiết schema và ví dụ lấy từ `/docs`. Quy ước lỗi và response: [api/docs/CONVENTIONS.md](api/docs/CONVENTIONS.md).

## Kiểm thử

Test nghiệm thu chạy qua HTTP bằng Postman collection và newman. Server phải đang chạy ở terminal khác:

```bash
cd api
npm run evidence
```

**Lưu ý:** lệnh này **reset database** (xóa dữ liệu, migrate và seed lại) trên DB trong `.env`. Chi tiết các nhóm test và cách chạy: [api/docs/TESTING.md](api/docs/TESTING.md).

## Cấu trúc repo

```
kartvibe/
  api/     REST API (mã nguồn, migration, seed, test nghiệm thu, tài liệu riêng)
  docs/    tài liệu gốc của dự án
```

Các thư mục mới (ví dụ `web/`, `worker/`) chỉ được tạo khi tới block cần chúng.

## Tài liệu

Tài liệu gốc luôn phản ánh trạng thái hiện tại của dự án; mã tuân theo tài liệu. Mục lục đầy đủ và quy ước: [docs/README.md](docs/README.md).

| Bạn muốn biết | Đọc |
|---|---|
| Hệ thống gồm những gì, request đi qua đâu | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Dữ liệu và quy tắc nghiệp vụ | [docs/domain/](docs/domain/README.md) |
| Vì sao chọn công nghệ hoặc cách làm này | [docs/decisions/](docs/decisions/README.md) |
| Định dạng lỗi, cách viết thêm một module | [api/docs/CONVENTIONS.md](api/docs/CONVENTIONS.md) |
| Cách chạy và hiểu bộ test | [api/docs/TESTING.md](api/docs/TESTING.md) |
| Dữ liệu seed | [api/seeds/README.md](api/seeds/README.md) |
| Thuật ngữ | [docs/GLOSSARY.md](docs/GLOSSARY.md) |
| Tài liệu gốc của Block 1 (bản chụp) | [docs/blocks/block-01/](docs/blocks/block-01/) |

## Quy ước làm việc

- **Tài liệu và mã đi cùng nhau:** đổi quy tắc nghiệp vụ thì cập nhật `docs/domain/`; đổi công nghệ hoặc cách làm lớn thì thêm ADR mới. Bảng "khi thay đổi thì cập nhật tài liệu nào" ở [docs/README.md](docs/README.md).
- **Bản chụp theo block** (`docs/blocks/`) giữ nguyên bản, không sửa sau khi chốt.
- **Không commit `.env`:** chỉ `.env.example` được commit.
- **Đặt tên:** tên nằm trong không gian dùng chung thì có tiền tố `kartvibe` (database `kartvibe`, container `kartvibe-postgres`, package `kartvibe-api`); thư mục trong repo để tên ngắn (`api`, `docs`).
