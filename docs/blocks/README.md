# Tài liệu theo block

Mỗi thư mục `block-NN/` là tài liệu của một block học: yêu cầu, kế hoạch, ghi chú trình bày. Đây là nơi duy nhất trong repo nhắc tên block; tài liệu chính (`README.md`, `docs/ARCHITECTURE.md`, README của từng dự án) viết như dự án bình thường.

| Block | Chủ đề | Thư mục | Mã tương ứng | Trạng thái |
|---|---|---|---|---|
| 1 | Cart API (REST, Prisma, Postgres) | [`block-01/`](block-01/) | [`api/`](../../api/) | bản chụp nộp bài |
| 2 | API composition (BFF, GraphQL) | [`block-02/`](block-02/) | [`services/`](../../services/), [`web/`](../../web/), bằng chứng ở [`results/`](../../results/) | đang hoàn thiện để nộp |
| 3 | chưa xác nhận yêu cầu | [`block-03/`](block-03/) | chưa có | ghi chú chuẩn bị |

## Quy ước

- Nhánh làm việc `feat/block-NN`, nhánh chính `main`; khi nộp gắn tag `block-NN`.
- Tài liệu trong thư mục block là bản chụp tại thời điểm làm; khi quyết định đổi, sửa tài liệu gốc ở `docs/` và ADR, không sửa ngược bản chụp đã nộp.
- Quyết định kỹ thuật dùng lâu dài nằm ở [`../decisions/`](../decisions/); mỗi block chỉ ghi quyết định của riêng bài (ví dụ Plan).
- Đề bài nằm ngoài repo, trong thư mục `w0N/` cạnh thư mục repo.
