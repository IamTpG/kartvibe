// Sinh mã TypeScript từ proto v1 (bản sao đóng băng trong proto/inventory/v1) vào src/generated/.
// Đây là client CŨ: dùng để dựng order-v1 một lần rồi đóng băng. Không sinh lại sau khi đã đóng băng (xem FROZEN.sha256).
// Cách dùng: npm run codegen [-- --out <thư-mục>]   (PROTO_DIR nếu proto v1 ở chỗ khác)
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(pkgDir, 'package.json'));
const outArg = process.argv.indexOf('--out');
const outDir = resolve(pkgDir, outArg > 0 ? process.argv[outArg + 1] : 'src/generated');
const protoDir = resolve(pkgDir, process.env.PROTO_DIR ?? 'proto/inventory/v1');
const protoc = require.resolve('grpc-tools/bin/protoc.js');
const plugin = join(dirname(require.resolve('ts-proto/package.json')), 'protoc-gen-ts_proto');

mkdirSync(outDir, { recursive: true });
const show = (p) => relative(process.cwd(), p) || '.';
console.log(`Proto v1: ${show(join(protoDir, 'inventory.proto'))}\nOutput: ${show(outDir)}`);
const r = spawnSync(process.execPath, [
  protoc, `--plugin=protoc-gen-ts_proto=${plugin}`, `--ts_proto_out=${outDir}`,
  '--ts_proto_opt=outputServices=grpc-js,esModuleInterop=true', '-I', protoDir, join(protoDir, 'inventory.proto'),
], { encoding: 'utf8' });
process.stdout.write(r.stdout); process.stderr.write(r.stderr);
if (r.status !== 0) { console.error(`Codegen failed (exit ${r.status})`); process.exit(r.status ?? 1); }
console.log('Codegen completed successfully.');
