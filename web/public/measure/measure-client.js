/* Browser script and Node self-check: no dependencies. */
(function (root) {
  'use strict';
  const variants = ['baseline', 'bff', 'graphql-naive', 'graphql-fixed'];
  function createRecorder({ fetchImpl = root.fetch.bind(root), baseUrl = root.location?.href || 'http://localhost:4000', requestId = root.crypto.randomUUID() } = {}) {
    let clientRequests = 0, payloadBytes = 0;
    const calls = [];
    async function apiFetch(input, init = {}) {
      const url = new URL(input, baseUrl);
      const business = ['4001', '4002', '4003', '4004', '4005'].includes(url.port)
        && !['/health', '/_metrics', '/_metrics/reset', '/_fault'].includes(url.pathname);
      const headers = new Headers(init.headers);
      if (business) { clientRequests++; headers.set('x-request-id', requestId); }
      const start = performance.now();
      const response = await fetchImpl(url.href, { ...init, headers, cache: 'no-store' });
      const bytes = await response.arrayBuffer();
      if (business) { payloadBytes += bytes.byteLength; calls.push({ url: url.href, status: response.status, bytes: bytes.byteLength, ms: performance.now() - start }); }
      const text = new TextDecoder().decode(bytes);
      let body;
      try { body = text ? JSON.parse(text) : null; }
      catch { throw new Error(`Response không phải JSON: ${url.pathname} (${response.status})`); }
      if (!response.ok) { const error = new Error(`HTTP ${response.status}: ${url.pathname}`); error.status = response.status; error.body = body; throw error; }
      return body;
    }
    return { apiFetch, snapshot: () => ({ clientRequests, payloadBytes, requestId, calls: [...calls] }) };
  }
  const queries = {
    web: 'query Web($userId:Int!){ user(id:$userId){id name} orders(userId:$userId){id status createdAt items{productId quantity product{name price}}} }',
    mobile: 'query Mobile($userId:Int!){ orders(userId:$userId){id status items{product{name thumbnail}}} }'
  };
  async function loadContract({ variant, client, apiFetch, userId = 1, host = 'http://localhost' }) {
    if (!variants.includes(variant) || !['web', 'mobile'].includes(client) || !Number.isSafeInteger(userId) || userId < 1) throw new Error('Cấu hình tải không hợp lệ');
    if (variant === 'bff') return apiFetch(`${host}:4004/bff/${client}/${client === 'web' ? 'dashboard' : 'orders'}?userId=${userId}`);
    if (variant.startsWith('graphql')) return apiFetch(`${host}:4005/graphql?dataloader=${variant === 'graphql-naive' ? 'off' : 'on'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: queries[client], variables: { userId } }) });
    const user = client === 'web' ? await apiFetch(`${host}:4001/users/${userId}`) : null;
    const raw = await apiFetch(`${host}:4002/orders?userId=${userId}`);
    const orders = [];
    for (const order of raw.data) {
      const items = [];
      for (const item of order.items) {
        const product = await apiFetch(`${host}:4003/products/${item.productId}`);
        items.push(client === 'web'
          ? { productId: item.productId, quantity: item.quantity, product: { name: product.name, price: product.price } }
          : { product: { name: product.name, thumbnail: product.thumbnail } });
      }
      orders.push(client === 'web' ? { id: order.id, status: order.status, createdAt: order.createdAt, items } : { id: order.id, status: order.status, items });
    }
    return { ...(user ? { user } : {}), orders, partial: false, errors: [] };
  }
  async function metrics(action, host = 'http://localhost') {
    const result = {};
    for (const [name, port] of Object.entries({ user: 4001, order: 4002, product: 4003, bff: 4004, graphql: 4005 })) {
      const response = await root.fetch(`${host}:${port}/_metrics${action === 'reset' ? '/reset' : ''}`, { method: action === 'reset' ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Metrics ${name}: HTTP ${response.status}`);
      if (action !== 'reset') result[name] = await response.json();
    }
    return result;
  }
  let running = false;
  async function runSeries({ config, load, render, resetMetrics, readMetrics, save,
    warmRuns = 5, coldSession = null, fetchImpl, now = () => performance.now(),
    mark = () => performance.mark('screen-complete'), visible = () => !root.document || root.document.visibilityState === 'visible' }) {
    if (running) throw new Error('Một bộ đo đang chạy');
    if (!variants.includes(config.variant) || !['web', 'mobile'].includes(config.client) || !['S', 'L'].includes(config.size)) throw new Error('Cấu hình đo không hợp lệ');
    if (!Number.isInteger(warmRuns) || warmRuns < 5) throw new Error('Cần ít nhất 5 lần ấm');
    if (typeof save !== 'function') throw new Error('Thiếu nơi lưu kết quả');
    running = true;
    const rows = [];
    try {
      const modes = [...(coldSession ? ['cold'] : []), ...Array(warmRuns).fill('warm')];
      let warmIndex = 0;
      for (const mode of modes) {
        if (!visible()) throw new Error('Tab phải ở nền trước');
        await resetMetrics();
        const recorder = createRecorder({ fetchImpl });
        let hidden = false;
        const trackVisibility = () => { if (!visible()) hidden = true; };
        root.document?.addEventListener('visibilitychange', trackVisibility);
        const t0 = now();
        let data, completeMs;
        try {
          data = await load({ ...config, apiFetch: recorder.apiFetch });
          await render(data, config);
          completeMs = now() - t0;
          mark();
          if (hidden || !visible()) throw new Error('Tab đã chuyển nền trong lần đo');
        } finally { root.document?.removeEventListener('visibilitychange', trackVisibility); }
        const services = await readMetrics();
        const row = { ...config, mode, run: mode === 'cold' ? 1 : ++warmIndex,
          ...recorder.snapshot(), completeMs,
          partial: data.partial === true || (data.errors || []).some(e => e.extensions?.code === 'PRODUCT_UNAVAILABLE'),
          services, ...(mode === 'cold' ? { coldSession } : {}), measuredAt: new Date().toISOString() };
        await save(row);
        rows.push(row);
      }
      return rows;
    } finally { running = false; }
  }
  root.MeasureClient = { variants, queries, createRecorder, loadContract, metrics, runSeries };
  if (typeof module !== 'undefined') module.exports = root.MeasureClient;
})(globalThis);
