import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/index.js';
import { closeDb } from '../src/db.js';

async function main() {
  const app = await createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server');
  }
  const baseUrl = `http://localhost:${address.port}`;
  console.log(`[verify] Running contract verification against ${baseUrl}\n`);

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = await healthRes.json();
    assert.deepEqual(healthBody, { status: 'ok' });
    console.log('✓ 1. GET /health -> 200 {"status":"ok"}');

    // 2. Seed SIZE=L (30 products) then SIZE=S (10 products)
    const seedLRes = await fetch(`${baseUrl}/_seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 'L' }),
    });
    assert.equal(seedLRes.status, 200);
    const seedLBody = (await seedLRes.json()) as { count: number };
    assert.equal(seedLBody.count, 30);

    const p30Res = await fetch(`${baseUrl}/products/30`);
    assert.equal(p30Res.status, 200);

    const seedSRes = await fetch(`${baseUrl}/_seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 'S' }),
    });
    assert.equal(seedSRes.status, 200);
    const seedSBody = (await seedSRes.json()) as { count: number };
    assert.equal(seedSBody.count, 10);
    console.log('✓ 2. Seed SIZE=L (30 products) & SIZE=S (10 products) verified');

    // 3. Reset metrics & verify 0
    const resetRes = await fetch(`${baseUrl}/_metrics/reset`, { method: 'POST' });
    assert.equal(resetRes.status, 204);

    let metricsRes = await fetch(`${baseUrl}/_metrics`);
    let metrics = (await metricsRes.json()) as { service: string; requests: number; dbQueries: number };
    assert.deepEqual(metrics, { service: 'product', requests: 0, dbQueries: 0 });
    console.log('✓ 3. POST /_metrics/reset -> 204 & GET /_metrics -> {requests: 0, dbQueries: 0}');

    // 4. Single product GET /products/8 & x-request-id propagation
    const customReqId = 'test-req-single-008';
    const p8Res = await fetch(`${baseUrl}/products/8`, {
      headers: { 'x-request-id': customReqId },
    });
    assert.equal(p8Res.status, 200);
    assert.equal(p8Res.headers.get('x-request-id'), customReqId);
    assert.equal(p8Res.headers.get('access-control-allow-origin'), '*');
    const p8 = (await p8Res.json()) as Record<string, unknown>;
    assert.equal(p8.id, 8);
    assert.equal(p8.sku, 'SKU-008');
    assert.equal(p8.name, 'Sản phẩm 08');
    assert.equal(p8.price, 14000);
    assert.equal(p8.thumbnail, 'https://img.example.test/p/8.jpg');
    assert.equal(p8.description, 'Mô tả sản phẩm 8. '.repeat(6));

    metricsRes = await fetch(`${baseUrl}/_metrics`);
    metrics = (await metricsRes.json()) as { service: string; requests: number; dbQueries: number };
    assert.deepEqual(metrics, { service: 'product', requests: 1, dbQueries: 1 });
    console.log('✓ 4. GET /products/8 matches contract & increments requests=1, dbQueries=1');

    // 5. Proof that batch endpoint GET /products?ids=10,8,9,8,999 costs ONLY 1 request & 1 DB query
    await fetch(`${baseUrl}/_metrics/reset`, { method: 'POST' });
    const batchRes = await fetch(`${baseUrl}/products?ids=10,8,9,8,999`, {
      headers: { 'x-request-id': 'test-req-batch-001' },
    });
    assert.equal(batchRes.status, 200);
    const batchBody = (await batchRes.json()) as { data: Array<{ id: number; name: string; price: number }> };
    assert.deepEqual(
      batchBody.data.map((p) => p.id),
      [8, 9, 10]
    );

    metricsRes = await fetch(`${baseUrl}/_metrics`);
    metrics = (await metricsRes.json()) as { service: string; requests: number; dbQueries: number };
    assert.deepEqual(metrics, { service: 'product', requests: 1, dbQueries: 1 });
    console.log(
      '✓ 5. GET /products?ids=10,8,9,8,999 deduplicates, ignores missing 999, sorts by id ASC [8,9,10], and costs 1 request + 1 dbQuery'
    );

    // 6. Validation & 404 checks
    const notFoundRes = await fetch(`${baseUrl}/products/999`);
    assert.equal(notFoundRes.status, 404);
    const notFoundBody = (await notFoundRes.json()) as { code: string };
    assert.equal(notFoundBody.code, 'PRODUCT_NOT_FOUND');

    const badIdsRes = await fetch(`${baseUrl}/products?ids=8,abc`);
    assert.equal(badIdsRes.status, 400);
    const badIdsBody = (await badIdsRes.json()) as { code: string };
    assert.equal(badIdsBody.code, 'VALIDATION_ERROR');

    const over200Ids = Array.from({ length: 201 }, (_, i) => i + 1).join(',');
    const overLimitRes = await fetch(`${baseUrl}/products?ids=${over200Ids}`);
    assert.equal(overLimitRes.status, 400);
    console.log('✓ 6. 404 PRODUCT_NOT_FOUND and 400 VALIDATION_ERROR (bad format & >200 ids) verified');

    // 7. Fault injection: all 3 modes
    // Mode A: High latency
    const faultLatencyRes = await fetch(`${baseUrl}/_fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latencyMs: 250, error: false }),
    });
    assert.equal(faultLatencyRes.status, 200);
    const t0 = performance.now();
    const slowProductRes = await fetch(`${baseUrl}/products/8`);
    const elapsed = performance.now() - t0;
    assert.equal(slowProductRes.status, 200);
    assert.ok(elapsed >= 240, `Expected elapsed >= 240ms, got ${Math.round(elapsed)}ms`);

    // Mode B: Error 500
    const faultErrRes = await fetch(`${baseUrl}/_fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latencyMs: 0, error: true }),
    });
    assert.equal(faultErrRes.status, 200);
    const errSingleRes = await fetch(`${baseUrl}/products/8`);
    assert.equal(errSingleRes.status, 500);
    const errSingleBody = (await errSingleRes.json()) as { code: string };
    assert.equal(errSingleBody.code, 'INTERNAL_ERROR');

    const errBatchRes = await fetch(`${baseUrl}/products?ids=8,9`);
    assert.equal(errBatchRes.status, 500);

    // Mode C: Clear fault
    const faultClearRes = await fetch(`${baseUrl}/_fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(faultClearRes.status, 200);
    const faultStateBody = (await faultClearRes.json()) as { latencyMs: number; error: boolean };
    assert.deepEqual(faultStateBody, { latencyMs: 0, error: false });

    const recoveredRes = await fetch(`${baseUrl}/products/8`);
    assert.equal(recoveredRes.status, 200);
    console.log('✓ 7. /_fault verified across all 3 modes (latencyMs, error=true 500, and reset {})');

    console.log('\nALL PRODUCT SERVICE CONTRACT CHECKS PASSED!');
  } finally {
    server.close();
    await closeDb();
  }
}

main().catch((err) => {
  console.error('[verify] Verification failed:', err);
  process.exit(1);
});
