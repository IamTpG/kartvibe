import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import '../../web/public/measure/measure-client.js';
const browserClient = globalThis.MeasureClient;
const names = ['user', 'order', 'product', 'bff', 'graphql'];
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function validateRow(row) {
  assert.ok(browserClient.variants.includes(row.variant));
  assert.ok(['web', 'mobile'].includes(row.client)); assert.ok(['S', 'L'].includes(row.size));
  assert.ok(['cold', 'warm'].includes(row.mode));
  assert.ok(Number.isInteger(row.run) && row.run > 0);
  assert.ok(typeof row.requestId === 'string' && row.requestId.length > 0);
  assert.equal(typeof row.partial, 'boolean');
  for (const key of ['completeMs', 'clientRequests', 'payloadBytes']) assert.ok(Number.isFinite(row[key]) && row[key] >= 0, key);
  for (const key of ['clientRequests', 'payloadBytes']) assert.ok(Number.isInteger(row[key]));
  for (const name of names) for (const key of ['requests', 'dbQueries']) assert.ok(Number.isInteger(row.services?.[name]?.[key]) && row.services[name][key] >= 0, `${name}.${key}`);
  if (row.mode === 'cold') assert.ok(typeof row.coldSession === 'string' && row.coldSession.length > 0);
  return row;
}
export function summarize(rows) {
  const groups = new Map(), seen = new Set();
  for (const row of rows) {
    validateRow(row); assert.ok(!row.testAdapter, 'Test adapter không phải benchmark thật');
    const key = `${row.variant}/${row.client}/${row.size}`;
    const identity = `${key}/${row.mode}/${row.run}`;
    assert.ok(!seen.has(identity), `Bản ghi trùng: ${identity}`); seen.add(identity);
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row);
  }
  const stats = values => { const sorted = [...values].sort((a,b) => a-b), n = sorted.length; return n ? { median: n % 2 ? sorted[Math.floor(n/2)] : (sorted[n/2-1]+sorted[n/2])/2, range: [sorted[0], sorted[n-1]] } : null; };
  const missing = [], output = [];
  for (const variant of browserClient.variants) for (const client of ['web','mobile']) for (const size of ['S','L']) {
    const key = `${variant}/${client}/${size}`, items = groups.get(key) || [], warm = items.filter(r => r.mode === 'warm');
    if (!items.some(r => r.mode === 'cold')) missing.push(`${key}: cold`);
    for (let i=1;i<=5;i++) if (!warm.some(r => r.run === i)) missing.push(`${key}: warm ${i}`);
    if (items.length) output.push({ key, count: items.length, cold: items.filter(r => r.mode === 'cold'), completeMs: stats(warm.map(r => r.completeMs)), payloadBytes: stats(warm.map(r => r.payloadBytes)), clientRequests: stats(warm.map(r => r.clientRequests)), services: Object.fromEntries(names.map(name => [name, Object.fromEntries(['requests','dbQueries'].map(field => [field, stats(warm.map(r => r.services[name][field]))]))])), partialRuns: items.filter(r => r.partial).length });
  }
  return { complete: missing.length === 0, missing, groups: output };
}
export function createCollector({ directory = join(root,'results/raw'), testAdapter = false } = {}) {
  return createServer(async (req,res) => {
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) { res.writeHead(403).end(); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Headers','content-type'); res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
    if(req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if(req.method !== 'POST' || req.url !== '/results') { res.writeHead(404).end(); return; }
    try {
      let body='', length=0;
      for await (const chunk of req) { length+=chunk.length; if(length>1048576) throw new Error('Payload quá lớn'); body+=chunk; }
      const row=validateRow(JSON.parse(body)); row.testAdapter=testAdapter;
      await mkdir(directory,{recursive:true}); const file=`${randomUUID()}.json`;
      await writeFile(join(directory,file),JSON.stringify(row,null,2),{flag:'wx'});
      res.writeHead(201,{'content-type':'application/json'}).end(JSON.stringify({file}));
    } catch(error) { res.writeHead(error.code && error.code !== 'ERR_ASSERTION' ? 500 : 400,{'content-type':'application/json'}).end(JSON.stringify({error:error.message})); }
  });
}
export async function restart(config) {
  for (const name of names) assert.ok(Array.isArray(config.commands?.[name]) && config.commands[name].length, `Thiếu command ${name}`);
  assert.ok(Array.isArray(config.stop) && config.stop.length, 'Thiếu command dừng riêng các service của nhóm');
  const run = (argv, env = {}) => spawn(argv[0],argv.slice(1),{cwd:config.cwd || root,env:{...process.env,...env},stdio:'inherit',shell:false});
  await new Promise((yes,no) => { const p=run(config.stop); p.on('error',no); p.on('exit',code => code===0?yes():no(new Error(`Stop exit ${code}`))); });
  const children=names.map(name => run(config.commands[name],config.env || {}));
  const failed=[]; children.forEach(p => {p.on('error',e=>failed.push(e)); p.on('exit',code=>failed.push(new Error(`Service exit ${code}`)));});
  try {
    const deadline=Date.now()+30000;
    for (let port=4001;port<=4005;port++) {
      while(true) {
        if(failed.length) throw failed[0];
        try { const r=await fetch(`http://localhost:${port}/health`,{signal:AbortSignal.timeout(1000)}); assert.equal(r.status,200); break; } catch(e) { if(Date.now()>deadline) throw e; await new Promise(r=>setTimeout(r,200)); }
      }
    }
    return { coldSession:randomUUID(), restartedAt:new Date().toISOString(), children };
  } catch(e) { children.forEach(p=>p.kill()); throw e; }
}


function keys(value, allowed, path) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${path}: cần object`);
  assert.deepEqual(Object.keys(value).sort(), [...allowed].sort(), `${path}: sai/thừa/thiếu khóa`);
}
function shape(data, client) {
  keys(data, client === 'web' ? ['user', 'orders'] : ['orders'], client);
  if (client === 'web') keys(data.user, ['id', 'name'], 'user');
  assert.ok(Array.isArray(data.orders), 'orders phải là array');
  data.orders.forEach((order, o) => {
    keys(order, client === 'web' ? ['id', 'status', 'createdAt', 'items'] : ['id', 'status', 'items'], `orders[${o}]`);
    assert.ok(Array.isArray(order.items));
    order.items.forEach((item, i) => {
      keys(item, client === 'web' ? ['productId', 'quantity', 'product'] : ['product'], `items[${i}]`);
      if (item.product !== null) keys(item.product, client === 'web' ? ['name', 'price'] : ['name', 'thumbnail'], 'product');
    });
  });
}
export function compareData({ baseline, bff, graphql, client, products, web, partial = false }) {
  assert.ok(['web', 'mobile'].includes(client));
  keys(bff, client === 'web' ? ['user', 'orders', 'partial', 'errors'] : ['orders', 'partial', 'errors'], 'BFF response');
  assert.equal(bff.partial, partial);
  assert.ok(Array.isArray(bff.errors));
  assert.ok(graphql && graphql.data, 'GraphQL thiếu data');
  if (!partial) { assert.deepEqual(bff.errors, []); assert.ok(!graphql.errors || graphql.errors.length === 0, 'GraphQL có lỗi ngoài dự kiến'); }
  else {
    assert.ok(bff.errors.length > 0 && bff.errors.every(e => e.code === 'PRODUCT_UNAVAILABLE'));
    assert.ok(graphql.errors?.length > 0 && graphql.errors.every(e => e.extensions?.code === 'PRODUCT_UNAVAILABLE'));
  }
  const { partial: ignoredPartial, errors: ignoredErrors, ...bffData } = bff;
  shape(baseline, client); shape(bffData, client); shape(graphql.data, client);
  assert.deepEqual(bffData, baseline, 'BFF lệch baseline');
  assert.deepEqual(graphql.data, baseline, 'GraphQL lệch baseline');
  if (client === 'mobile' && !partial) {
    assert.equal(baseline.orders.length, web.orders.length);
    const map = new Map(products.map(p => [p.id, p]));
    baseline.orders.forEach((order, o) => {
      const source = web.orders[o];
      assert.equal(order.id, source.id); assert.equal(order.status, source.status);
      assert.equal(order.items.length, source.items.length);
      order.items.forEach((item, i) => {
        const product = map.get(source.items[i].productId);
        assert.ok(product, 'Product tham chiếu không tồn tại');
        assert.deepEqual(item.product, { name: product.name, thumbnail: product.thumbnail });
      });
    });
  }
  if (partial) assert.ok(baseline.orders.flatMap(o => o.items).every(i => i.product === null), 'Fault toàn service phải làm mọi product thành null');
  return { client, partial, pass: true };
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === 'collect') {
    const server=createCollector({directory:resolve(arg || join(root,'results/raw'))});
    server.listen(4010,'127.0.0.1',()=>console.log('browserClient collector http://127.0.0.1:4010/results'));
  } else if(command === 'summary') {
    const directory=resolve(arg || join(root,'results/raw'));
    const files=(await readdir(directory)).filter(f=>f.endsWith('.json'));
    const rows=await Promise.all(files.map(f=>readFile(join(directory,f),'utf8').then(JSON.parse)));
    const result=summarize(rows); console.log(JSON.stringify(result,null,2));
    await writeFile(join(directory,'..','summary.json'),JSON.stringify(result,null,2));
    if(!result.complete) process.exitCode=1;
  } else if(command === 'restart') {
    assert.ok(arg,'Cần đường dẫn config JSON chứa argv stop và commands');
    const state=await restart(JSON.parse(await readFile(arg,'utf8')));
    await mkdir(join(root,'results'),{recursive:true});
    await writeFile(join(root,'results/cold-session.json'),JSON.stringify({coldSession:state.coldSession,restartedAt:state.restartedAt},null,2));
    console.log(`coldSession=${state.coldSession}; giữ terminal này chạy. Không gọi nghiệp vụ trước mẫu lạnh.`);
    const stop=()=>{state.children.forEach(p=>p.kill());}; process.on('SIGINT',stop); process.on('SIGTERM',stop);
  } else console.log('node services/tools/measure.mjs collect [raw-dir] | summary [raw-dir] | restart config.json');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e.message);process.exitCode=1;});
