# tools/compat: kiểm client cũ/mới × server cũ/mới

`compat.mjs` gọi `POST /orders` qua đúng flow ngoài, rồi tra log Order và Inventory theo `requestId` để chứng minh **client nào** đã gọi và Order đọc `available` ra sao. Không cần gói npm: chỉ cần Node ≥ 22.

```bash
node compat.mjs --order <url> --label <tên> --expect-client <v1|v2> \
     --expect-available <number|absent|none> --order-log <file> --inventory-log <file>
     [--evidence-dir <thư mục>] [--log-wait-ms 5000] [--http-timeout-ms 5000]
```

Các bước: (a) gửi `{sku:"SKU-OK", quantity:2}` kèm `x-request-id` tự sinh (`compat-<label>-<uuid>`); (b) kiểm 201; (c) trong `--inventory-log`, dòng có đúng `requestId` phải có `clientVersion` = `--expect-client`; (d) trong `--order-log`, dòng `direction: "outbound"` có đúng `requestId`: `number` là số nguyên (kể cả 0), `absent` là chuỗi `"absent"`, `none` là không có field; (e) in PASS/FAIL từng điều kiện kèm timestamp, in các dòng log đã khớp, lưu nguyên văn vào `evidence/compat-<thời gian>-<label>.txt`. Thoát 0 khi đạt, 1 khi có điều kiện không đạt, 2 khi sai tham số. Dòng log không phải JSON bị bỏ qua; log được đọc lại tới `--log-wait-ms` vì tiến trình khác có thể ghi trễ.

## Ma trận khi tích hợp (team lead)

Inventory thật phải được nạp lại tồn kho trước mỗi lần (`SKU-OK` chỉ có 10). Đường dẫn log theo `start-all.sh` (`logs/<tên>.log`):

```bash
node tools/compat/compat.mjs --order http://localhost:4022 --label client-cu_server-moi \
  --expect-client v1 --expect-available none --order-log logs/order-grpc-v1.log --inventory-log logs/inventory.log
node tools/compat/compat.mjs --order http://localhost:4012 --label client-moi_server-moi \
  --expect-client v2 --expect-available number --order-log logs/order-grpc.log --inventory-log logs/inventory.log
# dừng Inventory thật, chạy inventory-v1 với GRPC_PORT=4007 (ghi log vào logs/inventory-grpc-v1.log), rồi:
node tools/compat/compat.mjs --order http://localhost:4012 --label client-moi_server-cu \
  --expect-client v2 --expect-available absent --order-log logs/order-grpc.log --inventory-log logs/inventory-grpc-v1.log
```

## Kiểm tra bằng bản giả

```bash
npm install                 # và npm install trong ../../inventory-v1 (hoặc một lần ở gốc workspaces)
npm run check               # chạy ma trận + các trường hợp phải FAIL, cổng ngẫu nhiên, không để lại file
npm run evidence            # như check nhưng giữ output và log trong evidence/compat-ban-gia/
```

`check` dùng **inventory-v1 thật** của W3 (đặt `INVENTORY_V1_DIR` nếu không ở `../../inventory-v1`) và các **bản giả** trong `test/` (không phải sản phẩm nộp):

| Tệp | Vai trò |
|---|---|
| `test/fake-inventory.ts` | Inventory giả: REST (`PORT`, 4006) và gRPC sinh từ **proto v2** (`GRPC_PORT`, 4007), chung tồn kho, **luôn đặt `available`**; `/health`, `/_reset`, `/_fault` (khi `ENABLE_TEST_HOOKS=1`); CORS bằng gói `cors` |
| `test/fake-order.ts` | Order giả theo PLAN 3.2, 3.3, 3.5: `INVENTORY_PROTOCOL=rest\|grpc`, `CLIENT_PROTO=v1\|v2`, deadline `INVENTORY_DEADLINE_MS` (500), hai dòng log mỗi request, CORS bằng gói `cors`, `/_reset` |
| `test/reply-v1.ts`, `test/reply-v2.ts` | Toàn bộ mã phụ thuộc hình dạng `ReserveReply` (đọc `available`, hằng `clientVersion`), mỗi phiên bản một tệp |
| `test/generated/v1`, `test/generated/v2` | Mã sinh từ proto (`npm run codegen`, đặt `PROTO_DIR` nếu cần) |
| `test/run-fakes.mjs` | `npm run fakes`: chạy bộ giả trên cổng cố định 4006/4007, 4002, 4012, 4022 để thử UI |

## Thử UI demo (`web/public/order-compare.html`)

```bash
npm run fakes                     # trong tools/compat; Ctrl+C để dừng
cd ../../web && npm start         # http://localhost:4000/order-compare.html
```
