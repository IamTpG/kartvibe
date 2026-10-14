// npm run check: build (tsc), mã sinh ra đã đóng băng và là mã v1, test chạy server thật.
// Thoát 0 khi mọi bước đạt, 1 khi có bước không đạt.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const results = [];

function step(name, fn) {
  console.log(`\n=== ${name}`);
  let pass;
  try { pass = fn(); } catch (e) { console.log(e.message); pass = false; }
  results.push([name, pass]);
}
const run = (script) => spawnSync(npm, ['run', '--silent', script], { cwd: pkgDir, stdio: 'inherit' }).status === 0;

step('build (tsc --noEmit)', () => run('build'));
step('verify-frozen', () => run('verify-frozen'));
step('mã sinh ra không có available (chỉ proto v1)', () => {
  const src = readFileSync(resolve(pkgDir, 'src/generated/inventory.ts'), 'utf8');
  const hits = src.split('\n').filter((l) => /available/i.test(l));
  console.log(hits.length ? hits.join('\n') : 'không có dòng nào chứa "available"');
  return hits.length === 0;
});
step('test (server thật, client v1, đọc byte reply)', () => run('test'));

console.log('\n=== Kết quả');
for (const [name, pass] of results) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
const ok = results.every(([, pass]) => pass);
console.log(ok ? 'CHECK PASS' : 'CHECK FAIL');
process.exit(ok ? 0 : 1);
