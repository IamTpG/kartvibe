// Gọi User, Order, Product: URL, timeout, chuyển tiếp x-request-id.
import type { components as UserApi } from './generated/user.js';
import type { components as OrderApi } from './generated/order.js';
import type { components as ProductApi } from './generated/product.js';

// Kiểu lấy từ hợp đồng mà từng service công bố (sinh bằng `npm run contracts`), không tự khai báo lại.
export type User = UserApi['schemas']['User'];
export type Order = OrderApi['schemas']['Order'];
export type Product = ProductApi['schemas']['Product'];

export const userUrl = process.env.USER_SERVICE_URL ?? 'http://localhost:4001';
export const orderUrl = process.env.ORDER_SERVICE_URL ?? 'http://localhost:4002';
export const productUrl = process.env.PRODUCT_SERVICE_URL ?? 'http://localhost:4003';
export const productTimeout = Number(process.env.PRODUCT_TIMEOUT_MS ?? 1000);
export const upstreamTimeout = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 5000);

export async function getJson<T>(base: string, path: string, requestId: string, timeout: number): Promise<T> {
  const response = await fetch(new URL(path, base), {
    headers: { 'x-request-id': requestId },
    signal: AbortSignal.timeout(timeout),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return await response.json() as T;
}
