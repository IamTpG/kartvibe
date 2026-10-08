import './env.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { executeQuery, metrics } from './db.js';
import { logEvent, logRequest } from './logger.js';
import type { Order } from './contract.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4002;
const LATENCY_MS = process.env.LATENCY_MS !== undefined ? parseInt(process.env.LATENCY_MS, 10) : 0;

// CORS
app.use(cors({ origin: '*' }));
app.use(express.json());

// Request ID & Timing middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  res.setHeader('x-request-id', requestId);
  (req as any).requestId = requestId;
  (req as any).startTime = Date.now();

  const isExcluded = req.path === '/health' || req.path.startsWith('/_metrics');

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
      });
    }
  });

  next();
});

// Middleware giả lập độ trễ LATENCY_MS cho các request nghiệp vụ
app.use((req: Request, res: Response, next: NextFunction) => {
  const isExcluded = req.path === '/health' || req.path.startsWith('/_metrics');
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

app.listen(PORT, () => {
  logEvent(`Order listening on :${PORT}`, { latencyMs: LATENCY_MS });
});
