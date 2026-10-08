import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const measureClient = require('../../../web/public/measure/measure-client.js');
import * as measure from '../measure.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('collector persists validated records and summary detects incomplete or mislabeled matrix', async () => {
  assert.equal(typeof measure.createCollector, 'function', 'collector chưa được hiện thực');
  const dir = await mkdtemp(join(tmpdir(), 'client-'));
  const collector = measure.createCollector({ directory: dir, testAdapter: true });
  await new Promise(resolve => collector.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${collector.address().port}`;
  const row = { variant: 'bff', client: 'web', size: 'S', mode: 'warm', run: 1, requestId: 'test-1', partial: false, completeMs: 15, clientRequests: 1, payloadBytes: 100, services: { user: { requests: 1, dbQueries: 1 }, order: { requests: 1, dbQueries: 2 }, product: { requests: 1, dbQueries: 1 }, bff: { requests: 1, dbQueries: 0 }, graphql: { requests: 0, dbQueries: 0 } } };
  try {
    let response = await fetch(`${base}/results`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(row) });
    assert.equal(response.status, 201);
    const receipt = await response.json();
    const stored = JSON.parse(await readFile(join(dir, receipt.file), 'utf8'));
    assert.equal(stored.testAdapter, true);
    assert.equal(stored.completeMs, 15);
    response = await fetch(`${base}/results`, { method: 'POST', body: JSON.stringify({ ...row, completeMs: -1 }) });
    assert.equal(response.status, 400);
    const rows = [0, 10, 20, 30, 40].map((value, i) => ({ ...row, testAdapter: false, requestId: `r-${i}`, run: i + 1, completeMs: value }));
    const summary = measure.summarize(rows);
    assert.equal(summary.groups[0].completeMs.median, 20);
    assert.deepEqual(summary.groups[0].completeMs.range, [0, 40]);
    assert.equal(summary.complete, false);
    assert.ok(summary.missing.length > 0);
    assert.throws(() => measure.summarize([stored]), /adapter/i);
    assert.throws(() => measure.summarize([...rows, rows[0]]), /trùng/i);
    assert.throws(() => measure.validateRow({ ...row, services: {} }));
  } finally { await new Promise(resolve => collector.close(resolve)); await rm(dir, { recursive: true }); }
});

test('default loader uses sequential per-item baseline and exact GraphQL mobile query', async () => {
  assert.equal(typeof measureClient.loadContract, 'function', 'contract loader chưa được hiện thực');
  const paths = [];
  const apiFetch = async (url, init) => {
    paths.push(new URL(url).pathname);
    if (url.includes('/orders?')) return { data: [{ id: 1, userId: 1, status: 'PAID', createdAt: 'date', items: [{ productId: 8, quantity: 2 }, { productId: 8, quantity: 1 }] }] };
    if (url.includes('/products/')) return { name: 'P8', price: 14000, thumbnail: 'thumb' };
    if (url.includes('/graphql')) { assert.ok(!JSON.parse(init.body).query.includes('user(id')); return { data: { orders: [] } }; }
    return { id: 1, name: 'U1' };
  };
  const result = await measureClient.loadContract({ variant: 'baseline', client: 'mobile', apiFetch });
  assert.deepEqual(paths, ['/orders', '/products/8', '/products/8']);
  assert.deepEqual(result.orders[0].items, [{ product: { name: 'P8', thumbnail: 'thumb' } }, { product: { name: 'P8', thumbnail: 'thumb' } }]);
  await measureClient.loadContract({ variant: 'graphql-fixed', client: 'mobile', apiFetch });
});

test('contract comparison checks actual mobile keys, values, order and GraphQL errors', () => {
  assert.equal(typeof measure.compareData, 'function', 'đối chiếu chưa được hiện thực');
  const web = { user: { id: 1, name: 'Người dùng 1' }, orders: [{ id: 1, status: 'PENDING', createdAt: '2026-01-01T00:00:00.000Z', items: [{ productId: 8, quantity: 2, product: { name: 'Sản phẩm 08', price: 14000 } }] }] };
  const mobile = { orders: [{ id: 1, status: 'PENDING', items: [{ product: { name: 'Sản phẩm 08', thumbnail: 'https://img.example.test/p/8.jpg' } }] }] };
  const products = [{ id: 8, name: 'Sản phẩm 08', price: 14000, thumbnail: 'https://img.example.test/p/8.jpg' }];
  assert.doesNotThrow(() => measure.compareData({ baseline: web, bff: { ...web, partial: false, errors: [] }, graphql: { data: web }, client: 'web', products, web }));
  assert.doesNotThrow(() => measure.compareData({ baseline: mobile, bff: { ...mobile, partial: false, errors: [] }, graphql: { data: mobile }, client: 'mobile', products, web }));
  const extra = structuredClone(mobile); extra.orders[0].items[0].product.price = 14000;
  assert.throws(() => measure.compareData({ baseline: mobile, bff: { ...extra, partial: false, errors: [] }, graphql: { data: mobile }, client: 'mobile', products, web }));
  assert.throws(() => measure.compareData({ baseline: web, bff: { ...web, partial: false, errors: [] }, graphql: { data: web, errors: [{ message: 'oops' }] }, client: 'web', products, web }));
});

test('apiFetch counts UTF-8 body bytes and business calls only', async () => {
  assert.equal(typeof measureClient.createRecorder, 'function', 'recorder chưa được hiện thực');
  const recorder = measureClient.createRecorder({ fetchImpl: async () => new Response('{"name":"Việt"}') });
  await recorder.apiFetch('http://localhost:4003/products/1');
  await recorder.apiFetch('http://localhost:4003/_metrics');
  await recorder.apiFetch('http://localhost:4000/a.jpg');
  assert.equal(recorder.snapshot().clientRequests, 1);
  assert.equal(recorder.snapshot().payloadBytes, Buffer.byteLength('{"name":"Việt"}'));
});

test('series waits for render, excludes metrics time and preserves cold/warm records', async () => {
  assert.equal(typeof measureClient.runSeries, 'function', 'series chưa được hiện thực');
  const events = [], saved = [];
  let clock = 0;
  const rows = await measureClient.runSeries({
    config: { variant: 'bff', client: 'web', size: 'S' }, warmRuns: 5, coldSession: 'verified-restart',
    now: () => clock, mark: () => events.push('mark'), visible: () => true,
    resetMetrics: async () => { events.push('reset'); clock += 100; },
    readMetrics: async () => { events.push('metrics'); clock += 100; return { user: { requests: 1, dbQueries: 1 }, order: { requests: 1, dbQueries: 2 }, product: { requests: 1, dbQueries: 1 }, bff: { requests: 1, dbQueries: 0 }, graphql: { requests: 0, dbQueries: 0 } }; },
    fetchImpl: async () => { clock += 10; return new Response('{"orders":[],"partial":false,"errors":[]}'); },
    load: async ({ apiFetch }) => apiFetch('http://localhost:4004/bff/web/dashboard?userId=1'),
    render: async () => { await Promise.resolve(); clock += 5; events.push('render'); },
    save: async row => saved.push(row)
  });
  assert.equal(rows.length, 6);
  assert.equal(rows[0].mode, 'cold');
  assert.equal(rows[0].coldSession, 'verified-restart');
  assert.deepEqual(rows.slice(1).map(r => r.run), [1, 2, 3, 4, 5]);
  assert.ok(rows.every(row => row.completeMs === 15 && row.clientRequests === 1));
  assert.deepEqual(events.slice(0, 4), ['reset', 'render', 'mark', 'metrics']);
  assert.equal(saved.length, 6);
});
