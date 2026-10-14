# inventory-v1: server cũ tối thiểu (D12)

gRPC Inventory **chỉ biết proto v1** (tiến trình `inventory-grpc-v1`, cổng `GRPC_PORT` mặc định **4008**). Không database. Reply **không bao giờ có `available`**: kiểu `ReserveReply` sinh từ v1 không có field này nên mã không đặt được (thử đặt thì `tsc` báo lỗi, xem `tools/compat/evidence/errors.txt`).

Dùng để quan sát "client mới × server cũ": `order-grpc` gọi server này và phải log `available: "absent"`.

## Cài và chạy

```bash
npm install                      # hoặc npm install ở gốc workspaces
npm start                        # gRPC :4008
GRPC_PORT=4007 npm start         # thay chỗ Inventory thật (sau khi dừng nó) để order-grpc gọi mà không đổi cấu hình
HTTP_PORT=4018 ENABLE_TEST_HOOKS=1 npm start   # bật thêm HTTP phụ: GET /health, POST /_reset (nạp lại fixture)
```

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `GRPC_PORT` | `4008` | cổng gRPC |
| `HTTP_PORT` | (tắt) | bật HTTP phụ `GET /health`; tắt mặc định để không tranh cổng 4006 |
| `ENABLE_TEST_HOOKS` | (tắt) | `1` thì có `POST /_reset` trên HTTP phụ |

Fixture (PLAN mục 3.4), giữ trong bộ nhớ, khởi động lại là nạp lại: `SKU-OK` 10, `SKU-LOW` 1, `SKU-ZERO` 0, sku khác coi như 0.

| Trường hợp | Trả về |
|---|---|
| đủ hàng | OK, `reservation_id` |
| thiếu hàng | `FAILED_PRECONDITION`, trailing metadata `x-error-code: OUT_OF_STOCK` |
| sku rỗng hoặc dài hơn 64, quantity ngoài 1..1000 | `INVALID_ARGUMENT` |

Log: một dòng JSON mỗi lời gọi ra stdout (`direction: "inbound"`, `protocol: "grpc"`, `clientVersion` từ metadata `x-client-version`, `requestId` từ `x-request-id`, `reservationId` khi thành công, `errorCode` khi thiếu hàng).

## Sinh code và đóng băng

```bash
npm run codegen        # proto ../proto/inventory/v1 -> src/generated/ (đặt PROTO_DIR=<thư mục chứa v1/> nếu proto ở chỗ khác)
npm run verify-frozen  # so sha256 của mã sinh ra (và của proto v1, nếu tìm thấy) với FROZEN.sha256; sinh lại vào thư mục tạm để so
npm run freeze         # ghi lại FROZEN.sha256 — chỉ khi cố ý sinh lại
```

Mã sinh ra được commit. `FROZEN.sha256` ghi hash của proto v1 và `src/generated/inventory.ts`.

## Kiểm tra

```bash
npm run check   # tsc --noEmit, verify-frozen, mã sinh không có "available", test chạy server thật
```

Test (`test/server.test.ts`) khởi động server trên cổng trống, gọi bằng client v1, và đọc **byte** của reply để chắc chỉ có field 1 và 2.
