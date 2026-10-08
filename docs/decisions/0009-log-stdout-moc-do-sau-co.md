# 0009. Log ra stdout và gom ngoài mã sản phẩm; móc đo và test sau cờ môi trường

- **Trạng thái:** chấp nhận
- **Liên quan:** [ADR 0004](0004-logging-pino-request-id.md) (log của `api` ra stdout)

## Bối cảnh
Các service (`user`, `order`, `product`, `bff`, `graphql`) mỗi cái tự ghi tệp log vào `results/logs/` bằng đường dẫn tương đối gán cứng tới thư mục bài nộp (riêng Product từng ghi hai nơi). Độ trễ giả (`LATENCY_MS`) bật mặc định và các điểm vào phục vụ test (`/_fault`, `/_seed`) luôn mở. Nghĩa là mã sản phẩm biết về bài nộp và mang sẵn các móc đo.

Mục đích của dự án là tích hợp kiến thức vào một hệ thống thật; những gì thuộc về bài nộp (`results/`, `docs/blocks/`) nên tách riêng.

## Quyết định
1. **Mỗi service chỉ ghi log ra stdout**, một dòng JSON cho mỗi lời gọi nghiệp vụ, như `api`. Định dạng chung (một quy ước giữa các service, cần để quan sát nhiều service): `ts`, `service`, `requestId`, `method`, `path`, `status`, `ms`. `x-request-id` được truyền xuyên các service.
   Sự kiện vòng đời (khởi động) cũng là một dòng JSON với `ts`, `service`, `msg`, không có `requestId`; nhờ vậy mọi dòng stdout đều parse được. Lỗi không bắt được vẫn ra stderr dạng văn bản.
2. **Nơi lưu log do môi trường chạy quyết định, không phải mã service.** Với chạy cục bộ, `services/start-all.sh` đóng vai hạ tầng log: ghi stdout của từng service vào `$LOG_DIR/<service>.log` (mặc định `services/logs/`, không commit). Công cụ thu bằng chứng đọc từ `LOG_DIR`. `results/` chỉ chứa **bằng chứng sinh ra** (trace, call graph, bảng đo), không chứa log thô.
3. **Móc phục vụ đo và test không bật mặc định.** `LATENCY_MS` mặc định `0`; `/_fault` và `/_seed` của Product chỉ tồn tại khi `ENABLE_TEST_HOOKS=1`. `/_metrics` giữ nguyên vì là quan sát. `services/start-all.sh` chạy service như bình thường và **không** bật các móc này; `services/tools/start-measure.sh` (`npm run start:measure`) cắm thêm chúng cho demo lỗi, đo và test (`LATENCY_MS=30`, `ENABLE_TEST_HOOKS=1`).

## Lý do
- Đúng với cách vận hành thật: service ghi stdout, nền tảng quyết định nơi lưu và gom.
- Mã sản phẩm không còn phụ thuộc đường dẫn của bài nộp; đổi nơi lưu log không phải sửa service.
- Móc gây lỗi và độ trễ giả không nên có sẵn ở mặc định của một hệ thống thật.

## Các lựa chọn đã cân nhắc
| Lựa chọn | Lý do không chọn |
|---|---|
| Mỗi service có biến `LOG_FILE` tùy chọn để tự ghi tệp | Phải thêm và duy trì mã ghi tệp ở năm nơi; cùng kết quả với việc bắt stdout bên ngoài |
| Dùng công cụ thu log thật (ví dụ Vector, Promtail) | Quá mức so với nhu cầu chạy cục bộ |
| Giữ nguyên (mỗi service tự ghi vào `results/logs`) | Gán cứng đường dẫn bài nộp vào mã sản phẩm |

## Hệ quả
- `start-all.sh` không phải hạ tầng log thật, chỉ là cách thuận tiện khi chạy cục bộ; khi có Docker/Kubernetes thì dùng cơ chế của chúng.
- Công cụ `tools/export-trace.mjs` đọc log từ `LOG_DIR`; hợp đồng chung của bài (mục độ trễ mặc định và mục log) được cập nhật theo.
- Chạy một service riêng lẻ thì log chỉ ra terminal (đúng ý); muốn lưu tệp thì chuyển hướng stdout, hoặc chạy qua `start-all.sh`.
