// Sinh mã TypeScript từ proto v1 và v2 vào generated/v1 và generated/v2 (hai thư mục riêng vì cùng package và
// tên service). Proto dùng chung ở services/proto/inventory/{v1,v2}; đặt PROTO_DIR (thư mục chứa v1/ và v2/) nếu khác.
// Tìm protoc và plugin bằng require.resolve nên chạy được cả khi npm workspaces đưa gói lên thư mục gốc.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(pkgDir, 'package.json'));
const protoBase = resolve(pkgDir, process.env.PROTO_DIR ?? '../../proto/inventory');
const protoc = require.resolve('grpc-tools/bin/protoc.js');
const plugin = join(dirname(require.resolve('ts-proto/package.json')), 'protoc-gen-ts_proto');
const show = (p) => relative(process.cwd(), p) || '.';

for (const version of ['v1', 'v2']) {
  const protoDir = join(protoBase, version);
  const outDir = join(pkgDir, 'generated', version);
  mkdirSync(outDir, { recursive: true });
  console.log(`[codegen] ${version}: ${show(join(protoDir, 'inventory.proto'))} -> ${show(outDir)}`);
  const r = spawnSync(process.execPath, [
    protoc, `--plugin=protoc-gen-ts_proto=${plugin}`, `--ts_proto_out=${outDir}`,
    '--ts_proto_opt=outputServices=grpc-js,esModuleInterop=true', '-I', protoDir, join(protoDir, 'inventory.proto'),
  ], { encoding: 'utf8' });
  process.stdout.write(r.stdout); process.stderr.write(r.stderr);
  if (r.status !== 0) { console.error(`[codegen] ${version} failed (exit ${r.status})`); process.exit(r.status ?? 1); }
}
console.log('[codegen] Codegen completed successfully.');
