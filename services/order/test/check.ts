import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { Server, ServerCredentials, Metadata, status } from '@grpc/grpc-js';
import { InventoryService } from '../src/generated/inventory.js';
import { pool } from '../src/db.js';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const deadlineMs = 150;
let mode: 'normal' | 'slow' | 'strange' | 'absent' | 'precondition' = 'normal';
let calls = 0;
const received = new Map<string, { protocol: string; version: string }>();

function answer(sku: string, quantity: number): { status: number; body: any } {
  if (!sku || sku.length > 64 || quantity < 1 || quantity > 1000) return { status: 400, body: { code: 'VALIDATION_ERROR', message: 'Invalid reservation' } };
  if (!['SKU-OK', 'SKU-LOW'].includes(sku) || (sku === 'SKU-LOW' && quantity > 1)) {
    return { status: 409, body: { code: 'OUT_OF_STOCK', message: 'Out of stock' } };
  }
  if (mode === 'strange') return { status: 500, body: { code: 'WEIRD', message: 'Unexpected' } };
  if (mode === 'precondition') return { status: 409, body: { code: 'OTHER_PRECONDITION', message: 'Unexpected precondition' } };
  return { status: 201, body: { reservationId: `r-${calls}`, ...(mode === 'absent' ? {} : { available: sku === 'SKU-LOW' ? 0 : 8 }) } };
}

const rest = createServer(async (req, res) => {
  if (req.url !== '/inventory/reservations') { res.writeHead(404).end(); return; }
  received.set(String(req.headers['x-request-id']), { protocol: 'rest', version: String(req.headers['x-client-version']) });
  calls++;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const { sku, quantity } = JSON.parse(raw);
  if (mode === 'slow') await delay(deadlineMs + 300);
  const result = answer(sku, quantity);
  res.writeHead(result.status, { 'content-type': 'application/json' }).end(JSON.stringify(result.body));
});

const grpc = new Server();
grpc.addService(InventoryService, {
  reserve: async (call: any, callback: any) => {
    received.set(String(call.metadata.get('x-request-id')[0]), { protocol: 'grpc', version: String(call.metadata.get('x-client-version')[0]) });
    calls++;
    if (mode === 'slow') await delay(deadlineMs + 300);
    const result = answer(call.request.sku, call.request.quantity);
    if (result.status !== 201) {
      const code = result.status === 400 ? status.INVALID_ARGUMENT : result.status === 409 ? status.FAILED_PRECONDITION : status.INTERNAL;
      const metadata = new Metadata();
      if (result.body.code === 'OUT_OF_STOCK') metadata.set('x-error-code', 'OUT_OF_STOCK');
      callback(Object.assign(new Error(result.body.message), { code, metadata }));
    } else callback(null, { reservationId: result.body.reservationId, ...(result.body.available === undefined ? {} : { available: result.body.available }) });
  },
});

async function inventoryStart() {
  rest.listen(4006);
  await once(rest, 'listening');
  await new Promise<void>((resolve, reject) => grpc.bindAsync('127.0.0.1:4007', ServerCredentials.createInsecure(), error => error ? reject(error) : resolve()));
}
async function inventoryStop() {
  await new Promise<void>(resolve => rest.close(() => resolve()));
  await new Promise<void>(resolve => grpc.tryShutdown(() => resolve()));
}
async function waitForHealth(port: number, child: ChildProcess) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Order exited early: ${child.exitCode}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {}
    await delay(50);
  }
  throw new Error('Order did not start');
}
async function post(port: number, body: string, requestId: string) {
  const start = Date.now();
  const response = await fetch(`http://127.0.0.1:${port}/orders`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId }, body });
  return { status: response.status, body: await response.json(), ms: Date.now() - start };
}
function normalized(result: Awaited<ReturnType<typeof post>>) {
  const { orderId: _orderId, ...body } = result.body;
  return { status: result.status, body };
}
async function requestLogs(logs: string[], requestId: string, count: number) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const entries = logs.flatMap(line => {
      try { const entry = JSON.parse(line); return entry.requestId === requestId ? [entry] : []; } catch { return []; }
    });
    if (entries.length >= count) return entries;
    await delay(10);
  }
  return logs.flatMap(line => {
    try { const entry = JSON.parse(line); return entry.requestId === requestId ? [entry] : []; } catch { return []; }
  });
}

