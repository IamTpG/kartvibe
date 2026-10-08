// Kiểm tra các service có đúng HỢP ĐỒNG CHUNG không (docs/blocks/block-02/hop-dong-chung.md, mục 3-5).
// Dùng khi nhận gói của từng người: chạy service rồi `node tools/check-contract.mjs --size S`.
// Service không chạy thì bỏ qua (SKIP). Chạy: node tools/check-contract.mjs [--size S|L] [--only user,order,product,bff,graphql]
const arg = (name, def) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : def);
const size = arg('--size', 'S') === 'L' ? 'L' : 'S';
const only = arg('--only', '').split(',').filter(Boolean);
const cfg = size === 'L' ? { orders: 50, k: 4, n: 30 } : { orders: 5, k: 3, n: 10 };
const ITEMS = cfg.orders * cfg.k;
const PORT = { user: 4001, order: 4002, product: 4003, bff: 4004, graphql: 4005 };

let failed = 0, passed = 0;
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? '  → ' + extra : ''}`);
  cond ? passed++ : failed++;
};
import { responseViolations, schemaViolations } from './contract.mjs';

// Kiểm response theo hợp đồng đã công bố của service (<service>/openapi.json).
const conformsResponse = (service, route, status, body, label) => {
  const v = responseViolations(service, route, status, body);
  ok(v.length === 0, `${label} khớp hợp đồng ${service} ${route} → ${status}`, v.slice(0, 3).join('; '));
};
const conformsSchema = (service, name, body, label) => {
  const v = schemaViolations(service, name, body);
  ok(v.length === 0, `${label} khớp hợp đồng ${service}/${name}`, v.slice(0, 3).join('; '));
};
const keys = (o) => (o && typeof o === 'object' ? Object.keys(o).sort().join(',') : String(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(svc, path, init = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(`http://localhost:${PORT[svc]}${path}`, { ...init, signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* không phải JSON */ }
    return { status: res.status, headers: res.headers, body, ms: performance.now() - t0 };
  } catch (e) {
    return { status: 0, headers: new Headers(), body: null, ms: performance.now() - t0, error: String(e) };
  }
}
const up = async (svc) => (await http(svc, '/health')).status === 200;
const metrics = async (svc) => (await http(svc, '/_metrics')).body;
const reset = (svc) => http(svc, '/_metrics/reset', { method: 'POST' });
const resetAll = (names) => Promise.all(names.map(reset));
const post = (svc, path, body) => http(svc, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// Công thức sinh dữ liệu của hợp đồng (mục 2.3).
const pad = (v, w) => String(v).padStart(w, '0');
const expItems = (o) => Array.from({ length: cfg.k }, (_, i) => ({ productId: ((o * 7 + i * 11) % cfg.n) + 1, quantity: ((o + i) % 3) + 1 }));
const expProduct = (id) => ({ id, sku: `SKU-${pad(id, 3)}`, name: `Sản phẩm ${pad(id, 2)}`, price: 10000 + id * 500,
  thumbnail: `https://img.example.test/p/${id}.jpg`, description: `Mô tả sản phẩm ${id}. `.repeat(6) });
const STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

async function common(svc) {
  const h = await http(svc, '/health');
  ok(h.status === 200 && h.body?.status === 'ok', '/health → 200 {"status":"ok"}');
  const m = await metrics(svc);
  ok(m && m.service === svc && Number.isInteger(m.requests) && Number.isInteger(m.dbQueries), '/_metrics có service, requests, dbQueries', JSON.stringify(m));
  const r = await reset(svc);
  const m2 = await metrics(svc);
  ok(r.status === 204 && m2?.requests === 0 && m2?.dbQueries === 0, 'POST /_metrics/reset → 204 và về 0', `status ${r.status}`);
  ok(h.headers.get('access-control-allow-origin') === '*', 'CORS: Access-Control-Allow-Origin: *');
}

async function checkUser() {
  console.log('\n[user :4001]'); await common('user');
  await reset('user');
  const r = await http('user', '/users/1', { headers: { 'x-request-id': 'chk-1' } });
  ok(r.status === 200 && keys(r.body) === 'id,name' && r.body.id === 1 && r.body.name === 'Người dùng 1', 'GET /users/1 → {id:1, name:"Người dùng 1"}', JSON.stringify(r.body));
  conformsResponse('user', 'GET /users/{id}', 200, r.body, 'GET /users/1');
  ok(r.headers.get('x-request-id') === 'chk-1', 'trả lại header x-request-id');
  const m = await metrics('user');
  ok(m.requests === 1 && m.dbQueries === 1, '1 request, 1 truy vấn DB', JSON.stringify(m));
  const nf = await http('user', '/users/99999');
  ok(nf.status === 404 && typeof nf.body?.code === 'string' && typeof nf.body?.message === 'string', 'GET /users/99999 → 404 {code, message}', `status ${nf.status}`);
  conformsResponse('user', 'GET /users/{id}', 404, nf.body, '404 của user');
}

async function checkOrder() {
  console.log('\n[order :4002]'); await common('order');
  await reset('order');
  const r = await http('order', '/orders?userId=1', { headers: { 'x-request-id': 'chk-2' } });
  const d = r.body?.data;
  ok(r.status === 200 && Array.isArray(d) && d.length === cfg.orders, `GET /orders?userId=1 → ${cfg.orders} đơn`, `status ${r.status}, ${d?.length}`);
  conformsResponse('order', 'GET /orders', 200, r.body, 'GET /orders?userId=1');
  if (Array.isArray(d) && d.length) {
    ok(d.every((o, i) => i === 0 || d[i - 1].id < o.id), 'sắp xếp theo id tăng dần');
    const o = d[0];
    ok(keys(o) === 'createdAt,id,items,status,userId' && o.id === 1 && o.userId === 1 && o.status === STATUSES[0] && o.createdAt === '2026-01-01T00:00:00.000Z', 'đơn 1: đúng khóa, status, createdAt', JSON.stringify(o).slice(0, 160));
    const e = expItems(1);
    ok(o.items.length === cfg.k && o.items.every((it, i) => keys(it) === 'productId,quantity' && it.productId === e[i].productId && it.quantity === e[i].quantity), 'items của đơn 1 khớp công thức (thứ tự item_index)');
    ok(d.every((x) => x.status === STATUSES[(x.id - 1) % 5]), 'status theo công thức (id - 1) % 5');
  }
  ok(r.headers.get('x-request-id') === 'chk-2', 'trả lại header x-request-id');
  const m = await metrics('order');
  ok(m.requests === 1 && m.dbQueries === 2, '1 request, đúng 2 truy vấn DB', JSON.stringify(m));
  const bad = await http('order', '/orders?userId=abc');
  ok(bad.status === 400 && bad.body?.code === 'VALIDATION_ERROR', 'userId sai kiểu → 400 VALIDATION_ERROR', `status ${bad.status}`);
  conformsResponse('order', 'GET /orders', 400, bad.body, '400 của order');
  const none = await http('order', '/orders?userId=2');
  ok(none.status === 200 && Array.isArray(none.body?.data) && none.body.data.length === 0, 'người dùng không có đơn → 200 {"data":[]}');
}

async function checkProduct() {
  console.log('\n[product :4003]'); await common('product');
  const hooks = await http('product', '/_fault');
  ok(hooks.status === 200, 'móc test của Product đang bật (ENABLE_TEST_HOOKS=1)', `status ${hooks.status}; khởi động lại bằng npm run start:measure`);
  if (hooks.status !== 200) return;
  await post('product', '/_fault', {});
  await reset('product');
  const one = await http('product', '/products/8');
  const sameProduct = (p) => keys(p) === keys(expProduct(8)) && Object.entries(expProduct(p?.id ?? 8)).every(([k, v]) => p[k] === v);
  ok(one.status === 200 && sameProduct(one.body), 'GET /products/8 đúng trường và giá trị theo công thức', JSON.stringify(one.body)?.slice(0, 160));
  conformsResponse('product', 'GET /products/{id}', 200, one.body, 'GET /products/8');
  let m = await metrics('product');
  ok(m.requests === 1 && m.dbQueries === 1, 'lấy một product: 1 request, 1 truy vấn', JSON.stringify(m));
  const nf = await http('product', '/products/99999');
  ok(nf.status === 404 && typeof nf.body?.code === 'string', 'product không có → 404 {code, message}', `status ${nf.status}`);
  conformsResponse('product', 'GET /products/{id}', 404, nf.body, '404 của product');

  await reset('product');
  const b = await http('product', '/products?ids=9,8,10,8', { headers: { 'x-request-id': 'chk-3' } });
  const ids = b.body?.data?.map((p) => p.id);
  ok(b.status === 200 && JSON.stringify(ids) === '[8,9,10]', 'GET /products?ids=9,8,10,8 → 3 product, loại trùng, sắp id tăng dần', JSON.stringify(ids));
  ok(b.body?.data?.every((p) => Object.entries(expProduct(p.id)).every(([k, v]) => p[k] === v)), 'product trong lô đúng trường và giá trị');
  conformsResponse('product', 'GET /products', 200, b.body, 'GET /products?ids=');
  m = await metrics('product');
  ok(m.requests === 1 && m.dbQueries === 1, 'lấy nhiều id: đúng 1 request, 1 truy vấn', JSON.stringify(m));
  ok(b.headers.get('x-request-id') === 'chk-3', 'trả lại header x-request-id');
  const miss = await http('product', '/products?ids=1,99999');
  ok(miss.status === 200 && miss.body?.data?.length === 1 && miss.body.data[0].id === 1, 'id không tồn tại bị bỏ qua (không lỗi)', `status ${miss.status}`);
  const badIds = await http('product', '/products?ids=a,b');
  ok(badIds.status === 400 && badIds.body?.code === 'VALIDATION_ERROR', 'ids sai định dạng → 400 VALIDATION_ERROR', `status ${badIds.status}`);
  const many = await http('product', `/products?ids=${Array.from({ length: 201 }, (_, i) => i + 1).join(',')}`);
  ok(many.status === 400, 'hơn 200 id → 400', `status ${many.status}`);

  const fe = await post('product', '/_fault', { error: true });
  ok(fe.status === 200 && fe.body?.error === true, 'POST /_fault {"error":true} → trả trạng thái', JSON.stringify(fe.body));
  const e1 = await http('product', '/products/1'), e2 = await http('product', '/products?ids=1,2');
  ok(e1.status === 500 && e2.status === 500 && e1.body?.code === 'INTERNAL_ERROR', 'khi error: cả hai endpoint trả 500 INTERNAL_ERROR', `${e1.status}/${e2.status}`);
  conformsResponse('product', 'GET /products/{id}', 500, e1.body, '500 của product');
  await post('product', '/_fault', { latencyMs: 400 });
  const slow = await http('product', '/products/1');
  ok(slow.status === 200 && slow.ms >= 400, 'khi latencyMs=400: chậm thêm ≥ 400 ms', `${Math.round(slow.ms)} ms`);
  await post('product', '/_fault', {});
  const clear = await http('product', '/products/1');
  ok(clear.status === 200 && clear.ms < 400, 'POST /_fault {} xóa lỗi', `${Math.round(clear.ms)} ms`);
  const st = await http('product', '/_fault');
  ok(st.status === 200 && st.body?.error === false && st.body?.latencyMs === 0, 'GET /_fault trả trạng thái hiện tại', JSON.stringify(st.body));
}

const strip = ({ partial, errors, ...rest }) => rest;

async function checkBff() {
  console.log('\n[bff :4004]'); await common('bff');
  await post('product', '/_fault', {});
  await resetAll(['user', 'order', 'product', 'bff']);
  const w = await http('bff', '/bff/web/dashboard?userId=1');
  const b = w.body;
  ok(w.status === 200 && b?.partial === false && Array.isArray(b.errors) && b.errors.length === 0, 'web: 200, partial=false, errors rỗng', `status ${w.status}`);
  conformsResponse('bff', 'GET /bff/web/dashboard', 200, b, 'web');
  ok(b?.user?.id === 1 && b.user.name === 'Người dùng 1', 'web: user đúng');
  ok(b?.orders?.length === cfg.orders, `web: đủ ${cfg.orders} đơn`);
  ok(b?.orders?.every((o) => o.items.every((it) => it.product.name === expProduct(it.productId).name && it.product.price === expProduct(it.productId).price)), 'web: tên và giá product đúng');
  const mw = await Promise.all(['user', 'order', 'product'].map(metrics));
  ok(mw[0].requests === 1 && mw[1].requests === 1 && mw[2].requests === 1 && mw[2].dbQueries === 1, 'web: BFF gọi User 1, Order 1, Product 1 lần (lấy nhiều id, loại trùng)', `user ${mw[0].requests}, order ${mw[1].requests}, product ${mw[2].requests}/${mw[2].dbQueries}`);

  await resetAll(['user', 'order', 'product', 'bff']);
  const mob = await http('bff', '/bff/mobile/orders?userId=1');
  const mb = mob.body;
  ok(mob.status === 200 && mb?.partial === false, 'mobile: 200, partial=false', `status ${mob.status}`);
  conformsResponse('bff', 'GET /bff/mobile/orders', 200, mb, 'mobile (CHỈ có id, status, items[].product.{name, thumbnail})');
  ok(mb?.orders?.length === cfg.orders, `mobile: đủ ${cfg.orders} đơn`);
  const mm = await Promise.all(['user', 'product'].map(metrics));
  ok(mm[0].requests === 0 && mm[1].requests === 1, 'mobile: không gọi User; Product 1 lần', `user ${mm[0].requests}, product ${mm[1].requests}`);

  await post('product', '/_fault', { error: true });
  const bad = (await http('bff', '/bff/web/dashboard?userId=1')).body;
  ok(bad?.partial === true && bad.errors?.[0]?.code === 'PRODUCT_UNAVAILABLE' && Array.isArray(bad.errors[0].productIds), 'Product lỗi: partial=true, errors[0].code=PRODUCT_UNAVAILABLE, có productIds');
  ok(bad?.orders?.length === cfg.orders && bad.orders.every((o) => o.items.every((it) => it.product === null)) && bad.user?.name === 'Người dùng 1', 'Product lỗi: product null ở mọi item, phần còn lại vẫn đủ');
  conformsResponse('bff', 'GET /bff/web/dashboard', 200, bad, 'web khi Product lỗi (một phần)');
  ok(!JSON.stringify(bad).includes('Sản phẩm'), 'Product lỗi: không điền tên/giá giả');
  await post('product', '/_fault', { latencyMs: 1500 });
  const t = await http('bff', '/bff/web/dashboard?userId=1');
  ok(t.body?.partial === true && t.ms < 1500, 'Product chậm 1500 ms: hết thời gian chờ → partial', `${Math.round(t.ms)} ms`);
  await post('product', '/_fault', {});
}

const WEB_Q = 'query Web($userId: Int!){ user(id:$userId){id name} orders(userId:$userId){ id status createdAt items{ productId quantity product{ name price } } } }';
const MOB_Q = 'query Mobile($userId: Int!){ orders(userId:$userId){ id status items{ product{ name thumbnail } } } }';
const gql = (q, qs = '') => post('graphql', `/graphql${qs}`, { query: q, variables: { userId: 1 } });

async function checkGraphql() {
  console.log('\n[graphql :4005]'); await common('graphql');
  await post('product', '/_fault', {});
  await resetAll(['user', 'order', 'product', 'graphql']);
  const w = await gql(WEB_Q);
  ok(w.status === 200 && !w.body?.errors && w.body?.data?.orders?.length === cfg.orders, 'web: 200, đủ đơn, không lỗi');
  conformsSchema('graphql', 'WebData', w.body?.data, 'web data');
  const p = await metrics('product');
  ok(p.requests === 1 && p.dbQueries === 1, 'DATALOADER đã bật: Product chỉ 1 lời gọi (không tăng theo số đơn)', JSON.stringify(p));
  await resetAll(['product']);
  const n = await gql(WEB_Q, '?dataloader=off');
  const pn = await metrics('product');
  ok(pn.requests === ITEMS, `DATALOADER tắt: N+1, Product ${ITEMS} lời gọi`, `thực tế ${pn.requests}`);
  ok(JSON.stringify(w.body?.data) === JSON.stringify(n.body?.data), 'dữ liệu hai chế độ giống nhau');
  const m = await gql(MOB_Q);
  conformsSchema('graphql', 'MobileData', m.body?.data, 'mobile data (chỉ các trường mobile)');
}

async function checkEquality() {
  console.log('\n[đối chiếu BFF ↔ GraphQL]');
  await post('product', '/_fault', {});
  const bw = (await http('bff', '/bff/web/dashboard?userId=1')).body;
  const gw = (await gql(WEB_Q)).body?.data;
  ok(bw && gw && JSON.stringify(strip(bw)) === JSON.stringify(gw), 'web: dữ liệu BFF giống hệt data của GraphQL');
  const bm = (await http('bff', '/bff/mobile/orders?userId=1')).body;
  const gm = (await gql(MOB_Q)).body?.data;
  ok(bm && gm && JSON.stringify(strip(bm)) === JSON.stringify(gm), 'mobile: dữ liệu BFF giống hệt data của GraphQL');
}

console.log(`== Kiểm tra hợp đồng chung, dữ liệu ${size}: ${cfg.orders} đơn, ${ITEMS} item ==`);
const groups = { user: checkUser, order: checkOrder, product: checkProduct, bff: checkBff, graphql: checkGraphql };
const status = {};
for (const svc of Object.keys(groups)) {
  if (only.length && !only.includes(svc)) continue;
  if (!(await up(svc))) { console.log(`\n[${svc} :${PORT[svc]}]\n  SKIP  không chạy (/health không trả lời)`); status[svc] = 'SKIP'; continue; }
  try { await groups[svc](); status[svc] = 'RUN'; } catch (e) { ok(false, `${svc}: lỗi bất ngờ`, String(e)); }
}
if (status.bff === 'RUN' && status.graphql === 'RUN') await checkEquality();
await post('product', '/_fault', {}).catch(() => {});
console.log(`\nKết quả: ${passed} đạt, ${failed} thất bại. Đã bỏ qua: ${Object.entries(status).filter(([, v]) => v === 'SKIP').map(([k]) => k).join(', ') || 'không'}`);
process.exit(failed ? 1 : 0);
