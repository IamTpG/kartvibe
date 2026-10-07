// Sinh postman/kartvibe-api.postman_collection.json + environment từ ma trận TEST_MATRIX.md.
// Chạy: node evidence/build-collection.mjs  (run-all.sh tự gọi).
import { readFileSync, writeFileSync } from 'node:fs';

// UUID lấy từ cùng các file với seed → không thể lệch nhau.
const load = (table) => JSON.parse(readFileSync(new URL(`../seeds/data/${table}.json`, import.meta.url), 'utf-8'));
const products = load('products');
const carts = load('carts');
const productId = (alias) => products.find((p) => p.alias === alias).id;
const cartId = (alias) => carts.find((c) => c.alias === alias).id;

const env = {
  baseUrl: 'http://localhost:3000',
  product1Id: productId('SP1'),
  product2Id: productId('SP2'),
  product3Id: productId('SP3'),
  product4Id: productId('SP4'),
  product5Id: productId('SP5'),
  checkedOutCartId: cartId('CART_CLOSED'),
  cartWithInactiveId: cartId('CART_WITH_INACTIVE'),
  notFoundUuid: '99999999-9999-4999-8999-999999999999',
  activeCartId: '',
  secondCartId: '',
  lastRequestId: '',
};

const cartSchema = `{type:'object',additionalProperties:false,required:['id','status','items','subtotal_cents'],properties:{id:{type:'string',format:'uuid'},status:{enum:['open','checked_out']},subtotal_cents:{type:'integer',minimum:0},items:{type:'array',items:{type:'object',additionalProperties:false,required:['product_id','sku','name','price_cents','quantity','subtotal_cents'],properties:{product_id:{type:'string'},sku:{type:'string'},name:{type:'string'},price_cents:{type:'integer'},quantity:{type:'integer'},subtotal_cents:{type:'integer'}}}}}}`;

const collectionScript = `
pm.test('[F2] has X-Request-Id header', () => pm.response.to.have.header('X-Request-Id'));
pm.test('[F2] X-Request-Id is a UUID', () => pm.expect(pm.response.headers.get('X-Request-Id')).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
if (pm.response.code >= 400) {
  pm.test('[F1] error matches Error Contract', () => pm.response.to.have.jsonSchema({type:'object',required:['code','message','details','request_id'],additionalProperties:false,properties:{code:{type:'string'},message:{type:'string'},details:{type:'array',items:{type:'object',required:['field','issue'],additionalProperties:false,properties:{field:{type:'string'},issue:{type:'string'}}}},request_id:{type:'string'}}}));
  pm.test('[F2] header X-Request-Id == body.request_id', () => {
    const b = pm.response.json();
    pm.expect(b.request_id).to.eql(pm.response.headers.get('X-Request-Id'));
    pm.environment.set('lastRequestId', b.request_id);
    console.log('request_id=' + b.request_id);
  });
  pm.test('[E1] no stack trace / SQL leaked', () => {
    const t = pm.response.text();
    ['Error:', ' at ', 'SELECT ', 'INSERT ', 'ECONNREFUSED', 'prisma'].forEach(k => pm.expect(t).to.not.include(k));
  });
}
if ([200, 201].includes(pm.response.code) && pm.response.headers.get('Content-Type')?.includes('json')) {
  const b = pm.response.json();
  if (b && b.items) pm.test('[F1] Cart matches schema', () => pm.response.to.have.jsonSchema(${cartSchema}));
}
`;

const ev = (code) => [{ listen: 'test', script: { type: 'text/javascript', exec: code.trim().split('\n') } }];

