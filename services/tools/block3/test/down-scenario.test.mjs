import http from 'node:http';
import { runDownScenario } from '../down.mjs';
import { createOrderServer, createInventoryServer } from './mock-services.mjs';

console.log('[test:down] Kiểm tra kịch bản down trong 2 tình huống:');

async function testSituation1() {
  console.log('\n--- Tình huống 1: Inventory vẫn đang chạy -> down.mjs phải dừng và trả về false (báo lỗi)');
  const invServer = createInventoryServer();
  await new Promise(r => invServer.listen(4006, '127.0.0.1', r));

  try {
    const result = await runDownScenario();
    if (result === false) {
      console.log('✓ PASS Tình huống 1: Phát hiện Inventory đang chạy và dừng lại chính xác, không đoán.');
    } else {
      throw new Error('FAIL: Lẽ ra phải dừng lại khi Inventory đang chạy');
    }
  } finally {
    await new Promise(r => invServer.close(r));
  }
}

async function testSituation2() {
  console.log('\n--- Tình huống 2: Inventory đã tắt, Order 4002 và 4012 đang chạy -> down.mjs phải trả về PASS (503 INVENTORY_UNAVAILABLE)');
  const orderRest = createOrderServer({ port: 4002, mode: 'rest', inventoryUrl: 'http://127.0.0.1:4006' });
  const orderGrpc = createOrderServer({ port: 4012, mode: 'grpc', inventoryUrl: 'http://127.0.0.1:4006' });

  await new Promise(r => orderRest.listen(4002, '127.0.0.1', r));
  await new Promise(r => orderGrpc.listen(4012, '127.0.0.1', r));

  try {
    const result = await runDownScenario();
    if (result === true) {
      console.log('✓ PASS Tình huống 2: Xác nhận Inventory tắt và cả hai Order trả 503 INVENTORY_UNAVAILABLE trong thời gian hữu hạn.');
    } else {
      throw new Error('FAIL: Kịch bản down không trả true');
    }
  } finally {
    await Promise.all([
      new Promise(r => orderRest.close(r)),
      new Promise(r => orderGrpc.close(r))
    ]);
  }
}

async function run() {
  await testSituation1();
  await testSituation2();
  console.log('\n[test:down] Tất cả kiểm tra kịch bản down đã HOÀN TẤT THÀNH CÔNG!\n');
}

run().catch(err => {
  console.error('[test:down] Lỗi:', err);
  process.exit(1);
});
