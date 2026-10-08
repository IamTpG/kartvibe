// Dịch vụ GIẢ (User 4001, Order 4002, Product 4003) theo đúng hợp đồng chung, dữ liệu trong bộ nhớ.
// Chỉ để thử BFF/GraphQL khi chưa có service thật hoặc chưa có Docker. Không phải mã nộp bài.
// Chạy: SIZE=S|L LATENCY_MS=30 node services/tools/mock-services.mjs
import http from 'node:http';

const SIZE = process.env.SIZE === 'L' ? 'L' : 'S';
const { orders: N_ORDERS, k: K, n: N_PRODUCTS } = SIZE === 'L' ? { orders: 50, k: 4, n: 30 } : { orders: 5, k: 3, n: 10 };
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 30);
const STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

const pad = (v, w) => String(v).padStart(w, '0');
const products = new Map();
for (let id = 1; id <= N_PRODUCTS; id++) {
  products.set(id, {
    id, sku: `SKU-${pad(id, 3)}`, name: `Sản phẩm ${pad(id, 2)}`, price: 10000 + id * 500,
    thumbnail: `https://img.example.test/p/${id}.jpg`, description: `Mô tả sản phẩm ${id}. `.repeat(6),
  });
}
const orders = [];
for (let o = 1; o <= N_ORDERS; o++) {
  const items = [];
  for (let i = 0; i < K; i++) items.push({ productId: ((o * 7 + i * 11) % N_PRODUCTS) + 1, quantity: ((o + i) % 3) + 1 });
  orders.push({
    id: o, userId: 1, status: STATUSES[(o - 1) % 5],
    createdAt: new Date(Date.UTC(2026, 0, 1) + (o - 1) * 86400000).toISOString(), items,
  });
}
const user = { id: 1, name: 'Người dùng 1' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fault = { latencyMs: 0, error: false };

function start(name, port, route) {
  const m = { requests: 0, dbQueries: 0 };
  // Hợp đồng mục 1: CORS `*` và đọc/ghi x-request-id ở mọi service.
  const send = (res, status, body, req) => {
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (req?.headers['x-request-id']) headers['x-request-id'] = req.headers['x-request-id'];
    res.writeHead(status, headers);
    res.end(status === 204 ? undefined : JSON.stringify(body));
  };
  http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const t0 = performance.now();
    if (url.pathname === '/health') return send(res, 200, { status: 'ok' }, req);
    if (url.pathname === '/_metrics' && req.method === 'GET') return send(res, 200, { service: name, ...m }, req);
    if (url.pathname === '/_metrics/reset') { m.requests = 0; m.dbQueries = 0; return send(res, 204, null, req); }
    if (name === 'product' && url.pathname === '/_fault') {
      if (req.method === 'POST') {
        let raw = ''; for await (const c of req) raw += c;
        const b = raw ? JSON.parse(raw) : {};
        fault = { latencyMs: Number(b.latencyMs ?? 0), error: Boolean(b.error) };
      }
      return send(res, 200, fault, req);
    }
    m.requests++;
    await sleep(LATENCY_MS + (name === 'product' ? fault.latencyMs : 0));
    let status, body;
    if (name === 'product' && fault.error) [status, body] = [500, { code: 'INTERNAL_ERROR', message: 'Lỗi giả lập' }];
    else [status, body] = route(url, m);
    send(res, status, body, req);
    console.log(JSON.stringify({
      ts: new Date().toISOString(), service: name, requestId: req.headers['x-request-id'] ?? null,
      method: req.method, path: url.pathname + url.search, status, ms: Math.round(performance.now() - t0),
    }));
  }).listen(port, () => console.log(`[mock] ${name} :${port} (SIZE=${SIZE}, latency ${LATENCY_MS}ms)`));
}

start('user', 4001, (url, m) => {
  const mt = url.pathname.match(/^\/users\/(\d+)$/);
  if (!mt) return [404, { code: 'NOT_FOUND', message: 'Không tìm thấy' }];
  m.dbQueries++;
  return Number(mt[1]) === 1 ? [200, user] : [404, { code: 'USER_NOT_FOUND', message: 'Không có người dùng' }];
});

start('order', 4002, (url, m) => {
  if (url.pathname !== '/orders') return [404, { code: 'NOT_FOUND', message: 'Không tìm thấy' }];
  const uid = Number(url.searchParams.get('userId'));
  if (!Number.isInteger(uid)) return [400, { code: 'VALIDATION_ERROR', message: 'userId không hợp lệ' }];
  m.dbQueries += 2;
  return [200, { data: orders.filter((o) => o.userId === uid) }];
});

start('product', 4003, (url, m) => {
  if (url.pathname === '/products' && url.searchParams.has('ids')) {
    const ids = url.searchParams.get('ids').split(',').map(Number);
    if (ids.some((i) => !Number.isInteger(i)) || ids.length > 200) return [400, { code: 'VALIDATION_ERROR', message: 'ids không hợp lệ' }];
    m.dbQueries++;
    const uniq = [...new Set(ids)].sort((a, b) => a - b);
    return [200, { data: uniq.map((i) => products.get(i)).filter(Boolean) }];
  }
  const mt = url.pathname.match(/^\/products\/(\d+)$/);
  if (!mt) return [404, { code: 'NOT_FOUND', message: 'Không tìm thấy' }];
  m.dbQueries++;
  const p = products.get(Number(mt[1]));
  return p ? [200, p] : [404, { code: 'PRODUCT_NOT_FOUND', message: 'Không có product' }];
});
