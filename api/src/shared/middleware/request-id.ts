import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../logger.js';

// Server luôn tự sinh request_id, bỏ qua X-Request-Id client gửi lên.
export const httpLogger = pinoHttp({
  logger,
  genReqId: (_req, res) => {
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : 'info'),
  // Chỉ log method/url/id — không log header (tránh lộ Authorization) và body.
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

export const requestId: RequestHandler = (req, _res, next) => {
  req.requestId = String(req.id);
  next();
};

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}
