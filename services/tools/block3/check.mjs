import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenarios } from './scenarios.mjs';
import { runSlowScenario } from './slow.mjs';
import { runLatency } from './latency.mjs';
import { startMockServers } from './test/mock-services.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const checkStartTs = new Date().toISOString();
  console.log(`======================================================================`);
  console.log(`[check] KHỞI ĐỘNG KIỂM TRA TỰ ĐỘNG TOÀN DIỆN (W4 check)`);
  console.log(`Thời điểm: ${checkStartTs}`);
  console.log(`======================================================================\n`);

  let mockCluster = null;
  let allOk = true;

  try {
    // 1. Khởi động Mock Servers trong test/
    console.log(`[check] Bước 1: Khởi động Mock Services (Order 4002, 4012 & Inventory 4006)...`);
    mockCluster = await startMockServers();
    console.log(`[check] Mock Services đã sẵn sàng.\n`);

    // 2. Kiểm tra logic chuẩn hóa
    console.log(`[check] Bước 2: Kiểm tra Unit Test logic chuẩn hóa và so sánh snapshot...`);
    execSync('node test/normalize.test.mjs', { cwd: __dirname, stdio: 'inherit' });

    // 3. Chạy bộ kịch bản và so sánh snapshot
    console.log(`[check] Bước 3: Chạy bộ kịch bản (ok, out-of-stock, invalid-quantity, invalid-body)...`);
    const scOk = await runScenarios();
    if (!scOk) {
      throw new Error('Bộ kịch bản snapshot thất bại!');
    }

    // 4. Chạy kịch bản slow
    console.log(`[check] Bước 4: Chạy kịch bản Inventory chậm (slow)...`);
    const slowOk = await runSlowScenario();
    if (!slowOk) {
      throw new Error('Kịch bản slow thất bại!');
    }

    // 5. Chạy đo payload
    console.log(`[check] Bước 5: Chạy đo payload (Protobuf vs REST JSON)...`);
    execSync('npx tsx payload.ts', { cwd: __dirname, stdio: 'inherit' });

    // 6. Chạy đo latency
    console.log(`\n[check] Bước 6: Chạy đo thời gian phản hồi (latency n=5)...`);
    const latencyOk = await runLatency(5);
    if (!latencyOk) {
      throw new Error('Đo latency thất bại!');
    }

  } catch (err) {
    allOk = false;
    console.error(`\n[check] ✗ LỖI TRONG QUÁ TRÌNH KIỂM TRA:`, err.message);
  } finally {
    if (mockCluster) {
      console.log(`\n[check] Dừng các Mock Services...`);
      await mockCluster.stopAll();
    }
  }

  const checkEndTs = new Date().toISOString();
  console.log(`\n======================================================================`);
  if (allOk) {
    console.log(`[check] ✓ TẤT CẢ KIỂM TRA ĐÃ HOÀN TẤT THÀNH CÔNG (PASS)! [${checkEndTs}]`);
    console.log(`======================================================================`);
    process.exit(0);
  } else {
    console.error(`[check] ✗ KIỂM TRA THẤT BẠI (FAIL)! [${checkEndTs}]`);
    console.error(`======================================================================`);
    process.exit(1);
  }
}

main();
