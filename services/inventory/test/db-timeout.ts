import assert from 'node:assert/strict';
import pg from 'pg';
import * as grpc from '@grpc/grpc-js';
import { createInventoryGrpcClient } from './grpc-client.js';

// Run against a running service; locks only synthetic stock table.
const pool = new pg.Pool({ host: process.env.PGHOST || 'localhost', port: Number(process.env.PGPORT || 5434), user: process.env.PGUSER || 'postgres', password: process.env.PGPASSWORD || 'postgres', database: process.env.PGDATABASE || 'kartvibe_inventory' });
const lock = await pool.connect();
const client = createInventoryGrpcClient(`localhost:${process.env.GRPC_PORT || 4007}`);
try {
  await lock.query('BEGIN');
  await lock.query('LOCK TABLE stock IN ACCESS EXCLUSIVE MODE');
  const start = performance.now();
  const [rest, grpcResult] = await Promise.all([
    fetch(`http://localhost:${process.env.PORT || 4006}/inventory/reservations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sku: 'SKU-OK', quantity: 1 }), signal: AbortSignal.timeout(20000) }),
    new Promise<{ error?: { code: number } }>((resolve) => client.reserve({ sku: 'SKU-OK', quantity: 1 }, new grpc.Metadata(), { deadline: Date.now() + 20000 }, (error) => resolve({ error: error || undefined }))),
  ]);
  assert.equal(rest.status, 500);
  assert.equal((await rest.json()).code, 'INTERNAL_ERROR');
  assert.equal(grpcResult.error?.code, 13);
  assert(performance.now() - start < 20000);
  console.log('PASS: locked DB returns REST 500 INTERNAL_ERROR and gRPC INTERNAL within 20s');
} finally {
  await lock.query('ROLLBACK');
  lock.release();
  client.close();
  await pool.end();
}
