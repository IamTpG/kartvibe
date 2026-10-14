// npm run check: chạy compat.mjs end-to-end với bản giả và với inventory-v1 thật của W3.
//   Ma trận như team lead sẽ chạy (W3.md mục 1) + các trường hợp phải FAIL để chắc compat.mjs không đạt "dễ dãi".
//   Mọi tiến trình dùng cổng trống ngẫu nhiên nên không đụng các service đang chạy.
// Tùy chọn: --evidence-dir <thư mục> để giữ output compat.mjs và log các tiến trình (npm run evidence).
// Thoát 0 khi mọi bước đạt.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, start, stop, waitStarted } from './procs.mjs';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inventoryV1Dir = resolve(pkgDir, process.env.INVENTORY_V1_DIR ?? '../../inventory-v1');
const evArg = process.argv.indexOf('--evidence-dir');
const keep = evArg > 0;
const workDir = keep ? resolve(pkgDir, process.argv[evArg + 1]) : mkdtempSync(join(tmpdir(), 'compat-check-'));
const logDir = join(workDir, 'logs');
mkdirSync(logDir, { recursive: true });

const results = [];
const record = (name, pass, note = '') => {
  results.push([name, pass]);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? ` (${note})` : ''}`);
};

// Nạp lại tồn kho của cả hai Inventory trước mỗi lần chạy để kết quả không phụ thuộc thứ tự (SKU-OK chỉ có 10).
let resetUrls = [];
async function resetStock() {
  for (const url of resetUrls) await fetch(url, { method: 'POST' });
}

async function compat(args, expectExit, name) {
  await resetStock();
  console.log(`\n=== ${name}\n$ node compat.mjs ${args.join(' ')}`);
  const r = spawnSync(process.execPath, [join(pkgDir, 'compat.mjs'), ...args, '--evidence-dir', workDir], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  record(name, r.status === expectExit, `exit ${r.status}, mong đợi ${expectExit}`);
}

const procs = [];
try {
  console.log('=== tsc --noEmit (bản giả)');
  record('tsc --noEmit (bản giả)', spawnSync(process.execPath, [join(dirname(createRequire(join(pkgDir, 'package.json')).resolve('typescript/package.json')), 'bin/tsc'), '--noEmit', '-p', pkgDir], { stdio: 'inherit' }).status === 0);
  console.log('\n=== node --check compat.mjs');
  record('node --check compat.mjs', spawnSync(process.execPath, ['--check', join(pkgDir, 'compat.mjs')], { stdio: 'inherit' }).status === 0);
  console.log('\n=== thiếu tham số');
  record('thiếu tham số thì thoát 2', spawnSync(process.execPath, [join(pkgDir, 'compat.mjs'), '--order', 'http://x'], { stdio: 'inherit' }).status === 2);

  if (!existsSync(join(inventoryV1Dir, 'src/server.ts'))) throw new Error(`không thấy inventory-v1 ở ${inventoryV1Dir} (đặt INVENTORY_V1_DIR)`);

  const [invHttp, invGrpc, oldGrpc, oldHttp, pOld, pNew, pNewOnOld, pNowhere] = await Promise.all(Array.from({ length: 8 }, freePort));
  const fakeInventory = start({ name: 'inventory', script: 'test/fake-inventory.ts', cwd: pkgDir, logDir, env: { PORT: invHttp, GRPC_PORT: invGrpc, ENABLE_TEST_HOOKS: '1' } });
  const inventoryV1 = start({ name: 'inventory-grpc-v1', script: 'src/server.ts', cwd: inventoryV1Dir, logDir, env: { GRPC_PORT: oldGrpc, HTTP_PORT: oldHttp, ENABLE_TEST_HOOKS: '1' } });
  const order = (name, port, clientProto, grpcPort) => start({
    name, script: 'test/fake-order.ts', cwd: pkgDir, logDir,
    env: { PORT: port, INVENTORY_PROTOCOL: 'grpc', CLIENT_PROTO: clientProto, INVENTORY_GRPC_ADDR: `127.0.0.1:${grpcPort}`, SERVICE_NAME: name.replace(/\..*/, '') },
  });
  const orderOld = order('order-grpc-v1', pOld, 'v1', invGrpc);
  const orderNew = order('order-grpc', pNew, 'v2', invGrpc);
  const orderNewOnOld = order('order-grpc.goi-inventory-grpc-v1', pNewOnOld, 'v2', oldGrpc);
  procs.push(fakeInventory, inventoryV1, orderOld, orderNew, orderNewOnOld);
  await Promise.all(procs.map((p) => waitStarted(p)));
  resetUrls = [`http://127.0.0.1:${invHttp}/_reset`, `http://127.0.0.1:${oldHttp}/_reset`];
  console.log(`\nĐã khởi động: ${procs.map((p) => p.name).join(', ')}; log ở ${logDir}`);

  const row = (label, port, client, available, orderLog, invLog) => [
    '--order', `http://127.0.0.1:${port}`, '--label', label, '--expect-client', client, '--expect-available', available,
    '--order-log', orderLog.logFile, '--inventory-log', invLog.logFile,
  ];

  // Ma trận của W3.md (Inventory thật v2 được thay bằng bản giả v2).
  await compat(row('client-cu_server-moi', pOld, 'v1', 'none', orderOld, fakeInventory), 0, 'client cũ (v1) × server mới (bản giả v2): v1, none');
  await compat(row('client-moi_server-moi', pNew, 'v2', 'number', orderNew, fakeInventory), 0, 'client mới (v2) × server mới (bản giả v2): v2, number');
  await compat(row('client-moi_server-cu', pNewOnOld, 'v2', 'absent', orderNewOnOld, inventoryV1), 0, 'client mới (v2) × server cũ (inventory-v1): v2, absent');
  // Thêm: client cũ × server cũ.
  const pOldOnOld = await freePort();
  const orderOldOnOld = order('order-grpc-v1.goi-inventory-grpc-v1', pOldOnOld, 'v1', oldGrpc);
  procs.push(orderOldOnOld);
  await waitStarted(orderOldOnOld);
  await compat(row('client-cu_server-cu', pOldOnOld, 'v1', 'none', orderOldOnOld, inventoryV1), 0, 'client cũ (v1) × server cũ (inventory-v1): v1, none');

  // Phải FAIL: kỳ vọng sai thì compat.mjs thoát 1.
  await compat(row('am-tinh_sai-client', pOld, 'v2', 'none', orderOld, fakeInventory), 1, 'phải FAIL: client cũ nhưng kỳ vọng v2');
  await compat(row('am-tinh_server-cu-khong-co-so', pNewOnOld, 'v2', 'number', orderNewOnOld, inventoryV1), 1, 'phải FAIL: server cũ nhưng kỳ vọng available là số');
  await compat(row('am-tinh_server-moi-khong-absent', pNew, 'v2', 'absent', orderNew, fakeInventory), 1, 'phải FAIL: server mới nhưng kỳ vọng absent');
  await compat(row('am-tinh_client-cu-khong-co-field', pOld, 'v1', 'absent', orderOld, fakeInventory), 1, 'phải FAIL: client cũ không có field nhưng kỳ vọng absent');
  await compat([...row('am-tinh_order-khong-chay', pNowhere, 'v2', 'number', orderNew, fakeInventory), '--log-wait-ms', '300'], 1, 'phải FAIL: Order không chạy');
} catch (e) {
  record('khởi động bản giả và inventory-v1', false, e.message);
} finally {
  await Promise.all(procs.map(stop));
  if (!keep) rmSync(workDir, { recursive: true, force: true });
}

console.log('\n=== Kết quả');
for (const [name, pass] of results) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
const ok = results.length > 0 && results.every(([, pass]) => pass);
console.log(ok ? 'CHECK PASS' : 'CHECK FAIL');
if (keep) console.log(`Output compat.mjs và log: ${workDir}`);
process.exit(ok ? 0 : 1);
