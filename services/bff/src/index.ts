import './env.js';
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { logEvent, logRequest } from './logger.js';
import {
  getJson, orderUrl, productTimeout, productUrl, upstreamTimeout, userUrl,
  type Order, type Product, type User
} from './upstream.js';
import type { MobileOrders, WebDashboard } from './contract.js';

type ApiError = WebDashboard['errors'][number];

const app = express();
app.disable('x-powered-by');
const port = Number(process.env.PORT ?? 4004);
let requests = 0;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-request-id');
  res.setHeader('Access-Control-Expose-Headers', 'x-request-id');
  res.setHeader('x-request-id', req.header('x-request-id') || randomUUID());
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/_metrics', (_req, res) => res.json({ service: 'bff', requests, dbQueries: 0 }));
app.post('/_metrics/reset', (_req, res) => { requests = 0; res.sendStatus(204); });

function validUserId(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

async function compose(req: Request, res: Response, client: 'web' | 'mobile') {
  const started = performance.now();
  const requestId = String(res.getHeader('x-request-id'));
  requests++;
  let status = 200;
  try {
    const userId = validUserId(req.query.userId);
    if (userId === null) {
      status = 400;
      return res.status(status).json({ code: 'VALIDATION_ERROR', message: 'userId must be a positive integer' });
    }

    // Web requests are independent; mobile deliberately never calls User Service.
    const userPromise = client === 'web'
      ? getJson<User>(userUrl, `/users/${userId}`, requestId, upstreamTimeout)
      : Promise.resolve(null);
    const ordersPromise = getJson<{ data: Order[] }>(orderUrl, `/orders?userId=${userId}`, requestId, upstreamTimeout);
    let user: User | null;
    let orders: Order[];
    try {
      const [u, result] = await Promise.all([userPromise, ordersPromise]);
      user = u;
      orders = result.data;
      if (!Array.isArray(orders)) throw new Error('Invalid Order response');
    } catch {
      status = 502;
      return res.status(status).json({ code: 'UPSTREAM_ERROR', message: 'User or Order Service unavailable' });
    }

    const ids = [...new Set(orders.flatMap(order => order.items.map(item => item.productId)))].sort((a, b) => a - b);
    let products = new Map<number, Product>();
    let errors: ApiError[] = [];
    if (ids.length) {
      try {
        const result = await getJson<{ data: Product[] }>(productUrl, `/products?ids=${ids.join(',')}`, requestId, productTimeout);
        if (!Array.isArray(result.data)) throw new Error('Invalid Product response');
        products = new Map(result.data.map(product => [product.id, product]));
        const missing = ids.filter(id => !products.has(id));
        if (missing.length) errors = [{ code: 'PRODUCT_UNAVAILABLE', message: 'Some products are unavailable', productIds: missing }];
      } catch {
        errors = [{ code: 'PRODUCT_UNAVAILABLE', message: 'Product Service unavailable', productIds: ids }];
      }
    }

    const partial = errors.length > 0;
    if (client === 'web') {
      const body: WebDashboard = {
        user: user!, // web luôn gọi User ở trên
        orders: orders.map(order => ({
          id: order.id, status: order.status, createdAt: order.createdAt,
          items: order.items.map(item => {
            const product = products.get(item.productId);
            return { productId: item.productId, quantity: item.quantity,
              product: product ? { name: product.name, price: product.price } : null };
          })
        })),
        partial, errors
      };
      return res.json(body);
    }
    const body: MobileOrders = {
      orders: orders.map(order => ({
        id: order.id, status: order.status,
        items: order.items.map(item => {
          const product = products.get(item.productId);
          return { product: product ? { name: product.name, thumbnail: product.thumbnail } : null };
        })
      })),
      partial, errors
    };
    return res.json(body);
  } catch (error) {
    status = 500;
    console.error('BFF failed to compose response:', error);
    if (!res.headersSent) return res.status(status).json({ code: 'INTERNAL_ERROR', message: 'Could not compose dashboard' });
  } finally {
    logRequest({ requestId, method: req.method, path: req.path, status, ms: Math.round(performance.now() - started) });
  }
}

app.get('/bff/web/dashboard', (req, res) => { void compose(req, res, 'web'); });
app.get('/bff/mobile/orders', (req, res) => { void compose(req, res, 'mobile'); });
app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found' }));

app.listen(port, () => logEvent(`BFF listening on :${port}`));
