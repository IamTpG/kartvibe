# docs

Tài liệu gốc của dự án. Codebase tuân theo các tài liệu này; khi làm việc ở mỗi block, tài liệu gốc được cập nhật theo.

## Hai tầng
- **Tài liệu gốc** (`docs/`, `<thành-phần>/docs/`): luôn phản ánh trạng thái hiện tại.
- **Bản chụp theo block** (`docs/blocks/block-XX/`): nguyên bản tài liệu của block đó, không sửa sau khi chốt. Mỗi block ghi rõ giả định về yêu cầu và đã xác nhận với giảng viên chưa.

## Nơi đặt tài liệu
- Liên quan nhiều thành phần hoặc nghiệp vụ → `docs/`.
- Chỉ liên quan một thành phần → `<thành-phần>/docs/` (ví dụ `api/docs/`).
- Nội dung sinh được từ mã (endpoint, cột DB) không viết tay trong tài liệu; trỏ tới nguồn (ví dụ `/openapi.json`, `schema.prisma`). Chỉ commit bản sinh ra khi có lý do và có cách kiểm tra nó còn mới.

## Quy ước
- Markdown; sơ đồ viết bằng Mermaid (GitHub tự hiển thị).
- Link tương đối giữa các tài liệu.

## Mục lục

**Toàn dự án (`docs/`)**
- [GLOSSARY.md](GLOSSARY.md): thuật ngữ
- [ARCHITECTURE.md](ARCHITECTURE.md): thành phần, giao tiếp, vòng đời request, cấu trúc repo
- [domain/](domain/README.md): dữ liệu và quy tắc nghiệp vụ theo domain (catalog, cart, ...)
- [decisions/](decisions/README.md): các quyết định kỹ thuật (ADR)
- [blocks/](blocks/): tài liệu theo block: `block-01` là bản chụp nộp bài; `block-02` là tài liệu bài API composition (xem [blocks/README.md](blocks/README.md)); `block-03` là ghi chú chuẩn bị (chưa có đề)

**Riêng `api` (`api/`)**
- [api/docs/CONVENTIONS.md](../api/docs/CONVENTIONS.md): quy ước API, error contract, cấu trúc module
- [api/docs/TESTING.md](../api/docs/TESTING.md): cách kiểm thử và chạy bằng chứng nghiệm thu
- [api/seeds/README.md](../api/seeds/README.md): dữ liệu seed và tình huống kiểm thử
- [api/README.md](../api/README.md): cài đặt và chạy

## Khi thay đổi thì cập nhật tài liệu nào

| Thay đổi | Cập nhật |
|---|---|
| Quy tắc nghiệp vụ, dữ liệu | `domain/<domain>.md` |
| Chọn hoặc đổi công nghệ, cách làm lớn | ADR mới trong `decisions/` (ADR cũ ghi "bị thay thế") |
| Thêm mã lỗi, đổi định dạng response | `api/docs/CONVENTIONS.md` |
| Thêm thành phần hoặc service | `ARCHITECTURE.md` |
| Thêm dữ liệu seed hoặc test case | `api/seeds/README.md`, `api/docs/TESTING.md` |
| Thuật ngữ mới | `GLOSSARY.md` |
