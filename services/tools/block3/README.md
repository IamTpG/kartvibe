# Block 3 Tools: Kịch bản Snapshot, Lỗi và Đo kiểm (W4)

Thư mục công cụ kiểm thử, snapshot, giả lập lỗi và đo lường cho Block 3 (REST vs gRPC giữa Order API và Inventory Service).

---

## 1. Yêu cầu môi trường & Cài đặt

- **Node.js:** phiên bản ≥ 22 (đã kiểm chứng trên Node 22 và 24).
- **Cài đặt thư viện:**
  ```bash
  cd services/tools/block3
  npm install
  ```
- **Sinh mã Protobuf (nếu cần sinh lại):**
  ```bash
  npm run codegen
  ```
  *(Mã sinh ra đã được commit sẵn trong `generated/v1/` và `generated/v2/`).*

---

## 2. Yêu cầu để chạy với Hệ thống thật

Khi chạy với hệ thống thật của dự án:
1. **Các service cần chạy:**
   - `order` (REST baseline): cổng **4002** (biến môi trường `ORDER_REST_URL`, mặc định `http://localhost:4002`)
   - `order-grpc` (gRPC mode): cổng **4012** (biến môi trường `ORDER_GRPC_URL`, mặc định `http://localhost:4012`)
   - `inventory` (REST & gRPC): cổng **4006** (biến môi trường `INVENTORY_URL`, mặc định `http://localhost:4006`)
   - *(Tùy chọn)* `order-grpc-v1` (client cũ): cổng **4022** (biến môi trường `ORDER_OLD_URL`, mặc định `http://localhost:4022`). Nếu cổng này không chạy, công cụ tự động bỏ qua bản chụp thứ 3 và ghi rõ "không chạy".
2. **Bắt buộc bật Test Hooks:**
   Tất cả các service thật phải được khởi động với biến môi trường:
   ```bash
   ENABLE_TEST_HOOKS=1
   ```
   nhằm cho phép các endpoint `POST /_reset` (Order và Inventory) và `POST /_fault` (Inventory) hoạt động.

---

## 3. Quy tắc Chuẩn hóa Dữ liệu (Normalization Rules)

Khi gọi API ngoài và lưu snapshot, dữ liệu được chuẩn hóa qua `lib/normalize.mjs` theo các quy tắc:
1. **Loại bỏ ID động trong Body:** Trường `orderId` trong body được thay thế bằng chuỗi cố định `"<ID>"`.
2. **Loại bỏ Header và ID điều hướng động:**
   - Các header thay đổi theo thời gian hoặc tiến trình: `date`, `x-request-id`, `etag`, `last-modified`, `content-length`, `connection`, `keep-alive` bị loại bỏ khi so sánh.
   - Header quan trọng như `content-type` được giữ lại.
   - Nếu trong body có chứa `x-request-id` hoặc `requestId`, chúng sẽ được loại bỏ để tránh lệch hash.
3. **Giữ nguyên vẹn các trường xác định:**
   - HTTP status code (201, 400, 409, 503, 504).
   - Nội dung nghiệp vụ: `sku`, `quantity`, `status: "CONFIRMED"`, `code` lỗi (ví dụ `OUT_OF_STOCK`, `VALIDATION_ERROR`, `INVENTORY_TIMEOUT`, `INVENTORY_UNAVAILABLE`), `message`.

---

## 4. Danh mục Lệnh và Cách Chạy

### 4.1. Kiểm tra toàn diện nhanh (`npm run check`)
Chạy bộ kiểm thử tự động với Mock Services tích hợp sẵn trong `test/` (không cần khởi động hệ thống thật):
```bash
npm run check
```
Lệnh này tự động thực thi tuần tự:
1. Khởi động Mock Cluster (Order 4002, 4012 và Inventory 4006).
2. Kiểm tra Unit Test logic chuẩn hóa (`test/normalize.test.mjs`).
3. Chạy 4 kịch bản snapshot (`ok`, `out-of-stock`, `invalid-quantity`, `invalid-body`) và so sánh đối chiếu REST vs gRPC.
4. Chạy kịch bản làm chậm Inventory (`slow`) và kiểm tra mã lỗi 504 `INVENTORY_TIMEOUT` với thời gian hữu hạn.
5. Chạy đo payload Lớp 1 (`payload.ts`).
6. Chạy đo thời gian phản hồi latency (`latency.mjs --n 5`).
7. Tắt sạch Mock Cluster và thoát với mã `0` khi tất cả đều PASS.

---

### 4.2. Chạy bộ Kịch bản Snapshot (`npm run scenario`)
```bash
npm run scenario
```
- Gọi tuần tự `POST /_reset` trước mỗi kịch bản.
- Chạy 4 kịch bản:
  - `ok`: `{sku:"SKU-OK", quantity:2}` → 201 `{orderId:"<ID>", sku:"SKU-OK", quantity:2, status:"CONFIRMED"}`
  - `out-of-stock`: `{sku:"SKU-ZERO", quantity:1}` → 409 `{code:"OUT_OF_STOCK", message:"..."}`
  - `invalid-quantity`: `{sku:"SKU-OK", quantity:0}` → 400 `{code:"VALIDATION_ERROR", message:"..."}`
  - `invalid-body`: Payload không phải JSON hợp lệ → 400 `{code:"VALIDATION_ERROR", message:"..."}`
- Lưu snapshot đã chuẩn hóa vào thư mục `snapshots/`:
  - `snapshots/<kịch-bản>.rest.json`
  - `snapshots/<kịch-bản>.grpc.json`
  - `snapshots/<kịch-bản>.grpc-v1.json` (nếu có client cũ ở cổng 4022)
