# Plan Block 3: REST và gRPC giữa các service

> **Bản nháp của team lead, cho đến khi team lead xác nhận toàn bộ.** Hiện D1 đến D15 đều ở trạng thái `Chốt` và mục 3 đã được rà soát; quyết định mới thêm sau này có trạng thái `Đề xuất` hoặc `Chờ quyết định` cho đến khi được chốt. Chỉ giao việc khi D1 đến D15 và mục 3 đã `Chốt`. Plan phải xong **trước khi hiện thực gRPC** (đề bài yêu cầu). Cách phối hợp chung: `advance-web/CACH-LAM-VIEC.md`.
>
> Ký hiệu: **[KC]** đã kiểm chứng trong code hoặc đề; **[CKC]** chưa kiểm chứng, người nhận việc phải kiểm tra trước khi dựa vào.

## 1. Mục tiêu và phạm vi

Luồng đặt hàng đi qua hai boundary: browser → Order API (REST/JSON, **giữ nguyên**), và Order API → Inventory. Chặng sau chuyển từ REST sang gRPC. Thêm một field vào proto, chứng minh client build từ proto cũ vẫn chạy với server mới, xử lý thiếu hàng, Inventory chậm và tắt, rồi đo payload và ghi trải nghiệm phát triển.

**Ngoài phạm vi:** streaming, gRPC-Web, retry và idempotency (thuộc block sau; chỉ ghi rủi ro vào báo cáo), xác thực.

## 2. Quyết định chung

Bắt buộc tuân theo. Thành viên không tự đổi; nếu thấy sai thì ghi vào `HANDOVER.md`, không sửa.

