// Đối chiếu dữ liệu: baseline (ghép ở client) = BFF = GraphQL, cho cả web và mobile.
// Tiêu chí đạt của đề: "Baseline, BFF và GraphQL trả cùng dữ liệu dashboard cho cùng người dùng;
// response mobile chỉ chứa các trường mobile cần." Chạy: node tools/check-equality.mjs [--user 1]
// BFF/GraphQL chưa chạy thì bỏ qua phần của chúng.
const userId = Number(process.argv.includes('--user') ? process.argv[process.argv.indexOf('--user') + 1] : 1);
const P = { user: 4001, order: 4002, product: 4003, bff: 4004, graphql: 4005 };
const url = (s, path) => `http://localhost:${P[s]}${path}`;
const up = async (s) => fetch(url(s, '/health'), { signal: AbortSignal.timeout(2000) }).then((r) => r.ok).catch(() => false);
const json = (u, init) => fetch(u, init).then((r) => r.json());

let failed = 0;
const ok = (c, label, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${!c && extra ? '  → ' + extra : ''}`); if (!c) failed++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keys = (o) => Object.keys(o).sort().join(',');

// 1. Baseline: ghép tuần tự như trang web (mỗi item một lời gọi Product, không loại trùng).
let calls = 0;
const get = (s, path) => { calls++; return json(url(s, path)); };
const user = await get('user', `/users/${userId}`);
const { data: orders } = await get('order', `/orders?userId=${userId}`);
const productByItem = new Map();
for (const o of orders) for (const it of o.items) productByItem.set(`${o.id}:${it.productId}`, await get('product', `/products/${it.productId}`));

const baseWeb = {
  user: { id: user.id, name: user.name },
  orders: orders.map((o) => ({ id: o.id, status: o.status, createdAt: o.createdAt,
    items: o.items.map((it) => { const p = productByItem.get(`${o.id}:${it.productId}`);
      return { productId: it.productId, quantity: it.quantity, product: { name: p.name, price: p.price } }; }) })),
};
const baseMobile = { orders: orders.map((o) => ({ id: o.id, status: o.status,
  items: o.items.map((it) => { const p = productByItem.get(`${o.id}:${it.productId}`); return { product: { name: p.name, thumbnail: p.thumbnail } }; }) })) };
console.log(`== Đối chiếu dữ liệu (người dùng ${userId}): ${orders.length} đơn, baseline dùng ${calls} lời gọi ==`);
ok(baseWeb.orders.length > 0, 'baseline có dữ liệu');

const strip = ({ partial, errors, ...rest }) => rest;
const WEB_Q = 'query Web($userId: Int!){ user(id:$userId){id name} orders(userId:$userId){ id status createdAt items{ productId quantity product{ name price } } } }';
const MOB_Q = 'query Mobile($userId: Int!){ orders(userId:$userId){ id status items{ product{ name thumbnail } } } }';
const gql = (q) => json(url('graphql', '/graphql'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q, variables: { userId } }) });

// 2. Mobile chỉ được có đúng các trường mobile (kiểm tra khóa ở mọi mức).
const mobileKeysOk = (m) => keys(m) === 'orders' && m.orders.every((o) => keys(o) === 'id,items,status' && o.items.every((it) => keys(it) === 'product' && keys(it.product) === 'name,thumbnail'));
ok(mobileKeysOk(baseMobile), 'mobile (baseline đã lọc): chỉ có id, status, items[].product.{name, thumbnail}');

if (await up('bff')) {
  const bw = await json(url('bff', `/bff/web/dashboard?userId=${userId}`));
  ok(same(strip(bw), baseWeb), 'web: BFF = baseline', 'khác nhau');
  ok(bw.partial === false && bw.errors.length === 0, 'web: BFF không báo lỗi một phần khi mọi service khỏe');
  const bm = await json(url('bff', `/bff/mobile/orders?userId=${userId}`));
  ok(same(strip(bm), baseMobile), 'mobile: BFF = baseline');
  ok(mobileKeysOk(strip(bm)), 'mobile: response BFF chỉ có trường mobile (không có trường thừa)');
} else console.log('SKIP  BFF không chạy');

if (await up('graphql')) {
  const gw = await gql(WEB_Q);
  ok(!gw.errors && same(gw.data, baseWeb), 'web: GraphQL = baseline', gw.errors ? JSON.stringify(gw.errors[0]) : 'khác nhau');
  const gm = await gql(MOB_Q);
  ok(!gm.errors && same(gm.data, baseMobile), 'mobile: GraphQL = baseline');
  ok(mobileKeysOk(gm.data), 'mobile: response GraphQL chỉ có trường mobile');
} else console.log('SKIP  GraphQL không chạy');

console.log(failed ? `\n${failed} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra đạt');
process.exit(failed ? 1 : 0);