- In `PASS` khi hai snapshot giống nhau, in `FAIL` kèm diff chi tiết nếu có sai lệch.

---

### 4.3. Kịch bản Inventory chậm (`npm run slow`)
```bash
npm run slow
```
- Gửi `POST http://localhost:4006/_fault {"delayMs": 2000}` (vượt quá deadline 500 ms của Order).
- Gọi `POST /orders` trên cả hai cổng 4002 và 4012.
- Kiểm tra kết quả trả về:
  - Status: **504**
  - Body: `{ "code": "INVENTORY_TIMEOUT", ... }`
  - Thời gian kết thúc hữu hạn (đo thời gian thực tế và so sánh < 1500 ms).
- Ghi nhận `timestamp`, `status`, `body`, `thời gian đo`.
- Sử dụng khối `finally` để chắc chắn gửi lại `{"delayMs": 0}` nhằm đưa Inventory trở lại bình thường.

---

### 4.4. Kịch bản Inventory tắt (`npm run down`)
Kịch bản này đòi hỏi Inventory **thật sự đã bị tắt** trước khi chạy.
1. **Bước 1: Tắt Inventory:**
   - Trên Linux/macOS/Git Bash:
     ```bash
     ./stop-inventory.sh services/.run/inventory.pid
     ```
   - Trên Windows PowerShell:
     ```powershell
     .\stop-inventory.ps1 -PidFile services/.run/inventory.pid
     ```
2. **Bước 2: Chạy kịch bản kiểm tra:**
   ```bash
   npm run down
   ```
   - Script trước tiên gọi `GET /health` của Inventory: nếu Inventory vẫn đang chạy, script **dừng lại ngay và báo lỗi rõ ràng** (không đoán mò).
   - Khi xác nhận Inventory đã tắt, gọi `POST /orders` trên cả hai cổng 4002 và 4012.
   - Kiểm tra kết quả:
     - Status: **503**
     - Body: `{ "code": "INVENTORY_UNAVAILABLE", ... }`
     - Thời gian kết thúc hữu hạn (< 2000 ms).

---

### 4.5. Đo Payload Lớp 1 (`npm run payload`)
```bash
npm run payload
```
- Đo kích thước message đã serialize của lời gọi `Reserve(SKU-OK, 2)`:
  - **REST (JSON):** `Buffer.byteLength(JSON.stringify(body))` của request và reply.
  - **Protobuf:** `encode(...).finish().length` của message request và reply sinh từ `inventory.proto` (v1 và v2).
- Báo cáo chi tiết:
  - Request: REST JSON (29 bytes) vs Protobuf (10 bytes) → Protobuf tiết kiệm 65.5%.
  - Reply: REST JSON (30 bytes) vs Protobuf v1 (14 bytes) vs Protobuf v2 (16 bytes khi có `available=8`, 14 bytes khi vắng).
  - Chi phí của trường `available`: đúng **2 bytes** khi có mặt, **0 bytes** khi vắng mặt (nhờ cơ chế presence).
- Báo cáo Markdown được lưu tại `out/payload-measurement.md`.

---

### 4.6. Đo thời gian phản hồi (`npm run latency`)
```bash
npm run latency
# Hoặc tùy chỉnh số lần đo:
node latency.mjs --n 10
```
- Gọi kịch bản `ok` tối thiểu 5 lần trên từng cổng (mặc định 5 lần).
- Luôn gọi `/_reset` trước mỗi lần để đảm bảo điều kiện công bằng.
- Tính toán và in bảng:
  - **Median (ms)**
  - **[Min, Max] (ms)**
  - Các giá trị mẫu đo được kèm timestamp và điều kiện chạy.
- Lưu dữ liệu đo chi tiết vào `out/latency-measurement.json`.
- *(Không đưa ra kết luận khái quát hóa về hiệu năng trong output theo yêu cầu của đề bài).*

---

## 5. Cấu trúc Thư mục Đầu ra

```text
services/tools/block3/
├── check.mjs                   # Script chạy kiểm tra tự động npm run check
├── scenarios.mjs               # Bộ kịch bản và so sánh snapshot
├── slow.mjs                    # Kịch bản Inventory chậm (504 INVENTORY_TIMEOUT)
├── down.mjs                    # Kịch bản Inventory tắt (503 INVENTORY_UNAVAILABLE)
├── payload.ts                  # Đo payload lớp 1 (REST JSON vs Protobuf v1/v2)
├── latency.mjs                 # Đo thời gian phản hồi (median, [min, max])
├── stop-inventory.sh           # Script dừng tiến trình Inventory bằng PID
├── stop-inventory.ps1          # Script dừng tiến trình Inventory trên Windows
├── lib/
│   └── normalize.mjs           # Module chuẩn hóa response và so sánh diff
├── scripts/
│   └── codegen.mjs             # Script sinh mã TypeScript từ file .proto
├── generated/
│   ├── v1/inventory.ts         # Mã sinh từ proto v1
│   └── v2/inventory.ts         # Mã sinh từ proto v2
├── test/
│   ├── mock-services.mjs       # Mock servers cho Order (4002, 4012) và Inventory (4006)
│   ├── normalize.test.mjs      # Unit tests cho logic chuẩn hóa
│   └── down-scenario.test.mjs  # Unit tests cho kịch bản down
├── snapshots/                  # Thư mục lưu các bản chụp snapshot đã chuẩn hóa
│   ├── ok.rest.json
│   ├── ok.grpc.json
│   ├── out-of-stock.rest.json
│   └── ...
└── out/                        # Thư mục lưu kết quả đo lường
    ├── payload-measurement.md  # Báo cáo đo payload lớp 1
    └── latency-measurement.json# Dữ liệu đo thời gian phản hồi
```
