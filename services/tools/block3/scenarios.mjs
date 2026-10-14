import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeResponse, compareSnapshots } from './lib/normalize.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Endpoints configurable via environment variables
export const ORDER_REST_URL = process.env.ORDER_REST_URL || 'http://localhost:4002';
export const ORDER_GRPC_URL = process.env.ORDER_GRPC_URL || 'http://localhost:4012';
export const ORDER_OLD_URL = process.env.ORDER_OLD_URL || 'http://localhost:4022';
export const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:4006';

const snapshotsDir = path.join(__dirname, 'snapshots');
fs.mkdirSync(snapshotsDir, { recursive: true });

async function isOldClientAlive() {
  try {
    const res = await fetch(`${ORDER_OLD_URL}/health`, { signal: AbortSignal.timeout(600) });
    return res.ok;
  } catch {
    return false;
  }
}

async function safePost(url, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(1000)
    });
    return res.status;
  } catch (err) {
    return `ERR: ${err.message}`;
  }
}

export async function resetAllServices(hasOldClient = false) {
  const ts = new Date().toISOString();
  const restStatus = await safePost(`${ORDER_REST_URL}/_reset`);
  const grpcStatus = await safePost(`${ORDER_GRPC_URL}/_reset`);
  const invStatus = await safePost(`${INVENTORY_URL}/_reset`);
  let oldStatus = 'bỏ qua (không chạy)';

  if (hasOldClient) {
    oldStatus = await safePost(`${ORDER_OLD_URL}/_reset`);
  }

  const bad = Object.entries({ REST: restStatus, gRPC: grpcStatus, Inventory: invStatus, ...(hasOldClient ? { 'gRPC-v1': oldStatus } : {}) })
    .filter(([, status]) => status !== 204);
  if (bad.length) {
    console.warn(`  [CẢNH BÁO ${ts}] POST /_reset không trả 204: ${bad.map(([name, status]) => `${name}=${status}`).join(', ')} (cần ENABLE_TEST_HOOKS=1); kết quả kịch bản có thể không xác định`);
  }
}

async function invokeOrder(baseUrl, body, isRaw = false) {
  const headers = isRaw ? { 'Content-Type': 'text/plain' } : { 'Content-Type': 'application/json' };
  const rawBody = isRaw ? body : JSON.stringify(body);

  const res = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers,
    body: rawBody
  });

  const responseHeaders = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  let resBody;
  const text = await res.text();
  try {
    resBody = JSON.parse(text);
  } catch {
    resBody = text;
  }

  return {
    status: res.status,
    headers: responseHeaders,
    body: resBody
  };
}

