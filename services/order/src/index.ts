import './env.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { executeQuery, metrics } from './db.js';
import { logEvent, logRequest } from './logger.js';
import type { Order } from './contract.js';
import { RestInventoryClient } from './inventory/rest-client.js';
import { GrpcInventoryClient, clientVersion } from './inventory/grpc-client.js';
import { InventoryError, externalErrors } from './inventory/types.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4002;
const LATENCY_MS = process.env.LATENCY_MS !== undefined ? parseInt(process.env.LATENCY_MS, 10) : 0;
const protocol = process.env.INVENTORY_PROTOCOL || 'rest';
if (protocol !== 'rest' && protocol !== 'grpc') throw new Error(`Invalid INVENTORY_PROTOCOL: ${protocol} (expected rest or grpc)`);
const deadlineMs = Number(process.env.INVENTORY_DEADLINE_MS ?? 500);
if (!Number.isInteger(deadlineMs) || deadlineMs <= 0) throw new Error('INVENTORY_DEADLINE_MS must be a positive integer');
const inventory = protocol === 'grpc'
  ? new GrpcInventoryClient(process.env.INVENTORY_GRPC_ADDR || 'localhost:4007')
  : new RestInventoryClient(process.env.INVENTORY_REST_URL || 'http://localhost:4006');

// CORS
app.use(cors({ origin: '*' }));

// Request ID & Timing middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  res.setHeader('x-request-id', requestId);
  (req as any).requestId = requestId;
  (req as any).startTime = Date.now();

  const isExcluded = req.path === '/health' || req.path.startsWith('/_metrics') || req.path === '/_reset';

  if (!isExcluded) {
    metrics.requests += 1;
  }

  res.on('finish', () => {
    if (!isExcluded) {
      const duration = Date.now() - (req as any).startTime;
      logRequest({
        ts: new Date().toISOString(),
        service: 'order',
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: duration,
        direction: 'inbound',
      });
    }
  });

  next();
});

app.use(express.json());
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }
  next(err);
});

// Middleware giả lập độ trễ LATENCY_MS cho các request nghiệp vụ
app.use((req: Request, res: Response, next: NextFunction) => {
  const isExcluded = req.path === '/health' || req.path.startsWith('/_metrics') || req.path === '/_reset';
  if (isExcluded || LATENCY_MS <= 0) {
    return next();
  }
  setTimeout(next, LATENCY_MS);
});

// Endpoints theo hợp đồng chung

// 1. Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// 2. Metrics
app.get('/_metrics', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'order',
    requests: metrics.requests,
    dbQueries: metrics.dbQueries,
  });
});

app.post('/_metrics/reset', (req: Request, res: Response) => {
  metrics.reset();
  res.status(204).send();
});

if (process.env.ENABLE_TEST_HOOKS === '1') {
  app.post('/_reset', async (_req: Request, res: Response) => {
    try {
      await executeQuery('TRUNCATE TABLE purchase_orders RESTART IDENTITY');
      res.status(204).send();
    } catch (error) {
      console.error('[Order reset error]', error);
      res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  });
}

app.post('/orders', async (req: Request, res: Response) => {
  const body: unknown = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body) ||
      !('sku' in body) || typeof body.sku !== 'string' ||
      !('quantity' in body) || typeof body.quantity !== 'number' || !Number.isInteger(body.quantity)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'sku must be a string and quantity must be an integer' });
  }
  const { sku, quantity } = body as { sku: string; quantity: number };
  const requestId = (req as any).requestId as string;
  const started = Date.now();
  let reservationId: string | undefined;
  let available: number | 'absent' | undefined; // undefined: chưa có reply (lời gọi lỗi) nên không ghi vào log
  let outcome = 0;
  let grpcStatus: string | undefined;
  let errorCode: string | undefined;
  try {
    const result = await inventory.reserve(sku, quantity, { requestId, deadlineMs });
    reservationId = result.reservationId;
    available = result.available ?? 'absent'; // reply thành công mà vắng available: server cũ không gửi field
    outcome = protocol === 'grpc' ? 0 : 201;
  } catch (error) {
    const failure = error instanceof InventoryError ? error : new InventoryError(
      'INTERNAL_ERROR', protocol === 'grpc' ? 2 : 500, protocol === 'grpc' ? 'UNKNOWN' : undefined,
    );
    errorCode = failure.kind;
    grpcStatus = failure.grpcStatus;
    outcome = failure.upstreamStatus;
  } finally {
    logRequest({
      ts: new Date().toISOString(), service: 'order', requestId,
      method: protocol === 'grpc' ? 'gRPC' : 'POST',
      path: protocol === 'grpc' ? '/kartvibe.inventory.Inventory/Reserve' : '/inventory/reservations',
      status: outcome, ms: Date.now() - started,
      direction: 'outbound', protocol, operation: 'Reserve',
      clientVersion,
      ...(protocol === 'grpc' ? { ...(available !== undefined ? { available } : {}), grpcStatus: grpcStatus ?? 'OK' } : {}),
      ...(errorCode ? { errorCode } : {}), ...(reservationId ? { reservationId } : {}),
    });
  }

  if (errorCode) {
    const mapped = externalErrors[errorCode as keyof typeof externalErrors];
    return res.status(mapped.status).json({ code: errorCode, message: mapped.message });
  }
  try {
    const saved = await executeQuery<{ id: number }>(
      'INSERT INTO purchase_orders (sku, quantity, reservation_id, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [sku, quantity, reservationId, 'CONFIRMED'],
    );
    return res.status(201).json({ orderId: saved.rows[0].id, sku, quantity, status: 'CONFIRMED' });
  } catch (error) {
    console.error('[Order DB error after reservation]', { requestId, reservationId, error });
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
});