| ID | Quyết định | Lý do ngắn | Đã không chọn và vì sao | Trạng thái |
|---|---|---|---|---|
| D1 | **Đặt code trong `services/`**: thêm `inventory/`, mở rộng `order/`. Không dùng `api/`. | Có sẵn khung log, health, `x-request-id`, hợp đồng OpenAPI; công thấp nhất (phân tích ở trao đổi trước) | `api/` (Order hoặc Inventory đặt trong đó): thêm migration Prisma, đụng test nghiệm thu, phải viết ADR liên kết hai dự án; công sức ước lượng cao hơn nhiều [SL]. Làm riêng rồi áp dụng sau: làm tích hợp hai lần. | Chốt |
| D2 | Inventory có **database riêng `kartvibe_inventory`** (cùng server Postgres, cổng 5434). Không lưu trong bộ nhớ. Bảng `stock(sku, available)` và `reservations(id, sku, quantity, created_at)`. Giữ hàng phải **nguyên tử**: một câu lệnh có điều kiện (ví dụ `UPDATE ... SET available = available - $q WHERE sku = $s AND available >= $q`), để hai request đồng thời không cùng giữ phần hàng cuối. `POST /_reset` nạp lại bằng seed xác định. | Cùng mô hình "mỗi service một database"; quy tắc "ai đến trước được giữ" do một câu lệnh nguyên tử bảo đảm | Dữ liệu trong bộ nhớ: đơn giản hơn, khỏi sửa phần tạo DB, nhưng không phản ánh mô hình mỗi service một DB và mất khi khởi động lại (team lead chọn DB riêng). | Chốt |
| D3 | Order lưu đơn trong **database `kartvibe_order` có sẵn**, vào **bảng mới** `purchase_orders(id serial, sku, quantity, reservation_id, status, created_at)`. Không dùng bảng `orders` của Block 2 (seed Block 2 xóa bảng đó và hợp đồng `GET /orders` giữ nguyên). `POST /_reset` xóa bảng mới và đặt lại bộ đếm id. | Không làm hỏng dữ liệu và kiểm tra của Block 2; id xác định sau reset | Lưu trong bộ nhớ (team lead không chọn). Dùng lại bảng `orders` của Block 2: sẽ bị seed Block 2 `TRUNCATE` và làm lẫn với hợp đồng `GET /orders`. | Chốt |
| D4 | Thiếu hàng ở gRPC: status **`FAILED_PRECONDITION`** kèm lý do **`OUT_OF_STOCK`** trong trailing metadata `x-error-code`; `details` (`grpc-message`) là câu mô tả tiếng Anh cho người đọc (`Insufficient stock for <sku>`), Order không đọc nó. Không tạo order, không giữ hàng. Order dựa vào `x-error-code`, không dựa riêng vào status, vì `FAILED_PRECONDITION` sau này có thể dùng cho điều kiện khác. Reply không có field `reserved`: thiếu hàng đi bằng status lỗi (đã bỏ field `reserved` của ví dụ trong bài giảng vì thừa). | gRPC không cho tự thêm status code, nên mã nghiệp vụ đi kèm bằng metadata; đối xứng với REST 409 `OUT_OF_STOCK` (D5). Đề cho cả hai cách, đây là lựa chọn của nhóm. Đã thử: server đặt `metadata.set('x-error-code', 'OUT_OF_STOCK')` trong lỗi, client đọc `err.metadata.get('x-error-code')` được [KC]. Tên khóa là **hợp đồng giữa W1 và W2**, không tự đổi | B: reply `reserved=false` (khớp proto slide, dùng đúng field `reserved`) nhưng REST trả 409 còn gRPC trả OK nên code client hai bên không đối xứng. | Chốt |
| D5 | REST Inventory khi thiếu hàng trả **409** `{ "code": "OUT_OF_STOCK", ... }`; đủ hàng trả **201** kèm `reservationId`. | Theo hình slide 4 của đề (`POST /reservations` trả 201 hoặc 409 out_of_stock) [KC]; hình ghi chữ thường, nhóm dùng `OUT_OF_STOCK` cho đồng nhất với mã lỗi các service khác | HTTP 200 với `reserved:false` (đề xuất ban đầu): trái hình slide 4, nơi Inventory REST trả 409. | Chốt |
| D6 | Field thêm vào: `optional int32 available = 2` ở `ReserveReply` (số lượng còn lại sau khi xử lý). | Đúng ví dụ trong slide; `optional` để có presence | `int32 available = 2` không `optional`: giá trị 0 và field vắng không phân biệt được (rủi ro mà đề nêu). | Chốt |
| D7 | Khi `available` vắng, Order **không suy ra 0**: log `available: "absent"`. API ngoài **không đổi**, không lộ `available`. | Tránh hiểu sai giá trị mặc định; giữ nguyên contract ngoài | Suy ra 0 khi vắng: sai nghĩa (hết hàng hay client cũ?). Đưa `available` vào response ngoài: đổi contract mà đề bắt giữ nguyên. | Chốt |
| D8 | Deadline gọi Inventory: `INVENTORY_DEADLINE_MS`, mặc định **500**. Cả REST baseline cũng có timeout cùng giá trị. | Đề yêu cầu request kết thúc trong thời gian hữu hạn | Chỉ gRPC có deadline: REST baseline có thể treo, mất tính so sánh công bằng và trái yêu cầu hữu hạn thời gian [SL]. | Chốt |
| D9 | Node/TypeScript: `@grpc/grpc-js` + `grpc-tools` (kèm `protoc`, cài bằng npm) + `ts-proto` (`outputServices=grpc-js`). Đã chạy thử trong thư mục tạm: cài được, sinh code (có `available?: number \| undefined`), server v2 với client v1 và v2 chạy được. npm hiện cảnh báo về script cài đặt chưa được duyệt (`npm approve-scripts`) nhưng `protoc` vẫn dùng được. | Có bước sinh code thật cho báo cáo [KC: thử trên Node 24.18.1, protoc 3.19.1] | `@grpc/proto-loader` (nạp proto lúc chạy): không có bước sinh code thật nên thiếu output sinh code và lỗi compile mà đề muốn ghi. `buf` hay `protoc` cài ở hệ thống: thêm bước cài ngoài npm. | Chốt |
| D10 | **Client cũ** = bản **Order build từ proto v1** (thư mục `order-v1/`, tiến trình `order-grpc-v1`, cổng 4022): cùng mã nguồn Order của W2, `src/generated` sinh từ **proto v1**, không đọc `available`, gửi `x-client-version: v1`. **Đóng băng**: commit proto v1, mã sinh ra, `FROZEN.sha256` (sha256 của proto và mã sinh ra) và script `verify-frozen`. Team lead dựng sau khi có Order của W2. Order hiện hành là client mới (`x-client-version: v2`). | Client cũ chạy đúng flow `POST /orders` qua server mới; chứng minh bằng hash và log, không cần dựng lại | CLI client v1 và v2 độc lập: làm song song được, nhưng client cũ không đi qua `POST /orders`, nên bằng chứng yếu hơn. | Chốt |
| D11 | Đại lượng đo payload: **lớp 1**, tức **message Protobuf đã serialize** so với **JSON body** của đúng request và reply đó (đề minh họa 25 byte so với 6 byte), đo cả request lẫn reply. Wire bytes (lớp 3) chỉ ghi riêng nếu có thời gian, không trộn với lớp 1. | Cùng một đại lượng cho cả hai bên | Wire bytes hoặc body kèm khung (lớp 2, 3): đề cấm so một lớp của bên này với lớp khác của bên kia; header HTTP/2 và HTTP/1.1 làm chênh lệch khó diễn giải. | Chốt |
| D12 | Làm "client mới với server cũ": `order-grpc` gọi **`inventory-grpc-v1`** (thư mục `inventory-v1/`, server tối thiểu build từ proto v1, không đặt `available`) và log `available: "absent"`. | Cần cho quan sát field vắng thật | Bỏ qua (đề ghi "nếu còn thời gian"): không quan sát được field vắng thật. Chọn làm vì còn thời gian. | Chốt |
| D13 | Chạy **hai bản Order song song** (`order` 4002 REST, `order-grpc` 4012 gRPC) từ cùng mã nguồn, thay vì chọn giao thức theo từng request. API ngoài không có công tắc ẩn. Hai bản dùng chung DB và Inventory nên kịch bản chạy **tuần tự** và gọi `/_reset` giữa các lần. | Khác biệt giữa hai bản chỉ có thể do giao thức; log tách theo tên cho bằng chứng rõ; không thêm mã chỉ để test | Một bản Order chọn giao thức theo từng request (header hoặc query): thêm đường điều khiển ẩn vào API ngoài, hai nhánh sống chung một tiến trình nên khó nói "đã chuyển sang gRPC". | Chốt |
| D14 | **Không bù trừ** khi Order lỗi sau khi Inventory đã giữ hàng, hoặc khi Order thấy quá hạn trong lúc Inventory đã chạy xong. Chỉ log `reservationId`; ghi rủi ro (và liên hệ retry, idempotency ở block sau) vào báo cáo. | Bù trừ và idempotency ngoài phạm vi đề | Bù trừ (hoàn hàng) hoặc idempotency khi quá hạn: ngoài phạm vi của đề, thuộc block sau. | Chốt |
| D15 | **UI demo** `web/public/order-compare.html` (kèm `js/order-compare.js` và `js/order-compare-logic.js`): gửi cùng một `POST /orders` tới các bản Order (4002, 4012 và 4022 nếu đang chạy), hiện status, body, thời gian đo ở trình duyệt và kết luận giống/khác sau khi chuẩn hóa; có nút **nạp lại tồn kho** (`POST /_reset` của Inventory) và nút **làm chậm Inventory** (`POST /_fault`), nên **Inventory REST bật CORS** như Order (`cors({ origin: '*' })`). Là công cụ demo, **không phải bằng chứng**; không thuộc yêu cầu của đề. Giao cho W3. | Trực quan cho phần trình bày; rẻ vì `web/` và CORS (một dòng cấu hình) đã quen dùng ở các service | Không UI (đề không yêu cầu): demo kém trực quan. UI không CORS ở Inventory: không có nút làm chậm hay nạp lại tồn kho. Proxy trong `web/server.mjs`: sửa file dùng chung. | Chốt |

