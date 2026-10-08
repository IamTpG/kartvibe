// Gọi các service REST (User, Order, Product) theo hợp đồng chung. Không truy vấn DB trực tiếp.
import { log } from './logger.js';

const USER_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:4001';
const ORDER_URL = process.env.ORDER_SERVICE_URL ?? 'http://localhost:4002';
const PRODUCT_URL = process.env.PRODUCT_SERVICE_URL ?? 'http://localhost:4003';
export const PRODUCT_TIMEOUT_MS = Number(process.env.PRODUCT_TIMEOUT_MS ?? 1000);
const DEFAULT_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 5000);

import type { components as UserApi } from './generated/user.js';
import type { components as OrderApi } from './generated/order.js';
import type { components as ProductApi } from './generated/product.js';

// Kiểu lấy từ hợp đồng mà từng service công bố (sinh bằng `npm run contracts`), không tự khai báo lại.
export type User = UserApi['schemas']['User'];
export type OrderRow = OrderApi['schemas']['Order'];
export type Product = ProductApi['schemas']['Product'];

export class UpstreamError extends Error {
  constructor(
    readonly service: string,
    readonly kind: 'NOT_FOUND' | 'TIMEOUT' | 'HTTP' | 'NETWORK',
    message: string,
  ) {
    super(message);
  }
}

/** Gọi một service, chuyển tiếp x-request-id, đặt timeout, ghi log. Trả null khi 404. */
async function call<T>(service: string, base: string, path: string, requestId: string, timeoutMs: number): Promise<T | null> {
  const t0 = performance.now();
  let status = 0;
  try {
    const res = await fetch(base + path, {
      headers: { 'x-request-id': requestId },
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = res.status;
    if (res.status === 404) return null;
    if (!res.ok) throw new UpstreamError(service, 'HTTP', `${service} trả ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new UpstreamError(service, timedOut ? 'TIMEOUT' : 'NETWORK', `${service}: ${timedOut ? 'quá thời gian chờ' : 'lỗi kết nối'}`);
  } finally {
    log({ requestId, upstream: service, method: 'GET', path, status, ms: Math.round(performance.now() - t0) });
  }
}

export async function getUser(id: number, requestId: string): Promise<User | null> {
  return call<User>('user', USER_URL, `/users/${id}`, requestId, DEFAULT_TIMEOUT_MS);
}

export async function getOrders(userId: number, requestId: string): Promise<OrderRow[]> {
  const body = await call<{ data: OrderRow[] }>('order', ORDER_URL, `/orders?userId=${userId}`, requestId, DEFAULT_TIMEOUT_MS);
  return body?.data ?? [];
}

/** Một product theo id; null nếu không tồn tại. */
export function getProduct(id: number, requestId: string): Promise<Product | null> {
  return call<Product>('product', PRODUCT_URL, `/products/${id}`, requestId, PRODUCT_TIMEOUT_MS);
}

/** Nhiều product trong MỘT lời gọi (id đã được gọi loại trùng); id không tồn tại bị bỏ qua. */
export async function getProducts(ids: readonly number[], requestId: string): Promise<Product[]> {
  const body = await call<{ data: Product[] }>('product', PRODUCT_URL, `/products?ids=${ids.join(',')}`, requestId, PRODUCT_TIMEOUT_MS);
  return body?.data ?? [];
}