// 3. Nghiệp vụ: GET /orders?userId=1
app.get('/orders', async (req: Request, res: Response) => {
  const userIdRaw = req.query.userId as string | undefined;

  if (!userIdRaw) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'userId query parameter is required',
    });
  }

  const userId = parseInt(userIdRaw, 10);
  if (isNaN(userId) || String(userId) !== userIdRaw) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'userId must be a valid integer',
    });
  }

  try {
    // Quy chuẩn hợp đồng: Mỗi lời gọi dùng ĐÚNG 2 TRUY VẤN DB
    // Truy vấn 1: Lấy danh sách đơn hàng của user, sắp xếp id tăng dần
    const ordersResult = await executeQuery<{
      id: number;
      user_id: number;
      status: string;
      created_at: Date | string;
    }>(
      `SELECT id, user_id, status, created_at FROM orders WHERE user_id = $1 ORDER BY id ASC;`,
      [userId]
    );

    const orders = ordersResult.rows;
    const orderIds = orders.map((o) => o.id);

    // Truy vấn 2: Lấy tất cả item của các đơn hàng đó qua WHERE order_id = ANY($1)
    // Sắp xếp theo order_id ASC, item_index ASC
    const itemsResult = await executeQuery<{
      order_id: number;
      item_index: number;
      product_id: number;
      quantity: number;
    }>(
      `SELECT order_id, item_index, product_id, quantity FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY order_id ASC, item_index ASC;`,
      [orderIds]
    );

    // Gom items theo order_id
    const itemsByOrderId = new Map<number, Array<{ productId: number; quantity: number }>>();
    for (const item of itemsResult.rows) {
      if (!itemsByOrderId.has(item.order_id)) {
        itemsByOrderId.set(item.order_id, []);
      }
      itemsByOrderId.get(item.order_id)!.push({
        productId: item.product_id,
        quantity: item.quantity,
      });
    }

    // Ghép dữ liệu trả về theo format hợp đồng
    const data: Order[] = orders.map((order) => ({
      id: order.id,
      userId: order.user_id,
      status: order.status as Order['status'], // cột status là text; hợp đồng giới hạn năm giá trị
      createdAt: new Date(order.created_at).toISOString(),
      items: itemsByOrderId.get(order.id) || [],
    }));

    return res.status(200).json({ data });
  } catch (err: any) {
    console.error('[Order Service Error]', err);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
});

executeQuery(`CREATE TABLE IF NOT EXISTS purchase_orders (
  id serial PRIMARY KEY, sku text NOT NULL, quantity int NOT NULL,
  reservation_id text NOT NULL, status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)`).then(() => app.listen(PORT, () => {
  logEvent(`Order listening on :${PORT}`, { latencyMs: LATENCY_MS, protocol });
})).catch((error) => {
  console.error('[Order startup error]', error);
  process.exit(1);
});
