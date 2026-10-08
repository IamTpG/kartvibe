import test from 'node:test';
import assert from 'node:assert/strict';
import { responseViolations as resp, schemaViolations as schema } from '../contract.mjs';

const product = (id) => ({ id, sku: `SKU-${String(id).padStart(3, '0')}`, name: `Sản phẩm ${id}`, price: 14000,
  thumbnail: `https://img.example.test/p/${id}.jpg`, description: 'Mô tả' });
const webItem = (p) => ({ productId: 8, quantity: 2, product: p });
const web = (items, extra = {}) => ({ user: { id: 1, name: 'Người dùng 1' }, partial: false, errors: [],
  orders: [{ id: 1, status: 'PAID', createdAt: '2026-01-01T00:00:00.000Z', items }], ...extra });
const WEB = ['bff', 'GET /bff/web/dashboard', 200];
const MOBILE = ['bff', 'GET /bff/mobile/orders', 200];

test('hợp đồng chấp nhận dữ liệu đúng', () => {
  assert.deepEqual(resp('user', 'GET /users/{id}', 200, { id: 1, name: 'A' }), []);
  assert.deepEqual(resp('product', 'GET /products/{id}', 200, product(8)), []);
  assert.deepEqual(resp('product', 'GET /products', 200, { data: [product(8), product(9)] }), []);
  assert.deepEqual(resp('user', 'GET /users/{id}', 404, { code: 'USER_NOT_FOUND', message: 'y' }), []);
  assert.deepEqual(resp(...WEB, web([webItem({ name: 'A', price: 1 })])), []);
});

test('hợp đồng chấp nhận product null khi lỗi một phần', () => {
  const body = web([webItem(null)], { partial: true, errors: [{ code: 'PRODUCT_UNAVAILABLE', message: 'm', productIds: [8] }] });
  assert.deepEqual(resp(...WEB, body), []);
});

test('hợp đồng bắt service giả thiếu trường (ví dụ product không có sku/description)', () => {
  const { sku, description, ...thin } = product(8);
  assert.ok(resp('product', 'GET /products/{id}', 200, thin).length > 0);
  assert.ok(resp('product', 'GET /products', 200, { data: [thin] }).length > 0);
});

test('hợp đồng bắt trường thừa và sai kiểu', () => {
  assert.ok(resp('user', 'GET /users/{id}', 200, { id: 1, name: 'A', email: 'x' }).length > 0);
  assert.ok(resp('user', 'GET /users/{id}', 200, { id: '1', name: 'A' }).length > 0);
  const order = { id: 1, userId: 1, status: 'UNKNOWN', createdAt: '2026-01-01T00:00:00.000Z', items: [] };
  assert.ok(resp('order', 'GET /orders', 200, { data: [order] }).length > 0);
  assert.ok(resp('order', 'GET /orders', 200, { data: [{ ...order, status: 'PAID', createdAt: 'hôm qua' }] }).length > 0);
});

test('mobile chỉ được có trường mobile (không có price, createdAt, user)', () => {
  const ok = { partial: false, errors: [], orders: [{ id: 1, status: 'PAID', items: [{ product: { name: 'A', thumbnail: 't' } }] }] };
  assert.deepEqual(resp(...MOBILE, ok), []);
  const leaky = structuredClone(ok); leaky.orders[0].items[0].product.price = 1;
  assert.ok(resp(...MOBILE, leaky).length > 0);
  assert.ok(resp(...MOBILE, { ...ok, user: { id: 1, name: 'A' } }).length > 0);
  assert.ok(schema('graphql', 'MobileData', { orders: ok.orders, partial: false }).length > 0);
  assert.deepEqual(schema('graphql', 'MobileData', { orders: ok.orders }), []);
});

test('route hoặc schema không khai báo thì báo lỗi rõ', () => {
  assert.throws(() => resp('user', 'GET /khong-co', 200, {}), /không khai báo/);
  assert.throws(() => schema('graphql', 'KhongCo', {}), /không có schema/);
});
