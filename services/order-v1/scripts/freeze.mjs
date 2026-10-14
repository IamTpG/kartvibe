// Đóng băng client cũ: FROZEN.sha256 ghi sha256 của proto v1, mã sinh từ nó, và các file khác `order` (client gRPC, index.ts),
// cùng phiên bản @grpc/grpc-js đang cài. Dựng order-v1 một lần rồi KHÔNG build lại; đây là bằng chứng "chưa build lại".
//   npm run verify-frozen   kiểm các hash còn khớp, proto bản sao khớp proto chung (nếu có), sinh lại từ proto v1 ra đúng mã đã
//                           commit, và phiên bản @grpc/grpc-js không đổi.
//   npm run freeze          ghi lại FROZEN.sha256 (chỉ khi cố ý dựng lại order-v1).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(pkgDir, 'package.json'));
const frozenFile = join(pkgDir, 'FROZEN.sha256');
const sharedProto = resolve(pkgDir, '../proto/inventory/v1/inventory.proto');
const FILES = [
  'proto/inventory/v1/inventory.proto',
  'src/generated/inventory.ts',
  'src/inventory/grpc-client.ts',
  'src/index.ts',
];
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const grpcVersion = () => JSON.parse(readFileSync(require.resolve('@grpc/grpc-js/package.json'), 'utf8')).version;

if (process.argv.includes('--write')) {
  const lines = [...FILES.map((f) => `${sha(join(pkgDir, f))}  ${f}`), `${grpcVersion()}  @grpc/grpc-js`];
  writeFileSync(frozenFile, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  process.exit(0);
}

const expected = Object.fromEntries(
  readFileSync(frozenFile, 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, f]) => [f, h]),
);
let ok = true;
const report = (pass, msg) => { console.log(`${pass ? 'PASS' : 'FAIL'} ${msg}`); ok &&= pass; };

for (const f of FILES) report(sha(join(pkgDir, f)) === expected[f], `${f} khớp FROZEN.sha256`);
report(grpcVersion() === expected['@grpc/grpc-js'], `@grpc/grpc-js ${grpcVersion()} khớp phiên bản đã đóng băng (${expected['@grpc/grpc-js']})`);
if (existsSync(sharedProto)) {
  report(sha(sharedProto) === sha(join(pkgDir, FILES[0])), 'proto v1 bản sao trong order-v1 trùng services/proto/inventory/v1');
} else {
  console.log(`SKIP không thấy proto chung ở ${sharedProto}`);
}
const tmp = mkdtempSync(join(tmpdir(), 'order-v1-codegen-'));
const r = spawnSync(process.execPath, [join(pkgDir, 'scripts/codegen.mjs'), '--out', tmp], { encoding: 'utf8', cwd: pkgDir });
report(r.status === 0 && sha(join(tmp, 'inventory.ts')) === sha(join(pkgDir, 'src/generated/inventory.ts')), 'sinh lại từ proto v1 cho đúng mã đã commit');
rmSync(tmp, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
