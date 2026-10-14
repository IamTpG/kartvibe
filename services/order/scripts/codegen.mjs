// Sinh mã TypeScript từ proto v2 vào src/generated/ (mã sinh ra được commit).
// Proto dùng chung nằm ở services/proto/inventory/v2; đặt PROTO_DIR nếu nó ở chỗ khác (thư mục chứa inventory.proto).
// Tìm protoc và plugin bằng require.resolve nên chạy được cả khi npm workspaces đưa gói lên thư mục gốc.
// Cách dùng: npm run codegen
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(pkgDir, 'package.json'));

const outDir = resolve(pkgDir, 'src/generated');
const protoDir = resolve(pkgDir, process.env.PROTO_DIR ?? '../proto/inventory/v2');

const protoc = require.resolve('grpc-tools/bin/protoc.js');
const plugin = join(dirname(require.resolve('ts-proto/package.json')), 'protoc-gen-ts_proto');

mkdirSync(outDir, { recursive: true });
const args = [
  protoc,
  `--plugin=protoc-gen-ts_proto=${plugin}`,
  `--ts_proto_out=${outDir}`,
  '--ts_proto_opt=outputServices=grpc-js,esModuleInterop=true',
  '-I', protoDir,
  join(protoDir, 'inventory.proto'),
];
const show = (p) => relative(process.cwd(), p) || '.';
console.log(`Proto: ${show(join(protoDir, 'inventory.proto'))}`);
console.log(`Output: ${show(outDir)}`);
const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
process.stdout.write(r.stdout);
process.stderr.write(r.stderr);
if (r.status !== 0) {
  console.error(`Codegen failed (exit ${r.status})`);
  process.exit(r.status ?? 1);
}
console.log('Codegen completed successfully.');
