import './env.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import * as grpc from '@grpc/grpc-js';

import { initDb, resetDb, pool, metrics } from './db.js';
import { logEvent, logRequest, LogEntry } from './logger.js';
import {
  validateReserveInput,
  reserve,
  setFaultDelay,
  getFaultDelay,
  applyFaultDelay,
} from './service.js';
import { InventoryService, InventoryServer } from './generated/inventory.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4006;
const GRPC_PORT = process.env.GRPC_PORT ? parseInt(process.env.GRPC_PORT, 10) : 4007;
const ENABLE_TEST_HOOKS = process.env.ENABLE_TEST_HOOKS === '1';

// ----------------------------------------------------
// 1. REST Application (Express)
// ----------------------------------------------------
const app = express();

// CORS bật trước mọi route để UI demo gọi /_reset và /_fault (D15)
app.use(cors({ origin: '*' }));

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

  // Ghi log khi handler gọi res.end(), không đợi sự kiện 'finish': nếu client đã ngắt kết nối (ví dụ Order quá hạn)
  // thì Node không phát 'finish', nhưng handler vẫn chạy xong và hàng vẫn bị giữ (D14); log phải có dòng đó.
  let logged = false;
  const emitLog = () => {
    if (logged || isExcluded) return;
    logged = true;
    const duration = Date.now() - (req as any).startTime;
    const clientVersion = (req.headers['x-client-version'] as string) || 'unknown';
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      service: 'inventory',
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: duration,
      protocol: 'rest',
      direction: 'inbound',
      clientVersion,
    };

    if (req.path === '/inventory/reservations') {
      entry.operation = 'Reserve';
    }
    if ((res as any).reservationId) {
      entry.reservationId = (res as any).reservationId;
    }
    if ((res as any).errorCode) {
      entry.errorCode = (res as any).errorCode;
    }

    logRequest(entry);
  };
  const originalEnd = res.end.bind(res) as (...args: any[]) => any;
  res.end = ((...args: any[]) => {
    const result = originalEnd(...args);
    emitLog();
    return result;
  }) as typeof res.end;

  next();
});

app.use(express.json());

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    (res as any).errorCode = 'VALIDATION_ERROR';
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Malformed JSON request body' });
  }
  return next(err);
});

// Endpoints theo hợp đồng chung
// 1. Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// 2. Metrics
app.get('/_metrics', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'inventory',
    requests: metrics.requests,
    dbQueries: metrics.dbQueries,
  });
});

app.post('/_metrics/reset', (req: Request, res: Response) => {
  metrics.reset();
  res.status(204).send();
});

// 3. Test Hooks (chỉ khi ENABLE_TEST_HOOKS=1)
if (ENABLE_TEST_HOOKS) {
  app.post('/_reset', async (req: Request, res: Response) => {
    try {
      await resetDb();
      res.status(204).send();
    } catch (err: any) {
      console.error('[Reset Error]', err);
      res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message });
    }
  });

  app.post('/_fault', (req: Request, res: Response) => {
    const delayMs = req.body?.delayMs;
    if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 60000) {
      (res as any).errorCode = 'VALIDATION_ERROR';
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'delayMs must be an integer from 0 to 60000' });
    }
    setFaultDelay(delayMs);
    res.status(204).send();
  });

  // Tắt cả REST (4006) và gRPC (4007) cho nút "Tắt Inventory" của UI demo (luồng Inventory tắt).
  // Trả lời trước rồi mới thoát; UI không bật lại được, phải chạy lại start:measure.
  app.post('/_shutdown', (req: Request, res: Response) => {
    res.status(204).send();
    setTimeout(() => process.exit(0), 100);
  });
}

// 4. Nghiệp vụ: POST /inventory/reservations
app.post('/inventory/reservations', async (req: Request, res: Response) => {
  await applyFaultDelay();

  const { sku, quantity } = req.body || {};
  const validation = validateReserveInput(sku, quantity);

  if (!validation.valid) {
    (res as any).errorCode = 'VALIDATION_ERROR';
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: validation.error,
    });
  }

  try {
    const result = await reserve(sku, quantity);
    if (!result.success) {
      (res as any).errorCode = 'OUT_OF_STOCK';
      return res.status(409).json({
        code: 'OUT_OF_STOCK',
        message: 'Insufficient stock or item not found',
      });
    }

    (res as any).reservationId = result.reservationId;
    return res.status(201).json({
      reservationId: result.reservationId,
    });
  } catch (err: any) {
    console.error('[Inventory REST Error]', err);
    (res as any).errorCode = 'INTERNAL_ERROR';
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
});

