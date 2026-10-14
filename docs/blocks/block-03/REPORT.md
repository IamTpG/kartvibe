# Báo cáo Block 3: REST và gRPC giữa các service

> Mọi con số trong báo cáo lấy từ các file trong [`results/block-03/`](../../../results/block-03/), do team lead tự chạy `results/block-03/chay-lai.sh`
> (19 bước, 0 bước thất bại). Nguồn các nhận định: đã kiểm chứng (có file bằng chứng), quan sát của người tích hợp (có AI hỗ trợ), hoặc suy luận (ghi rõ).
>
> Lần chạy bằng chứng: 2026-10-14 22:53 (UTC+7), nhánh `feat/block-03`, commit `8ce28df` (theo `MANIFEST.txt`; mã Block 3 chưa commit tại thời điểm chạy, xem mục 9).
> Môi trường: Linux, Node v24.18.1, npm 11.16.0, `@grpc/grpc-js` 1.14.6, `grpc-tools` 1.13.1, `ts-proto` 2.13.0, `@bufbuild/protobuf` 2.16.0; `LATENCY_MS=0`.

## 1. Problem

Luồng đặt hàng đi qua **hai boundary** với hai nhóm consumer khác nhau.

| Boundary | Consumer | Phải giữ ổn định |
|---|---|---|
| Browser, Order API | Browser và bên thứ ba (nhóm không quyết định lịch cập nhật của họ) | URL, status, body |
| Order API, Inventory | Order API (nhóm viết cả hai đầu nhưng triển khai từng service riêng) | Operation, message |

Câu hỏi của block: đổi giao thức ở chặng thứ hai thì chặng thứ nhất có phải đổi theo không; và khi thêm field vào schema, một client build từ proto
cũ có còn chạy với server mới không.

## 2. Solution

- **Chặng ngoài giữ REST/JSON**; chặng trong chuyển sang gRPC (`Reserve` unary). REST của Inventory được giữ làm baseline để so sánh.
- **Hợp đồng gRPC là `.proto` dùng chung** (`services/proto/inventory/{v1,v2}`), mỗi service tự sinh code. v2 chỉ thêm `optional int32 available = 2`
  (tag mới; tag, kiểu và nghĩa của field cũ giữ nguyên; package và tên service giữ nguyên).
- **Thiếu hàng** là `FAILED_PRECONDITION` kèm trailing metadata `x-error-code: OUT_OF_STOCK`, ánh xạ ra 409 `OUT_OF_STOCK` ở API ngoài. Deadline 500 ms: quá hạn thành 504, không kết nối được thành 503.
- **Hai bản Order cùng mã nguồn** chạy song song (`order` REST 4002, `order-grpc` 4012) để mọi khác biệt chỉ có thể do giao thức.
- **Client cũ** là bản Order build từ proto v1 (`order-v1`, 4022), đóng băng bằng `FROZEN.sha256`; server cũ tối thiểu `inventory-v1` (4008) cho ca client mới với server cũ.

Quyết định đầy đủ, phương án đã không chọn và lý do: [`PLAN.md`](PLAN.md) (D1 đến D15) và [ADR 0012](../../decisions/0012-rest-browser-grpc-noi-bo.md). Sơ đồ: [`ARCHITECTURE.md`](../../ARCHITECTURE.md).

## 3. Demo

Chạy thật một flow đặt hàng qua hai boundary (không dùng ảnh chụp mã):

1. `LATENCY_MS=0 npm run start:measure` (trong `services/`) và `ENABLE_TEST_HOOKS=1 npm start` trong `web/`.
2. Mở `http://localhost:4000/order-compare.html`: các nút mẫu (đủ hàng, hết hàng, số lượng 0, body sai) gửi cùng một `POST /orders` tới ba bản Order; mỗi cột có panel "Bên trong (từ log)" cho thấy lời gọi nội bộ; kết luận GIỐNG NHAU/KHÁC bằng chữ. Nhắc "Nạp lại tồn kho" trước mỗi lần thử.
3. **Client cũ với server mới:** cột `Order gRPC cũ (proto v1)` (4022) hoàn tất đặt hàng với Inventory v2; kiểm bằng `node services/tools/compat/compat.mjs` và `npm run verify-frozen -w kartvibe-order-v1-service`.
4. **Inventory chậm:** nút "Làm chậm Inventory 2000 ms": các cột trả 504 sau khoảng deadline (500 ms). **Inventory tắt:** nút "Tắt Inventory" (cần `ENABLE_TEST_HOOKS=1` khi chạy `web`; hoặc `bash services/tools/block3/stop-inventory.sh services/.run/inventory.pid`): 503 ở các cột. Khởi động lại bằng `cd services && LATENCY_MS=0 npm run start:measure`.
5. Mở log (`services/logs/{order,order-grpc,order-grpc-v1,inventory}.log`) và tra theo `requestId` để thấy lời gọi nội bộ là REST hay gRPC.

