// BẢN GIẢ Order (thay W2/W5 khi chưa có), theo hợp đồng PLAN-trich.md mục 3.2, 3.3, 3.5.
//   INVENTORY_PROTOCOL=rest|grpc, CLIENT_PROTO=v1|v2 (v1 = client cũ, build từ proto v1, không đọc available)
//   PORT, SERVICE_NAME, INVENTORY_REST_URL, INVENTORY_GRPC_ADDR, INVENTORY_DEADLINE_MS, ENABLE_TEST_HOOKS
// Đơn lưu trong bộ nhớ. CORS bằng gói cors như Order thật. Không phải sản phẩm nộp.
import { randomUUID } from 'node:crypto';
import * as grpc from '@grpc/grpc-js';
import cors from 'cors';
import express from 'express';
import { elapsed, GRPC_PATH, makeLog } from './log.js';

const PROTOCOL = process.env.INVENTORY_PROTOCOL ?? 'rest';
const CLIENT_PROTO = process.env.CLIENT_PROTO ?? 'v2';
const PORT = Number(process.env.PORT ?? 4002);
const REST_URL = process.env.INVENTORY_REST_URL ?? 'http://localhost:4006';
const GRPC_ADDR = process.env.INVENTORY_GRPC_ADDR ?? 'localhost:4007';
const DEADLINE_MS = Number(process.env.INVENTORY_DEADLINE_MS ?? 500);
const TEST_HOOKS = process.env.ENABLE_TEST_HOOKS === '1';
const SERVICE = process.env.SERVICE_NAME ?? (PROTOCOL === 'grpc' ? (CLIENT_PROTO === 'v1' ? 'order-grpc-v1' : 'order-grpc') : 'order');
const log = makeLog(SERVICE);

if (!['rest', 'grpc'].includes(PROTOCOL) || !['v1', 'v2'].includes(CLIENT_PROTO)) {
  throw new Error(`INVENTORY_PROTOCOL=${PROTOCOL}, CLIENT_PROTO=${CLIENT_PROTO} không hợp lệ`);
}
const reply = CLIENT_PROTO === 'v1' ? await import('./reply-v1.js') : await import('./reply-v2.js');
const grpcClient = PROTOCOL === 'grpc' ? reply.makeClient(GRPC_ADDR) : undefined;

type Failure = { ok: false; http: number; code: string; message: string };
type Outcome = { ok: true; reservationId: string } | Failure;

const OUT_OF_STOCK = (sku: string): Failure => ({ ok: false, http: 409, code: 'OUT_OF_STOCK', message: `Không đủ hàng cho ${sku}` });
const INVALID: Failure = { ok: false, http: 400, code: 'VALIDATION_ERROR', message: 'sku hoặc quantity ngoài miền giá trị' };
const TIMEOUT: Failure = { ok: false, http: 504, code: 'INVENTORY_TIMEOUT', message: `Inventory không trả lời trong ${DEADLINE_MS} ms` };
const UNAVAILABLE: Failure = { ok: false, http: 503, code: 'INVENTORY_UNAVAILABLE', message: 'Không kết nối được Inventory' };
const INTERNAL: Failure = { ok: false, http: 500, code: 'INTERNAL_ERROR', message: 'Lỗi không mong đợi khi gọi Inventory' };