// ----------------------------------------------------
// 2. gRPC Server
// ----------------------------------------------------
const grpcServerImpl: InventoryServer = {
  reserve: async (call, callback) => {
    const startTime = Date.now();
    metrics.requests += 1;

    const metadata = call.metadata;
    const reqIdVal = metadata.get('x-request-id')[0];
    const requestId = typeof reqIdVal === 'string' && reqIdVal ? reqIdVal : crypto.randomUUID();
    const clientVerVal = metadata.get('x-client-version')[0];
    const clientVersion = typeof clientVerVal === 'string' && clientVerVal ? clientVerVal : 'unknown';

    await applyFaultDelay();

    const { sku, quantity } = call.request;
    const validation = validateReserveInput(sku, quantity);

    if (!validation.valid) {
      const duration = Date.now() - startTime;
      logRequest({
        ts: new Date().toISOString(),
        service: 'inventory',
        requestId,
        method: 'gRPC',
        path: '/kartvibe.inventory.Inventory/Reserve',
        status: grpc.status.INVALID_ARGUMENT,
        ms: duration,
        protocol: 'grpc',
        direction: 'inbound',
        operation: 'Reserve',
        clientVersion,
        grpcStatus: 'INVALID_ARGUMENT',
        errorCode: 'VALIDATION_ERROR',
      });

      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        details: validation.error || 'INVALID_ARGUMENT',
      });
    }

    try {
      const result = await reserve(sku, quantity);
      const duration = Date.now() - startTime;

      if (!result.success) {
        logRequest({
          ts: new Date().toISOString(),
          service: 'inventory',
          requestId,
          method: 'gRPC',
          path: '/kartvibe.inventory.Inventory/Reserve',
          status: grpc.status.FAILED_PRECONDITION,
          ms: duration,
          protocol: 'grpc',
          direction: 'inbound',
          operation: 'Reserve',
          clientVersion,
          grpcStatus: 'FAILED_PRECONDITION',
          errorCode: 'OUT_OF_STOCK',
        });

        const md = new grpc.Metadata();
        md.set('x-error-code', 'OUT_OF_STOCK');
        return callback({
          code: grpc.status.FAILED_PRECONDITION,
          details: `Insufficient stock for ${sku}`,
          metadata: md,
        });
      }

      logRequest({
        ts: new Date().toISOString(),
        service: 'inventory',
        requestId,
        method: 'gRPC',
        path: '/kartvibe.inventory.Inventory/Reserve',
        status: grpc.status.OK,
        ms: duration,
        protocol: 'grpc',
        direction: 'inbound',
        operation: 'Reserve',
        clientVersion,
        grpcStatus: 'OK',
        reservationId: result.reservationId,
      });

      return callback(null, {
        reservationId: result.reservationId,
        available: result.available,
      });
    } catch (err: any) {
      console.error('[Inventory gRPC Error]', err);
      const duration = Date.now() - startTime;
      logRequest({
        ts: new Date().toISOString(),
        service: 'inventory',
        requestId,
        method: 'gRPC',
        path: '/kartvibe.inventory.Inventory/Reserve',
        status: grpc.status.INTERNAL,
        ms: duration,
        protocol: 'grpc',
        direction: 'inbound',
        operation: 'Reserve',
        clientVersion,
        grpcStatus: 'INTERNAL',
        errorCode: 'INTERNAL_ERROR',
      });

      return callback({
        code: grpc.status.INTERNAL,
        details: 'INTERNAL_ERROR',
      });
    }
  },
};

// ----------------------------------------------------
// 3. Khởi động hai cổng trong cùng một tiến trình
// ----------------------------------------------------
async function startServer() {
  await initDb();
  logEvent('Database initialized and verified');

  const restServer = app.listen(PORT, () => {
    logEvent(`Inventory REST listening on :${PORT}`, { latencyMs: getFaultDelay() });
  });

  const grpcServer = new grpc.Server();
  grpcServer.addService(InventoryService, grpcServerImpl);

  grpcServer.bindAsync(
    `0.0.0.0:${GRPC_PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, boundPort) => {
      if (err) {
        console.error('Failed to bind gRPC server:', err);
        process.exit(1);
      }
      logEvent(`Inventory gRPC listening on :${boundPort}`);
    }
  );

  const shutdown = async () => {
    logEvent('Shutting down Inventory Service');
    restServer.close();
    grpcServer.forceShutdown();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start Inventory Service:', err);
  process.exit(1);
});