## 4. Evidence

Tiêu chí đạt của đề đối chiếu với bằng chứng (kết quả của lần chạy 2026-10-14):

| Tiêu chí của đề | Bằng chứng | Kết quả |
|---|---|---|
| Status và body của API ngoài giống nhau trước/sau, đường đủ hàng và thiếu hàng | `results/block-03/snapshots/` (`scenarios.txt`, `*.json`) | **Đạt.** 4 kịch bản (đủ hàng 201, thiếu hàng 409 `OUT_OF_STOCK`, số lượng 0 → 400, body không phải JSON → 400): REST = gRPC = gRPC cũ, đều PASS. |
| Log Order cho thấy lời gọi nội bộ là gRPC; log REST (trước) và gRPC (sau) | `results/block-03/logs/trace-theo-requestId.txt`, `logs/*.log` | **Đạt.** Cùng `requestId`: Order REST ghi `protocol: rest`, path `/inventory/reservations`; Order gRPC ghi `protocol: grpc`, path `/kartvibe.inventory.Inventory/Reserve`, `grpcStatus: OK`; Inventory ghi cùng `requestId`. |
| Field mới dùng tag mới, field cũ giữ nguyên; diff proto và output sinh code | `results/block-03/proto/proto-va-sinh-code.txt` | **Đạt.** Diff v1 → v2 chỉ thêm `optional int32 available = 2` (và dòng chú thích); `reservation_id = 1`, package và tên service không đổi. Sinh lại code các gói: "KHÔNG ĐỔI". |
| Client build từ proto cũ, chưa build lại, hoàn tất flow với server mới; log version | `results/block-03/compat/ma-tran.txt`, `compat/verify-frozen.txt` | **Đạt.** Client build từ proto v1 (`order-grpc-v1`, đóng băng, `verify-frozen` PASS) hoàn tất đặt hàng 201 với Inventory v2; log Inventory ghi `clientVersion="v1"`, log Order không có `available` (3/3 điều kiện). |
| Client mới đọc đúng `available` (kể cả 0); với server cũ thì vắng | `results/block-03/compat/ma-tran.txt` (mục 2, 2b, 3) | **Đạt.** Client mới × server mới: `available: 8` (3/3). Giữ phần hàng cuối (SKU-LOW): `available` có mặt, giá trị 0. Client mới × server cũ: `available: "absent"` (3/3). |
| Thiếu hàng, Inventory chậm, Inventory tắt: timestamp, status, response ngoài, thời gian hữu hạn | `results/block-03/errors/` | **Đạt.** Thiếu hàng: 409 (snapshot). Inventory chậm 2000 ms: 504 `INVENTORY_TIMEOUT` sau 512 ms (REST) và 504 ms (gRPC). Inventory tắt: 503 `INVENTORY_UNAVAILABLE` sau 16 ms (REST) và 5 ms (gRPC). 10 request song song vào SKU-LOW (tồn 1): đúng 1×201 và 9×409 trên cả ba cổng. |
| Bảng payload kèm đại lượng đo | `results/block-03/payload/payload-measurement.md` | **Đạt.** Đo ở lớp 1, cùng đại lượng cho hai bên (bảng bên dưới). |
| Thời gian phản hồi (≥ 5 lần, median và khoảng) | `results/block-03/latency/` | **Đạt.** 20 mẫu mỗi cổng; median và khoảng ở bảng bên dưới. |
| Block 2 không bị ảnh hưởng | `results/block-03/regression/` | **Đạt.** `contracts:check` khớp; `test:tools` 11/11; `build` (`tsc --noEmit`) không lỗi; kiểm Block 2: 80 đạt, 0 thất bại; `GET /orders` trả dữ liệu bình thường. |

### Payload (lớp 1: message đã serialize, request và reply; cùng đại lượng cho cả hai bên)

| Chiều | JSON (byte) | Protobuf (byte) | Ghi chú |
|---|---|---|---|
| Request `Reserve(SKU-OK, 2)` | 29 | 10 | Protobuf nhỏ hơn 65,5% (`{"sku":"SKU-OK","quantity":2}`) |
| Reply, REST chỉ có `reservationId` so Protobuf v1 | 25 | 7 | REST và Protobuf mang các trường khác nhau (xem file nguồn) |
| Reply Protobuf v2 có `available=8` / vắng `available` | | 9 / 7 | field mới tốn thêm 2 byte (tag + varint) khi có mặt; vắng thì bằng v1 |

