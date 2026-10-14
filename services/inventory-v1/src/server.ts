// Server cũ tối thiểu (D12): chỉ biết proto v1 nên kiểu ReserveReply không có field available,
// tức là mã này không thể đặt available dù muốn.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import * as grpc from '@grpc/grpc-js';
import { InventoryService, ReserveReply, type InventoryServer } from './generated/inventory.js';
import { reserve, resetStock } from './fixture.js';
import { log, SERVICE } from './log.js';

const GRPC_PORT = Number(process.env.GRPC_PORT ?? 4008);
// HTTP phụ (GET /health, POST /_reset) chỉ bật khi đặt HTTP_PORT; mặc định tắt để không tranh cổng 4006 của Inventory thật.
const HTTP_PORT = process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : undefined;
const TEST_HOOKS = process.env.ENABLE_TEST_HOOKS === '1';
const PATH = '/kartvibe.inventory.Inventory/Reserve';

const firstValue = (md: grpc.Metadata, key: string): string | undefined => {
  const v = md.get(key)[0];
  return v === undefined ? undefined : String(v);
};

const impl: InventoryServer = {
  reserve(call, callback) {
    const started = performance.now();
    const requestId = firstValue(call.metadata, 'x-request-id') ?? randomUUID();
    const clientVersion = firstValue(call.metadata, 'x-client-version') ?? null;
    const { sku, quantity } = call.request;
    const result = reserve(sku, quantity);

    const base = {
      requestId,
      method: 'gRPC',
      path: PATH,
      protocol: 'grpc',
      direction: 'inbound',
      operation: 'Reserve',
      clientVersion,
    };
    const done = (code: grpc.status, extra: Record<string, unknown> = {}) =>
      log({ ...base, status: code, grpcStatus: grpc.status[code], ms: Number((performance.now() - started).toFixed(1)), ...extra });

    if (result.kind === 'reserved') {
      callback(null, ReserveReply.fromPartial({ reservationId: result.reservationId }));
      done(grpc.status.OK, { reservationId: result.reservationId });
      return;
    }
    if (result.kind === 'out_of_stock') {
      const metadata = new grpc.Metadata();
      metadata.set('x-error-code', 'OUT_OF_STOCK');
      callback({
        code: grpc.status.FAILED_PRECONDITION,
        details: `OUT_OF_STOCK: ${sku} còn ${result.inStock}, cần ${quantity}`,
        metadata,
      });
      done(grpc.status.FAILED_PRECONDITION, { errorCode: 'OUT_OF_STOCK' });
      return;
    }
    callback({ code: grpc.status.INVALID_ARGUMENT, details: result.message });
    done(grpc.status.INVALID_ARGUMENT);
  },
};

const server = new grpc.Server();
server.addService(InventoryService, impl);
server.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    log({ event: 'start_failed', grpcPort: GRPC_PORT, error: err.message });
    process.exit(1);
  }
  log({ event: 'started', protocol: 'grpc', grpcPort: port, proto: 'v1', testHooks: TEST_HOOKS });
});

const http = HTTP_PORT === undefined ? undefined : createServer((req, res) => {
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET' && req.url === '/health') return reply(200, { status: 'ok', service: SERVICE });
  if (TEST_HOOKS && req.method === 'POST' && req.url === '/_reset') {
    resetStock();
    return reply(200, { reset: true });
  }
  reply(404, { code: 'NOT_FOUND', message: 'không có đường dẫn này' });
}).listen(HTTP_PORT, () => log({ event: 'started', protocol: 'http', httpPort: HTTP_PORT }));

const stop = () => {
  http?.close();
  server.tryShutdown(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
