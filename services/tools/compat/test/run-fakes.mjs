// Chạy bộ bản giả trên cổng cố định để thử UI demo (order-compare.html) và compat.mjs bằng tay:
//   inventory (giả, REST 4006 + gRPC v2 4007), order 4002 (REST), order-grpc 4012 (gRPC, client v2),
//   order-grpc-v1 4022 (gRPC, client v1). Tất cả bật ENABLE_TEST_HOOKS=1.
// Cách dùng: npm run fakes [-- --log-dir <thư mục>] [-- --no-4022]. Log: logs/<tên>.log. Ctrl+C để dừng.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop, waitStarted } from './procs.mjs';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.indexOf('--log-dir');
const logDir = resolve(pkgDir, arg > 0 ? process.argv[arg + 1] : 'logs');
mkdirSync(logDir, { recursive: true });
const hooks = { ENABLE_TEST_HOOKS: '1' };

const specs = [
  { name: 'inventory', script: 'test/fake-inventory.ts', env: { PORT: '4006', GRPC_PORT: '4007', ...hooks } },
  { name: 'order', script: 'test/fake-order.ts', env: { PORT: '4002', INVENTORY_PROTOCOL: 'rest', ...hooks } },
  { name: 'order-grpc', script: 'test/fake-order.ts', env: { PORT: '4012', INVENTORY_PROTOCOL: 'grpc', CLIENT_PROTO: 'v2', ...hooks } },
  { name: 'order-grpc-v1', script: 'test/fake-order.ts', env: { PORT: '4022', INVENTORY_PROTOCOL: 'grpc', CLIENT_PROTO: 'v1', ...hooks } },
].filter((s) => !(process.argv.includes('--no-4022') && s.name === 'order-grpc-v1'));

const procs = specs.map((s) => start({ ...s, cwd: pkgDir, logDir }));
const shutdown = async () => { await Promise.all(procs.map(stop)); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
try {
  await Promise.all(procs.map((p) => waitStarted(p)));
} catch (e) {
  console.error(e.message);
  await shutdown();
}
console.log(`Bản giả đang chạy: ${specs.map((s) => `${s.name}:${s.env.PORT}`).join(', ')} (gRPC Inventory 4007)`);
console.log(`Log: ${logDir}/<tên>.log. Ctrl+C để dừng.`);
