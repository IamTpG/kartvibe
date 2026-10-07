import { AppError } from './errors.js';

/** Lấy SQLSTATE (23505, 23503, ...) từ lỗi Prisma/driver, bất kể bọc bao nhiêu lớp. */
function sqlState(err: unknown, depth = 0): string | undefined {
  if (!err || typeof err !== 'object' || depth > 5) return undefined;
  const e = err as Record<string, any>;
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && !/^P\d{4}$/.test(e.code)) {
    return e.code;
  }
  return (
    sqlState(e.originalCode ? { code: e.originalCode } : undefined, depth + 1) ??
    sqlState(e.meta?.driverAdapterError, depth + 1) ??
    sqlState(e.cause, depth + 1)
  );
}

/**
 * Phòng thủ lỗi DB:
 *  23505 (unique, INSERT cart_items) → 409 ITEM_ALREADY_IN_CART
 *  23503 (FK, product bị xóa giữa chừng) → 422 PRODUCT_UNAVAILABLE
 *  còn lại (kể cả 23514 CHECK = bug tầng 1) → để error handler trả 500 + log
 */
export function mapInsertError(err: unknown): unknown {
  if (err instanceof AppError) return err;
  const e = err as { code?: string };
  const state = sqlState(err);
  if (e?.code === 'P2002' || state === '23505') return new AppError('ITEM_ALREADY_IN_CART');
  if (e?.code === 'P2003' || state === '23503') return new AppError('PRODUCT_UNAVAILABLE');
  return err;
}