## 3. Hợp đồng chung

### 3.1 Cổng, tên, biến môi trường

| Thành phần | Cổng | Ghi chú |
|---|---|---|
| `order` (đã có) | 4002 | Thêm `POST /orders`, `POST /_reset`; `INVENTORY_PROTOCOL=rest` (baseline) |
| `order-grpc` | 4012 | **Cùng mã nguồn** với `order`, chạy với `INVENTORY_PROTOCOL=grpc` (D13) |
| `inventory` REST | 4006 | Nghiệp vụ, `/health`, `/_metrics`, `POST /_reset`, `POST /_fault`; **bật CORS** `cors({ origin: '*' })` như Order (cho UI demo, D15) |
| `inventory` gRPC | 4007 | Cùng process với REST |
| `order-grpc-v1` | 4022 | **Client cũ** (D10), mã ở thư mục `order-v1/`: Order build từ proto v1, đóng băng; chạy khi thử client cũ với server mới |
| `inventory-grpc-v1` gRPC | 4008 | Server cũ tối thiểu (D12), mã ở thư mục `inventory-v1/`; chỉ chạy khi thử client mới với server cũ (đặt `GRPC_PORT=4007` nếu muốn `order-grpc` gọi nó mà không đổi cấu hình, sau khi dừng Inventory thật) |

**Quy ước tên:** tên tiến trình (và tên file log `logs/<tên>.log`) là `order`, `order-grpc`, `order-grpc-v1`, `inventory`, `inventory-grpc-v1`; thư mục mã nguồn là `order/` (chạy hai tiến trình `order` và `order-grpc`), `order-v1/`, `inventory/`, `inventory-v1/`.

**`inventory` là một tiến trình, hai cổng** (4006 REST, 4007 gRPC). Đã cân nhắc tách thành hai tiến trình cho tên đối xứng với Order và không chọn: `/_fault`, `/health` và "tắt Inventory" đều dựa vào một tiến trình chung. Order tách hai tiến trình vì consumer chọn giao thức lúc khởi động (D13), còn Inventory phục vụ cả hai.

`POST /_reset` (Order và Inventory) và `POST /_fault` (Inventory) chỉ bật khi `ENABLE_TEST_HOOKS=1`, như Product của Block 2. `POST /_fault` nhận `{ "delayMs": n }` (0 là bình thường), tác động **cả REST và gRPC**, để làm Inventory chậm rồi trả lại mà không khởi động lại. "Tắt Inventory" là dừng process (W4 viết script); `start-all.sh` đặt PID ở `services/.run/inventory.pid`, theo mẫu `.run/<tên>.pid` đang dùng [KC: `start-all.sh`].

