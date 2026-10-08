// Kiểm tra GraphQL theo hợp đồng chung. Cần: 3 service (thật hoặc giả) + GraphQL đang chạy.
// Chạy: node test/integration.mjs [--size S|L]   (SIZE phải khớp cấu hình dữ liệu của service)
const size = process.argv.includes('--size') ? process.argv[process.argv.indexOf('--size') + 1] : 'S';
const cfg = size === 'L' ? { orders: 50, k: 4, n: 30 } : { orders: 5, k: 3, n: 10 };
const ITEMS = cfg.orders * cfg.k;
const GQL = process.env.GRAPHQL_URL ?? 'http://localhost:4005';
const SVC = { user: 4001, order: 4002, product: 4003, graphql: 4005 };

const WEB = `query Web($userId: Int!) {
  user(id: $userId) { id name }
  orders(userId: $userId) { id status createdAt items { productId quantity product { name price } } }
}`;
const MOBILE = `query Mobile($userId: Int!) {
  orders(userId: $userId) { id status items { product { name thumbnail } } }
}`;

let failed = 0;
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) failed++;
};
const j = (url, init) => fetch(url, init).then((r) => (r.status === 204 ? null : r.json()));
const resetAll = () => Promise.all(Object.values(SVC).map((p) => fetch(`http://localhost:${p}/_metrics/reset`, { method: 'POST' })));
const metric = (name) => j(`http://localhost:${SVC[name]}/_metrics`);
const fault = (body) => j('http://localhost:4003/_fault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function gql(query, qs = '') {
  const t0 = performance.now();
  const body = await j(`${GQL}/graphql${qs}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { userId: 1 } }),
  });
  return { ...body, ms: performance.now() - t0 };
}
import { schemaViolations } from '../../tools/contract.mjs';
const conforms = (name, data, label) => {
  const v = schemaViolations('graphql', name, data);
  ok(v.length === 0, `${label} khớp hợp đồng graphql/${name}`, v.slice(0, 3).join('; '));
};

console.log(`== Kiểm tra GraphQL, dữ liệu ${size}: ${cfg.orders} đơn, ${ITEMS} item ==`);
await fault({});

// 1. Đã sửa N+1 (mặc định): Product chỉ bị gọi MỘT lần dù có nhiều đơn.
await resetAll();
const fixed = await gql(WEB);
ok(!fixed.errors && fixed.data.orders.length === cfg.orders, 'web (loader on): đủ đơn, không lỗi');
conforms('WebData', fixed.data, 'web data');
let [u, o, p, g] = await Promise.all(['user', 'order', 'product', 'graphql'].map(metric));
ok(p.requests === 1 && p.dbQueries === 1, 'web (loader on): Product 1 lời gọi, 1 truy vấn', `(product ${p.requests}/${p.dbQueries})`);
ok(u.requests === 1 && o.requests === 1 && o.dbQueries === 2, 'web: User 1 lời gọi, Order 1 lời gọi/2 truy vấn');
ok(g.requests === 1, 'web: client chỉ gửi 1 request tới GraphQL');

// 2. Ngây thơ: N+1.
await resetAll();
const naive = await gql(WEB, '?dataloader=off');
p = await metric('product');
ok(!naive.errors && p.requests === ITEMS && p.dbQueries === ITEMS, `web (loader off): N+1, Product ${ITEMS} lời gọi`, `(thực tế ${p.requests})`);
ok(JSON.stringify(fixed.data) === JSON.stringify(naive.data), 'dữ liệu hai chế độ giống hệt nhau');

// 3. Dữ liệu đúng công thức hợp đồng (đơn 1).
const o1 = fixed.data.orders[0];
const exp = Array.from({ length: cfg.k }, (_, i) => ({ productId: ((1 * 7 + i * 11) % cfg.n) + 1, quantity: ((1 + i) % 3) + 1 }));
ok(o1.items.every((it, i) => it.productId === exp[i].productId && it.quantity === exp[i].quantity
  && it.product.name === `Sản phẩm ${String(it.productId).padStart(2, '0')}` && it.product.price === 10000 + it.productId * 500),
  'đơn 1 khớp công thức sinh dữ liệu');
ok(fixed.data.user.name === 'Người dùng 1', 'có tên người dùng');

// 4. Mobile: chỉ đúng các trường mobile, không gọi User.
await resetAll();
const mob = await gql(MOBILE);
[u, p] = await Promise.all(['user', 'product'].map(metric));
conforms('MobileData', mob.data, 'mobile data (chỉ id, status, items[].product.{name, thumbnail})');
ok(u.requests === 0 && p.requests === 1, 'mobile: không gọi User, Product 1 lời gọi', `(user ${u.requests}, product ${p.requests})`);
const mobNaive = (await resetAll(), await gql(MOBILE, '?dataloader=off'));
ok((await metric('product')).requests === ITEMS && JSON.stringify(mobNaive.data) === JSON.stringify(mob.data), 'mobile (loader off): N+1 nhưng cùng dữ liệu');

// 5. Policy lỗi: Product lỗi 500 → product null + errors, không có giá trị giả.
await fault({ error: true });
const bad = await gql(WEB);
const allNull = bad.data.orders.every((od) => od.items.every((it) => it.product === null));
conforms('WebData', bad.data, 'web data khi Product lỗi (một phần)');
ok(allNull && bad.data.orders.length === cfg.orders && bad.data.user.name === 'Người dùng 1', 'Product lỗi: product null ở mọi item, phần còn lại vẫn đủ');
ok(bad.errors?.length > 0 && bad.errors.every((e) => e.extensions?.code === 'PRODUCT_UNAVAILABLE' && Array.isArray(e.path)), 'Product lỗi: errors có extensions.code = PRODUCT_UNAVAILABLE và path');
ok(!JSON.stringify(bad.data).includes('Sản phẩm'), 'Product lỗi: không điền tên/giá giả');

// 6. Product chậm quá timeout (1000 ms) → partial; chậm vừa phải (500 ms) → đủ dữ liệu.
await fault({ latencyMs: 1500 });
const slow = await gql(WEB);
ok(slow.data.orders.every((od) => od.items.every((it) => it.product === null)) && slow.errors?.length > 0 && slow.ms < 1500,
  'Product chậm 1500 ms: hết thời gian chờ 1000 ms → partial', `(${Math.round(slow.ms)} ms)`);
await fault({ latencyMs: 500 });
const mid = await gql(WEB);
ok(!mid.errors && mid.data.orders[0].items[0].product !== null && mid.ms >= 500, 'Product chậm 500 ms: vẫn đủ dữ liệu, chậm hơn', `(${Math.round(mid.ms)} ms)`);
await fault({});

console.log(failed ? `\n${failed} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra đạt');
process.exit(failed ? 1 : 0);
