// BẢN GIẢ Inventory (thay W1 khi chưa có): một tiến trình, REST (PORT, mặc định 4006) và gRPC sinh từ
// proto v2 (GRPC_PORT, mặc định 4007), dùng chung tồn kho trong bộ nhớ. gRPC luôn đặt available.
// Có /health; /_reset và /_fault khi ENABLE_TEST_HOOKS=1; REST bật CORS bằng gói cors (D15).
// Không phải sản phẩm nộp.
import { randomUUID } from 'node:crypto';
import * as grpc from '@grpc/grpc-js';
import cors from 'cors';
import express from 'express';
import { InventoryService, ReserveReply, type InventoryServer } from './generated/v2/inventory.js';
import { elapsed, GRPC_PATH, makeLog } from './log.js';

const PORT = Number(process.env.PORT ?? 4006);
const GRPC_PORT = Number(process.env.GRPC_PORT ?? 4007);
const TEST_HOOKS = process.env.ENABLE_TEST_HOOKS === '1';
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 0);
const log = makeLog(process.env.SERVICE_NAME ?? 'inventory');

const SEED: Record<string, number> = { 'SKU-OK': 10, 'SKU-LOW': 1, 'SKU-ZERO': 0 };
const stock = new Map<string, number>();
let nextReservation = 1;
let faultDelayMs = 0;
const reset = () => {
  stock.clear();
  for (const [sku, n] of Object.entries(SEED)) stock.set(sku, n);
  nextReservation = 1;
};
reset();

type Result =
  | { kind: 'reserved'; reservationId: string; available: number }
  | { kind: 'out_of_stock'; available: number }
  | { kind: 'invalid'; message: string };

function reserve(sku: unknown, quantity: unknown): Result {
  if (typeof sku !== 'string' || sku.length === 0 || sku.length > 64) return { kind: 'invalid', message: 'sku phải có 1 đến 64 ký tự' };
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
    return { kind: 'invalid', message: 'quantity phải từ 1 đến 1000' };
  }
  const inStock = stock.get(sku) ?? 0;
  if (inStock < quantity) return { kind: 'out_of_stock', available: inStock };
  stock.set(sku, inStock - quantity);
  return { kind: 'reserved', reservationId: `fake-res-${nextReservation++}`, available: inStock - quantity };
}

const delay = () => new Promise((r) => setTimeout(r, LATENCY_MS + faultDelayMs));

// ---------- REST ----------
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use((req, res, next) => {
  const started = performance.now();
  const requestId = req.header('x-request-id') ?? randomUUID();
  res.setHeader('x-request-id', requestId);
  // Ghi một lần, khi trả lời xong. Route giữ hàng tự gọi writeLog sau khi trả lời, vì nếu Order đã bỏ cuộc
  // (quá hạn) thì không có sự kiện 'finish', nhưng hàng vẫn đã được giữ (D14) và cần có trong log.
  let logged = false;
  res.locals.writeLog = () => {
    if (logged) return;
    logged = true;
    log({
      requestId, method: req.method, path: req.path, status: res.statusCode, ms: elapsed(started),
      protocol: 'rest', direction: 'inbound', clientVersion: req.header('x-client-version') ?? null, ...res.locals.extra,
    });
  };
  res.on('finish', res.locals.writeLog);
  next();
});

app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

app.post('/inventory/reservations', async (req, res) => {
  await delay();
  const r = reserve(req.body?.sku, req.body?.quantity);
  res.locals.extra = { operation: 'Reserve' };
  if (r.kind === 'reserved') {
    res.locals.extra.reservationId = r.reservationId;
    res.status(201).json({ reservationId: r.reservationId });
  } else if (r.kind === 'out_of_stock') {
    res.locals.extra.errorCode = 'OUT_OF_STOCK';
    res.status(409).json({ code: 'OUT_OF_STOCK', message: `Không đủ hàng cho ${req.body.sku}` });
  } else {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: r.message });
  }
  res.locals.writeLog();
});

if (TEST_HOOKS) {
  app.post('/_reset', (_req, res) => { reset(); res.json({ reset: true }); });
  app.post('/_fault', (req, res) => {
    const d = req.body?.delayMs;
    if (!Number.isInteger(d) || d < 0) {
      res.status(400).json({ code: 'VALIDATION_ERROR', message: 'delayMs phải là số nguyên ≥ 0' });
      return;
    }
    faultDelayMs = d;
    res.json({ delayMs: faultDelayMs });
  });
}

app.use((err: { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(err.status ?? 500).json({ code: err.status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: err.type ?? 'lỗi' });
});

// ---------- gRPC (proto v2) ----------
const impl: InventoryServer = {
  async reserve(call, callback) {
    const started = performance.now();
    const requestId = String(call.metadata.get('x-request-id')[0] ?? randomUUID());
    const clientVersion = call.metadata.get('x-client-version')[0];
    await delay();
    const r = reserve(call.request.sku, call.request.quantity);
    const done = (code: grpc.status, extra: Record<string, unknown>) => log({
      requestId, method: 'gRPC', path: GRPC_PATH, status: code, grpcStatus: grpc.status[code], ms: elapsed(started),
      protocol: 'grpc', direction: 'inbound', operation: 'Reserve', clientVersion: clientVersion === undefined ? null : String(clientVersion), ...extra,
    });
    if (r.kind === 'reserved') {
      callback(null, ReserveReply.fromPartial({ reservationId: r.reservationId, available: r.available }));
      done(grpc.status.OK, { reservationId: r.reservationId, available: r.available });
    } else if (r.kind === 'out_of_stock') {
      const metadata = new grpc.Metadata();
      metadata.set('x-error-code', 'OUT_OF_STOCK');
      callback({ code: grpc.status.FAILED_PRECONDITION, details: 'OUT_OF_STOCK', metadata });
      done(grpc.status.FAILED_PRECONDITION, { errorCode: 'OUT_OF_STOCK' });
    } else {
      callback({ code: grpc.status.INVALID_ARGUMENT, details: r.message });
      done(grpc.status.INVALID_ARGUMENT, {});
    }
  },
};

const grpcServer = new grpc.Server();
grpcServer.addService(InventoryService, impl);
grpcServer.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (err) => {
  if (err) throw err;
  app.listen(PORT, () => log({ event: 'started', fake: true, httpPort: PORT, grpcPort: GRPC_PORT, proto: 'v2', testHooks: TEST_HOOKS }));
});