| Biến | Mặc định | Dùng ở |
|---|---|---|
| `INVENTORY_PROTOCOL` | `rest` (`rest` hoặc `grpc`); đặt một lần lúc khởi động, không đổi khi đang chạy | Order |
| `INVENTORY_REST_URL` | `http://localhost:4006` | Order |
| `INVENTORY_GRPC_ADDR` | `localhost:4007` | Order |
| `INVENTORY_DEADLINE_MS` | `500` (REST cũng có timeout cùng giá trị, D8) | Order |
| `PORT`, `GRPC_PORT` | `4006`, `4007` | Inventory |
| `PGDATABASE` | `kartvibe_inventory` (Order: `kartvibe_order` có sẵn) | Inventory |
| `LATENCY_MS` | `0` | Inventory (độ trễ giả cố định) |
| `ENABLE_TEST_HOOKS` | tắt | Order, Inventory |

### 3.2 API ngoài (browser và bên thứ ba), **không đổi trước và sau**

Lỗi theo dạng đã dùng ở các service: `{ "code": string, "message": string }`.

| Tình huống | Status | Body |
|---|---|---|
| Đủ hàng | 201 | `{ "orderId": <int>, "sku": "...", "quantity": <int>, "status": "CONFIRMED" }` |
| Thiếu hàng | 409 | `{ "code": "OUT_OF_STOCK", "message": "..." }` |
| Dữ liệu sai (sku rỗng, `quantity < 1`) | 400 | `{ "code": "VALIDATION_ERROR", "message": "..." }` |
| Inventory quá hạn | 504 | `{ "code": "INVENTORY_TIMEOUT", "message": "..." }` |
| Inventory không kết nối được | 503 | `{ "code": "INVENTORY_UNAVAILABLE", "message": "..." }` |

Giá trị động cần loại khi đối chiếu snapshot: `orderId`, header thời gian, `x-request-id`.

**Validate chia hai tầng:**
- **Order** chỉ kiểm hình dạng: body là JSON object hợp lệ, `sku` là chuỗi, `quantity` là số nguyên. Sai thì 400 `VALIDATION_ERROR` ngay, không gọi Inventory.
- **Inventory** kiểm miền giá trị: `sku` không rỗng và tối đa 64 ký tự; `quantity` từ 1 đến 1000. Sai thì `INVALID_ARGUMENT` (REST: 400), Order ánh xạ ra 400 `VALIDATION_ERROR`. Nhờ vậy nhánh ánh xạ lỗi này chạy được end-to-end (đề: `INVALID_ARGUMENT` dùng cho `quantity` nhỏ hơn 1).

### 3.3 Inventory và ánh xạ lỗi

REST baseline: `POST /inventory/reservations` body `{ "sku", "quantity" }`. Đủ hàng: 201 `{ "reservationId": string }`. Thiếu hàng: 409 `{ "code": "OUT_OF_STOCK", "message": string }` (D5). `quantity < 1`: 400.

Proto v1 (đặt tại `services/proto/inventory/v1/inventory.proto`):

```proto
syntax = "proto3";
package kartvibe.inventory;
service Inventory { rpc Reserve(ReserveRequest) returns (ReserveReply); }
message ReserveRequest { string sku = 1; int32 quantity = 2; }
message ReserveReply  { string reservation_id = 1; }
```

Proto v2 (`.../v2/inventory.proto`) chỉ thêm `optional int32 available = 2;` vào `ReserveReply`. Field 1 (`reservation_id`) giữ nguyên tag, kiểu và nghĩa. **Giữ nguyên `package kartvibe.inventory` và tên service**: tên đầy đủ của lời gọi là `/kartvibe.inventory.Inventory/Reserve`, đổi package thì client cũ không gọi được (đã thử: client v1 bị từ chối khi server nằm ở package khác, chạy được khi giữ cùng package) [KC]. Thư mục `v1/`, `v2/` chỉ là hai bản chụp của cùng một hợp đồng.

| Sự kiện | Inventory gRPC | Inventory REST | Order trả ra ngoài |
|---|---|---|---|
| Đủ hàng | OK (kèm `reservation_id`) | 201 | 201 |
| Thiếu hàng | `FAILED_PRECONDITION` kèm `x-error-code: OUT_OF_STOCK` (D4) | 409 `OUT_OF_STOCK` | 409 `OUT_OF_STOCK` |
| Dữ liệu ngoài miền (3.2) | `INVALID_ARGUMENT` | 400 | 400 `VALIDATION_ERROR` |
| Không kịp deadline | `DEADLINE_EXCEEDED` (phía client) | timeout phía client | 504 `INVENTORY_TIMEOUT` |
| Không kết nối được | `UNAVAILABLE` | `ECONNREFUSED` hoặc tương đương | 503 `INVENTORY_UNAVAILABLE` |
| Lỗi khác | `INTERNAL` | 5xx | 500 `INTERNAL_ERROR` |

**Sinh code:** mỗi service tự sinh code từ `.proto` dùng chung vào `src/generated/` của mình, không import code sinh của service khác (ADR 0011). Lệnh đã chạy thử [KC], chạy từ thư mục service đã cài `grpc-tools` và `ts-proto`:

```bash
./node_modules/.bin/grpc_tools_node_protoc \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=src/generated \
  --ts_proto_opt=outputServices=grpc-js,esModuleInterop=true \
  -I ../proto/inventory/v2 ../proto/inventory/v2/inventory.proto
```

