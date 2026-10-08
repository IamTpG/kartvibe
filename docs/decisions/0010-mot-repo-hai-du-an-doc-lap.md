# 0010. Một repo, hai dự án độc lập (`api` và `services` + `web`)

- **Trạng thái:** chấp nhận
- **Liên quan:** [ADR 0006](0006-feature-based-structure.md), [ADR 0009](0009-log-stdout-moc-do-sau-co.md)

## Bối cảnh
`api/` là Cart API (Express, Prisma, Postgres, database `kartvibe`). Bài tập tiếp theo của môn yêu cầu viết **ba service riêng** (User, Order, Product), thêm lớp ghép dữ liệu (BFF, GraphQL) và một trang web. Yêu cầu tách thành ba service là của đề. Việc đặt chung repo với dự án cũ, và tiếp tục phát triển cùng một dự án thay vì mở repo mới, là quyết định của nhóm, nhằm tích hợp kiến thức các block vào một hệ thống thật.

## Quyết định
1. Giữ **một repo** `kartvibe`. `api/` và `services/` + `web/` là hai dự án **độc lập**, đặt cạnh nhau, **chưa liên kết** (không import, không gọi nhau).
2. Mỗi dự án tự chọn kiến trúc, cấu trúc thư mục và công cụ phù hợp. `api/` giữ nguyên; `services/` dùng npm workspaces (một `node_modules`, một `package-lock.json`).
3. Hai dự án dùng chung **container Postgres** `kartvibe-postgres` (cổng 5434) nhưng **database khác nhau**: `kartvibe` cho `api/`; `kartvibe_user`, `kartvibe_order`, `kartvibe_product` cho `services/` (mỗi service một database).
4. Những gì thuộc về bài nộp tách riêng khỏi mã sản phẩm: `docs/blocks/block-NN/` (tài liệu theo block, tag `block-NN`) và `results/` (bằng chứng sinh ra). Nhánh làm việc là `feat/block-NN`, nhánh chính là `main`.
5. Block sau có thể dùng lại một dự án sẵn có hoặc thêm một thư mục cấp cao mới; mỗi trường hợp ghi bằng ADR hoặc trong `docs/blocks/block-NN/`.

## Lý do
- Giữ lịch sử và tài liệu của cả học kỳ ở một nơi; ADR, quy ước và công cụ dùng chung.
- Tránh liên kết sớm: `api/` đã nộp và được kiểm thử ở trạng thái hiện tại, ghép vào `services/` làm đổi hợp đồng của nó mà chưa có yêu cầu.
- Chia sẻ Postgres tiết kiệm tài nguyên máy, tách database vẫn đảm bảo không dùng chung dữ liệu.

## Các lựa chọn đã cân nhắc
| Lựa chọn | Lý do không chọn |
|---|---|
| Repo riêng cho `services` | Mất tài liệu, ADR và quy ước chung; nhóm muốn gom kiến thức vào một hệ thống |
| Gộp `services` vào `api` (một ứng dụng) | Trái yêu cầu của đề (ba service riêng, mỗi service một CSDL) |
| Liên kết ngay `api` với `services` | Chưa có yêu cầu; làm đổi hợp đồng đã nộp của `api` |

## Hệ quả
- Hai bộ phụ thuộc: `api/` có `node_modules` riêng, `services/` có `node_modules` riêng; chạy `npm install` ở từng nơi.
- Dùng chung container nghĩa là `npm run reset` của `api` chỉ tác động lên database nó cấu hình (`kartvibe`), không đụng database của `services`.
- Cần cẩn thận khi lệnh dọn dẹp chạy trên container (xóa container làm mất cả hai nhóm database).
- Nếu về sau liên kết hai dự án, viết ADR mới và đánh dấu ADR này là bị thay thế.
