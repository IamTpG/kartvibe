// Sinh lại hợp đồng đã công bố và kiểu cho bên tiêu thụ; --check chỉ so với bản đã commit (không ghi).
//   1. <service>/openapi.json  ← <service>/src/contract.ts (Zod → OpenAPI 3.1), mỗi service sở hữu hợp đồng của nó.
//   2. <consumer>/src/generated/<provider>.d.ts  ← <provider>/openapi.json (openapi-typescript), cho bff và graphql.
// Chạy: npm run contracts        (ghi)
//       npm run contracts:check  (báo lệch nếu mã, spec hoặc kiểu đã commit không khớp nhau; thoát mã 1)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');
const providers = ['user', 'order', 'product', 'bff', 'graphql'];
const consumers = { bff: ['user', 'order', 'product'], graphql: ['user', 'order', 'product'] };
const BANNER = (provider) => `// KHÔNG SỬA TAY. Sinh từ ${provider}/openapi.json bằng \`npm run contracts\` (services/).\n// Kiểu của hợp đồng mà ${provider} công bố; bên tiêu thụ không import mã của ${provider}.\n\n`;

const tmp = check ? mkdtempSync(join(tmpdir(), 'contracts-')) : null;
const problems = [];

function emit(target, content) {
  const rel = target.replace(root, '');
  if (check) {
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current !== content) problems.push(rel);
  } else {
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
    console.log(`ghi ${rel}`);
  }
}

const specPath = {};
for (const svc of providers) {
  const out = check ? join(tmp, `${svc}.openapi.json`) : join(root, svc, 'openapi.json');
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/openapi.ts', out], { cwd: join(root, svc), encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
  specPath[svc] = out;
  if (check) emit(join(root, svc, 'openapi.json'), readFileSync(out, 'utf8'));
}

for (const [consumer, list] of Object.entries(consumers)) {
  for (const provider of list) {
    const ast = await openapiTS(pathToFileURL(specPath[provider]));
    emit(join(root, consumer, 'src', 'generated', `${provider}.d.ts`), BANNER(provider) + astToString(ast));
  }
}

if (tmp) rmSync(tmp, { recursive: true, force: true });
if (check) {
  if (problems.length) {
    console.error('Hợp đồng đã commit lệch với mã. Chạy `npm run contracts` rồi xem lại diff:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log('Hợp đồng khớp mã: openapi.json và kiểu sinh ra đều đúng.');
}