const snapshots: Record<string, unknown> = {};
let failed = false;
try {
  await inventoryStart();
  for (const protocol of ['rest', 'grpc'] as const) {
    const port = protocol === 'rest' ? 4002 : 4012;
    const logs: string[] = [];
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: process.cwd(), env: { ...process.env, PORT: String(port), INVENTORY_PROTOCOL: protocol, INVENTORY_DEADLINE_MS: String(deadlineMs), INVENTORY_REST_URL: 'http://127.0.0.1:4006', INVENTORY_GRPC_ADDR: '127.0.0.1:4007', ENABLE_TEST_HOOKS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', data => logs.push(...String(data).trim().split('\n')));
    child.stderr?.on('data', data => process.stderr.write(data));
    try {
      await waitForHealth(port, child);
      assert.equal((await fetch(`http://127.0.0.1:${port}/_reset`, { method: 'POST' })).status, 204);
      const cases = [
        ['success', '{"sku":"SKU-OK","quantity":2}', 201, undefined],
        ['zero available', '{"sku":"SKU-LOW","quantity":1}', 201, undefined],
        ['absent available', '{"sku":"SKU-OK","quantity":1}', 201, undefined],
        ['out of stock', '{"sku":"SKU-ZERO","quantity":1}', 409, 'OUT_OF_STOCK'],
        ['unknown sku', '{"sku":"SKU-UNKNOWN","quantity":1}', 409, 'OUT_OF_STOCK'],
        ['domain validation', '{"sku":"SKU-OK","quantity":0}', 400, 'VALIDATION_ERROR'],
        ['domain upper bound', '{"sku":"SKU-OK","quantity":5000}', 400, 'VALIDATION_ERROR'],
        ['empty sku', '{"sku":"","quantity":1}', 400, 'VALIDATION_ERROR'],
        ['large integer', '{"sku":"SKU-OK","quantity":4294967297}', 400, 'VALIDATION_ERROR'],
        ['other precondition', '{"sku":"SKU-OK","quantity":1}', 500, 'INTERNAL_ERROR'],
        ['malformed JSON', '{', 400, 'VALIDATION_ERROR'],
        ['shape validation', '{"sku":"SKU-OK","quantity":"2"}', 400, 'VALIDATION_ERROR'],
      ] as const;
      for (const [name, body, expectedStatus, expectedCode] of cases) {
        mode = name === 'absent available' ? 'absent' : name === 'other precondition' ? 'precondition' : 'normal';
        const before = calls;
        const requestId = `check-${protocol}-${name.replaceAll(' ', '-')}`;
        const result = await post(port, body, requestId);
        assert.equal(result.status, expectedStatus, name);
        if (name === 'success') assert.equal(result.body.orderId, 1, 'reset restarts purchase order ids');
        if (expectedCode) assert.equal(result.body.code, expectedCode, name);
        if (name === 'malformed JSON' || name === 'shape validation') assert.equal(calls, before, 'Shape validation must not call Inventory');
        if (name !== 'malformed JSON' && name !== 'shape validation' && !(protocol === 'grpc' && name === 'large integer')) {
          assert.deepEqual(received.get(requestId), { protocol, version: 'v2' }, 'Inventory receives request ID and client version');
        }
        const expectedLogs = name === 'malformed JSON' || name === 'shape validation' ? 1 : 2;
        const entries = await requestLogs(logs, requestId, expectedLogs);
        assert.equal(entries.length, expectedLogs, `log count: ${name}`);
        if (entries.length === 2) {
          const outbound = entries.find(entry => entry.direction === 'outbound');
          assert.equal(outbound?.protocol, protocol);
          assert.equal(outbound?.clientVersion, 'v2');
          if (protocol === 'rest') assert.equal('available' in outbound, false);
          if (protocol === 'grpc') {
            assert.equal(outbound.grpcStatus, expectedStatus === 201 ? 'OK' : expectedStatus === 409 || name === 'other precondition' ? 'FAILED_PRECONDITION' : 'INVALID_ARGUMENT');
            if (name === 'success') assert.equal(outbound.available, 8);
            if (name === 'zero available') assert.equal(outbound.available, 0);
            if (name === 'absent available') assert.equal(outbound.available, 'absent');
            if (expectedStatus !== 201) assert.equal('available' in outbound, false, 'lời gọi lỗi không có reply nên không ghi available');
          }
        }
        const key = name;
        const snapshot = normalized(result);
        if (protocol === 'rest') snapshots[key] = snapshot;
        else assert.deepEqual(snapshot, snapshots[key], `REST/gRPC parity: ${name}`);
        console.log(`PASS ${protocol} ${name}`);
      }
      mode = 'slow';
      const slowId = `check-${protocol}-slow`;
      const timeout = await post(port, '{"sku":"SKU-OK","quantity":2}', slowId);
      assert.equal(timeout.status, 504);
      assert.equal(timeout.body.code, 'INVENTORY_TIMEOUT');
      assert.ok(timeout.ms < deadlineMs + 500, `Timeout took ${timeout.ms}ms`);
      const slowLogs = await requestLogs(logs, slowId, 2);
      assert.equal(slowLogs.length, 2);
      assert.equal(slowLogs.find(entry => entry.direction === 'outbound')?.protocol, protocol);
      if (protocol === 'rest') snapshots.timeout = normalized(timeout);
      else assert.deepEqual(normalized(timeout), snapshots.timeout, 'REST/gRPC parity: timeout');
      console.log(`PASS ${protocol} timeout ${timeout.ms}ms`);
      mode = 'strange';
      const strangeId = `check-${protocol}-strange`;
      const strange = await post(port, '{"sku":"SKU-OK","quantity":2}', strangeId);
      assert.equal(strange.status, 500);
      assert.equal(strange.body.code, 'INTERNAL_ERROR');
      assert.equal((await requestLogs(logs, strangeId, 2)).length, 2);
      if (protocol === 'rest') snapshots.strange = normalized(strange);
      else assert.deepEqual(normalized(strange), snapshots.strange, 'REST/gRPC parity: unknown error');
      console.log(`PASS ${protocol} unknown error`);
      mode = 'normal';
      const rows = await pool.query('SELECT id, sku, quantity, status, reservation_id FROM purchase_orders ORDER BY id');
      assert.equal(rows.rowCount, 3, 'only successful reservations create purchase orders');
      assert.deepEqual(rows.rows.map(row => [row.id, row.sku, row.quantity, row.status]), [
        [1, 'SKU-OK', 2, 'CONFIRMED'], [2, 'SKU-LOW', 1, 'CONFIRMED'], [3, 'SKU-OK', 1, 'CONFIRMED'],
      ]);
      assert.ok(rows.rows.every(row => typeof row.reservation_id === 'string' && row.reservation_id.length > 0));
      console.log(`PASS ${protocol} purchase_orders persistence and reset`);
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  }
  await inventoryStop();
  for (const protocol of ['rest', 'grpc'] as const) {
    const port = protocol === 'rest' ? 4002 : 4012;
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: process.cwd(), env: { ...process.env, PORT: String(port), INVENTORY_PROTOCOL: protocol, INVENTORY_DEADLINE_MS: String(deadlineMs), INVENTORY_REST_URL: 'http://127.0.0.1:4006', INVENTORY_GRPC_ADDR: '127.0.0.1:4007' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const logs: string[] = [];
    child.stdout?.on('data', data => logs.push(...String(data).trim().split('\n')));
    try {
      await waitForHealth(port, child);
      assert.equal((await fetch(`http://127.0.0.1:${port}/_reset`, { method: 'POST' })).status, 404, 'test hook disabled');
      const downId = `check-${protocol}-down`;
      const result = await post(port, '{"sku":"SKU-OK","quantity":2}', downId);
      assert.equal(result.status, 503);
      assert.equal(result.body.code, 'INVENTORY_UNAVAILABLE');
      assert.ok(result.ms < deadlineMs + 500, `Unavailable took ${result.ms}ms`);
      const downLogs = await requestLogs(logs, downId, 2);
      assert.equal(downLogs.length, 2);
      assert.equal(downLogs.find(entry => entry.direction === 'outbound')?.protocol, protocol);
      if (protocol === 'rest') snapshots.unavailable = normalized(result);
      else assert.deepEqual(normalized(result), snapshots.unavailable, 'REST/gRPC parity: unavailable');
      console.log(`PASS ${protocol} unavailable ${result.ms}ms`);
    } finally { child.kill('SIGTERM'); await once(child, 'exit'); }
  }
} catch (error) {
  failed = true;
  console.error('FAIL', error);
}
process.exitCode = failed ? 1 : 0;
if (failed) { grpc.forceShutdown(); rest.close(); }
await pool.end();