Reserve có thể đã chạy xong dù Order thấy quá hạn, và không bù trừ (D14).

### 3.4 Fixture tồn kho (xác định)

| sku | Tồn |
|---|---|
| `SKU-OK` | 10 |
| `SKU-LOW` | 1 |
| `SKU-ZERO` | 0 |

Đường đủ hàng dùng `{sku:"SKU-OK", quantity:2}`; đường thiếu hàng dùng `{sku:"SKU-ZERO", quantity:1}`. **Khởi tạo tự động:** mỗi service tự tạo bảng khi khởi động (`CREATE TABLE IF NOT EXISTS`); Inventory nạp bảng `stock` theo bảng trên nếu bảng đang rỗng, nên `start-all.sh` không cần bước seed. `POST /_reset` xóa `reservations` và nạp lại `stock`. sku không có trong `stock` coi như tồn 0.

### 3.5 Log

Mỗi lời gọi một dòng JSON ra stdout (ADR 0009), có sẵn `ts`, `service`, `requestId`, `method`, `path`, `status`, `ms`. **Thêm các trường tùy chọn**:

| Trường | Ý nghĩa |
|---|---|
| `protocol` | `rest` hoặc `grpc`, ở cả log phía gọi và phía nhận |
| `direction` | `inbound` hoặc `outbound` |
| `operation` | ví dụ `Reserve` |
| `grpcStatus` | tên status gRPC nếu có |
| `clientVersion` | `v1` hoặc `v2`, lấy từ metadata `x-client-version` |
| `available` | chỉ ở dòng `outbound` gRPC của lời gọi **có reply** thành công: giá trị, hoặc `"absent"` nếu reply không có field (D7). Lời gọi lỗi (quá hạn, hết hàng...) không có reply nên **không ghi khóa này** |
| `errorCode` | mã nghiệp vụ nếu có, ví dụ `OUT_OF_STOCK` |

Quy tắc ghi:
- **gRPC:** `method` là `"gRPC"`, `path` là `"/kartvibe.inventory.Inventory/Reserve"`, `status` là mã số gRPC (0 là OK, 9 là `FAILED_PRECONDITION`), `grpcStatus` là tên.
- **Order ghi hai dòng mỗi request**: một `inbound` (`POST /orders`) và một `outbound` (lời gọi Inventory, có `protocol`, `ms`), cùng `requestId`.
- **Client REST và gRPC đều gửi `x-client-version`** (header hoặc metadata) để log hai bên đối xứng.
- `x-request-id` truyền qua header (REST) hoặc metadata (gRPC), giữ như Block 2.
- Khi giữ hàng thành công, log `reservationId` (D14).

### 3.6 Cấu trúc thư mục đích và quyền sở hữu

Mỗi thành viên **chỉ sửa file trong phần mình sở hữu**. File dùng chung (`package.json` gốc của `services`, `start-all.sh`, `tools/check-contract.mjs`) do team lead sửa; thành viên ghi nhu cầu vào `HANDOVER.md`.

Proto do **team lead tạo ở giai đoạn 1 rồi đóng băng**, vì W1 và W2 cần ngay từ đầu.

```
services/
  proto/inventory/v1/inventory.proto      W5 (giai đoạn 1, đóng băng)
  proto/inventory/v2/inventory.proto      W5 (giai đoạn 1, đóng băng)
  inventory/                              W1   (có contract.ts và openapi.json cho REST, ADR 0011)
  order/                                  W2
  order-v1/                               W5   (client cũ: Order build từ proto v1, đóng băng; dựng khi tích hợp; trong workspaces)
  inventory-v1/                           W3   (server cũ tối thiểu, D12; trong workspaces)
  tools/compat/compat.mjs                 W3   (kiểm client cũ/mới và server cũ/mới qua `POST /orders` và log)
  tools/block3/                           W4   (kịch bản, snapshot, đo)
  web/public/order-compare.html           W3   (UI demo, D15)
  web/public/js/order-compare.js          W3
  web/public/js/order-compare-logic.js    W3
  web/test/order-compare-logic.test.mjs   W3   (test của hàm so sánh; không được server tĩnh phục vụ)
  start-all.sh, package.json, tools/*     W5
```

## 4. Phân việc

### 4.1 Công nghệ và phiên bản (bắt buộc, không tự nâng)

| Hạng mục | Giá trị |
|---|---|
| Nền | Node.js ≥ 22 (đã thử trên 24), TypeScript chạy bằng `tsx`, ESM [KC: `services/order/package.json`] |
| HTTP, DB, hợp đồng REST | Express 5, `pg` thuần (không Prisma), Zod 4 và `zod-to-openapi` [KC] |
| gRPC (D9) | `@grpc/grpc-js` **1.14.6**, `grpc-tools` **1.13.1**, `ts-proto` **2.13.0** [KC: đúng các bản đã thử]; ghi chính xác, **không dấu `^`**, trong `package.json` của mọi thư mục dùng gRPC |