function req(id, name, method, path, { body, rawBody, expect: want, code, test = '', rules = [] } = {}) {
  const checks = [`pm.test('${id}: status ${want}', () => pm.response.to.have.status(${want}));`];
  if (code) checks.push(`pm.test('${id}: code ${code}', () => pm.expect(pm.response.json().code).to.eql('${code}'));`);
  return {
    name: `${id} — ${name}${rules.length ? ` [${rules.join(', ')}]` : ''}`,
    event: ev(checks.join('\n') + '\n' + test),
    request: {
      method,
      header: body !== undefined || rawBody !== undefined ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      url: { raw: `{{baseUrl}}${path}`, host: ['{{baseUrl}}'], path: path.split('?')[0].split('/').filter(Boolean), query: path.includes('?') ? path.split('?')[1].split('&').map((kv) => ({ key: kv.split('=')[0], value: kv.split('=')[1] })) : undefined },
      ...(body !== undefined || rawBody !== undefined ? { body: { mode: 'raw', raw: rawBody ?? JSON.stringify(body) } } : {}),
    },
  };
}

const field = (f) => `pm.test('details point to ${f}', () => pm.expect(pm.response.json().details.map(d => d.field)).to.include('${f}'));`;
const A = '{{activeCartId}}', CL = '{{checkedOutCartId}}', CI = '{{cartWithInactiveId}}', NF = '{{notFoundUuid}}';
const P1 = '{{product1Id}}', P2 = '{{product2Id}}', P3 = '{{product3Id}}', P4 = '{{product4Id}}', P5 = '{{product5Id}}';
const V = 'VALIDATION_ERROR';

