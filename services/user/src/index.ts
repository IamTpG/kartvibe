import './env.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { executeQuery, metrics } from './db.js';
import { logEvent, logRequest } from './logger.js';
import type { User } from './contract.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4001;
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
        service: 'user',
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
    service: 'user',
    requests: metrics.requests,
    dbQueries: metrics.dbQueries,
  });
});

app.post('/_metrics/reset', (req: Request, res: Response) => {
  metrics.reset();
  res.status(204).send();
});

// 3. Nghiệp vụ: GET /users/:id
app.get('/users/:id', async (req: Request, res: Response) => {
  const rawId = String(req.params.id);
  const id = parseInt(rawId, 10);

  if (isNaN(id) || String(id) !== rawId) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'User ID must be an integer',
    });
  }

  try {
    const result = await executeQuery('SELECT id, name FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: `User with id ${id} not found`,
      });
    }

    const row = result.rows[0];
    const user: User = { id: row.id, name: row.name };
    return res.status(200).json(user);
  } catch (err: any) {
    console.error('[User Service Error]', err);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
});

app.listen(PORT, () => {
  logEvent(`User listening on :${PORT}`, { latencyMs: LATENCY_MS });
});
