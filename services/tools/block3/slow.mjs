import { performance } from 'node:perf_hooks';

export const ORDER_REST_URL = process.env.ORDER_REST_URL || 'http://localhost:4002';
export const ORDER_GRPC_URL = process.env.ORDER_GRPC_URL || 'http://localhost:4012';
export const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:4006';

const TIMEOUT_THRESHOLD_MS = 1500; // Deadline is 500ms, total should complete well under 1500ms
const FAULT_DELAY_MS = 2000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setFaultDelay(delayMs) {
  const res = await fetch(`${INVENTORY_URL}/_fault`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delayMs })
  });
  if (!res.ok) {
    throw new Error(`Failed to set fault on Inventory: HTTP ${res.status}`);
  }
}

async function testPortSlow(name, url) {
  const start = performance.now();
  const ts = new Date().toISOString();

  let status = 0;
  let body = null;
  try {
    const res = await fetch(`${url}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: 'SKU-OK', quantity: 2 })
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

  console.log(`[${ts}] ${name} (${url}) kết quả:`);
  console.log(`  - Status: ${status}`);
  console.log(`  - Body:   ${JSON.stringify(body)}`);
  console.log(`  - Thời gian đo được: ${elapsedMs} ms (Ngưỡng cho phép: < ${TIMEOUT_THRESHOLD_MS} ms)`);

  const is504 = status === 504;
  const isTimeoutCode = body?.code === 'INVENTORY_TIMEOUT';
  const isFinite = elapsedMs < TIMEOUT_THRESHOLD_MS;

  const pass = is504 && isTimeoutCode && isFinite;
  if (pass) {
    console.log(`  ✓ [PASS] Đạt 504 INVENTORY_TIMEOUT và thời gian kết thúc hữu hạn (${elapsedMs} ms)`);
  } else {
    console.error(`  ✗ [FAIL] Không đạt tiêu chí: 504=${is504}, code INVENTORY_TIMEOUT=${isTimeoutCode}, <${TIMEOUT_THRESHOLD_MS}ms=${isFinite}`);
  }

  return pass;
}

export async function runSlowScenario() {
  const startTs = new Date().toISOString();
  console.log(`======================================================================`);
  console.log(`[slow] Bắt đầu kịch bản Inventory chậm (delayMs: 2000) tại: ${startTs}`);
  console.log(`======================================================================`);

  let allPassed = false;
  try {
    console.log(`[slow] Gửi POST ${INVENTORY_URL}/_fault { delayMs: 2000 }...`);
    await setFaultDelay(FAULT_DELAY_MS);
    console.log(`[slow] Đã làm chậm Inventory. Bắt đầu gọi Order trên cả hai cổng...\n`);

    const restPass = await testPortSlow('Order REST', ORDER_REST_URL);
    console.log('');
    const grpcPass = await testPortSlow('Order gRPC', ORDER_GRPC_URL);

    allPassed = restPass && grpcPass;
  } finally {
    console.log(`\n[slow] Khôi phục Inventory về trạng thái bình thường: { delayMs: 0 }...`);
    try {
      await setFaultDelay(0);
      console.log(`[slow] Đã khôi phục Inventory (delayMs: 0) thành công.`);
      // D14: Order đã trả 504 nhưng Inventory vẫn xử lý xong lời gọi bị làm chậm và giữ hàng. Chờ các lần giữ hàng trễ
      // đó rơi xuống rồi nạp lại tồn kho, để kịch bản sau không bị lệch tồn kho.
      console.log(`[slow] Chờ ${FAULT_DELAY_MS + 500} ms cho các lần giữ hàng trễ của Inventory hoàn tất (D14), rồi nạp lại tồn kho...`);
      await sleep(FAULT_DELAY_MS + 500);
      const reset = await fetch(`${INVENTORY_URL}/_reset`, { method: 'POST' });
      console.log(`[slow] POST ${INVENTORY_URL}/_reset -> HTTP ${reset.status}`);
    } catch (err) {
      console.error(`[slow] CẢNH BÁO: Lỗi khi khôi phục delayMs=0:`, err.message);
    }
  }

  console.log(`======================================================================`);
  console.log(`[slow] KẾT QUẢ KỊCH BẢN SLOW: ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log(`======================================================================\n`);

  return allPassed;
}

if (process.argv[1] && process.argv[1].endsWith('slow.mjs')) {
  runSlowScenario().then(ok => {
    process.exit(ok ? 0 : 1);
  }).catch(err => {
    console.error('[slow] Lỗi kịch bản:', err);
    process.exit(1);
  });
}