async function reserveRest(sku: string, quantity: number, requestId: string): Promise<Outcome> {
  const started = performance.now();
  const base = { requestId, method: 'POST', path: '/inventory/reservations', protocol: 'rest', direction: 'outbound', operation: 'Reserve', clientVersion: reply.CLIENT_VERSION };
  try {
    const res = await fetch(`${REST_URL}/inventory/reservations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-client-version': reply.CLIENT_VERSION },
      body: JSON.stringify({ sku, quantity }),
      signal: AbortSignal.timeout(DEADLINE_MS),
    });
    const body = await res.json().catch(() => ({}));
    const outcome: Outcome = res.status === 201 ? { ok: true, reservationId: String(body.reservationId) }
      : res.status === 409 ? OUT_OF_STOCK(sku) : res.status === 400 ? INVALID : INTERNAL;
    log({ ...base, status: res.status, ms: elapsed(started), ...(outcome.ok ? { reservationId: outcome.reservationId } : { errorCode: outcome.code }) });
    return outcome;
  } catch (e) {
    const outcome = (e as Error).name === 'TimeoutError' ? TIMEOUT : UNAVAILABLE;
    log({ ...base, status: null, ms: elapsed(started), errorCode: outcome.code, error: String((e as { cause?: { code?: string } }).cause?.code ?? (e as Error).name) });
    return outcome;
  }
}

function reserveGrpc(sku: string, quantity: number, requestId: string): Promise<Outcome> {
  const started = performance.now();
  const metadata = new grpc.Metadata();
  metadata.set('x-request-id', requestId);
  metadata.set('x-client-version', reply.CLIENT_VERSION);
  return new Promise((resolve) => {
    grpcClient!.reserve({ sku, quantity }, metadata, { deadline: Date.now() + DEADLINE_MS }, (err, res) => {
      const code = err ? err.code : grpc.status.OK;
      const base = { requestId, method: 'gRPC', path: GRPC_PATH, status: code, grpcStatus: grpc.status[code], ms: elapsed(started), protocol: 'grpc', direction: 'outbound', operation: 'Reserve', clientVersion: reply.CLIENT_VERSION };
      if (!err && res) {
        log({ ...base, ...reply.replyFields(res), reservationId: res.reservationId });
        return resolve({ ok: true, reservationId: res.reservationId });
      }
      const errorCode = err?.metadata?.get('x-error-code')[0];
      const outcome = errorCode === 'OUT_OF_STOCK' ? OUT_OF_STOCK(sku)
        : code === grpc.status.INVALID_ARGUMENT ? INVALID
        : code === grpc.status.DEADLINE_EXCEEDED ? TIMEOUT
        : code === grpc.status.UNAVAILABLE ? UNAVAILABLE : INTERNAL;
      log({ ...base, errorCode: outcome.ok ? undefined : outcome.code });
      resolve(outcome);
    });
  });
}

const orders: { orderId: number; sku: string; quantity: number; reservationId: string; status: string }[] = [];
let nextId = 1;

const app = express();
app.use(cors({ origin: '*' }));
app.use((req, res, next) => {
  const started = performance.now();
  const requestId = req.header('x-request-id') ?? randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  res.on('finish', () => log({ requestId, method: req.method, path: req.path, status: res.statusCode, ms: elapsed(started), protocol: 'rest', direction: 'inbound' }));
  next();
});
app.use(express.json());

app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

app.post('/orders', async (req, res) => {
  const body = req.body;
  // Order chỉ kiểm hình dạng (mục 3.2); miền giá trị do Inventory kiểm.
  if (typeof body !== 'object' || body === null || Array.isArray(body) || typeof body.sku !== 'string' || !Number.isInteger(body.quantity)) {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Body phải là JSON object có sku (chuỗi) và quantity (số nguyên)' });
    return;
  }
  const { sku, quantity } = body as { sku: string; quantity: number };
  const outcome = PROTOCOL === 'grpc'
    ? await reserveGrpc(sku, quantity, res.locals.requestId)
    : await reserveRest(sku, quantity, res.locals.requestId);
  if (!outcome.ok) {
    res.status(outcome.http).json({ code: outcome.code, message: outcome.message });
    return;
  }
  const order = { orderId: nextId++, sku, quantity, reservationId: outcome.reservationId, status: 'CONFIRMED' };
  orders.push(order);
  res.status(201).json({ orderId: order.orderId, sku, quantity, status: order.status });
});

if (TEST_HOOKS) {
  app.post('/_reset', (_req, res) => {
    orders.length = 0;
    nextId = 1;
    res.json({ reset: true });
  });
}

// JSON hỏng (express.json) và lỗi khác: trả đúng dạng lỗi của hợp đồng ngoài.
app.use((err: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.status === 400) res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Body không phải JSON hợp lệ' });
  else res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Lỗi không mong đợi' });
});

app.listen(PORT, () => log({ event: 'started', fake: true, port: PORT, inventoryProtocol: PROTOCOL, clientProto: CLIENT_PROTO, testHooks: TEST_HOOKS }));
