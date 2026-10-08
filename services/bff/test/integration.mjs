import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { assertResponse } from '../../tools/contract.mjs';

const calls = { user: [], order: [], product: [] };
let productMode = 'ok';
let userFails = false;
let orderFails = false;
let orderRows = [
  { id: 1, userId: 1, status: 'PAID', createdAt: '2026-01-01T00:00:00.000Z', items: [
    { productId: 8, quantity: 2 }, { productId: 9, quantity: 1 }] },
  { id: 2, userId: 1, status: 'SHIPPED', createdAt: '2026-01-02T00:00:00.000Z', items: [
    { productId: 8, quantity: 1 }] }
];
const servers = [];
async function mock(name, handler) {
  const server = createServer((req, res) => {
    calls[name].push({ path: req.url, requestId: req.headers['x-request-id'] });
    res.setHeader('Content-Type', 'application/json');
    handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
// Mọi phản hồi của service giả phải khớp hợp đồng đã công bố của service đó (<service>/openapi.json), nếu không test này hỏng.
function json(res, value, status, contract) {
  assertResponse(contract.service, contract.route, status, value);
  res.writeHead(status); res.end(JSON.stringify(value));
}
const USER = { service: 'user', route: 'GET /users/{id}' };
const ORDERS = { service: 'order', route: 'GET /orders' };
const PRODUCTS = { service: 'product', route: 'GET /products' };
const user = await mock('user', (_req, res) => userFails
  ? json(res, { code: 'INTERNAL_ERROR', message: 'test' }, 500, USER)
  : json(res, { id: 1, name: 'Người dùng 1' }, 200, USER));
const order = await mock('order', (_req, res) => orderFails
  ? json(res, { code: 'INTERNAL_ERROR', message: 'test' }, 500, ORDERS)
  : json(res, { data: orderRows }, 200, ORDERS));
const product = await mock('product', (_req, res) => {
  if (productMode === 'error') return json(res, { code: 'INTERNAL_ERROR', message: 'test' }, 500, PRODUCTS);
  if (productMode === 'slow') return setTimeout(() => json(res, { data: [] }, 200, PRODUCTS), 150);
  const fixture = (id) => ({ id, sku: `SKU-${String(id).padStart(3, '0')}`, name: `Sản phẩm ${String(id).padStart(2, '0')}`,
    price: 10000 + id * 500, thumbnail: `https://img.example.test/p/${id}.jpg`, description: `Mô tả sản phẩm ${id}.` });
  return json(res, { data: [fixture(8), ...(productMode === 'missing' ? [] : [fixture(9)])] }, 200, PRODUCTS);
});
const portServer = createServer();
await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));
const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port), USER_SERVICE_URL: user,
    ORDER_SERVICE_URL: order, PRODUCT_SERVICE_URL: product,
    PRODUCT_TIMEOUT_MS: '50' }, stdio: 'ignore'
});

try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { const response = await fetch(`http://localhost:${port}/health`); ready = response.ok; if (ready) break; }
    catch { await delay(100); }
  }
  assert.ok(ready, 'BFF did not start');
  const requestId = 'integration-p2';
  const webResponse = await fetch(`http://localhost:${port}/bff/web/dashboard?userId=1`, { headers: { 'x-request-id': requestId } });
  assert.equal(webResponse.status, 200);
  const web = await webResponse.json();
  assertResponse('bff', 'GET /bff/web/dashboard', 200, web);
  assert.equal(web.orders[1].items[0].product.name, 'Sản phẩm 08');
  assert.equal(web.partial, false);
  assert.equal(calls.user.length, 1);
  assert.equal(calls.order.length, 1);
  assert.equal(calls.product.length, 1);
  assert.equal(calls.product[0].path, '/products?ids=8,9');
  assert.ok(Object.values(calls).flat().every(call => call.requestId === requestId));

  const mobileResponse = await fetch(`http://localhost:${port}/bff/mobile/orders?userId=1`);
  const mobile = await mobileResponse.json();
  assertResponse('bff', 'GET /bff/mobile/orders', 200, mobile);
  assert.equal(calls.user.length, 1, 'mobile must not call User');
  assert.equal(calls.product.length, 2);

  productMode = 'error';
  const failed = await (await fetch(`http://localhost:${port}/bff/web/dashboard?userId=1`)).json();
  assertResponse('bff', 'GET /bff/web/dashboard', 200, failed);
  assert.equal(failed.partial, true);
  assert.equal(failed.orders[0].items[0].product, null);
  assert.deepEqual(failed.errors[0].productIds, [8, 9]);
  productMode = 'slow';
  const slow = await (await fetch(`http://localhost:${port}/bff/mobile/orders?userId=1`)).json();
  assertResponse('bff', 'GET /bff/mobile/orders', 200, slow);
  assert.equal(slow.partial, true);
  assert.equal(slow.orders[0].items[0].product, null);
  productMode = 'missing';
  const missing = await (await fetch(`http://localhost:${port}/bff/web/dashboard?userId=1`)).json();
  assertResponse('bff', 'GET /bff/web/dashboard', 200, missing);
  assert.equal(missing.orders[0].items[0].product.name, 'Sản phẩm 08');
  assert.equal(missing.orders[0].items[1].product, null);
  assert.deepEqual(missing.errors[0].productIds, [9]);

  userFails = true;
  const badUser = await fetch(`http://localhost:${port}/bff/web/dashboard?userId=1`);
  assert.equal(badUser.status, 502);
  const badUserBody = await badUser.json();
  assertResponse('bff', 'GET /bff/web/dashboard', 502, badUserBody);
  assert.equal(badUserBody.code, 'UPSTREAM_ERROR');
  userFails = false;
  orderFails = true;
  const badOrder = await fetch(`http://localhost:${port}/bff/mobile/orders?userId=1`);
  assert.equal(badOrder.status, 502);
  assert.equal((await badOrder.json()).code, 'UPSTREAM_ERROR');
  orderFails = false;

  const invalid = await fetch(`http://localhost:${port}/bff/web/dashboard?userId=abc`);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'VALIDATION_ERROR');
  orderRows = [];
  const empty = await (await fetch(`http://localhost:${port}/bff/mobile/orders?userId=1`)).json();
  assert.deepEqual(empty.orders, []);
  assert.equal(empty.partial, false);
  assert.equal(calls.product.length, 5, 'no Product call when there are no items');

  const metrics = await (await fetch(`http://localhost:${port}/_metrics`)).json();
  assert.equal(metrics.requests, 9);
  assert.equal(metrics.dbQueries, 0);
  console.log('BFF integration passed: shape, dedup, trace, error, timeout, missing product, validation, empty orders, metrics');
} finally {
  child.kill();
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
}
