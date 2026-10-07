import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, errorMessage } from '../errors.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    code: 'ROUTE_NOT_FOUND',
    message: errorMessage('ROUTE_NOT_FOUND'),
    details: [],
    request_id: req.requestId,
  });
};

export const methodNotAllowed: RequestHandler = (req, res) => {
  res.status(405).json({
    code: 'METHOD_NOT_ALLOWED',
    message: errorMessage('METHOD_NOT_ALLOWED'),
    details: [],
    request_id: req.requestId,
  });
};

function bodyParserError(err: unknown): boolean {
  const e = err as { type?: string; status?: number };
  return typeof e?.type === 'string' && e.type.startsWith('entity.') && e.status === 400;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.requestId ?? String(req.id);
  if (!res.getHeader('X-Request-Id')) res.setHeader('X-Request-Id', requestId);

  if (err instanceof AppError) {
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      details: err.details,
      request_id: requestId,
    });
  }

  // JSON hỏng / body quá lớn từ express.json()
  if (bodyParserError(err)) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: errorMessage('VALIDATION_ERROR'),
      details: [{ field: 'body', issue: 'must be valid JSON' }],
      request_id: requestId,
    });
  }

  // Mọi lỗi khác (kể cả lỗi DB): chi tiết chỉ vào log, body không lộ gì.
  req.log?.error({ err }, 'unhandled error');
  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: errorMessage('INTERNAL_ERROR'),
    details: [],
    request_id: requestId,
  });
};