### 4.2 Việc của giai đoạn 1 (team lead, trước khi giao)

- [x] Tạo `services/proto/inventory/v1` và `v2` theo 3.3, rồi đóng băng (đã kiểm bằng `protoc`).
- [x] Chuẩn bị **bản sao `services/order/`** (không có `node_modules`) cho W1 (làm mẫu cấu trúc service) và W2 (làm nền để sửa).
- [x] Viết bốn gói giao việc W1 đến W4 (`giao-viec/`, dựng bằng `giao-viec/dong-goi.sh`) (mục 4.3), mỗi gói kèm trích đề, mục 1 đến 3, bảng 4.1, phần việc và chuẩn bàn giao mục 5.
- [x] Nhánh `feat/block-03` đã có.

### 4.3 Bảng phân việc

Giai đoạn 1 xong mục 2, 3 và 4.2, rồi giao song song. Mỗi thành viên nhận **gói giao việc** gồm: trích đề, mục 1 đến 3, bảng 4.1, phần việc dưới đây, chuẩn bàn giao mục 5.

| Phần | Người | Mục tiêu | Đầu ra | Tự quyết | Tiêu chí xong |
|---|---|---|---|---|---|
| **W1** Inventory | Thành viên 1 | Dựng Inventory với DB riêng, REST (baseline) và gRPC server dùng chung logic; giữ hàng nguyên tử; validate miền giá trị; seed, `/_reset`, `/_fault`; **CORS** cho REST (D15); `contract.ts` và `openapi.json` cho REST | `services/inventory/` chạy độc lập, log theo 3.5 | Cấu trúc nội bộ, cách chia logic dùng chung | `curl` và client gRPC đều cho đúng bảng 3.3; hai request đồng thời vào phần hàng cuối chỉ một thành công; server v2 set `available`; log có `protocol`, `clientVersion`, `reservationId` |
| **W2** Order | Thành viên 2 | `POST /orders` lưu DB (D3), `/_reset`; client REST và client gRPC chọn bằng `INVENTORY_PROTOCOL`; kiểm hình dạng đầu vào; ánh xạ lỗi theo bảng 3.3 (cả hai giao thức); deadline; hai dòng log mỗi request; **cô lập** mọi mã phụ thuộc hình dạng `ReserveReply` (đọc `available`, hằng `clientVersion`) trong **một file** để dựng `order-v1` bằng cách sinh lại code từ proto v1 | Thay đổi trong `services/order/` kèm `openapi.json` mới (`npm run openapi`) | Cách đặt lớp client, cách đo deadline | API ngoài đúng 3.2 ở cả hai chế độ; Inventory chậm hoặc tắt vẫn trả lỗi trong thời gian hữu hạn |
| **W3** Tương thích | Thành viên 3 | Kiểm chứng toolchain (D9); **UI demo** `order-compare.html` (D15, gồm nút nạp lại tồn kho và làm chậm Inventory); `inventory-v1/`; bản giả server v2 để thử; `compat.mjs`: gọi `POST /orders` tới một Order, rồi đọc log Order và Inventory theo `requestId` để kiểm `clientVersion`, `available` (số hoặc `absent`) và kết quả; lưu diff proto và output sinh code | `services/inventory-v1/`, `services/tools/compat/compat.mjs`, các tệp UI trong `web/` và bằng chứng | Cách đóng băng server cũ, định dạng bằng chứng | `compat.mjs` chạy được với Order và Inventory giả; server cũ không bao giờ đặt `available`; diff proto và output sinh code lưu được |
| **W4** Snapshot và đo | Thành viên 4 | Kịch bản gọi `POST /orders` hai đường trên **cả hai cổng** (4002 và 4012), tuần tự, `/_reset` giữa các lần; chuẩn hóa giá trị động; so snapshot trước/sau; kịch bản Inventory chậm và tắt có timestamp; công cụ đo payload theo D11; script đo thời gian (≥ 5 lần mỗi cổng, median và [min, max]) | `services/tools/block3/` | Cách chuẩn hóa, định dạng snapshot | Chạy được với cả hai giá trị `INVENTORY_PROTOCOL`, in PASS/FAIL, ghi log kết quả |
| **W5** Hạ tầng và tích hợp | Team lead | **Giai đoạn 1: tạo `services/proto/` (v1, v2) theo 3.3 rồi đóng băng.** `start-all.sh` (thêm tạo DB `kartvibe_inventory`, khởi động `inventory`, `order-grpc` và `order-grpc-v1` (từ `order-v1/`); mỗi bản Order ghi log riêng), workspaces, `contracts:check`, **dựng và đóng băng `order-v1`** sau khi có Order của W2, ADR về giao thức nội bộ, README chạy lại, khung báo cáo | Sửa file dùng chung, `order-v1/`, ADR, README | Toàn quyền | Khởi động đủ service, bộ kiểm tra Block 2 vẫn xanh |