### Thời gian phản hồi (API ngoài, một máy, `LATENCY_MS=0`)

| Cổng | Số mẫu | Median (ms) | [min, max] (ms) |
|---|---|---|---|
| REST 4002 | 20 | 11,99 | [10,28; 18,64] |
| gRPC 4012 | 20 | 9,59 | [8,18; 13,23] |

Mẫu đầu tiên của REST là 18,64 ms (có thể gồm chi phí kết nối). Không kết luận hiệu năng chung từ bảng này (xem mục 7). Từng mẫu: `results/block-03/latency/latency.txt`.

## 5. Trade-off

Các lựa chọn đã bàn và lý do không chọn (đầy đủ ở cột "Đã không chọn và vì sao" của `PLAN.md`): `api/` hay thư mục mới; dữ liệu trong bộ nhớ hay DB riêng; `reserved=false` hay status
cho thiếu hàng; proto v2 ở package khác; client cũ là CLI hay bản Order cũ; chọn giao thức theo từng request hay hai bản Order; `proto-loader` hay sinh code thật; wire bytes hay message serialize; bù trừ khi quá hạn.

Điều đã quan sát thêm khi chạy thật (có file bằng chứng ở mục 4):

- **Quá hạn không có nghĩa là chưa chạy (D14).** Order trả 504 sau khoảng deadline nhưng Inventory vẫn giữ hàng xong sau đó (`errors/d14-reserve-sau-qua-han.txt`: Order trả 504 sau 0,52 s; sau 3 s số giữ hàng tăng từ 0 lên 1, tồn SKU-OK từ 10 xuống 8; log Inventory ghi `ms: 2005`). Không có bù trừ nên retry tự động sẽ cần idempotency.
- **Kênh gRPC có backoff.** Sau khi Inventory tắt rồi bật lại, `errors/inventory-tat.txt` ghi: cổng 4012 (Order gRPC) cần 6 lần thử, 1,58 s mới trả lại 409 bình thường; cổng 4022 (Order gRPC cũ) hồi phục ngay ở lần thử đầu (0,018 s). Thời gian hồi phục phụ thuộc trạng thái kênh của từng tiến trình. Phép đo này không có cổng REST, nên "REST không bị" là suy luận (REST mở kết nối mới mỗi lần), chưa được đo.
- **Hợp đồng chặt, nhưng thay đổi nghĩa vẫn lọt.** Thêm tag mới tương thích ở mức wire (đã chạy client cũ với server mới và ngược lại); đề cũng nêu rằng wire-compatible chưa bảo đảm business-compatible (ví dụ đổi nghĩa `quantity`): Protobuf không bắt được điều đó.
- **Debug khó hơn REST:** không `curl` trực tiếp được; cần `.proto` và công cụ; log phải nối hai service bằng `requestId`.

## 6. Developer experience

Quan sát thật, theo nguồn:

- **Sinh code (người tích hợp, Linux):** một lệnh `grpc_tools_node_protoc` với plugin `ts-proto`; `grpc-tools` kèm `protoc` nên không cần cài riêng. Mã sinh ra **giống từng byte** với bản W1, W2, W3 sinh độc lập (W1 trên Windows), và chỉ khác dòng chú thích phiên bản `protoc` ở bản của W4 (W4 dùng `protoc` hệ thống 4.25.3 sau khi `grpc-tools` hỏng trên Windows). `npm install` báo `allow-scripts` về `grpc-tools`, `protobufjs`, `esbuild` nhưng `protoc` vẫn chạy.
- **Lỗi compile khi sinh lại từ proto v1** (nguyên văn, `tsc --noEmit` ở `order-v1`): `src/inventory/grpc-client.ts(32,69): error TS2339: Property 'available' does not exist on type 'ReserveReply'.` Chỉ một lỗi, ở một file, nhờ W2 cô lập việc đọc `available` ở đó: kiểu sinh ra chặn client cũ dùng field mới ngay lúc compile. Còn một chỗ không bị `tsc` bắt: log outbound ở `index.ts` vẫn ghi `available: "absent"` cho client cũ (sai nghĩa); phải sửa tay.
- **Hợp đồng ngầm khi ráp:** mã sinh import `@bufbuild/protobuf/wire`, nhưng chỉ một gói khai báo nó; các gói khác chạy được nhờ hoisting. Đường dẫn `./node_modules/.bin/...` trong script `codegen` gãy khi npm workspaces đưa gói lên thư mục gốc; đã đổi sang `require.resolve`.
- **Windows:** `grpc-tools@1.13.1` đi kèm `protoc.exe` lỗi thiếu DLL trên máy Windows của hai thành viên (W1, W4); họ phải thay binary hoặc dùng `protoc` hệ thống. Nguồn: `HANDOVER.md` của W1 và W4 (không tái hiện được trên Linux).
- **Hồi quy do thay đổi cục bộ:** thêm `"type": "module"` vào `web/package.json` làm hỏng ba test của bộ đo Block 2 (`measure-client.js` dùng chung với Node dưới dạng CommonJS); phát hiện nhờ chạy lại `test:tools`, đã hoàn tác.
- **Phát hành client và server riêng:** client v1 nhận reply v2 bình thường (field 2 lạ bị bỏ qua). Điều kiện là giữ nguyên `package kartvibe.inventory`: đổi package thì client cũ bị từ chối (đã thử).
- **Công cụ của thành viên, lỗi phát hiện khi chạy thật:** `stop-inventory.sh` báo "đã tắt" nhưng chỉ kill tiến trình `npm`, `node` mồ côi vẫn phục vụ; đã sửa kill cả process group và kiểm `/health`.
- **Một lỗi log chỉ lộ khi demo thật:** Inventory REST ghi log ở sự kiện `finish`, nên khi Order quá hạn và ngắt kết nối thì Inventory vẫn giữ hàng (đã thấy trong DB) mà **không có dòng log nào**; đường gRPC thì có. `check` của W1 không bắt được vì chưa có ca client bỏ cuộc giữa chừng. Đã sửa (ghi log khi handler gọi `res.end()`) và thêm ca kiểm. Tương tự, log của Order từng ghi `available: "absent"` cả ở dòng lỗi (không có reply nên giá trị đó vô nghĩa); đã sửa.
- **Debug:** tra theo `requestId` đủ để nối log Order (hai dòng: vào và ra) với log Inventory; lỗi gRPC có tên status (`grpcStatus`) dễ đọc hơn mã số.