export async function runScenarios() {
  const timestamp = new Date().toISOString();
  console.log(`======================================================================`);
  console.log(`[scenarios] Bắt đầu chạy bộ kịch bản và lưu snapshot tại: ${timestamp}`);
  console.log(`  - ORDER_REST_URL: ${ORDER_REST_URL}`);
  console.log(`  - ORDER_GRPC_URL: ${ORDER_GRPC_URL}`);
  console.log(`  - INVENTORY_URL:  ${INVENTORY_URL}`);

  const hasOld = await isOldClientAlive();
  console.log(`  - ORDER_OLD_URL:  ${ORDER_OLD_URL} -> ${hasOld ? 'Đang chạy (sẽ kiểm tra snapshot thứ 3)' : 'Không chạy (bỏ qua)'}`);
  console.log(`======================================================================\n`);

  const scenarios = [
    {
      name: 'ok',
      description: 'Đủ hàng {sku:"SKU-OK", quantity:2} -> 201',
      body: { sku: 'SKU-OK', quantity: 2 },
      isRaw: false,
      expectedStatus: 201
    },
    {
      name: 'out-of-stock',
      description: 'Thiếu hàng {sku:"SKU-ZERO", quantity:1} -> 409 OUT_OF_STOCK',
      body: { sku: 'SKU-ZERO', quantity: 1 },
      isRaw: false,
      expectedStatus: 409
    },
    {
      name: 'invalid-quantity',
      description: 'Số lượng không hợp lệ {sku:"SKU-OK", quantity:0} -> 400 VALIDATION_ERROR',
      body: { sku: 'SKU-OK', quantity: 0 },
      isRaw: false,
      expectedStatus: 400
    },
    {
      name: 'invalid-body',
      description: 'Body không phải JSON -> 400',
      body: '{ malformed JSON raw body: invalid }',
      isRaw: true,
      expectedStatus: 400
    }
  ];

  let allPassed = true;

  for (const sc of scenarios) {
    const scTs = new Date().toISOString();
    console.log(`----------------------------------------------------------------------`);
    console.log(`[${scTs}] Kịch bản: "${sc.name}" (${sc.description})`);

    // Reset before scenario
    await resetAllServices(hasOld);

    // Call REST 4002
    const restRes = await invokeOrder(ORDER_REST_URL, sc.body, sc.isRaw);
    const restNorm = normalizeResponse(restRes);
    const restSnapPath = path.join(snapshotsDir, `${sc.name}.rest.json`);
    fs.writeFileSync(restSnapPath, JSON.stringify({
      scenario: sc.name,
      mode: 'rest',
      timestamp: scTs,
      status: restNorm.status,
      headers: restNorm.headers,
      body: restNorm.body
    }, null, 2));

    // Call gRPC 4012
    const grpcRes = await invokeOrder(ORDER_GRPC_URL, sc.body, sc.isRaw);
    const grpcNorm = normalizeResponse(grpcRes);
    const grpcSnapPath = path.join(snapshotsDir, `${sc.name}.grpc.json`);
    fs.writeFileSync(grpcSnapPath, JSON.stringify({
      scenario: sc.name,
      mode: 'grpc',
      timestamp: scTs,
      status: grpcNorm.status,
      headers: grpcNorm.headers,
      body: grpcNorm.body
    }, null, 2));

    // Compare REST vs gRPC
    const cmp = compareSnapshots(restRes, grpcRes, 'REST (4002)', 'gRPC (4012)');
    if (cmp.match && restNorm.status === sc.expectedStatus) {
      console.log(`  ✓ [PASS] REST vs gRPC đối chiếu khớp hoàn toàn (Status ${restNorm.status})`);
    } else {
      allPassed = false;
      console.error(`  ✗ [FAIL] REST vs gRPC không khớp hoặc sai status mong đợi (${sc.expectedStatus}):`);
      if (cmp.diff) console.error(`    ${cmp.diff.replace(/\n/g, '\n    ')}`);
    }

    // If Old Client is running, compare grpc-v1
    if (hasOld) {
      const oldRes = await invokeOrder(ORDER_OLD_URL, sc.body, sc.isRaw);
      const oldNorm = normalizeResponse(oldRes);
      const oldSnapPath = path.join(snapshotsDir, `${sc.name}.grpc-v1.json`);
      fs.writeFileSync(oldSnapPath, JSON.stringify({
        scenario: sc.name,
        mode: 'grpc-v1',
        timestamp: scTs,
        status: oldNorm.status,
        headers: oldNorm.headers,
        body: oldNorm.body
      }, null, 2));

      const cmpOld = compareSnapshots(restRes, oldRes, 'REST (4002)', 'grpc-v1 (4022)');
      if (cmpOld.match) {
        console.log(`  ✓ [PASS] REST vs grpc-v1 đối chiếu khớp`);
      } else {
        allPassed = false;
        console.error(`  ✗ [FAIL] REST vs grpc-v1 không khớp:\n    ${cmpOld.diff}`);
      }
    } else {
      console.log(`  - [INFO] grpc-v1 (4022): bỏ qua (không chạy)`);
    }
  }

  console.log(`\n======================================================================`);
  if (allPassed) {
    console.log(`[scenarios] KẾT QUẢ: TẤT CẢ KỊCH BẢN ĐÃ PASS! Snapshots được lưu tại: ${snapshotsDir}`);
  } else {
    console.error(`[scenarios] KẾT QUẢ: CÓ KỊCH BẢN THẤT BẠI! Vui lòng kiểm tra diff bên trên.`);
  }
  console.log(`======================================================================\n`);

  return allPassed;
}

if (process.argv[1] && process.argv[1].endsWith('scenarios.mjs')) {
  runScenarios().then(ok => {
    process.exit(ok ? 0 : 1);
  }).catch(err => {
    console.error('[scenarios] Unexpected error:', err);
    process.exit(1);
  });
}
