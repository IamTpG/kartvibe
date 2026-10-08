import './env.js';
import express, { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initDb,
  queryProductById,
  queryProductsByIds,
  getDbQueriesCount,
  resetDbQueriesCount,
  seedDatabase,
  DataSize,
} from './db.js';
import { logEvent, logRequest } from './logger.js';
import type { Product, ProductList } from './contract.js';

const __filename = fileURLToPath(import.meta.url);

const PORT = Number(process.env.PORT || 4003);
// Độ trễ giả và các điểm vào phục vụ test (/_fault, /_seed) mặc định TẮT; start-all.sh bật chúng cho demo và đo.
const BASE_LATENCY_MS = Number(process.env.LATENCY_MS ?? 0);
const TEST_HOOKS = process.env.ENABLE_TEST_HOOKS === '1';

interface FaultState {
  latencyMs: number;
  error: boolean;
}

let requestsCount = 0;
let faultState: FaultState = {
  latencyMs: 0,
  error: false,
};

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createApp(): Promise<express.Express> {
  await initDb();

  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

  // CORS & Request ID middleware (no compression enabled)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-request-id');
    res.setHeader('Access-Control-Expose-Headers', 'x-request-id');
    res.setHeader('Cache-Control', 'no-store');

    const incomingReqId = req.header('x-request-id');
    const requestId =
      incomingReqId && incomingReqId.trim().length > 0
        ? incomingReqId.trim()
        : crypto.randomUUID();

    (req as Request & { requestId: string }).requestId = requestId;
    res.setHeader('x-request-id', requestId);

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json());

  // ============================================================================
  // Control & Observability Endpoints (NOT counted in requests or dbQueries)
  // ============================================================================

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/_metrics', (_req: Request, res: Response) => {
    res.status(200).json({
      service: 'product',
      requests: requestsCount,
      dbQueries: getDbQueriesCount(),
    });
  });

  const handleMetricsReset = (_req: Request, res: Response) => {
    requestsCount = 0;
    resetDbQueriesCount();
    res.status(204).end();
  };

  app.post('/_metrics/reset', handleMetricsReset);
  app.post('/reset', handleMetricsReset);

  // Điểm vào phục vụ test: chỉ có khi ENABLE_TEST_HOOKS=1.
  if (TEST_HOOKS) {
    app.get('/_fault', (_req: Request, res: Response) => {
      res.status(200).json({
        latencyMs: faultState.latencyMs,
        error: faultState.error,
      });
    });

    app.post('/_fault', (req: Request, res: Response) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const keys = Object.keys(body);

      if (keys.length === 0) {
        faultState = { latencyMs: 0, error: false };
      } else {
        const rawLatency = body.latencyMs !== undefined ? Number(body.latencyMs) : 0;
        if (Number.isNaN(rawLatency) || rawLatency < 0) {
          res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: 'latencyMs must be a non-negative number',
          });
          return;
        }
        faultState = {
          latencyMs: Math.floor(rawLatency),
          error: Boolean(body.error),
        };
      }

      res.status(200).json({
        latencyMs: faultState.latencyMs,
        error: faultState.error,
      });
    });

    app.post('/_seed', async (req: Request, res: Response) => {
      try {
        const rawSize = String(req.body?.size || req.query?.size || 'S').toUpperCase();
        if (rawSize !== 'S' && rawSize !== 'L') {
          res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: 'size must be "S" or "L"',
          });
          return;
        }
        const result = await seedDatabase(rawSize as DataSize);
        resetDbQueriesCount();
        res.status(200).json({
          status: 'ok',
          size: rawSize,
          count: result.count,
          mode: result.mode,
        });
      } catch {
        res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'Failed to seed database',
        });
      }
    });
  }

  // ============================================================================
  // Business Endpoints (Counted in metrics, subject to LATENCY_MS + _fault, logged)
  // ============================================================================

  const businessMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const startHr = performance.now();
    const requestId = (req as Request & { requestId: string }).requestId;

    requestsCount += 1;

    res.on('finish', () => {
      const elapsedMs = Math.round(performance.now() - startHr);
      logRequest({
        ts: new Date().toISOString(),
        service: 'product',
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: elapsedMs,
      });
    });

    const totalDelayMs = BASE_LATENCY_MS + faultState.latencyMs;
    await sleep(totalDelayMs);

    if (faultState.error) {
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Product service fault injection is active',
      });
      return;
    }

    next();
  };

  /**
   * Batch endpoint: GET /products?ids=8,9,10
   * Rules (Section 3 of hop-dong-chung.md):
   * - `ids` is comma-separated integers
   * - duplicate IDs are deduplicated (counted once)
   * - non-existent IDs are ignored (no error)
   * - sorted by `id` ascending
   * - max 200 IDs (exceeding returns 400)
   * - invalid format returns 400 VALIDATION_ERROR
   * - 1 call = 1 request, 1 DB query (WHERE id = ANY(...))
   */
  app.get('/products', businessMiddleware, async (req: Request, res: Response) => {
    try {
      const idsRaw = req.query.ids;
      if (typeof idsRaw !== 'string' || idsRaw.trim() === '') {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Query parameter "ids" is required and must be a comma-separated list of integers',
        });
        return;
      }

      const parts = idsRaw.split(',');
      if (parts.length > 200) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Maximum 200 ids allowed per request',
        });
        return;
      }

      const parsedIds: number[] = [];
      for (const part of parts) {
        const trimmed = part.trim();
        if (!/^\d+$/.test(trimmed)) {
          res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: `Invalid product id "${part}" in ids list`,
          });
          return;
        }
        const num = Number(trimmed);
        if (!Number.isSafeInteger(num) || num <= 0) {
          res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: `Product id "${part}" must be a positive integer`,
          });
          return;
        }
        parsedIds.push(num);
      }

      const uniqueIds = Array.from(new Set(parsedIds));
      const products = await queryProductsByIds(uniqueIds);

      const body: ProductList = { data: products };
      res.status(200).json(body);
    } catch {
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error while fetching products',
      });
    }
  });

  /**
   * Single product endpoint: GET /products/:id
   * Rules (Section 3 of hop-dong-chung.md):
   * - 200 {"id":8,"sku":"SKU-008","name":"Sản phẩm 08","price":14000,"thumbnail":"https://img.example.test/p/8.jpg","description":"..."}
   * - 404 {"code":"PRODUCT_NOT_FOUND","message":"..."}
   * - 400 {"code":"VALIDATION_ERROR","message":"..."} if id is invalid
   * - 1 call = 1 request, 1 DB query
   */
  app.get('/products/:id', businessMiddleware, async (req: Request, res: Response) => {
    try {
      const rawId = String(req.params.id);
      if (!/^\d+$/.test(rawId)) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Product id must be a positive integer',
        });
        return;
      }

      const id = Number(rawId);
      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Product id must be a positive integer',
        });
        return;
      }

      const product = await queryProductById(id);
      if (!product) {
        res.status(404).json({
          code: 'PRODUCT_NOT_FOUND',
          message: `Product ${id} not found`,
        });
        return;
      }

      const body: Product = product;
      res.status(200).json(body);
    } catch {
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error while fetching product',
      });
    }
  });

  // Fallback 404 & Error handlers without stack traces
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    });
  });

  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  });

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  createApp()
    .then((app) => {
      app.listen(PORT, () => {
        logEvent(`Product listening on :${PORT}`, { latencyMs: BASE_LATENCY_MS });
      });
    })
    .catch((err) => {
      console.error('[product-service] Failed to start:', err);
      process.exit(1);
    });
}
