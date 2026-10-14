# order-v1: Order build từ proto v1 (client cũ, đóng băng)

Bản sao của `services/order` dựng **một lần** từ `proto/inventory/v1` (không có field `available`), rồi đóng băng. Nó đóng vai
"client cũ" của bài REST và gRPC: chạy với Inventory **mới** (proto v2) mà luồng đặt hàng vẫn hoàn tất. Chi tiết quyết định D10
trong `docs/blocks/block-03/PLAN.md`.

- Chạy: `bash ../start-all.sh` chạy nó ở cổng **4022**, tên tiến trình `order-grpc-v1` (`INVENTORY_PROTOCOL=grpc`), log `services/logs/order-grpc-v1.log`.
- So với `order/`, `src` chỉ khác **ba file**: `src/generated/inventory.ts` (sinh từ proto v1), `src/inventory/grpc-client.ts` (`clientVersion = 'v1'`,
  không đọc `available`) và `src/index.ts` (log outbound không có khóa `available`, vì client cũ không biết field này).
- Khi sinh lại từ proto v1, `tsc` báo đúng một lỗi, ở `grpc-client.ts`: `error TS2339: Property 'available' does not exist on type 'ReserveReply'`.
- **Không build lại.** `npm run verify-frozen` kiểm `FROZEN.sha256` (hash proto v1, mã sinh, `grpc-client.ts`, `index.ts` và phiên bản `@grpc/grpc-js`),
  proto bản sao trùng `services/proto/inventory/v1`, và sinh lại từ proto v1 ra đúng mã đã commit. `npm run freeze` chỉ dùng khi cố ý dựng lại.
- Gói không có `test/` và `openapi.json`: hợp đồng ngoài của nó giống `order/`.
