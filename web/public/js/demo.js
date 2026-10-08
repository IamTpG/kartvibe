// Bảng demo: (1) số liệu PHÍA SERVICE của lần tải vừa rồi, (2) lịch sử so sánh các chế độ, (3) công tắc chậm/lỗi của Product.
// Giúp thấy: browser gửi bao nhiêu request, và mỗi service nhận bao nhiêu lời gọi / truy vấn DB.
const PORTS = { user: 4001, order: 4002, product: 4003, bff: 4004, graphql: 4005 };
const base = (port) => `${location.protocol}//${location.hostname || 'localhost'}:${port}`;
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = String(text);
  return n;
}
function table(headers, bodyId) {
  const t = el('table', 'demo-table');
  const head = el('tr');
  for (const h of headers) head.append(el('th', '', h));
  const thead = el('thead'); thead.append(head);
  const tbody = el('tbody'); if (bodyId) tbody.id = bodyId;
  t.append(thead, tbody);
  return { t, tbody };
}
const row = (cells, cls) => { const tr = el('tr', cls); for (const c of cells) tr.append(el('td', '', c)); return tr; };

const panel = el('section', 'demo');
panel.append(el('h2', '', 'Phía service và so sánh'));

// (1) công tắc lỗi của Product
const faultBar = el('div', 'demo-row');
const faultState = el('span', 'demo-fault', 'Product: đang kiểm tra...');
async function setFault(body) {
  await fetch(`${base(PORTS.product)}/_fault`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await showFault();
}
async function showFault() {
  try {
    const f = await (await fetch(`${base(PORTS.product)}/_fault`)).json();
    faultState.textContent = f.error ? 'Product: LỖI 500' : f.latencyMs > 0 ? `Product: chậm thêm ${f.latencyMs} ms` : 'Product: bình thường';
  } catch { faultState.textContent = 'Product: không kết nối được'; }
}
for (const [label, body] of [['Product bình thường', {}], ['Product chậm 1500 ms', { latencyMs: 1500, error: false }], ['Product lỗi 500', { latencyMs: 0, error: true }]]) {
  const b = el('button', '', label); b.type = 'button';
  b.addEventListener('click', () => setFault(body));
  faultBar.append(b);
}
faultBar.append(faultState);
panel.append(faultBar, el('p', 'demo-note', 'Chậm 1500 ms vượt timeout 1000 ms của BFF/GraphQL nên kết quả trả về là MỘT PHẦN (product thiếu hiện “—”). Baseline gọi trực tiếp từng Product nên không có cơ chế một phần.'));

// (2) số liệu phía service của lần tải vừa rồi
panel.append(el('h3', '', 'Phía service, lần tải vừa rồi'));
const svc = table(['Service', 'Request nhận', 'Truy vấn DB'], 'demo-svc');
panel.append(svc.t);

// (3) lịch sử so sánh
panel.append(el('h3', '', 'Các lần tải gần đây (mới nhất ở trên)'));
const hist = table(['Chế độ', 'Request client', 'Payload (B)', 'Hoàn tất (ms)', 'Product: request / DB', 'Một phần'], 'demo-hist');
panel.append(hist.t);
const clear = el('button', '', 'Xóa lịch sử'); clear.type = 'button';
clear.addEventListener('click', () => hist.tbody.replaceChildren());
panel.append(clear);

document.querySelector('main').append(panel);
showFault();

async function readMetrics() {
  const out = {};
  await Promise.all(Object.entries(PORTS).map(async ([name, port]) => {
    try { out[name] = await (await fetch(`${base(port)}/_metrics`)).json(); } catch { out[name] = null; }
  }));
  return out;
}

window.DashboardDemo = {
  // Reset bộ đếm của mọi service trước khi tải để số liệu chỉ là của lần tải này.
  async before() {
    await Promise.all(Object.values(PORTS).map((p) => fetch(`${base(p)}/_metrics/reset`, { method: 'POST' }).catch(() => {})));
  },
  async after(out) {
    if (!out || out.completeMs === null) return;
    const m = await readMetrics();
    svc.tbody.replaceChildren();
    for (const name of Object.keys(PORTS)) {
      const x = m[name];
      svc.tbody.append(row([name, x ? x.requests : '—', x ? x.dbQueries : '—'], name === 'product' ? 'demo-hl' : ''));
    }
    const mode = $('mode').selectedOptions[0]?.textContent ?? '';
    const p = m.product;
    hist.tbody.prepend(row([mode, out.clientRequests, out.payloadBytes, out.completeMs, p ? `${p.requests} / ${p.dbQueries}` : '—', out.partial ? 'có' : 'không']));
    while (hist.tbody.rows.length > 12) hist.tbody.deleteRow(-1);
  },
};
