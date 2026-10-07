# 📋 Nhiệm vụ của Phú — Tech Lead & Implementer

> **Bối cảnh**: Nhóm 5 người đang làm bài tập môn Advanced Web. Đề bài yêu cầu xây dựng một **Cart API** bằng RESTful, có OpenAPI spec, validation, error contract chuẩn và logging. Phú là người duy nhất viết code — các thành viên còn lại đưa ra quyết định thiết kế để Phú implement.

---

## 🎯 Nhiệm vụ của Phú

Phú đưa ra **toàn bộ quyết định về tech stack** và là người **tổng hợp output** của 4 thành viên còn lại để implement web app hoàn chỉnh.

Output của Phú là file `DECISIONS.md` — các thành viên khác đọc file này để hiểu môi trường họ đang thiết kế cho.

---

## 📦 Sản phẩm cần bàn giao (toàn bộ nhóm)

Khi Phú implement xong, sản phẩm cần có:

| Hạng mục | Yêu cầu |
|----------|---------|
| **Setup** | `README.md` ghi đủ lệnh: tạo DB, chạy migration, seed, reset, khởi động server |
| **API** | 6 endpoint đúng method, path, status code theo đề bài |
| **Documentation** | OpenAPI 3.1 có đủ mọi status code; trang `/docs` chạy được trên trình duyệt; có ví dụ request/response |
| **Validation** | Dùng cùng nguồn schema với spec; request sai format không được chạm tới DB |
| **Error & Logging** | Mọi lỗi (kể cả 500) đều theo đúng error contract; log kèm `request_id` |
| **Evidence** | Script chạy lại được cho mọi kịch bản trong ma trận nghiệm thu |

---

## ✅ Các quyết định Phú cần đưa ra

### 1. Runtime & Framework
Chọn một trong các lựa chọn phổ biến:

| Lựa chọn | Đặc điểm |
|----------|----------|
| **Node.js + Express** | Phổ biến nhất, nhiều tài liệu, hệ sinh thái lớn |
| **Node.js + Fastify** | Nhanh hơn Express, schema validation tích hợp sẵn |
| **Hono** | Nhẹ, hiện đại, chạy được trên Bun hoặc Node |
| **Bun + Hono/Elysia** | Runtime mới, tốc độ cao |

**Gợi ý**: Nếu nhóm quen Node.js thì chọn **Express** để tiết kiệm thời gian.

---

### 2. Approach: Contract-first hay Code-first

Đây là quyết định quan trọng nhất — ảnh hưởng đến toàn bộ cách viết code.

**Contract-first** (viết `openapi.yaml` trước, code sau):
- Thạnh viết API design ra file `.yaml` / `.json`
- Phú dùng middleware đọc file đó để validate request tự động
- Thư viện: `express-openapi-validator` (nếu dùng Express)
- **Ưu điểm**: Spec là nguồn sự thật duy nhất, không thể lệch
- **Nhược điểm**: Phải viết YAML trước khi code

**Code-first** (viết schema trong code, sinh spec từ code):
- Thạnh thiết kế schema dạng conceptual, Phú hiện thực bằng `zod`
- Dùng `@asteasolutions/zod-to-openapi` để sinh ra file spec tự động
- **Ưu điểm**: Code và spec luôn đồng bộ
- **Nhược điểm**: Phức tạp hơn khi setup

---

### 3. ORM / Query builder

| Lựa chọn | Đặc điểm |
|----------|----------|
| **Drizzle ORM** | Type-safe, gần với SQL, migration tốt |
| **Prisma** | DX tốt, auto-generate types, schema riêng |
| **Knex** | Query builder thuần, linh hoạt |
| **`pg` trực tiếp** | Viết SQL thẳng, ít abstraction nhất |

**Gợi ý**: `pg` trực tiếp hoặc Knex nếu muốn kiểm soát SQL; Prisma nếu muốn DX nhanh.