const folders = [
  ['D - Happy Path', [
    req('D1', 'GET /products', 'GET', '/products', { rules: ['CAT-01', 'CAT-02', 'CAT-03'], expect: 200, test: `const j=pm.response.json(); pm.test('4 active products, total=4, limit=20, offset=0', () => { pm.expect(j.data.length).to.eql(4); pm.expect(j.total).to.eql(4); pm.expect(j.limit).to.eql(20); pm.expect(j.offset).to.eql(0); pm.expect(j.data.map(p=>p.id)).to.not.include('${env.product5Id}'); pm.expect(JSON.stringify(j)).to.not.include('is_active'); }); pm.test('sorted by sku', () => { const k=j.data.map(p=>p.sku); pm.expect(k).to.eql([...k].sort()); });` }),
    req('D2', 'pagination', 'GET', '/products?limit=2&offset=0', { rules: ['CAT-03'], expect: 200, test: `const j=pm.response.json(); pm.expect(j.data.length).to.eql(2); pm.environment.set('page1', j.data.map(p=>p.id).join(','));` }),
    req('D2b', 'pagination page 2', 'GET', '/products?limit=2&offset=2', { rules: ['CAT-03'], expect: 200, test: `const j=pm.response.json(); pm.test('page 2 disjoint from page 1', () => { pm.expect(j.data.length).to.eql(2); const p1=pm.environment.get('page1').split(','); j.data.forEach(p => pm.expect(p1).to.not.include(p.id)); });` }),
    req('D2c', 'offset beyond total gives empty page', 'GET', '/products?offset=100', { rules: ['CAT-04'], expect: 200, test: `const j=pm.response.json(); pm.test('empty page, total still 4', () => { pm.expect(j.data).to.eql([]); pm.expect(j.total).to.eql(4); pm.expect(j.offset).to.eql(100); });` }),
    req('D3', 'POST /carts', 'POST', '/carts', { expect: 201, test: `const j=pm.response.json(); pm.test('D3 body + Location', () => { pm.response.to.have.header('Location'); pm.expect(pm.response.headers.get('Location')).to.eql('/carts/'+j.id); pm.expect(j).to.deep.include({status:'open',subtotal_cents:0}); pm.expect(j.items).to.eql([]); }); pm.environment.set('activeCartId', j.id);` }),
    req('D4', 'GET empty cart', 'GET', `/carts/${A}`, { expect: 200, test: `const j=pm.response.json(); pm.expect(j.items).to.eql([]); pm.expect(j.subtotal_cents).to.eql(0);` }),
    req('D5', 'add SP1 x2', 'POST', `/carts/${A}/items`, { rules: ['CART-03'], body: { product_id: P1, quantity: 2 }, expect: 201, test: `const j=pm.response.json(); pm.test('subtotal 10000', () => { pm.expect(j.items.length).to.eql(1); pm.expect(j.items[0]).to.deep.include({product_id:'${env.product1Id}',price_cents:5000,quantity:2,subtotal_cents:10000}); pm.expect(j.subtotal_cents).to.eql(10000); });` }),
    req('D6', 'add SP2 x1', 'POST', `/carts/${A}/items`, { rules: ['CART-03'], body: { product_id: P2, quantity: 1 }, expect: 201, test: `pm.expect(pm.response.json().subtotal_cents).to.eql(25000);` }),
    req('D6b', 'GET cart (25000)', 'GET', `/carts/${A}`, { rules: ['CART-03', 'CART-10'], expect: 200, test: `const j=pm.response.json(); pm.expect(j.items.length).to.eql(2); pm.expect(j.subtotal_cents).to.eql(25000); pm.test('items sorted by name', () => pm.expect(j.items.map(i=>i.product_id)).to.eql(['${env.product1Id}','${env.product2Id}']));` }),
    req('D7', 'PATCH SP1 -> 3', 'PATCH', `/carts/${A}/items/${P1}`, { rules: ['CART-03', 'CART-07'], body: { quantity: 3 }, expect: 200, test: `const j=pm.response.json(); pm.expect(j.items.find(i=>i.product_id==='${env.product1Id}')).to.deep.include({quantity:3,subtotal_cents:15000}); pm.expect(j.subtotal_cents).to.eql(30000);` }),
    req('D7b', 'PATCH same quantity is still 200', 'PATCH', `/carts/${A}/items/${P1}`, { rules: ['CART-07'], body: { quantity: 3 }, expect: 200, test: `const j=pm.response.json(); pm.expect(j.items.find(i=>i.product_id==='${env.product1Id}')).to.deep.include({quantity:3,subtotal_cents:15000}); pm.expect(j.subtotal_cents).to.eql(30000);` }),
    req('D8', 'DELETE SP2', 'DELETE', `/carts/${A}/items/${P2}`, { expect: 204, test: `pm.test('empty body', () => pm.expect(pm.response.text()).to.eql(''));` }),
    req('D9', 'GET cart (15000)', 'GET', `/carts/${A}`, { rules: ['CART-03'], expect: 200, test: `const j=pm.response.json(); pm.expect(j.items.length).to.eql(1); pm.expect(j.items[0].quantity).to.eql(3); pm.expect(j.subtotal_cents).to.eql(15000);` }),
    req('D10', 'create second cart', 'POST', '/carts', { rules: ['CART-12'], expect: 201, test: `pm.environment.set('secondCartId', pm.response.json().id);` }),
    // Giỏ A đang giữ SP1 qty=3 (= toàn bộ stock). Nếu stock bị trừ khi thêm vào giỏ thì thêm tiếp vào giỏ khác sẽ lỗi.
    req('D11', 'add SP1 x3 to second cart (stock not deducted)', 'POST', '/carts/{{secondCartId}}/items', { rules: ['CART-12'], body: { product_id: P1, quantity: 3 }, expect: 201, test: `pm.expect(pm.response.json().subtotal_cents).to.eql(15000);` }),
    // Fixture: giỏ checked_out có SP1 x2; giỏ open có SP5 (đã ngừng bán) x1.
    req('D12', 'checked_out cart still lists and counts its items', 'GET', `/carts/${CL}`, { rules: ['CART-04'], expect: 200, test: `const j=pm.response.json(); pm.test('closed cart keeps items', () => { pm.expect(j.status).to.eql('checked_out'); pm.expect(j.items.length).to.eql(1); pm.expect(j.items[0]).to.deep.include({product_id:'${env.product1Id}',quantity:2,subtotal_cents:10000}); pm.expect(j.subtotal_cents).to.eql(10000); });` }),
    req('D13', 'inactive product still listed and counted', 'GET', `/carts/${CI}`, { rules: ['CART-04'], expect: 200, test: `const j=pm.response.json(); pm.test('inactive product kept in cart', () => { pm.expect(j.items.length).to.eql(1); pm.expect(j.items[0]).to.deep.include({product_id:'${env.product5Id}',quantity:1,subtotal_cents:25000}); pm.expect(j.subtotal_cents).to.eql(25000); });` }),
  ]],
  ['A - Schema Validation', [
    req('A1', 'quantity=0', 'POST', `/carts/${A}/items`, { body: { product_id: P1, quantity: 0 }, expect: 400, code: V, test: field('quantity') + `pm.test('only quantity', () => pm.expect(pm.response.json().details.length).to.eql(1));` }),
    req('A2', 'quantity=11', 'POST', `/carts/${A}/items`, { body: { product_id: P1, quantity: 11 }, expect: 400, code: V, test: field('quantity') }),
    req('A3', 'quantity="2"', 'POST', `/carts/${A}/items`, { rawBody: `{"product_id":"${env.product1Id}","quantity":"2"}`, expect: 400, code: V, test: field('quantity') }),
    req('A4', 'missing product_id', 'POST', `/carts/${A}/items`, { body: { quantity: 2 }, expect: 400, code: V, test: field('product_id') }),
    req('A5', 'unknown field', 'POST', `/carts/${A}/items`, { rules: ['CART-02'], body: { product_id: P2, quantity: 2, price: 999 }, expect: 400, code: V, test: field('price') }),
    req('A5b', 'DB unchanged', 'GET', `/carts/${A}`, { expect: 200, test: `const j=pm.response.json(); pm.expect(j.items.length).to.eql(1); pm.expect(j.subtotal_cents).to.eql(15000);` }),
    req('A6', 'cartId not UUID', 'GET', '/carts/abc-123-not-uuid', { expect: 400, code: V, test: field('cartId') }),
    req('A7', 'PATCH quantity=0', 'PATCH', `/carts/${A}/items/${P1}`, { body: { quantity: 0 }, expect: 400, code: V, test: field('quantity') }),
    req('A8', 'empty body {}', 'POST', `/carts/${A}/items`, { body: {}, expect: 400, code: V }),
    req('A9', 'limit=0&offset=-1', 'GET', '/products?limit=0&offset=-1', { rules: ['CAT-03'], expect: 400, code: V, test: field('limit') + field('offset') }),
    req('A10', 'productId not UUID', 'DELETE', `/carts/${A}/items/not-a-uuid`, { expect: 400, code: V, test: field('productId') }),
    req('A11', 'broken JSON', 'POST', `/carts/${A}/items`, { rawBody: '{"product_id": ', expect: 400, code: V, test: field('body') }),
    req('A12', 'unknown query param', 'GET', '/products?page=2', { expect: 400, code: V, test: field('page') }),
  ]],
  ['B - 404 Not Found', [
    req('B1', 'GET unknown cart', 'GET', `/carts/${NF}`, { expect: 404, code: 'CART_NOT_FOUND' }),
    req('B2', 'POST item to unknown cart', 'POST', `/carts/${NF}/items`, { body: { product_id: P1, quantity: 1 }, expect: 404, code: 'CART_NOT_FOUND' }),
    req('B3', 'DELETE item not in cart', 'DELETE', `/carts/${A}/items/${P2}`, { rules: ['CART-09'], expect: 404, code: 'ITEM_NOT_FOUND' }),
    req('B4', 'PATCH item not in cart', 'PATCH', `/carts/${A}/items/${P2}`, { body: { quantity: 2 }, expect: 404, code: 'ITEM_NOT_FOUND' }),
    req('B5', 'DELETE on unknown cart', 'DELETE', `/carts/${NF}/items/${P1}`, { expect: 404, code: 'CART_NOT_FOUND' }),
    req('B6', 'unknown route', 'GET', '/foo', { expect: 404, code: 'ROUTE_NOT_FOUND' }),
    req('B7', 'method not allowed', 'PUT', '/carts', { expect: 405, code: 'METHOD_NOT_ALLOWED' }),
  ]],
  ['C - Business Rules', [
    req('C1', 'inactive product', 'POST', `/carts/${A}/items`, { rules: ['CART-05'], body: { product_id: P5, quantity: 1 }, expect: 422, code: 'PRODUCT_UNAVAILABLE' }),
    req('C1b', 'unknown product', 'POST', `/carts/${A}/items`, { rules: ['CART-05'], body: { product_id: NF, quantity: 1 }, expect: 422, code: 'PRODUCT_UNAVAILABLE' }),
    req('C2', 'out of stock (SP4)', 'POST', `/carts/${A}/items`, { rules: ['CART-11'], body: { product_id: P4, quantity: 1 }, expect: 409, code: 'INSUFFICIENT_STOCK' }),
    // SP1 đã nằm trong giỏ (D5) nên ITEM_ALREADY_IN_CART sẽ thắng → dùng SP3 (stock=1) với qty=2.
    req('C3', 'qty > stock (SP3 qty=2)', 'POST', `/carts/${A}/items`, { rules: ['CART-11'], body: { product_id: P3, quantity: 2 }, expect: 409, code: 'INSUFFICIENT_STOCK', test: field('quantity') }),
    req('C3a', 'add SP3 qty=1 (ok)', 'POST', `/carts/${A}/items`, { body: { product_id: P3, quantity: 1 }, expect: 201 }),
    req('C3b', 'PATCH SP3 qty=2 > stock', 'PATCH', `/carts/${A}/items/${P3}`, { rules: ['CART-11'], body: { quantity: 2 }, expect: 409, code: 'INSUFFICIENT_STOCK' }),
    req('C4', 'already in cart (SP1)', 'POST', `/carts/${A}/items`, { rules: ['CART-06'], body: { product_id: P1, quantity: 1 }, expect: 409, code: 'ITEM_ALREADY_IN_CART' }),
    req('C4b', 'already in cart wins over stock', 'POST', `/carts/${A}/items`, { rules: ['CART-06', 'CART-13'], body: { product_id: P1, quantity: 4 }, expect: 409, code: 'ITEM_ALREADY_IN_CART' }),
    req('C5', 'POST to checked_out cart', 'POST', `/carts/${CL}/items`, { rules: ['CART-01'], body: { product_id: P1, quantity: 1 }, expect: 409, code: 'CART_CLOSED' }),
    req('C6', 'PATCH on checked_out cart', 'PATCH', `/carts/${CL}/items/${P1}`, { rules: ['CART-01', 'CART-13'], body: { quantity: 2 }, expect: 409, code: 'CART_CLOSED' }),
    req('C7', 'DELETE on checked_out cart', 'DELETE', `/carts/${CL}/items/${P1}`, { rules: ['CART-01', 'CART-13'], expect: 409, code: 'CART_CLOSED' }),
    req('C8', 'GET checked_out cart is readable', 'GET', `/carts/${CL}`, { rules: ['CART-01'], expect: 200, test: `pm.expect(pm.response.json().status).to.eql('checked_out');` }),
    req('C9', 'PATCH item of inactive product is still allowed', 'PATCH', `/carts/${CI}/items/${P5}`, { rules: ['CART-08'], body: { quantity: 2 }, expect: 200, test: `const j=pm.response.json(); pm.test('quantity 2, subtotal 50000', () => { pm.expect(j.items[0]).to.deep.include({product_id:'${env.product5Id}',quantity:2,subtotal_cents:50000}); pm.expect(j.subtotal_cents).to.eql(50000); });` }),
  ]],
  ['E - Server Error 500', [
    req('E1', 'DB down → 500 (chạy riêng)', 'GET', '/products', { expect: 500, code: 'INTERNAL_ERROR' }),
  ]],
];

const collection = {
  info: { name: 'Kartvibe API Acceptance Tests', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  event: [{ listen: 'test', script: { type: 'text/javascript', exec: collectionScript.trim().split('\n') } }],
  item: folders.map(([name, item]) => ({ name, item })),
};
const environment = {
  name: 'Kartvibe API Local',
  values: Object.entries(env).map(([key, value]) => ({ key, value, enabled: true })),
  _postman_variable_scope: 'environment',
};

writeFileSync(new URL('../postman/kartvibe-api.postman_collection.json', import.meta.url), JSON.stringify(collection, null, 2));
writeFileSync(new URL('../postman/kartvibe-api.postman_environment.json', import.meta.url), JSON.stringify(environment, null, 2));
console.log('postman collection + environment written');