Phụ thuộc: W1 và W2 cùng dựa vào proto và bảng 3.3 đã cố định ở Plan nên chạy song song được; kiểm tra chéo hai phần chỉ xảy ra ở tích hợp. W2, W3 và W4 mỗi người **tự dựng bản giả** của phần mình chưa có (Inventory giả cả REST lẫn gRPC cho W2; server hoặc Order tối thiểu cho W3, W4) từ hợp đồng 3.2 và 3.3, đặt trong `test/` của thư mục mình. Bản giả **được bàn giao cùng** để team lead chạy được `npm run check`, nhưng **không phải sản phẩm nộp hay bằng chứng** (team lead quyết định giữ hay bỏ). Rủi ro là các bản giả lệch nhau; sẽ lộ ra ở tích hợp. W3 phải **không** chỉnh `.proto` (thuộc W5); nếu phát hiện lỗi thì ghi vào `HANDOVER.md`. Thành viên nào cần giả định thêm thì tự quyết và ghi lý do.

## 5. Chuẩn bàn giao (mỗi thành viên)

- Thư mục theo đúng đường dẫn mục 3.6, chạy độc lập, có `README.md` ngắn: cài, chạy, sinh code, kiểm tra.
- `HANDOVER.md` gồm: quyết định tự đưa ra và lý do; điều đã kiểm chứng và điều chỉ là suy luận; thư viện cần thêm vào `package.json`; việc cần team lead làm ở file dùng chung; vấn đề còn tồn đọng.
- Không sửa D1 đến D15. Không có secret hay dữ liệu thật. Không chỉnh file thuộc phần người khác.
- Tên và cổng theo 3.1; log theo 3.5.
- `HANDOVER.md` ghi **phần nào do AI hỗ trợ** (phần, công cụ, cách bạn đã kiểm) và với mỗi quyết định tự đưa ra thì ghi cả **phương án đã không chọn và trade-off**. Kết quả chạy và số liệu không do AI viết: người làm chạy lệnh và lưu nguyên văn.
- Mỗi thư mục là một gói npm (service, công cụ) có `npm run check`: thoát 0 khi đạt, 1 khi không, in kết quả rõ ràng. Phần UI (`web/`) kiểm theo W3, mục 9.
- `HANDOVER.md` thêm mục **Quan sát trải nghiệm phát triển**: các bước đã làm, lỗi compile và runtime đã gặp, cách xử lý. Đây là nguyên liệu cho phần developer experience của báo cáo.
- Bản giả trong `test/` được bàn giao để chạy `npm run check`, nhưng không thuộc sản phẩm nộp hay bằng chứng.

## 6. Tích hợp và đo (team lead)

0. **Nghĩa của "trước/sau":** "trước" là chạy ở chế độ REST (cổng 4002), "sau" là chế độ gRPC (cổng 4012), cùng mã nguồn (D13). Báo cáo nói rõ điều này: nó chứng minh việc đổi giao thức không đổi API ngoài, nhưng không chứng minh mã cũ và mã mới giống nhau.
1. Đưa các phần vào `services/`, chạy `contracts:check`, `check`, rồi chạy kịch bản W4.
2. **Chạy lại tất cả số liệu** (snapshot, log, client cũ, lỗi, payload) trên hệ thống đã tích hợp; số nộp là số của team lead.
3. Đo thời gian: ít nhất 5 lần mỗi cấu hình, báo median và [min, max]; dữ liệu nhỏ, một máy, nên không kết luận hiệu năng chung.
4. Ghi trải nghiệm phát triển bằng quan sát thật: bước sinh code, lỗi compile và runtime gặp phải, cách đọc log, độ khó phát hành client và server riêng. Tận dụng `HANDOVER.md` của W1 đến W4.
5. Báo cáo gồm: Problem, Solution, Demo, Evidence, Trade-off. Demo chạy thật một flow qua hai boundary, gồm client cũ với server mới.

## 7. Truy vết tiêu chí đạt của đề

| Tiêu chí của đề | Nơi đáp ứng |
|---|---|
| Status và body API ngoài giống nhau trước/sau, cả hai đường | D3, 3.2; W2, W4 |
| Log Order cho thấy lời gọi nội bộ là gRPC | 3.5; W2 |
| Field mới dùng tag mới, field cũ giữ nguyên | D6, 3.3; W3 |
| Client cũ (`order-grpc-v1`, chưa build lại) hoàn tất flow đặt hàng với server mới | D10; W5 dựng và đóng băng, W3 `compat.mjs` |
| Inventory chậm hoặc tắt vẫn kết thúc hữu hạn | D8, 3.3; W2, W4 |
| Log Order và Inventory: REST (trước) và gRPC (sau) | 3.5; D13; W1, W2, mục 6 |
| Diff proto trước/sau và output sinh code | 3.3; W3 |
| Client mới đọc đúng `available` với server mới; với server cũ thì `absent` | D6, D7, D12; W2 (đọc và log), W3 (server cũ, `compat.mjs`) |
| Kết quả thiếu hàng, Inventory chậm, tắt: timestamp, status, response | 3.2, 3.3; W4 |
| Bảng payload kèm đại lượng đo và cách đo | D11; W4 |
| UI demo (không phải yêu cầu của đề) | D15; W3 |
| Ghi chú developer experience | Mục 5 (HANDOVER), mục 6 |
| README chạy lại, lệnh sinh code | W5; mục 3.3 |
| Plan viết trước khi hiện thực gRPC | Tài liệu này |
| Số liệu là kết quả chạy thật, kể cả chưa đạt | Mục 6 |