---

### 4. Thư viện Logging

| Lựa chọn | Đặc điểm |
|----------|----------|
| **pino-http** | Nhanh nhất, structured JSON log, tích hợp request_id tốt |
| **winston** | Linh hoạt, nhiều transport (file, console, cloud) |
| **morgan** | Đơn giản, chỉ log HTTP request |

**Lưu ý bắt buộc**: Mọi request phải có `request_id` (UUID sinh tự động). `request_id` này phải:
- Trả về trong response header: `X-Request-Id: <uuid>`
- Xuất hiện trong mọi dòng log liên quan đến request đó
- Xuất hiện trong response body của mọi error

**Tuyệt đối không log**: password, token, nội dung header `Authorization`.

---

### 5. Docs UI

| Lựa chọn | Đặc điểm |
|----------|----------|
| **Swagger UI** | Phổ biến nhất, có thể thử request trực tiếp |
| **Redoc** | Đẹp hơn, dễ đọc hơn, nhưng không thử request được |
| **Scalar** | Hiện đại, UX tốt, thử request được |

Trang `/docs` phải chạy được — đây là yêu cầu bắt buộc khi bàn giao.

---

### 6. Cấu trúc thư mục

Gợi ý cấu trúc tối giản:

```
project/
├── src/
│   ├── routes/         # Định nghĩa route từng endpoint
│   ├── handlers/       # Xử lý logic từng request
│   ├── services/       # Business logic (check stock, check cart status...)
│   ├── db/             # Kết nối DB, query functions
│   └── middleware/     # Validation, error handler, request_id
├── migrations/         # File SQL migration
├── seeds/              # File SQL seed data
├── openapi.yaml        # (nếu contract-first)
├── scripts/
│   ├── migrate.sh
│   ├── seed.sh
│   └── reset.sh
└── README.md
```

---

## 📝 Format output: `DECISIONS.md`

Phú nộp file với format:

```markdown
# Tech Stack Decisions

## Framework
**Chọn**: Express
**Lý do**: Cả nhóm quen, nhiều ví dụ trên mạng, đủ cho scope bài tập.

## Approach
**Chọn**: Contract-first
**Lý do**: Thạnh thiết kế spec trước, Phú dùng express-openapi-validator đọc spec đó.

## ORM
**Chọn**: pg (trực tiếp)
**Lý do**: Bài này SQL đơn giản, không cần ORM nặng.

## Logging
**Chọn**: pino-http
**Lý do**: Tích hợp request_id sẵn, log dạng JSON dễ parse.

## Docs UI
**Chọn**: Swagger UI
**Lý do**: Thử request được ngay trên trình duyệt, tiện cho demo.

## Cấu trúc thư mục
[paste cấu trúc dự kiến]
```

---

## 🗂 Thứ tự implement sau khi có đủ output

1. Đọc `DECISIONS.md` (của chính mình) → setup project
2. Đọc `DB_DESIGN.md` (của Anh) → viết migration + seed
3. Đọc `API_DESIGN.md` (của Thạnh) → viết `openapi.yaml` hoặc zod schema
4. Setup validation middleware
5. Đọc `BUSINESS_LOGIC.md` (của Đạt) → viết handlers/services cho từng endpoint
6. Thêm logging + error handler chuẩn
7. Đọc `TEST_MATRIX.md` (của Luân) → viết evidence script

---

## 🎤 Phần Phú phụ trách trong Presentation

Slide **Solution**: Giải thích contract-first hay code-first nhóm đã chọn và lý do. Giải thích tại sao chọn các thư viện đó.

Slide **Demo**: Mở trang `/docs`, gửi một request sai (ví dụ `quantity = 0`), chỉ cho thấy:
1. Response lỗi trả về `400` với body đúng error contract, có `request_id`
2. Trên terminal, dòng log có cùng `request_id` đó, chỉ vị trí lỗi xảy ra
