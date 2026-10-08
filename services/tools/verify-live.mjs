import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareData } from './measure.mjs';
import '../../web/public/measure/measure-client.js';
const measureClient=globalThis.MeasureClient;
export async function verifyLive({size='S', loader='on', faults=false, out=fileURLToPath(new URL('../../results/verification', import.meta.url)), host='http://localhost'}={}) {
  assert.ok(['S','L'].includes(size)); assert.ok(['on','off'].includes(loader));
  const report={size,loader,startedAt:new Date().toISOString(),checks:[],pass:false};
  const fetchJSON=async(url,init={})=>{const r=await fetch(url,{...init,signal:AbortSignal.timeout(15000)}); assert.ok(r.ok,`${url}: ${r.status}`); return r.status===204?null:r.json();};
  const load=(variant,client)=>measureClient.loadContract({variant,client,host,apiFetch:fetchJSON});
  const fault=body=>fetchJSON(`${host}:4003/_fault`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const strip=({partial,errors,...data})=>data;
  try {
    if(faults) await fault({});
    const web=strip(await load('baseline','web'));
    assert.equal(web.orders.length,size==='S'?5:50,'Seed size khác nhãn');
    const ids=[...new Set(web.orders.flatMap(o=>o.items.map(i=>i.productId)))];
    const products=(await fetchJSON(`${host}:4003/products?ids=${ids.join(',')}`)).data;
    for(const client of ['web','mobile']) {
      const baseline=client==='web'?web:strip(await load('baseline',client));
      const bff=await load('bff',client);
      await measureClient.metrics('reset',host);
      const graphql=await load(loader==='on'?'graphql-fixed':'graphql-naive',client);
      const metrics=await measureClient.metrics('read',host);
      const expected=loader==='on'?1:(size==='S'?15:200);
      assert.equal(metrics.product.requests,expected,'Product call count'); assert.equal(metrics.product.dbQueries,expected,'Product DB count');
      report.checks.push({...compareData({baseline,bff,graphql,client,products,web}),productRequests:metrics.product.requests});
      if(faults) for(const scenario of [{name:'slow',latencyMs:500,error:false},{name:'timeout',latencyMs:1500,error:false},{name:'error',latencyMs:0,error:true}]) {
        await fault({latencyMs:scenario.latencyMs,error:scenario.error});
        try {
          const b=await load('bff',client),g=await load('graphql-fixed',client);
          const partial=scenario.name!=='slow', expectedData=structuredClone(baseline);
          if(partial) expectedData.orders.forEach(o=>o.items.forEach(i=>i.product=null));
          report.checks.push({...compareData({baseline:expectedData,bff:b,graphql:g,client,products,web,partial}),scenario:scenario.name});
        } finally { await fault({}); await new Promise(r=>setTimeout(r,1700)); }
      }
    }
    report.pass=true;
  } catch(error) { report.error=error.message; }
  finally { if(faults) await fault({}).catch(e=>{report.cleanupError=e.message;report.pass=false;}); await mkdir(out,{recursive:true}); await writeFile(resolve(out,`${size}-${loader}-${Date.now()}.json`),JSON.stringify(report,null,2)); }
  return report;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [size='S',loader='on',flag]=process.argv.slice(2);
  const result=await verifyLive({size,loader,faults:flag==='--faults'}); console.log(JSON.stringify(result,null,2)); if(!result.pass) process.exitCode=1;
}
