import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import generated proto messages
import { ReserveRequest as ProtoRequestV1, ReserveReply as ProtoReplyV1 } from './generated/v1/inventory.js';
import { ReserveRequest as ProtoRequestV2, ReserveReply as ProtoReplyV2 } from './generated/v2/inventory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard fixture values
const sku = 'SKU-OK';
const quantity = 2;
const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:4006';
const FIXTURE_AVAILABLE = 10; // SKU-OK ở fixture (PLAN 3.4)

// Dùng reservationId và thân phản hồi THẬT của Inventory đang chạy (nạp lại tồn kho rồi đặt chỗ một lần); nếu Inventory
// không chạy thì dùng giá trị mẫu và ghi rõ trong báo cáo. Thân phản hồi REST thật được đo trực tiếp; message Protobuf
// được mã hóa từ chính các giá trị đó (kích thước tính bằng bộ mã hóa, không bắt từ dây).
let sampleReservationId = 'res-100001';
let realReplyJson: string | undefined;
let source = 'giá trị mẫu cố định (Inventory không chạy)';
try {
  await fetch(`${INVENTORY_URL}/_reset`, { method: 'POST', signal: AbortSignal.timeout(1500) });
  const res = await fetch(`${INVENTORY_URL}/inventory/reservations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku, quantity }), signal: AbortSignal.timeout(1500),
  });
  const text = await res.text();
  const parsed = JSON.parse(text);
  if (res.status === 201 && typeof parsed.reservationId === 'string') {
    sampleReservationId = parsed.reservationId;
    realReplyJson = text;
    source = `phản hồi thật của Inventory ${INVENTORY_URL} (reservationId \`${sampleReservationId}\`)`;
  }
  await fetch(`${INVENTORY_URL}/_reset`, { method: 'POST', signal: AbortSignal.timeout(1500) });
} catch { /* giữ giá trị mẫu */ }
const sampleAvailable = FIXTURE_AVAILABLE - quantity;

// 1. Requests
// REST request body (D11, 3.3)
const restRequestBody = {
  sku,
  quantity
};
const restRequestJson = JSON.stringify(restRequestBody);
const restRequestBytes = Buffer.byteLength(restRequestJson, 'utf8');

// Protobuf request
const protoRequestObj = {
  sku,
  quantity
};
const protoRequestV1Encoded = ProtoRequestV1.encode(protoRequestObj).finish();
const protoRequestV1Bytes = protoRequestV1Encoded.length;

// 2. Replies
// REST reply body (Section 3.3: REST baseline returns { "reservationId": string })
const restReplyBody = {
  reservationId: sampleReservationId
};
const restReplyJson = realReplyJson ?? JSON.stringify(restReplyBody);
const restReplyBytes = Buffer.byteLength(restReplyJson, 'utf8');

// Protobuf Reply v1 (syntax: string reservation_id = 1;)
const protoReplyV1Obj = {
  reservationId: sampleReservationId
};
const protoReplyV1Encoded = ProtoReplyV1.encode(protoReplyV1Obj).finish();
const protoReplyV1Bytes = protoReplyV1Encoded.length;

// Protobuf Reply v2 with available present (syntax adds: optional int32 available = 2;)
const protoReplyV2Obj = {
  reservationId: sampleReservationId,
  available: sampleAvailable
};
const protoReplyV2Encoded = ProtoReplyV2.encode(protoReplyV2Obj).finish();
const protoReplyV2Bytes = protoReplyV2Encoded.length;

// Protobuf Reply v2 with available absent
const protoReplyV2AbsentObj = {
  reservationId: sampleReservationId,
  available: undefined
};
const protoReplyV2AbsentEncoded = ProtoReplyV2.encode(protoReplyV2AbsentObj).finish();
const protoReplyV2AbsentBytes = protoReplyV2AbsentEncoded.length;

const timestamp = new Date().toISOString();

// Markdown report
const markdown = `# Báo cáo đo Payload Lớp 1 (Serialized Message)

- **Thời điểm đo:** \`${timestamp}\`
- **Đại lượng đo:** Lớp 1 (Message đã serialize: JSON string bytes vs Protobuf binary bytes) theo D11 và W4.md.
- **Không bao gồm:** HTTP/1.1 hoặc HTTP/2 wire headers/framing (lớp 3).
- **Nguồn dữ liệu:** ${source}.
- **Dữ liệu:** SKU = \`"${sku}"\`, quantity = \`${quantity}\`, reservationId = \`"${sampleReservationId}"\`, available = \`${sampleAvailable}\`.

## Bảng so sánh Payload (Request & Reply)

| Chiều | Giao thức / Định dạng | Payload đã serialize (bytes) | Các trường chứa trong payload | Chi tiết nội dung / JSON |
|---|---|---|---|---|
| **Request** | **REST (JSON)** | **${restRequestBytes}** | \`sku\`, \`quantity\` | \`${restRequestJson}\` |
| **Request** | **Protobuf (v1 & v2)** | **${protoRequestV1Bytes}** | \`sku\` (tag 1), \`quantity\` (tag 2) | \`ReserveRequest\` binary |
| **Reply** | **REST (JSON)** | **${restReplyBytes}** | \`reservationId\` | \`${restReplyJson}\` |
| **Reply** | **Protobuf v1** | **${protoReplyV1Bytes}** | \`reservation_id\` (tag 1) | \`ReserveReply\` (không có \`available\`) |
| **Reply** | **Protobuf v2** (có \`available\`) | **${protoReplyV2Bytes}** | \`reservation_id\` (tag 1), \`available\` (tag 2) | \`ReserveReply\` (có \`available = ${sampleAvailable}\`) |
| **Reply** | **Protobuf v2** (vắng \`available\`) | **${protoReplyV2AbsentBytes}** | \`reservation_id\` (tag 1) | \`ReserveReply\` (field vắng - optional presence) |

## Nhận xét chi phí trường mới và khác biệt:

1. **Request:**
   - REST JSON mang tên trường \`"sku"\` và \`"quantity"\` dưới dạng chuỗi text: **${restRequestBytes} bytes**.
   - Protobuf mã hóa tag số (1 byte tag + len chuỗi, 1 byte tag + varint quantity): **${protoRequestV1Bytes} bytes**.
   - Protobuf Request tiết kiệm khoảng **${((1 - protoRequestV1Bytes / restRequestBytes) * 100).toFixed(1)}%** kích thước so với REST JSON.

2. **Reply:**
   - REST baseline: chỉ trả về \`reservationId\` (${restReplyBytes} bytes).
   - Protobuf v1: chỉ gồm \`reservation_id\` (${protoReplyV1Bytes} bytes).
   - Protobuf v2 (khi có \`available = ${sampleAvailable}\`): **${protoReplyV2Bytes} bytes**.
   - Chi phí thêm trường \`optional int32 available\` trong Protobuf v2:
     - Thêm đúng **${protoReplyV2Bytes - protoReplyV1Bytes} bytes** (1 byte tag 2 [field 2, wire type 0 = 0x10] + 1 byte varint giá trị 8).
     - Khi trường \`available\` vắng (\`undefined\`), Protobuf v2 chỉ tốn **${protoReplyV2AbsentBytes} bytes** (bằng đúng v1), chứng minh cơ chế presence không tốn dung lượng khi không truyền.
`;

console.log(markdown);

// Save to out/
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const outFilePath = path.join(outDir, 'payload-measurement.md');
fs.writeFileSync(outFilePath, markdown, 'utf8');
console.log(`\n[payload] Đã lưu kết quả đo payload vào: ${outFilePath}`);
