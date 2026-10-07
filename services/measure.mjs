// Đo luồng "ngây thơ" của dashboard (tuần tự: user → orders → từng item một lời gọi product)
// và in 4 chỉ số: request từ "browser", truy vấn DB, lần gọi service, thời gian.
// Dùng:  node measure.mjs [--runs 5] [--user-id 1] [--mode naive]
// Thêm cách gọi mới (ví dụ BFF): thêm một hàm vào `modes` bên dưới.
const USER = process.env.USER_URL ?? 'http://localhost:4001';
const ORDER = process.env.ORDER_URL ?? 'http://localhost:4002';
const PRODUCT = process.env.PRODUCT_URL ?? 'http://localhost:4003';
const SERVICES = { user: USER, order: ORDER, product: PRODUCT };

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const runs = Number(opt('runs', 5));
const userId = Number(opt('user-id', 1));
const mode = opt('mode', 'naive');

/** Mỗi hàm trả về { browserRequests } sau khi thực hiện toàn bộ luồng. */
const modes = {
  async naive() {
    let browserRequests = 0;
    const get = async (url) => {
      browserRequests++;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return res.json();
    };
    await get(`${USER}/users/${userId}`);
    const { data: orders } = await get(`${ORDER}/orders?userId=${userId}`);
    for (const order of orders) {
      for (const item of order.items) await get(`${PRODUCT}/products/${item.productId}`);
    }
    return { browserRequests };
  },
};
if (!modes[mode]) throw new Error(`mode không hợp lệ: ${mode} (có: ${Object.keys(modes).join(', ')})`);

const post = (url) => fetch(url, { method: 'POST' }).then((r) => r.json());
const get = (url) => fetch(url).then((r) => r.json());

async function resetAll() {
  await Promise.all(Object.values(SERVICES).map((u) => post(`${u}/_metrics/reset`)));
}
async function readAll() {
  const m = await Promise.all(Object.values(SERVICES).map((u) => get(`${u}/_metrics`)));
  return {
    dbQueries: m.reduce((s, x) => s + x.dbQueries, 0),
    serviceCalls: m.reduce((s, x) => s + x.requests, 0),
  };
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const results = [];
for (let i = 0; i < runs; i++) {
  await resetAll();
  const t0 = performance.now();
  const { browserRequests } = await modes[mode]();
  const ms = Math.round(performance.now() - t0);
  results.push({ browserRequests, ...(await readAll()), ms });
}

console.log(`mode=${mode}, user=${userId}, runs=${runs}`);
console.table(results.map((r, i) => ({ run: i + 1, ...r })));
const keys = ['browserRequests', 'dbQueries', 'serviceCalls', 'ms'];
console.log('Trung vị:');
console.table([Object.fromEntries(keys.map((k) => [k, median(results.map((r) => r[k]))]))]);
