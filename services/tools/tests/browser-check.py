"""Browser adapter check, NOT real service benchmark. Requires Playwright."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[3]
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page()
    page.route('http://localhost:4000/measure-check', lambda route: route.fulfill(content_type='text/html', body='<html><body></body></html>'))
    page.goto('http://localhost:4000/measure-check')
    page.add_script_tag(path=str(ROOT / 'web/public/measure/measure-client.js'))
    result = page.evaluate('''async () => {
      const saved=[];
      document.body.innerHTML='<main id="output"></main>';
      const rows=await MeasureClient.runSeries({
        config:{variant:'bff',client:'web',size:'S'}, visible:()=>true,
        resetMetrics:async()=>{}, readMetrics:async()=>({}),
        fetchImpl:async()=>new Response(JSON.stringify({orders:[{id:1,product:'Sản phẩm 08'}],partial:false,errors:[]})),
        load:({apiFetch})=>apiFetch('http://localhost:4004/bff/web/dashboard?userId=1'),
        render:async data=>{document.querySelector('#output').textContent=JSON.stringify(data);},
        save:async row=>saved.push(row)
      });
      return {testAdapter:true,runs:rows.length,marks:performance.getEntriesByName('screen-complete').length,
        rendered:document.querySelector('#output').textContent,requests:rows.map(r=>r.clientRequests),bytes:rows.map(r=>r.payloadBytes)};
    }''')
    assert result['runs'] == 5 and result['marks'] == 5
    assert result['requests'] == [1]*5 and all(n>0 for n in result['bytes'])
    assert 'Sản phẩm 08' in result['rendered']
    browser.close()
(ROOT/'results/self-check').mkdir(parents=True,exist_ok=True)
(ROOT/'results/self-check/browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
