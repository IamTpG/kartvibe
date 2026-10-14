// Đóng băng server cũ: FROZEN.sha256 ghi sha256 của proto v1 và mã sinh từ nó.
//   npm run verify-frozen   kiểm mã sinh ra không đổi; nếu tìm thấy proto v1 thì kiểm cả proto và sinh lại để so.
//   npm run freeze          ghi lại FROZEN.sha256 (chỉ khi cố ý sinh lại mã).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frozenFile = join(pkgDir, 'FROZEN.sha256');
const protoFile = resolve(pkgDir, process.env.PROTO_DIR ?? '../proto/inventory', 'v1', 'inventory.proto');
const generated = join(pkgDir, 'src/generated/inventory.ts');
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

if (process.argv.includes('--write')) {
  const lines = [`${sha(protoFile)}  proto/inventory/v1/inventory.proto`, `${sha(generated)}  src/generated/inventory.ts`];
  writeFileSync(frozenFile, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  process.exit(0);
}

const expected = Object.fromEntries(
  readFileSync(frozenFile, 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, f]) => [f, h]),
);
let ok = true;
const report = (pass, msg) => { console.log(`${pass ? 'PASS' : 'FAIL'} ${msg}`); ok &&= pass; };

report(sha(generated) === expected['src/generated/inventory.ts'], 'src/generated/inventory.ts khớp FROZEN.sha256');
if (existsSync(protoFile)) {
  report(sha(protoFile) === expected['proto/inventory/v1/inventory.proto'], `${protoFile} khớp FROZEN.sha256`);
  const tmp = mkdtempSync(join(tmpdir(), 'inventory-v1-codegen-'));
  const r = spawnSync(process.execPath, [join(pkgDir, 'scripts/codegen.mjs'), '--out', tmp], { encoding: 'utf8' });
  report(r.status === 0 && sha(join(tmp, 'inventory.ts')) === sha(generated), 'sinh lại từ proto v1 cho đúng mã đã commit');
  rmSync(tmp, { recursive: true, force: true });
} else {
  console.log(`SKIP không thấy proto v1 ở ${protoFile} (đặt PROTO_DIR); chỉ kiểm mã đã commit`);
}
process.exit(ok ? 0 : 1);
