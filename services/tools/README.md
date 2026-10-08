# tools: công cụ kiểm tra và đo (không phải mã của hệ thống)

Mọi thứ trong thư mục này chỉ để **kiểm tra, thu bằng chứng và đo**. Hệ thống thật là năm service (`user`, `order`, `product`, `bff`, `graphql`) và trang web (`../web`). Chạy lệnh từ thư mục `services/`.

Lệnh chạy nằm ở gốc `services/`: `bash start-all.sh` (chạy như bình thường), `bash stop-all.sh`, và `bash tools/start-measure.sh` (`npm run start:measure`: chạy kèm các móc phục vụ demo lỗi, đo và test: `LATENCY_MS=30`, `ENABLE_TEST_HOOKS=1`).

## Kiểm tra đúng hợp đồng

| Tệp | Làm gì | Chạy |
|---|---|---|
| `check-contract.mjs` | Kiểm tra từng service (và BFF, GraphQL) có đúng hợp đồng chung không: response khớp `openapi.json` của từng service, công thức dữ liệu, số truy vấn DB, endpoint lấy nhiều id, công tắc lỗi. Service không chạy thì bỏ qua | `npm run check -- --size S` |
| `contract.mjs` | Thư viện: kiểm dữ liệu theo `openapi.json` đã công bố của từng service (dùng bởi check-contract và test của BFF/GraphQL) | |
| `contracts.mjs` | Sinh lại `openapi.json` (từ `src/contract.ts`) và kiểu cho BFF/GraphQL; `--check` báo lệch | `npm run contracts`, `npm run contracts:check` |
| `tests/contracts.test.mjs` | Test của chính hợp đồng: chấp nhận dữ liệu đúng, bắt thiếu trường, trường thừa, sai kiểu, rò trường vào mobile | `npm run test:tools` |
| `check-equality.mjs` | Baseline (ghép ở client) = BFF = GraphQL, cho web và mobile; mobile chỉ có trường mobile | `npm run check:equality` |
| `verify-live.mjs` | Đối chiếu và chạy lỗi (chậm, 500); báo cáo ra `results/verification/` | `npm run check:live -- S on [--faults]` |
| `tests/measure.test.mjs` | Test riêng của bộ đo (thu kết quả, tổng hợp, bộ đếm byte, chuỗi lạnh/ấm) | `npm run test:tools` |
| `tests/browser-check.py` | Kiểm tra bộ đo trong trình duyệt tự động (tùy chọn, cần Python + Playwright) | `python tools/tests/browser-check.py` |

## Thu bằng chứng

| Tệp | Làm gì | Chạy |
|---|---|---|
| `export-trace.mjs` | Xuất trace N+1 của GraphQL (DataLoader tắt/bật) và call graph của BFF từ log thật → `results/evidence/` | `npm run trace -- --size S` |

## Đo số liệu

| Tệp | Làm gì | Chạy |
|---|---|---|
| `measure.mjs` | Bộ thu kết quả (cổng 4010) nhận từng lần đo từ trang và ghi vào `results/raw/`; `summary` tổng hợp; `restart` khởi động lại theo cấu hình. **Không chạy cùng `start-all.sh`** | `npm run collector` khi đo từng cấu hình bằng tay (`npm run matrix` tự khởi động và tự tắt nó) |
| `restart-cold.sh` | Khởi động lại **toàn bộ** service để đo chế độ lạnh, ghi `results/cold-session.json` | `bash tools/restart-cold.sh [on\|off]` |
| `run-matrix.mjs` | Chạy cả ma trận 16 cấu hình bằng trình duyệt thật (nạp dữ liệu → khởi động lạnh → mở trang đo → chờ kết quả) | `npm run matrix` (thêm `--dry` để xem kế hoạch) |
| `report.mjs` | Tạo bảng đo thô dễ đọc từ `results/raw/` → `results/evidence/measurements.md` | `npm run report` |

Bộ chạy đo **trong trang** (nút "Chạy 1 lạnh + 5 ấm") nằm ở `../../web/public/measure/runner.js` và `../../web/public/measure/measure-client.js`, vì đó là mã chạy trong trình duyệt.

## Khác

| Tệp | Làm gì |
|---|---|
| `mock-services.mjs` | User/Order/Product **giả** đúng hợp đồng (dữ liệu trong bộ nhớ), chỉ để thử khi chưa có service thật: `SIZE=S npm run mock` |

## Kết quả nằm ở đâu
Ở gốc repo, thư mục `results/`: `evidence/` (trace, call graph, bảng đo), `verification/` (báo cáo đối chiếu), `raw/` (từng lần đo). Log thô của các service nằm ở `services/logs/` (do `start-all.sh` ghi stdout vào đó, không commit; đổi bằng `LOG_DIR`).
