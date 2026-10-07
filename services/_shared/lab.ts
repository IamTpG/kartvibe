// Phần dùng chung của các service trong sân thử Block 2: CORS, độ trễ giả, bộ đếm số liệu,
// đếm truy vấn DB, định dạng lỗi. Chỉ phục vụ học và đo, không phải mã production.
import express, { type Express, type RequestHandler } from 'express';
import pg from 'pg';

export const LATENCY_MS = Number(process.env.LATENCY_MS ?? 50);
export const DATABASE_URL =
  process.env.LAB_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/kartvibe_lab';

/** Số liệu của riêng tiến trình này; /_metrics và /health không tự tính vào. */
const metrics = { requests: 0, dbQueries: 0 };

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Db {
  query<T extends pg.QueryResultRow = any>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>>;
}

/** Mọi truy vấn của service đều đi qua wrapper này để đếm. */
export function createDb(): Db {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });
  return {
    query(text, params) {
      metrics.dbQueries++;
      return pool.query(text, params);
    },
  };
}

/** Đọc id số nguyên dương từ chuỗi; sai thì 400. */
export function parseId(raw: unknown, name = 'id'): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${name} phải là số nguyên dương`);
  }
  return n;
}

const cors: RequestHandler = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return void res.status(204).end();
  next();
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tạo app: CORS, health, metrics, rồi middleware đếm + độ trễ, rồi route nghiệp vụ. */
export function createLabApp(register: (app: Express) => void): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors);

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/_metrics', (_req, res) => res.json({ ...metrics }));
  app.post('/_metrics/reset', (_req, res) => {
    metrics.requests = 0;
    metrics.dbQueries = 0;
    res.json({ ...metrics });
  });

  // Mọi request nghiệp vụ: đếm rồi chờ độ trễ giả trước khi xử lý.
  app.use(async (_req, _res, next) => {
    metrics.requests++;
    if (LATENCY_MS > 0) await sleep(LATENCY_MS);
    next();
  });

  register(app);

  app.use((_req, res) => {
    res.status(404).json({ code: 'ROUTE_NOT_FOUND', message: 'Không tìm thấy endpoint' });
  });
  app.use(((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ code: err.code, message: err.message });
    }
    console.error(err); // chi tiết chỉ ở log, không trả ra ngoài
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Đã có lỗi xảy ra' });
  }) as express.ErrorRequestHandler);
  return app;
}

export function listen(app: Express, port: number, name: string) {
  const server = app.listen(port, () => {
    console.log(`${name} listening on :${port} (latency ${LATENCY_MS}ms)`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