## 8. Chưa xác nhận

- D4: team lead đã xác nhận chọn `FAILED_PRECONDITION`. Cơ chế metadata `x-error-code` đã thử trong thư mục tạm và chạy được [KC].
- Đề không quy định mã lỗi chính xác; `OUT_OF_STOCK` viết hoa là lựa chọn của nhóm, hình slide ghi `out_of_stock`.
- `reservationId`: Inventory sinh, dạng xác định theo id của bảng `reservations` sau `/_reset` (đề xuất).
- Cách chia validate hai tầng (3.2): team lead đã xác nhận.
- Giá trị `orderId` là id serial, nên chỉ xác định sau `/_reset`; snapshot vẫn loại trường này.
- "Trước/sau" hiểu theo chế độ REST/gRPC của cùng mã (team lead chọn, mục 6).
- `order-v1` chỉ dựng được sau khi có Order của W2: một bước tuần tự ở giai đoạn tích hợp (team lead).
- Ngưỡng 5 lần chạy là đề xuất của bài tập, không phải quy chuẩn.

## 9. Ghi chú khi tích hợp (khác với Plan ban đầu)

Phát sinh khi ráp W1 đến W4 vào `services/` (người tích hợp, có AI hỗ trợ); ghi lại để Plan phản ánh đúng mã thật.

- **Mã đã ráp, chạy thử trên Linux, Postgres thật:** W1 38/38, W2 32/32, `inventory-v1` 7/7, `tools/compat` (ma trận và 5 ca phải FAIL), `tools/block3` (bản giả), UI 11/11; `GET /orders` và 80 kiểm tra của Block 2 vẫn đúng.
- **Workspaces:** `inventory`, `order-v1`, `inventory-v1`, `tools/block3`, `tools/compat` nằm trong `services/package.json`; một lần `npm install`. Script `codegen` của W1, W2, W4 đổi sang `require.resolve` (mẫu của W3) vì `./node_modules/.bin/...` gãy khi gói bị hoist; proto lấy từ `services/proto`, bản sao proto trong gói W2 bỏ.
- **Phụ thuộc:** thêm `@bufbuild/protobuf` 2.16.0 (mã sinh import nó) vào W1, W2, W4; bỏ `protobufjs` của W4 (không dùng). Tên gói `tools/block3` đổi thành `kartvibe-tools-block3`.
- **`order-v1` khác `order` ở ba file, không phải hai** (kế hoạch ghi hai): `src/generated/inventory.ts`, `src/inventory/grpc-client.ts` và `src/index.ts`. `index.ts` luôn ghi `available` (mặc định `"absent"`) vào log outbound gRPC, nên với client cũ phải bỏ khóa này (nếu không log sai nghĩa); `tsc` không bắt chỗ này.
- **Sửa công cụ của W4 khi chạy thật:** `stop-inventory.sh` kill cả process group và kiểm `/health` (bản gốc báo thành công mà `node` vẫn chạy); `slow.mjs` chờ các lần giữ hàng trễ (D14) rồi nạp lại tồn kho; `scenarios.mjs` cảnh báo khi `/_reset` lỗi; `payload.ts` đo trên `reservationId` và thân phản hồi thật của Inventory thay vì giá trị mẫu.
- **UI:** ghi chú trên trang sửa lại cho đúng với ba cột (lần bấm thứ 2 đã có thể KHÁC); `web/package.json` không thêm `"type": "module"` (làm hỏng test của `measure-client.js`, Block 2).
- **Hai lỗi log phát hiện khi demo, đã sửa (chỉ đổi nội dung log, response ngoài không đổi):** (1) Inventory REST ghi log trong `res.on('finish')`, nên request mà client đã bỏ cuộc (Order quá hạn) không có dòng log dù hàng vẫn bị giữ; nay ghi khi handler gọi `res.end()`, và `check` của W1 có thêm ca "client bỏ cuộc vẫn có log" (39 ca). (2) Order ghi `available: "absent"` cả ở dòng lỗi, trong khi lời gọi lỗi không có reply; nay chỉ ghi khi có reply (`check` của W2 có thêm kiểm tra). `order-v1` không bị ảnh hưởng (hash đóng băng không đổi).
- **Quan sát chủ động đã làm:** D14 (Order trả 504 nhưng Inventory vẫn giữ hàng); kênh gRPC trả 503 ngay lập tức trong vài giây sau khi Inventory khởi động lại.
- **Bằng chứng nộp** do `results/block-03/chay-lai.sh` sinh (team lead chạy); `docs/blocks/block-03/REPORT.md` điền số từ đó.

