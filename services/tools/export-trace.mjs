// Xuất BẰNG CHỨNG trace từ log thật: (1) trace N+1 của GraphQL trước/sau khi sửa,
// (2) call graph nội bộ của BFF (nếu BFF chạy). Cần các service đang chạy.
// Chạy: node tools/export-trace.mjs [--size S|L]  → results/evidence/trace-n1-<size>.md, call-graph-bff-<size>.md
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const size = process.argv.includes('--size') ? process.argv[process.argv.indexOf('--size') + 1] : 'S';
const root = new URL('../../', import.meta.url);
// Log thô do start-all.sh ghi vào LOG_DIR (mặc định services/logs); results/ chỉ chứa bằng chứng sinh ra.
const logDir = process.env.LOG_DIR ? resolve(process.env.LOG_DIR) : fileURLToPath(new URL('../logs/', import.meta.url));
const logs = (n) => join(logDir, `${n}.log`);
const outDir = new URL('results/evidence/', root);
mkdirSync(outDir, { recursive: true });

const P = { user: 4001, order: 4002, product: 4003, bff: 4004, graphql: 4005 };
const base = (s) => `http://localhost:${P[s]}`;
const up = (s) => fetch(base(s) + '/health', { signal: AbortSignal.timeout(2000) }).then((r) => r.ok).catch(() => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readLines = (n) => (existsSync(logs(n)) ? readFileSync(logs(n), 'utf8').split('\n').filter(Boolean) : []);
const forId = (n, id) => readLines(n).filter((l) => l.includes(`"${id}"`));
const resetAll = () => Promise.all(Object.keys(P).map((s) => fetch(base(s) + '/_metrics/reset', { method: 'POST' }).catch(() => {})));
const metrics = (s) => fetch(base(s) + '/_metrics').then((r) => r.json());
const short = (l) => (l.length > 190 ? l.slice(0, 187) + '...' : l);
const stamp = Date.now();

const WEB_Q = 'query Web($userId: Int!){ user(id:$userId){id name} orders(userId:$userId){ id status createdAt items{ productId quantity product{ name price } } } }';
const runGql = async (mode, id) => {
  await resetAll();
  await fetch(`${base('graphql')}/graphql?dataloader=${mode}`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': id }, body: JSON.stringify({ query: WEB_Q, variables: { userId: 1 } }) });
  await sleep(400);
  const m = await metrics('product');
  return { id, product: m, lines: forId('product', id) };
};

if (await up('graphql') && await up('product')) {
  const off = await runGql('off', `trace-n1-off-${size}-${stamp}`);
  const on = await runGql('on', `trace-n1-on-${size}-${stamp}`);
  const md = `# Trace N+1 của GraphQL (dữ liệu ${size})

Nguồn: log thật của Product Service (\`product.log\` trong thư mục log của start-all.sh), lọc theo \`requestId\` của **một** request GraphQL (query web: user, đơn, items, product). Tạo bởi \`node export-trace.mjs --size ${size}\`.

| Chế độ | requestId | Lời gọi tới Product (\`/_metrics\`) | Truy vấn DB của Product | Số dòng log Product theo requestId |
|---|---|---:|---:|---:|
| \`DATALOADER=off\` (N+1) | \`${off.id}\` | ${off.product.requests} | ${off.product.dbQueries} | ${off.lines.length} |
| \`DATALOADER=on\` (đã sửa) | \`${on.id}\` | ${on.product.requests} | ${on.product.dbQueries} | ${on.lines.length} |

**Đọc kết quả:** khi tắt DataLoader, mỗi item trong đơn kích hoạt một lời gọi riêng \`GET /products/:id\` (N+1). Khi bật, các id trong cùng một request được gom và loại trùng, chỉ còn một lời gọi \`GET /products?ids=...\`, nên số lời gọi tới Product không tăng theo số đơn.

## Trước khi sửa (3 dòng đầu / tổng ${off.lines.length})
\`\`\`
${off.lines.slice(0, 3).map(short).join('\n')}
\`\`\`

## Sau khi sửa (${on.lines.length} dòng)
\`\`\`
${on.lines.map(short).join('\n')}
\`\`\`
`;
  writeFileSync(new URL(`trace-n1-${size}.md`, outDir), md);
  console.log(`Đã ghi results/evidence/trace-n1-${size}.md  (off: ${off.lines.length} dòng, on: ${on.lines.length} dòng)`);
} else console.log('SKIP trace N+1: GraphQL hoặc Product không chạy');

if (await up('bff')) {
  const id = `callgraph-bff-${size}-${stamp}`;
  await resetAll();
  await fetch(`${base('bff')}/bff/web/dashboard?userId=1`, { headers: { 'x-request-id': id } });
  await sleep(400);
  const rows = ['bff', 'user', 'order', 'product'].flatMap((s) => forId(s, id).map((l) => ({ s, l })));
  const md = `# Call graph nội bộ của BFF (dữ liệu ${size})

Một request \`GET /bff/web/dashboard?userId=1\` với \`x-request-id: ${id}\`. Các dòng log cùng \`requestId\` ở từng service:

| Service | Số lời gọi |
|---|---:|
${['user', 'order', 'product'].map((s) => `| ${s} | ${rows.filter((r) => r.s === s).length} |`).join('\n')}

\`\`\`
${rows.map((r) => `[${r.s}] ${short(r.l)}`).join('\n')}
\`\`\`
`;
  writeFileSync(new URL(`call-graph-bff-${size}.md`, outDir), md);
  console.log(`Đã ghi results/evidence/call-graph-bff-${size}.md (${rows.length} dòng log)`);
} else console.log('SKIP call graph BFF: BFF chưa chạy');
