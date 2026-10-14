// Kiểm inventory-v1 qua mạng thật: khởi động src/server.ts trên cổng trống, gọi bằng client v1,
// và đọc reply ở dạng byte để chắc chắn không có field 2 (available).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as grpc from '@grpc/grpc-js';
import { BinaryReader } from '@bufbuild/protobuf/wire';
import { InventoryClient, ReserveRequest, ReserveReply } from '../src/generated/inventory.js';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PATH = '/kartvibe.inventory.Inventory/Reserve';

let child: ChildProcess;
let client: InventoryClient;
let port: number;
const lines: Record<string, unknown>[] = [];

const freePort = () => new Promise<number>((ok) => {
  const s = createServer().listen(0, () => {
    const p = (s.address() as { port: number }).port;
    s.close(() => ok(p));
  });
});

before(async () => {
  port = await freePort();
  child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: pkgDir,
    env: { ...process.env, GRPC_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let buf = '';
  await new Promise<void>((ok, fail) => {
    child.on('exit', (code) => fail(new Error(`server thoát sớm, code ${code}`)));
    child.stdout!.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        lines.push(line);
        if (line.event === 'started') ok();
      }
    });
  });
  client = new InventoryClient(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
});

after(() => {
  client?.close();
  child?.kill('SIGTERM');
});

const md = (requestId: string, clientVersion = 'v1') => {
  const m = new grpc.Metadata();
  m.set('x-request-id', requestId);
  m.set('x-client-version', clientVersion);
  return m;
};

const call = (sku: string, quantity: number, requestId: string, clientVersion?: string) =>
  new Promise<{ err: grpc.ServiceError | null; reply?: ReserveReply }>((ok) =>
    client.reserve({ sku, quantity }, md(requestId, clientVersion), (err, reply) => ok({ err, reply })));

// Gọi Reserve nhưng không giải mã reply, để thấy đúng các byte server gửi.
const callRaw = (sku: string, quantity: number, requestId: string) =>
  new Promise<Buffer>((ok, fail) =>
    client.makeUnaryRequest(PATH, (r: ReserveRequest) => Buffer.from(ReserveRequest.encode(r).finish()), (b: Buffer) => b,
      { sku, quantity }, md(requestId), (err, value) => (err ? fail(err) : ok(value!))));

const fieldNumbers = (bytes: Uint8Array) => {
  const reader = new BinaryReader(bytes);
  const fields: number[] = [];
  while (reader.pos < reader.len) {
    const [no, type] = reader.tag();
    fields.push(no);
    reader.skip(type);
  }
  return fields;
};

const logOf = async (requestId: string) => {
  for (let i = 0; i < 50; i++) {
    const found = lines.find((l) => l.requestId === requestId);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`không thấy log của ${requestId}`);
};

test('SKU-OK: OK, có reservation_id', async () => {
  const { err, reply } = await call('SKU-OK', 2, 't-ok', 'v2');
  assert.equal(err, null);
  assert.match(reply!.reservationId, /^v1-res-\d+$/);
  const line = await logOf('t-ok');
  assert.equal(line.status, 0);
  assert.equal(line.grpcStatus, 'OK');
  assert.equal(line.reservationId, reply!.reservationId);
  assert.equal(line.clientVersion, 'v2', 'clientVersion lấy từ metadata x-client-version');
});

test('reply trên dây chỉ có field 1 (reservation_id), không bao giờ có field 2 (available)', async () => {
  const bytes = await callRaw('SKU-OK', 1, 't-raw');
  const fields = fieldNumbers(bytes);
  assert.deepEqual(fields, [1], `field nhận được: ${fields.join(',')} (bytes ${bytes.toString('hex')})`);
});

test('SKU-LOW: lần đầu đủ hàng, lần sau FAILED_PRECONDITION + x-error-code OUT_OF_STOCK', async () => {
  const first = await call('SKU-LOW', 1, 't-low-1');
  assert.equal(first.err, null);
  const second = await call('SKU-LOW', 1, 't-low-2');
  assert.equal(second.err?.code, grpc.status.FAILED_PRECONDITION);
  assert.deepEqual(second.err!.metadata.get('x-error-code'), ['OUT_OF_STOCK']);
  const line = await logOf('t-low-2');
  assert.equal(line.status, 9);
  assert.equal(line.errorCode, 'OUT_OF_STOCK');
});

test('SKU-ZERO: FAILED_PRECONDITION + x-error-code OUT_OF_STOCK', async () => {
  const { err } = await call('SKU-ZERO', 1, 't-zero');
  assert.equal(err?.code, grpc.status.FAILED_PRECONDITION);
  assert.deepEqual(err!.metadata.get('x-error-code'), ['OUT_OF_STOCK']);
});

test('sku không có trong fixture coi như tồn 0', async () => {
  const { err } = await call('SKU-KHONG-CO', 1, 't-unknown');
  assert.equal(err?.code, grpc.status.FAILED_PRECONDITION);
});

test('ngoài miền giá trị: INVALID_ARGUMENT', async () => {
  for (const [sku, quantity, id] of [['SKU-OK', 0, 't-q0'], ['SKU-OK', 1001, 't-q1001'], ['', 1, 't-empty'], ['X'.repeat(65), 1, 't-long']] as const) {
    const { err } = await call(sku, quantity, id);
    assert.equal(err?.code, grpc.status.INVALID_ARGUMENT, `${id}`);
    assert.equal((await logOf(id)).grpcStatus, 'INVALID_ARGUMENT');
  }
});

test('log: một dòng JSON mỗi lời gọi, đủ trường theo mục 3.5', async () => {
  const line = await logOf('t-zero');
  for (const key of ['ts', 'service', 'requestId', 'method', 'path', 'status', 'ms', 'protocol', 'direction', 'operation', 'grpcStatus', 'clientVersion']) {
    assert.ok(key in line, `thiếu ${key}`);
  }
  assert.equal(line.service, 'inventory-grpc-v1');
  assert.equal(line.method, 'gRPC');
  assert.equal(line.path, PATH);
  assert.equal(line.protocol, 'grpc');
  assert.equal(line.direction, 'inbound');
  assert.equal(line.clientVersion, 'v1');
  assert.ok(!('available' in line));
  assert.equal(lines.filter((l) => l.requestId === 't-zero').length, 1);
});
