# Kartvibe

Ứng dụng web thực hành cho môn **Phát triển ứng dụng web nâng cao**. Repo hiện có hai dự án độc lập, chưa liên kết với nhau: **`api`** (REST API giỏ hàng) và **`services` + `web`** (ba service User, Order, Product cùng BFF và GraphQL).

## Trạng thái

| Thành phần | Trạng thái |
|---|---|
| `api`: REST API giỏ hàng (sản phẩm, giỏ, mục trong giỏ, tính tổng tiền) | Có, đã qua bộ test nghiệm thu |
| `services` + `web`: ba service (User, Order, Product), BFF, GraphQL, hai trang web, công cụ đo | Có, đã qua bộ kiểm tra hợp đồng; số đo nhiều lần chưa hoàn tất |
| Đăng nhập, checkout, thanh toán, trừ tồn kho | Chưa làm |
| Worker, broker, cache | Chưa làm, sẽ thêm khi cần |

Kiến trúc và các thành phần có thể thêm: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Công nghệ

Node.js 20+ (đã thử trên 24), Express 5, TypeScript (chạy bằng `tsx`), Zod (validate và sinh OpenAPI từ cùng một schema), Prisma 7, PostgreSQL 17, pino-http, Swagger UI. Lý do chọn: [docs/decisions/](docs/decisions/README.md). `services`: Node.js 22+, Express 4/5, GraphQL (graphql-js, DataLoader), một database Postgres riêng cho mỗi service, trang web tĩnh không framework.

## Bắt đầu nhanh: `api`

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

## `services` (API composition)

Ba service REST (mỗi service một database riêng), BFF và GraphQL, so với baseline là trình duyệt gọi trực tiếp. Cần Docker bật và container `kartvibe-postgres` (tạo ở bước `api` ở trên). Chạy trong thư mục `services/`:

```bash
cd services
npm install
bash start-all.sh     # tạo database còn thiếu; chạy 5 service
npm run seed:s        # dữ liệu nhỏ (npm run seed:l cho dữ liệu lớn)
```

Web chạy riêng, ở terminal khác (từ gốc repo):

```bash
cd web
npm start             # cổng 4000, giữ chạy; Ctrl+C để dừng
```

Mở http://localhost:4000/dashboard.html, chọn chế độ (Baseline, BFF, GraphQL), bấm **Tải dữ liệu**; kiểm tra bằng `npm run check -- --size S`. Dừng bằng `bash stop-all.sh`. Hướng dẫn đầy đủ (demo, kiểm tra, đo, xử lý sự cố): [services/README.md](services/README.md).

## Cấu trúc repo

```
kartvibe/
  api/        REST API (mã nguồn, migration, seed, test nghiệm thu, tài liệu riêng)
  services/   user, order, product, bff, graphql, công cụ kiểm tra và đo (tools/)
  web/        Trang dashboard, mobile và bộ chạy đo
  results/    Bằng chứng và kết quả đo của services
  docs/       Tài liệu gốc của dự án; docs/blocks/block-NN: tài liệu theo từng block
```

Hai dự án độc lập, chưa liên kết; có thể khác kiến trúc. Việc viết thành ba service riêng (User, Order, Product) là yêu cầu của đề; việc đặt chung một repo là quyết định của nhóm. Về sau có thể dùng lại một dự án hoặc thêm thư mục cấp trên mới khi cần.

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
| Chạy, demo, kiểm tra và đo `services` | [services/README.md](services/README.md), [services/tools/README.md](services/tools/README.md) |
| Tài liệu theo từng block (đề, hợp đồng, Plan, bản chụp, ghi chú trình bày, sơ đồ) | [docs/blocks/](docs/blocks/) |

## Quy ước làm việc

- **Tài liệu và mã đi cùng nhau:** đổi quy tắc nghiệp vụ thì cập nhật `docs/domain/`; đổi công nghệ hoặc cách làm lớn thì thêm ADR mới. Bảng "khi thay đổi thì cập nhật tài liệu nào" ở [docs/README.md](docs/README.md).
- **Bản chụp theo block** (`docs/blocks/`) giữ nguyên bản, không sửa sau khi chốt.
- **Không commit `.env`:** chỉ `.env.example` được commit.
- **Đặt tên:** tên nằm trong không gian dùng chung thì có tiền tố `kartvibe` (database `kartvibe`, `kartvibe_user`..., container `kartvibe-postgres`, package `kartvibe-api`); thư mục trong repo để tên ngắn (`api`, `services`, `docs`).
- **Một repo, nhiều dự án độc lập:** mỗi dự án tự chạy được và có README riêng; bài nộp mỗi block nằm ở `docs/blocks/block-NN/` và gắn tag `block-NN`.
