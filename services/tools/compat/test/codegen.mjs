// Sinh mã cho bản giả từ proto v1 và v2 vào test/generated/v1, test/generated/v2 (mã sinh ra được commit).
// Proto dùng chung ở services/proto/inventory (W5); đặt PROTO_DIR nếu nó ở chỗ khác.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(pkgDir, 'package.json'));
const protoRoot = resolve(pkgDir, process.env.PROTO_DIR ?? '../../proto/inventory');
const protoc = require.resolve('grpc-tools/bin/protoc.js');
const plugin = join(dirname(require.resolve('ts-proto/package.json')), 'protoc-gen-ts_proto');
const show = (p) => relative(process.cwd(), p) || '.';

let status = 0;
for (const v of ['v1', 'v2']) {
  const outDir = join(pkgDir, 'test/generated', v);
  const protoDir = join(protoRoot, v);
  mkdirSync(outDir, { recursive: true });
  const opt = '--ts_proto_opt=outputServices=grpc-js,esModuleInterop=true';
  const args = [protoc, `--plugin=protoc-gen-ts_proto=${plugin}`, `--ts_proto_out=${outDir}`, opt, '-I', protoDir, join(protoDir, 'inventory.proto')];
  console.log(`$ node ${show(protoc)} --plugin=protoc-gen-ts_proto=${show(plugin)} --ts_proto_out=${show(outDir)} ${opt} -I ${show(protoDir)} ${show(args[6])}`);
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  console.log(`[exit ${r.status}]`);
  status ||= r.status ?? 1;
}
process.exit(status);
