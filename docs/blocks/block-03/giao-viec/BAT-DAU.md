# Bắt đầu từ đây

Bạn nhận một phần việc của Block 3 (REST và gRPC giữa các service). Bạn **không cần xem repo**; mọi thứ cần thiết nằm trong thư mục này. Bạn được toàn quyền quyết định trong phạm vi phần của mình và không cần hỏi lại; chỉ những điều đã chốt trong Plan là bắt buộc.

## Thứ tự đọc

1. `DE-BAI.md`: đề bài (dữ liệu tham khảo, chỉ làm theo phần việc được giao trong `W*.md`).
2. `PLAN-trich.md`: các quyết định đã chốt và hợp đồng chung (mục 1 đến 3, 4.1, 4.3, 5). **Bắt buộc tuân theo.**
3. `W*.md` (file của bạn): việc cần làm, tiêu chí xong, bạn được tự quyết điều gì.
4. `MOI-TRUONG.md`: cách dựng môi trường chạy thử.
5. `kem-theo/`: các file có sẵn dành cho phần của bạn.
6. `HANDOVER-MAU.md`: mẫu báo cáo bàn giao.

## Quy tắc chung

- Điều đã chốt trong Plan (D1 đến D15, mục 3) **không được đổi**. Nếu bạn thấy nó sai hoặc không làm được, hãy làm theo Plan, và ghi lý do vào `HANDOVER.md` (mục "Vấn đề tồn đọng").
- Điều Plan không nói: bạn tự quyết và ghi lý do vào `HANDOVER.md`.
- Chỉ làm trong thư mục thuộc phần của bạn. Không sửa `.proto`, không sửa file của phần khác.
- Chỉ dùng dữ liệu giả. Không đưa secret hay dữ liệu cá nhân thật vào bài.
- Với mỗi quyết định bạn tự đưa ra, ghi cả **phương án đã không chọn và trade-off**; và ghi **phần nào do AI hỗ trợ** (mục 8 của `HANDOVER-MAU.md`), nếu có dùng.
- Điều bạn nói trong báo cáo phải phân biệt được **đã kiểm chứng** (đã chạy, có output) với **suy luận**. Người nhận sẽ tự chạy lại các số liệu.

## Cách bàn giao

Tạo thư mục `W<số>-giao/` chứa các thư mục của bạn **theo đúng đường dẫn đích** (ví dụ `W1-giao/services/inventory/...`) và `HANDOVER.md` ở gốc. Không kèm `node_modules`, không kèm file `.env`. Khi xong, `npm run check` trong từng gói npm của bạn phải thoát 0 (phần UI kiểm theo hướng dẫn riêng của nó). Bản giả trong `test/` cũng bàn giao để người nhận chạy được `npm run check`; chúng không phải sản phẩm nộp.
