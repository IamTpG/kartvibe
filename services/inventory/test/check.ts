import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import * as grpc from '@grpc/grpc-js';
import { createInventoryGrpcClient, callGrpcReserve } from './grpc-client.js';

const REST_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4006;
const GRPC_PORT = process.env.GRPC_PORT ? parseInt(process.env.GRPC_PORT, 10) : 4007;
const BASE_URL = `http://localhost:${REST_PORT}`;
const GRPC_ADDR = `localhost:${GRPC_PORT}`;
const runId = `inventory-check-${process.pid}-${Date.now()}`;
const restOkRequestId = `${runId}-rest-ok`;
const restInvalidJsonRequestId = `${runId}-invalid-json`;
const grpcOkRequestId = `${runId}-grpc-ok`;
const restAbortedRequestId = `${runId}-rest-aborted`;

interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: any;
  durationMs: number;
}

function httpRequest(
  method: string,
  path: string,
  data?: any,
  headers: Record<string, string> = {},
  rawPayload?: string
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const payload = rawPayload ?? (data ? JSON.stringify(data) : undefined);
    const reqHeaders: Record<string, string> = { ...headers };
    if (payload) {
      reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const start = Date.now();
    const req = http.request(
      `${BASE_URL}${path}`,
      { method, headers: reqHeaders },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          const durationMs = Date.now() - start;
          let body = raw;
          try {
            if (raw.length > 0) body = JSON.parse(raw);
          } catch {}
          resolve({ status: res.statusCode || 0, headers: res.headers, body, durationMs });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

let passedCount = 0;
let failedCount = 0;

function assertTest(desc: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  PASS: ${desc}`);
    passedCount++;
  } else {
    console.error(`  FAIL: ${desc} ${details ? `(${details})` : ''}`);
    failedCount++;
  }
}

async function runTests() {
  console.log(`\n=== KARTVIBE INVENTORY SERVICE CHECK ===`);
  console.log(`REST: ${BASE_URL} | gRPC: ${GRPC_ADDR}`);

  const grpcClient = createInventoryGrpcClient(GRPC_ADDR);

  console.log('\n--- 1. Health & Reset ---');
  try {
    const health = await httpRequest('GET', '/health');
    assertTest('REST /health trả 200 {"status":"ok"}', health.status === 200 && health.body?.status === 'ok');
  } catch (err: any) {
    console.error(`Lỗi kết nối REST server tại ${BASE_URL}:`, err.message);
    process.exit(1);
  }

  const resetRes = await httpRequest('POST', '/_reset');
  assertTest('POST /_reset trả 204 nạp lại fixture', resetRes.status === 204);

  console.log('\n--- 2. Metrics ---');
  const metricsBefore = await httpRequest('GET', '/_metrics');
  assertTest('GET /_metrics trả service=inventory, requests, dbQueries', metricsBefore.status === 200 && metricsBefore.body?.service === 'inventory' && typeof metricsBefore.body?.requests === 'number' && typeof metricsBefore.body?.dbQueries === 'number');
  const metricsReset = await httpRequest('POST', '/_metrics/reset');
  assertTest('POST /_metrics/reset trả 204', metricsReset.status === 204);
  const metricsAfter = await httpRequest('GET', '/_metrics');
  assertTest('Metrics được reset về 0 requests & 0 dbQueries', metricsAfter.body?.requests === 0 && metricsAfter.body?.dbQueries === 0);

  console.log('\n--- 3. REST Reservations ---');
  const r1 = await httpRequest('POST', '/inventory/reservations', { sku: 'SKU-OK', quantity: 2 }, { 'x-client-version': 'v2', 'x-request-id': restOkRequestId });
  assertTest('REST đủ hàng trả 201 và reservationId', r1.status === 201 && typeof r1.body?.reservationId === 'string' && r1.body.reservationId.startsWith('RSV-'));

  const r2 = await httpRequest('POST', '/inventory/reservations', { sku: 'SKU-ZERO', quantity: 1 }, { 'x-client-version': 'v2', 'x-request-id': `${runId}-rest-zero` });
  assertTest('REST hết hàng trả 409 OUT_OF_STOCK', r2.status === 409 && r2.body?.code === 'OUT_OF_STOCK');
  const r3 = await httpRequest('POST', '/inventory/reservations', { sku: 'SKU-NOT-FOUND-XYZ', quantity: 1 });
  assertTest('REST SKU không tồn tại trả 409 OUT_OF_STOCK', r3.status === 409 && r3.body?.code === 'OUT_OF_STOCK');
  for (const [desc, body] of [['Quantity = 0', { sku: 'SKU-OK', quantity: 0 }], ['Quantity = 1001', { sku: 'SKU-OK', quantity: 1001 }], ['SKU rỗng', { sku: '', quantity: 1 }], ['SKU dài 65 ký tự', { sku: 'A'.repeat(65), quantity: 1 }]] as const) {
    const response = await httpRequest('POST', '/inventory/reservations', body);
    assertTest(`REST ${desc} trả 400 VALIDATION_ERROR`, response.status === 400 && response.body?.code === 'VALIDATION_ERROR');
  }
  const malformedJson = await httpRequest('POST', '/inventory/reservations', undefined, { 'x-request-id': restInvalidJsonRequestId }, '{');
  assertTest('REST malformed JSON trả 400 JSON VALIDATION_ERROR và request ID', malformedJson.status === 400 && malformedJson.body?.code === 'VALIDATION_ERROR' && malformedJson.headers['x-request-id'] === restInvalidJsonRequestId);

  console.log('\n--- 4. gRPC Reservations ---');
  const g1 = await callGrpcReserve(grpcClient, { sku: 'SKU-OK', quantity: 2 }, { 'x-client-version': 'v2', 'x-request-id': grpcOkRequestId });
  assertTest('gRPC đủ hàng trả OK, reservationId, available=6', !g1.error && typeof g1.response?.reservationId === 'string' && g1.response.available === 6);
  const g2 = await callGrpcReserve(grpcClient, { sku: 'SKU-ZERO', quantity: 1 }, { 'x-client-version': 'v2', 'x-request-id': `${runId}-grpc-zero` });
  assertTest('gRPC hết hàng trả FAILED_PRECONDITION và metadata OUT_OF_STOCK', g2.error?.code === grpc.status.FAILED_PRECONDITION && g2.error.details === 'Insufficient stock for SKU-ZERO' && g2.error.metadata?.get('x-error-code')?.[0] === 'OUT_OF_STOCK');
  const g3 = await callGrpcReserve(grpcClient, { sku: 'SKU-NOT-FOUND-XYZ', quantity: 1 });
  assertTest('gRPC SKU không tồn tại trả FAILED_PRECONDITION', g3.error?.code === grpc.status.FAILED_PRECONDITION && g3.error.metadata?.get('x-error-code')?.[0] === 'OUT_OF_STOCK');
  const g4 = await callGrpcReserve(grpcClient, { sku: 'SKU-OK', quantity: 6 });
  assertTest('gRPC giữ hàng cuối trả available=0', !g4.error && typeof g4.response?.reservationId === 'string' && g4.response.available === 0);
  for (const [desc, input] of [['Quantity = 0', { sku: 'SKU-OK', quantity: 0 }], ['Quantity = 1001', { sku: 'SKU-OK', quantity: 1001 }], ['SKU rỗng', { sku: '', quantity: 1 }], ['SKU dài 65 ký tự', { sku: 'A'.repeat(65), quantity: 1 }]] as const) {
    const result = await callGrpcReserve(grpcClient, input);
    assertTest(`gRPC ${desc} trả INVALID_ARGUMENT`, result.error?.code === grpc.status.INVALID_ARGUMENT);
  }

  console.log('\n--- 5. Concurrency ---');
  await httpRequest('POST', '/_reset');
  const concurrentRequests = Array.from({ length: 10 }, (_, i) => i % 2 === 0 ? httpRequest('POST', '/inventory/reservations', { sku: 'SKU-LOW', quantity: 1 }) : callGrpcReserve(grpcClient, { sku: 'SKU-LOW', quantity: 1 }));
  const results = await Promise.all(concurrentRequests);
  const successCount = results.filter((res) => 'status' in res ? res.status === 201 : !res.error && res.response?.reservationId).length;
  const outOfStockCount = results.filter((res) => 'status' in res ? res.status === 409 : res.error?.code === grpc.status.FAILED_PRECONDITION).length;
  assertTest('SKU-LOW concurrency: one success, nine out of stock', successCount === 1 && outOfStockCount === 9, `success=${successCount}, outOfStock=${outOfStockCount}`);
  const afterCheck = await httpRequest('POST', '/inventory/reservations', { sku: 'SKU-LOW', quantity: 1 });
  assertTest('SKU-LOW inventory remains nonnegative', afterCheck.status === 409);

  console.log('\n--- 6. Fault Injection & Latency ---');
  for (const delayMs of [-1, 1.5, '10', 60001, null]) {
    const invalidFault = await httpRequest('POST', '/_fault', { delayMs });
    assertTest(`POST /_fault rejects invalid delayMs ${JSON.stringify(delayMs)}`, invalidFault.status === 400 && invalidFault.body?.code === 'VALIDATION_ERROR');
  }
  const infiniteFault = await httpRequest('POST', '/_fault', undefined, {}, '{"delayMs":1e999}');
  assertTest('POST /_fault rejects non-finite delayMs', infiniteFault.status === 400 && infiniteFault.body?.code === 'VALIDATION_ERROR');
  const maxFault = await httpRequest('POST', '/_fault', { delayMs: 60000 });
  assertTest('POST /_fault accepts documented 60000ms maximum', maxFault.status === 204);
  await httpRequest('POST', '/_fault', { delayMs: 0 });
  const faultSet = await httpRequest('POST', '/_fault', { delayMs: 700 });
  assertTest('POST /_fault {"delayMs":700} trả 204', faultSet.status === 204);
  const startRestFault = Date.now();
  const restFaultRes = await httpRequest('POST', '/inventory/reservations', { sku: 'SKU-OK', quantity: 1 });
  const restFaultMs = Date.now() - startRestFault;
  assertTest('REST fault delay ≥ 700ms', restFaultRes.status === 201 && restFaultMs >= 700, `duration=${restFaultMs}ms`);
  const startGrpcFault = Date.now();
  await callGrpcReserve(grpcClient, { sku: 'SKU-OK', quantity: 1 });
  const grpcFaultMs = Date.now() - startGrpcFault;
  assertTest('gRPC fault delay ≥ 700ms', grpcFaultMs >= 700, `duration=${grpcFaultMs}ms`);
  await httpRequest('POST', '/_fault', { delayMs: 0 });
  const startNormal = Date.now();
  const normalRes = await httpRequest('POST', '/inventory/reservations', { sku: 'SKU-OK', quantity: 1 });
  const normalMs = Date.now() - startNormal;
  assertTest('Fault reset delay < 300ms', normalRes.status === 201 && normalMs < 300, `duration=${normalMs}ms`);

  console.log('\n--- 6b. Client bỏ cuộc giữa chừng (Order quá hạn) ---');
  await httpRequest('POST', '/_reset');
  await httpRequest('POST', '/_fault', { delayMs: 600 });
  await new Promise<void>((resolve) => {
    const payload = JSON.stringify({ sku: 'SKU-OK', quantity: 1 });
    const req = http.request(`${BASE_URL}/inventory/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload).toString(), 'x-client-version': 'v2', 'x-request-id': restAbortedRequestId } });
    req.on('error', () => {});
    req.write(payload);
    req.end();
    setTimeout(() => { req.destroy(); resolve(); }, 150);
  });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await httpRequest('POST', '/_fault', { delayMs: 0 });

  console.log('\n--- 7. CORS ---');
  const corsPreflight = await httpRequest('OPTIONS', '/_fault', undefined, { Origin: 'http://localhost:4000', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' });
  assertTest('CORS preflight allows origin *', (corsPreflight.status === 200 || corsPreflight.status === 204) && corsPreflight.headers['access-control-allow-origin'] === '*');

  console.log('\n--- 8. Log Format Verification ---');
  const logFilePath = process.env.LOG_FILE || 'logs/inventory.log';
  try {
    if (!existsSync(logFilePath)) throw new Error(`missing log file: ${logFilePath}`);
    const lines = readFileSync(logFilePath, 'utf-8').split('\n').filter((line) => line.trim());
    const records = lines.flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
    const restSuccess = records.find((entry) => entry.requestId === restOkRequestId && entry.protocol === 'rest' && entry.operation === 'Reserve');
    const restMalformed = records.find((entry) => entry.requestId === restInvalidJsonRequestId && entry.protocol === 'rest' && entry.operation === 'Reserve');
    const grpcSuccess = records.find((entry) => entry.requestId === grpcOkRequestId && entry.protocol === 'grpc' && entry.operation === 'Reserve');
    const validCommon = (entry: any) => entry && entry.ts && entry.service === 'inventory' && entry.method && entry.path && typeof entry.status === 'number' && typeof entry.ms === 'number' && entry.clientVersion;
    assertTest('Current REST success log correlates request ID and reservationId', validCommon(restSuccess) && restSuccess.reservationId === r1.body?.reservationId && restSuccess.status === 201);
    assertTest('Malformed JSON log correlates request ID and errorCode', validCommon(restMalformed) && restMalformed.status === 400 && restMalformed.errorCode === 'VALIDATION_ERROR');
    const restAborted = records.find((entry) => entry.requestId === restAbortedRequestId && entry.protocol === 'rest' && entry.operation === 'Reserve');
    assertTest('REST: client bỏ cuộc giữa chừng vẫn có dòng log của lần giữ hàng (status 201, reservationId, ms ≥ 500)', validCommon(restAborted) && restAborted.status === 201 && typeof restAborted.reservationId === 'string' && restAborted.ms >= 500, JSON.stringify(restAborted));
    assertTest('Current gRPC success log correlates request ID and reservationId', validCommon(grpcSuccess) && grpcSuccess.reservationId === g1.response?.reservationId && grpcSuccess.grpcStatus === 'OK');
  } catch (err: any) {
    assertTest(`Log file exists and is readable (${logFilePath})`, false, err.message);
  }

  await httpRequest('POST', '/_reset');
  grpcClient.close();
  console.log(`\n========================================`);
  console.log(`KẾT QUẢ KIỂM TRA: ${passedCount} PASS, ${failedCount} FAIL`);
  console.log(`========================================\n`);
  process.exit(failedCount > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Lỗi khi chạy bộ kiểm tra:', err);
  process.exit(1);
});
