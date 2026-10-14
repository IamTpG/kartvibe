import { performance } from 'node:perf_hooks';

export const ORDER_REST_URL = process.env.ORDER_REST_URL || 'http://localhost:4002';
export const ORDER_GRPC_URL = process.env.ORDER_GRPC_URL || 'http://localhost:4012';
export const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:4006';

const TIMEOUT_THRESHOLD_MS = 2000;

async function checkInventoryIsDown() {
  try {
    const res = await fetch(`${INVENTORY_URL}/health`, { signal: AbortSignal.timeout(800) });
    if (res.ok) {
      return false; // Still running!
    }
    return true;
  } catch {
    return true; // Connection refused / unreachable -> DOWN
  }
}

async function testPortDown(name, url) {
  const start = performance.now();
  const ts = new Date().toISOString();

  let status = 0;
  let body = null;
  try {
    const res = await fetch(`${url}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'SKU-OK', quantity: 2 }),
      signal: AbortSignal.timeout(TIMEOUT_THRESHOLD_MS)
    });
    status = res.status;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  } catch (err) {
    status = `ERR: ${err.message}`;
  }

  const elapsedMs = Math.round(performance.now() - start);

  console.log(`[${ts}] ${name} (${url}) khi Inventory tắt:`);
  console.log(`  - Status: ${status}`);
  console.log(`  - Body:   ${JSON.stringify(body)}`);
  console.log(`  - Thời gian phản hồi: ${elapsedMs} ms (ngưỡng: < ${TIMEOUT_THRESHOLD_MS} ms)`);

  const is503 = status === 503;
  const isUnavailableCode = body?.code === 'INVENTORY_UNAVAILABLE';
  const isFinite = elapsedMs < TIMEOUT_THRESHOLD_MS;

  const pass = is503 && isUnavailableCode && isFinite;
  if (pass) {
    console.log(`  ✓ [PASS] Đạt 503 INVENTORY_UNAVAILABLE trong thời gian hữu hạn (${elapsedMs} ms)`);
  } else {
    console.error(`  ✗ [FAIL] Không đạt tiêu chí: 503=${is503}, code INVENTORY_UNAVAILABLE=${isUnavailableCode}, thời gian hữu hạn=${isFinite}`);
  }

  return pass;
}

export async function runDownScenario() {
  const ts = new Date().toISOString();
  console.log(`======================================================================`);
  console.log(`[down] Bắt đầu kiểm tra kịch bản Inventory tắt tại: ${ts}`);
  console.log(`  - Kiểm tra trạng thái Inventory tại: ${INVENTORY_URL}`);
  console.log(`======================================================================`);

  const isDown = await checkInventoryIsDown();
  if (!isDown) {
    console.error(`\n[down] LỖI: Inventory vẫn đang chạy và phản hồi tại ${INVENTORY_URL}!`);
    console.error(`[down] Quy tắc W4.md: "Nếu Inventory còn đang chạy thì kịch bản dừng và báo lỗi, không đoán."`);
    console.error(`[down] HƯỚNG DẪN:`);
    console.error(`  1. Dừng tiến trình Inventory bằng lệnh:`);
    console.error(`     ./stop-inventory.sh services/.run/inventory.pid`);
    console.error(`     (hoặc .\\stop-inventory.ps1 trên Windows PowerShell)`);
    console.error(`  2. Sau khi Inventory đã dừng hẳn, chạy lại lệnh này.`);
    return false;
  }

  console.log(`[down] Xác nhận: Inventory đã tắt (không phản hồi /health). Bắt đầu gọi Order...\n`);

  const restPass = await testPortDown('Order REST', ORDER_REST_URL);
  console.log('');
  const grpcPass = await testPortDown('Order gRPC', ORDER_GRPC_URL);

  const allPassed = restPass && grpcPass;

  console.log(`\n======================================================================`);
  console.log(`[down] KẾT QUẢ KỊCH BẢN DOWN: ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log(`======================================================================\n`);

  return allPassed;
}

if (process.argv[1] && process.argv[1].endsWith('down.mjs')) {
  runDownScenario().then(ok => {
    process.exit(ok ? 0 : 1);
  }).catch(err => {
    console.error('[down] Lỗi:', err);
    process.exit(1);
  });
}