## 7. Giới hạn của phép đo

- Một máy, dữ liệu nhỏ, `localhost`, không có mạng thật: chênh lệch nhỏ giữa REST và gRPC không đủ để kết luận về hiệu năng.
- Số mẫu nhỏ (tham số `LATENCY_N`, tối thiểu 5 theo đề xuất của bài; đây là đề xuất của bài tập, không phải quy chuẩn); lần đầu mỗi cổng có thể gồm chi phí kết nối.
- Payload đo ở **lớp 1** (message đã serialize). Header HTTP/1.1 và HTTP/2 không được đo; không so sánh khác lớp. Kích thước Protobuf do bộ mã hóa tính từ cùng giá trị với phản hồi thật, không bắt từ dây.
- Thời gian trên trang `order-compare.html` đo ở trình duyệt, chỉ để tham khảo; không dùng làm số đo.
- Kênh gRPC dùng lại kết nối nên số đo REST và gRPC khác nhau cả ở chi phí kết nối, không chỉ ở định dạng message.

## 8. Phần do AI hỗ trợ

| Phần | Công cụ AI (theo `HANDOVER.md`) | Ghi chú |
|---|---|---|
| W1 Inventory | AI Coding Assistant | Người làm tự chạy `npm run check` và regression |
| W2 Order | Codex | Test chạy với Inventory giả; ráp với Inventory thật do người tích hợp |
| W3 Server cũ, `compat`, UI | Claude Code | Người làm thử UI bằng tay |
| W4 Kịch bản và đo | Gemini Code Assistant | Số liệu trong `out/` và `snapshots/` của gói gốc sinh từ bản giả, không dùng |
| Tích hợp, sửa mức tích hợp, tài liệu, script thu bằng chứng | Claude Code | Người tích hợp (team lead) duyệt từng phần và **tự chạy** `chay-lai.sh` để lấy số nộp |

Câu trả lời của AI không dùng làm bằng chứng: mọi bằng chứng ở mục 4 là output của lệnh do team lead chạy.

## 9. Việc còn lại trước khi nộp

- [x] Chạy `bash results/block-03/chay-lai.sh`, 19 bước PASS; các ô số ở mục 1 đến 4 đã điền từ file bằng chứng.
- [x] Thử `order-compare.html` và bộ slide bằng tay.
- [ ] Đọc diff phần mã của W1 đến W4 và phần sửa mức tích hợp; chuẩn bị giải thích log và bảo vệ các quyết định.
- [ ] Rà soát: không có secret hay dữ liệu cá nhân thật; `git status` sạch các tệp sinh ra.
- [ ] Commit và gắn tag `block-03`. `MANIFEST.txt` ghi commit `8ce28df` (trước mã Block 3). Nếu muốn MANIFEST khớp commit nộp: commit trước rồi chạy lại `chay-lai.sh`; nếu không, giữ nguyên và nêu rõ ở đây rằng bằng chứng được chạy trên cây làm việc chưa commit của nhánh `feat/block-03`.
