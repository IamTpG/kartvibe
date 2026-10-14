# results/block-03: bằng chứng Block 3 (REST và gRPC)

Mọi thứ trong thư mục này (trừ `chay-lai.sh` và README này) do `chay-lai.sh` sinh ra. Số liệu nộp là số của **một lần chạy do
team lead thực hiện**; không có số nào được gõ tay. Mỗi file ghi lệnh, thời điểm bắt đầu và mã thoát; đường dẫn tuyệt đối và
thư mục home được thay bằng `<repo>` và `<home>`.

## Chạy lại

Cần Docker với container `kartvibe-postgres` (cổng 5434) và `npm install` đã chạy ở `services/`. Từ gốc repo:

```bash
bash results/block-03/chay-lai.sh                  # mặc định 20 mẫu đo thời gian mỗi cổng
LATENCY_N=5 bash results/block-03/chay-lai.sh      # hoặc số mẫu khác (tối thiểu 5)
```

Script **dừng và khởi động lại** các service ở chế độ đo (`LATENCY_MS=0`, `ENABLE_TEST_HOOKS=1`), chạy toàn bộ kịch bản (mất vài
phút), rồi để các service chạy. Mã thoát là số bước thất bại. `bash services/stop-all.sh` để dừng.

## Nội dung

| Thư mục / file | Bằng chứng cho |
|---|---|
| `MANIFEST.txt` | Người chạy, thời điểm, nhánh và commit, phiên bản Node, npm, gRPC, cấu hình đo |
| `proto/proto-va-sinh-code.txt` | Diff proto v1 so v2 (chỉ thêm tag 2), sha256, diff mã sinh, sinh lại code không đổi mã đã commit |
| `snapshots/` | Status và body của API ngoài, REST (4002) so gRPC (4012) so gRPC cũ (4022), bốn kịch bản (`*.json` đã bỏ giá trị động) |
| `logs/trace-theo-requestId.txt` | Cùng một luồng đặt hàng: lời gọi nội bộ qua REST (trước) và gRPC (sau), theo `requestId` |
| `logs/*.log` | Log thô của Order (3 bản) và Inventory (thật và cũ) |
| `compat/ma-tran.txt`, `compat-*.txt` | Client cũ/mới x server cũ/mới qua `POST /orders` và log (`clientVersion`, `available`) |
| `compat/verify-frozen.txt` | `order-v1` (client cũ) và `inventory-v1` (server cũ) chưa bị build lại |
| `errors/` | Inventory chậm (504), Inventory tắt (503), D14 (Reserve đã chạy sau khi Order trả 504), đồng thời |
| `payload/` | Kích thước message đã serialize (lớp 1): JSON so Protobuf, request và reply |
| `latency/` | Thời gian phản hồi API ngoài: median và [min, max] mỗi cổng |
| `regression/` | Block 2 vẫn đúng: `contracts:check`, `test:tools`, `build`, 80 kiểm tra, `GET /orders` |

## Việc không tự động hóa

- **UI demo** `http://localhost:4000/order-compare.html` (`npm start` trong `web/`): thử bằng tay, không có output ở đây.
- Giới hạn của phép đo: một máy, dữ liệu nhỏ, cổng `localhost`; không kết luận hiệu năng chung từ số trong `latency/`.
