#!/usr/bin/env node
// Kiểm "client cũ/mới × server cũ/mới" qua đúng flow POST /orders và log (W3, D10, D12).
//
//   node compat.mjs --order <url> --label <tên> --expect-client <v1|v2> \
//        --expect-available <number|absent|none> --order-log <file> --inventory-log <file>
//
// Tùy chọn thêm: --evidence-dir <thư mục> (mặc định evidence/ cạnh tệp này),
//                --log-wait-ms <ms> (chờ log được ghi, mặc định 5000), --http-timeout-ms <ms> (mặc định 5000).
// Thoát 0 khi mọi điều kiện đạt, 1 khi có điều kiện không đạt, 2 khi sai cách dùng.
// Không phụ thuộc gói npm nào: chỉ dùng Node ≥ 22 (fetch, crypto, fs).
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = `Cách dùng: node compat.mjs --order <url> --label <tên> --expect-client <v1|v2> \\
  --expect-available <number|absent|none> --order-log <file> --inventory-log <file> \\
  [--evidence-dir <thư mục>] [--log-wait-ms <ms>] [--http-timeout-ms <ms>]`;

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--') || argv[i + 1] === undefined) throw new Error(`tham số không hợp lệ: ${key}`);
    opts[key.slice(2)] = argv[++i];
  }
  for (const k of ['order', 'label', 'expect-client', 'expect-available', 'order-log', 'inventory-log']) {
    if (!opts[k]) throw new Error(`thiếu --${k}`);
  }
  if (!['v1', 'v2'].includes(opts['expect-client'])) throw new Error('--expect-client phải là v1 hoặc v2');
  if (!['number', 'absent', 'none'].includes(opts['expect-available'])) {
    throw new Error('--expect-available phải là number, absent hoặc none');
  }
  return opts;
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(`${e.message}\n${USAGE}`);
  process.exit(2);
}

const evidenceDir = resolve(opts['evidence-dir'] ?? join(dirname(fileURLToPath(import.meta.url)), 'evidence'));
const logWaitMs = Number(opts['log-wait-ms'] ?? 5000);
const httpTimeoutMs = Number(opts['http-timeout-ms'] ?? 5000);

const out = [];
const say = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  out.push(line);
  console.log(line);
};
const results = [];
const check = (id, name, pass, detail) => {
  results.push(pass);
  say(`${pass ? 'PASS' : 'FAIL'} (${id}) ${name}: ${detail}`);
};

// Đọc các dòng JSON của một tệp log; bỏ qua dòng không phải JSON (ví dụ banner của npm).
function readLog(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { return { error: e.message, lines: [] }; }
  const lines = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    try { lines.push(JSON.parse(raw)); } catch { /* không phải JSON */ }
  }
  return { lines };
}

// Log do tiến trình khác ghi nên có thể trễ một chút: đọc lại cho tới khi thấy hoặc hết giờ.
async function findInLog(file, match) {
  const deadline = Date.now() + logWaitMs;
  for (;;) {
    const { error, lines } = readLog(file);
    const found = lines.filter(match);
    if (found.length || Date.now() >= deadline) return { error, found };
    await new Promise((r) => setTimeout(r, 100));
  }
}

const describeAvailable = (line) => ('available' in line ? JSON.stringify(line.available) : 'không có field');

const requestId = `compat-${opts.label.replace(/[^\w.-]+/g, '_')}-${randomUUID()}`;
const orderUrl = new URL('/orders', opts.order).toString();
const body = { sku: 'SKU-OK', quantity: 2 };

say(`compat.mjs label=${opts.label}`);
say(`kỳ vọng: clientVersion=${opts['expect-client']}, available=${opts['expect-available']}`);
say(`order-log=${resolve(opts['order-log'])}`);
say(`inventory-log=${resolve(opts['inventory-log'])}`);

// (a) gọi POST /orders với x-request-id tự sinh
say(`(a) POST ${orderUrl} x-request-id=${requestId} body=${JSON.stringify(body)}`);
let status;
let text = '';
try {
  const res = await fetch(orderUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(httpTimeoutMs),
  });
  status = res.status;
  text = await res.text();
  say(`    response ${status} ${text}`);
} catch (e) {
  say(`    không gọi được Order: ${e.cause?.code ?? e.name}: ${e.cause?.message ?? e.message}`);
}

// (b) response 201
check('b', 'POST /orders trả 201', status === 201, `thực tế ${status ?? 'không có response'}`);

// (c) log Inventory: dòng có đúng requestId, clientVersion bằng --expect-client
const inv = await findInLog(opts['inventory-log'], (l) => l.requestId === requestId && (l.direction ?? 'inbound') === 'inbound');
if (inv.error) say(`    không đọc được inventory-log: ${inv.error}`);
for (const l of inv.found) say(`    inventory-log: ${JSON.stringify(l)}`);
const invLine = inv.found[0];
check('c', `log Inventory có requestId và clientVersion = ${opts['expect-client']}`,
  invLine?.clientVersion === opts['expect-client'],
  invLine ? `clientVersion=${JSON.stringify(invLine.clientVersion)} (${inv.found.length} dòng khớp)` : 'không thấy dòng nào có requestId này');

// (d) log Order: dòng outbound có đúng requestId, kiểm available
const ord = await findInLog(opts['order-log'], (l) => l.requestId === requestId && l.direction === 'outbound');
if (ord.error) say(`    không đọc được order-log: ${ord.error}`);
for (const l of ord.found) say(`    order-log: ${JSON.stringify(l)}`);
const ordLine = ord.found[0];
const availableOk = {
  number: (l) => typeof l.available === 'number' && Number.isInteger(l.available),
  absent: (l) => l.available === 'absent',
  none: (l) => !('available' in l),
}[opts['expect-available']];
check('d', `log Order (outbound) có requestId và available = ${opts['expect-available']}`,
  Boolean(ordLine) && availableOk(ordLine),
  ordLine ? `available: ${describeAvailable(ordLine)}; protocol=${ordLine.protocol}, grpcStatus=${ordLine.grpcStatus ?? '-'}` : 'không thấy dòng outbound nào có requestId này');

// (e) tổng kết và lưu nguyên văn
const passed = results.filter(Boolean).length;
const ok = passed === results.length;
say(`KẾT QUẢ ${ok ? 'PASS' : 'FAIL'} (${passed}/${results.length} điều kiện đạt) label=${opts.label}`);

mkdirSync(evidenceDir, { recursive: true });
const file = join(evidenceDir, `compat-${new Date().toISOString().replace(/[:.]/g, '-')}-${opts.label.replace(/[^\w.-]+/g, '_')}.txt`);
writeFileSync(file, out.join('\n') + '\n');
console.log(`(đã lưu ${file})`);
process.exit(ok ? 0 : 1);
