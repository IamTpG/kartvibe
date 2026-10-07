import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError, type ErrorDetail } from '../errors.js';

interface Schemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

function lastKey(path: PropertyKey[], fallback: string): string {
  return path.length ? String(path[path.length - 1]) : fallback;
}

function issueText(i: z.core.$ZodIssue): string {
  switch (i.code) {
    case 'invalid_type':
      if (i.input === undefined) return 'is required';
      return `must be ${['int', 'number'].includes(i.expected) ? 'integer' : i.expected}`;
    case 'unrecognized_keys':
      return 'is not allowed';
    case 'too_small':
      return `must be >= ${i.minimum}`;
    case 'too_big':
      return `must be <= ${i.maximum}`;
    case 'invalid_format':
      if (i.format === 'uuid') return 'must be a valid UUID';
      if (i.format === 'regex') return 'must be integer';
      return 'is invalid';
    default:
      return i.message;
  }
}

export function toDetails(err: z.ZodError, bodyField = 'body'): ErrorDetail[] {
  const out: ErrorDetail[] = [];
  for (const i of err.issues) {
    if (i.code === 'unrecognized_keys') {
      for (const k of i.keys) out.push({ field: k, issue: 'is not allowed' });
    } else {
      out.push({ field: lastKey(i.path, bodyField), issue: issueText(i) });
    }
  }
  return out;
}

/**
 * Validate params → query → body bằng chính Zod schema dùng để sinh OpenAPI.
 * Chạy trước mọi truy vấn DB. Gộp lỗi của cả 3 phần vào 1 VALIDATION_ERROR.
 */
export const validate =
  (s: Schemas): RequestHandler =>
  (req, res, next) => {
    const details: ErrorDetail[] = [];
    const check = (schema: z.ZodType | undefined, data: unknown, bodyField?: string) => {
      if (!schema) return undefined;
      const r = schema.safeParse(data);
      if (r.success) return r.data;
      details.push(...toDetails(r.error, bodyField));
      return undefined;
    };

    const params = check(s.params, req.params);
    const query = check(s.query, req.query);

    let body: unknown;
    if (s.body) {
      if (!req.is('application/json')) {
        details.push({ field: 'body', issue: 'must be application/json' });
      } else {
        body = check(s.body, req.body, 'body');
      }
    }

    if (details.length) return next(new AppError('VALIDATION_ERROR', details));

    res.locals.params = params;
    res.locals.query = query;
    res.locals.body = body;
    next();
  };
