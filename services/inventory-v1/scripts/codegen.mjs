// Sinh mã TypeScript từ proto v1 vào src/generated/ (mã sinh ra được commit).
// Proto dùng chung nằm ở services/proto/inventory/v1 (W5); đặt PROTO_DIR nếu nó ở chỗ khác.
// Cách dùng: npm run codegen [-- --out <thư-mục>]
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(pkgDir, 'package.json'));

const outArg = process.argv.indexOf('--out');
const outDir = resolve(pkgDir, outArg > 0 ? process.argv[outArg + 1] : 'src/generated');
const protoDir = resolve(pkgDir, process.env.PROTO_DIR ?? '../proto/inventory', 'v1');

// Tìm bin qua require.resolve để chạy được cả khi cài riêng lẫn khi npm workspaces đưa gói lên thư mục gốc.
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
console.log(`$ node ${[show(protoc), `--plugin=protoc-gen-ts_proto=${show(plugin)}`, `--ts_proto_out=${show(outDir)}`, args[3], '-I', show(protoDir), show(args[6])].join(' ')}`);
const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
process.stdout.write(r.stdout);
process.stderr.write(r.stderr);
console.log(`[exit ${r.status}]`);
process.exit(r.status ?? 1);
