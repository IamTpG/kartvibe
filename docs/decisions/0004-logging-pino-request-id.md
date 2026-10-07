# 0004. Logging có cấu trúc bằng pino-http, ghi ra stdout, gắn request_id

- **Trạng thái:** chấp nhận
- **Nguồn:** Block 1

## Quyết định
Dùng `pino-http`. Mỗi request có `request_id` (UUID v4, sinh bằng `crypto.randomUUID()`), có mặt trong header `X-Request-Id`, mọi dòng log của request và body của mọi error response. Server luôn bỏ qua `X-Request-Id` do client gửi.

Quy tắc bắt buộc:
- Không log password, token, header `Authorization`. Serializer chỉ giữ `id`, `method`, `url`, `statusCode`; `redact` cho authorization, cookie, password, token.
- Chi tiết lỗi 500 chỉ ghi vào log, không trả trong response.

**Nơi lưu log:** app chỉ ghi JSON ra stdout. Muốn lưu file dùng `npm run start:log` (`tee -a logs/server.log`, `logs/` nằm trong `.gitignore`). Tra log: `grep <request_id> logs/server.log`.

## Lý do
- JSON log dễ grep và parse, pino-http gắn `request_id` vào mọi dòng của request, hiệu năng tốt.
- Chỉ cần `request_id` xuất hiện ở log và tra cứu được; ghi stdout là cách phổ biến (nơi lưu do môi trường chạy quyết định).

## Các lựa chọn đã cân nhắc
| Lựa chọn | Lý do không chọn |
|---|---|
| winston | Linh hoạt (nhiều transport) nhưng quá mức; không tích hợp với vòng đời request Express tốt bằng pino-http. |
| morgan | Chỉ log HTTP đơn giản, không gắn `request_id` vào từng dòng; cần thêm nhiều middleware tự viết. |
| Lưu log vào bảng Postgres | Thêm một lần ghi DB mỗi request (kể cả request 400 vốn không được chạm DB); DB lỗi thì mất đúng log cần nhất; làm bẩn dữ liệu seed; thêm bảng ngoài schema. |
| Pino transport ghi file trong code | Thêm code và cấu hình không cần thiết; `tee` cho kết quả tương đương. Có thể bổ sung nếu cần xoay vòng file. |
| Hệ thống log tập trung (ELK, Loki, Datadog) | Ngoài phạm vi. Có thể xem lại khi tới Block về observability. |
