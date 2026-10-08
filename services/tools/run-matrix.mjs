// Chạy ma trận đo: 4 biến thể × 2 client × 2 kích thước, mỗi cấu hình 1 lạnh + 5 ấm, bằng TRÌNH DUYỆT THẬT.
// Mỗi cấu hình: (đổi seed nếu đổi kích thước) → khởi động lại lạnh → mở trang đo trong trình duyệt → chờ 6 bản ghi về bộ thu.
// Cần: Docker/Postgres đang chạy; KHÔNG làm việc khác trên máy trong lúc đo; cửa sổ trình duyệt phải ở nền trước.
// Dùng: node tools/run-matrix.mjs [--sizes S,L] [--variants baseline,bff,graphql-naive,graphql-fixed] [--clients web,mobile]
//                           [--clean] [--dry] [--timeout 240] [--browser-cmd "xdg-open"] [--raw-dir results/raw] [--no-summary]
import { spawnSync, spawn } from 'node:child_process';
import net from 'node:net';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const svc = resolve(here, '..');        // thư mục services (nơi chạy npm run seed, start-all...)
const repo = resolve(here, '../..');   // gốc repo (results/...)
const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);
const flag = (n) => process.argv.includes(`--${n}`);
const list = (n, d) => arg(n, d).split(',').map((s) => s.trim()).filter(Boolean);

const sizes = list('sizes', 'S,L');
const variants = list('variants', 'baseline,bff,graphql-naive,graphql-fixed');
const clients = list('clients', 'web,mobile');
const timeoutMs = Number(arg('timeout', 240)) * 1000;
const browser = arg('browser-cmd', process.platform === 'darwin' ? 'open' : 'xdg-open');
const rawDir = resolve(repo, arg('raw-dir', 'results/raw'));
const WARM = 5;
const page = { web: 'dashboard.html', mobile: 'mobile.html' };

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: svc, encoding: 'utf8', ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = () => (existsSync(rawDir) ? readdirSync(rawDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(rawDir, f), 'utf8'))) : []);
const configRows = (c, cold) => rows().filter((r) => r.variant === c.variant && r.client === c.client && r.size === c.size && (r.mode === 'warm' || r.coldSession === cold));

// Bộ thu kết quả (cổng 4010) không chạy cùng start-all.sh: matrix tự khởi động nó (ghi đúng vào rawDir) và tắt khi xong.
const portOpen = (port) => new Promise((ok) => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); ok(true); }); s.once('error', () => ok(false)); });
let collector = null;
async function ensureCollector() {
  if (await portOpen(4010)) { console.log('Bộ thu kết quả đã chạy sẵn ở :4010 (dùng thư mục kết quả của nó, thường là results/raw).'); return; }
  collector = spawn('node', ['tools/measure.mjs', 'collect', rawDir], { cwd: svc, stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await portOpen(4010)); i++) await sleep(250);
  if (!(await portOpen(4010))) { console.error('Không khởi động được bộ thu kết quả ở :4010'); process.exit(1); }
  console.log(`Đã khởi động bộ thu kết quả ở :4010 (ghi vào ${rawDir}).`);
}
// Trang web (cổng 4000) chạy riêng khỏi các service: nếu chưa chạy, matrix tự bật nó và tắt khi xong.
let web = null;
async function ensureWeb() {
  if (await portOpen(4000)) { console.log('Web đã chạy sẵn ở :4000.'); return; }
  web = spawn('node', ['server.mjs'], { cwd: resolve(svc, '../web'), stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await portOpen(4000)); i++) await sleep(250);
  if (!(await portOpen(4000))) { console.error('Không khởi động được web ở :4000'); process.exit(1); }
  console.log('Đã khởi động web ở :4000.');
}
process.on('exit', () => { collector?.kill(); web?.kill(); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

const plan = [];
for (const size of sizes) for (const variant of variants) for (const client of clients) plan.push({ size, variant, client });
console.log(`Kế hoạch: ${plan.length} cấu hình × (1 lạnh + ${WARM} ấm). Thư mục kết quả: ${rawDir}`);
if (flag('dry')) { for (const c of plan) console.log(`  ${c.size} ${c.variant} ${c.client}`); process.exit(0); }

const existing = rows();
if (existing.length) {
  if (!flag('clean')) { console.error(`Đã có ${existing.length} bản ghi trong ${rawDir}. Chạy lại sẽ trùng bản ghi. Thêm --clean để chuyển chúng sang thư mục sao lưu.`); process.exit(2); }
  const backup = `${rawDir}-cu-${Date.now()}`;
  renameSync(rawDir, backup); console.log(`Đã chuyển kết quả cũ sang ${backup}`);
}
mkdirSync(rawDir, { recursive: true });

await ensureCollector();
await ensureWeb();
let currentSize = null;
for (const [i, c] of plan.entries()) {
  console.log(`\n[${i + 1}/${plan.length}] ${c.size} / ${c.variant} / ${c.client}`);
  if (c.size !== currentSize) {
    console.log(`  nạp dữ liệu ${c.size}...`);
    const seed = sh('npm', ['run', c.size === 'S' ? 'seed:s' : 'seed:l', '--silent']);
    if (seed.status !== 0) { console.error(seed.stdout + seed.stderr); process.exit(1); }
    currentSize = c.size;
  }
  const mode = c.variant === 'graphql-naive' ? 'off' : 'on';
  const rs = sh('bash', ['tools/restart-cold.sh', mode]);
  if (rs.status !== 0) { console.error(rs.stdout + rs.stderr); process.exit(1); }
  const cold = JSON.parse(readFileSync(join(repo, 'results/cold-session.json'), 'utf8')).coldSession;
  const url = `http://localhost:4000/${page[c.client]}?series=1&variant=${c.variant}&size=${c.size}&cold=${encodeURIComponent(cold)}`;
  console.log(`  mở: ${url}`);
  spawn(browser, [url], { detached: true, stdio: 'ignore' }).unref();
  const t0 = Date.now();
  while (configRows(c, cold).length < 1 + WARM) {
    if (Date.now() - t0 > timeoutMs) {
      console.error(`  QUÁ THỜI GIAN: mới có ${configRows(c, cold).length}/${1 + WARM} bản ghi. Tab trình duyệt có ở nền trước không? Xem thông báo lỗi trên trang.`);
      process.exit(3);
    }
    await sleep(1000);
  }
  const got = configRows(c, cold);
  const warm = got.filter((r) => r.mode === 'warm').map((r) => Math.round(r.completeMs));
  console.log(`  xong: ${got.length} bản ghi; ấm (ms): ${warm.join(', ')}; một phần: ${got.filter((r) => r.partial).length}`);
}

console.log('\nĐã đo xong ma trận.');
if (!flag('no-summary')) {
  const s = sh('node', ['tools/measure.mjs', 'summary', rawDir]);
  console.log(s.stdout.split('\n').filter((l) => /"complete"|missing/.test(l)).join('\n') || '(đã tạo summary.json)');
  const r = sh('node', ['tools/report.mjs', rawDir]); console.log(r.stdout.trim());
}
// Thoát hẳn: collector và web (nếu do matrix khởi động) sẽ bị tắt ở sự kiện 'exit'.
process.exit(0);
