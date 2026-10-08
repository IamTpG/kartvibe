// Bảng điều khiển đo: nối trang thật (hàm render) với bộ đo (MeasureClient.runSeries).
// Mỗi lần chạy: 1 lần lạnh (nếu có cold session) + 5 lần ấm; từng lần được gửi tới bộ thu kết quả (cổng 4010).
// Tự chạy khi có ?series=1&variant=bff&size=S&cold=<id>  (cold bỏ trống thì chỉ chạy 5 lần ấm).
const Measure = globalThis.MeasureClient;
const client = document.body.dataset.client;
const COLLECTOR = 'http://127.0.0.1:4010/results';
const params = new URLSearchParams(location.search);

function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n[k] = v;
  if (text !== undefined) n.textContent = text;
  return n;
}
function field(label, control) {
  const l = el('label', {}, label);
  l.append(control);
  return l;
}

const variant = el('select', { id: 'run-variant' });
for (const v of Measure.variants) variant.append(el('option', { value: v }, v));
const size = el('select', { id: 'run-size' });
for (const s of ['S', 'L']) size.append(el('option', { value: s }, s));
const cold = el('input', { id: 'run-cold', placeholder: 'cold session (từ restart-cold.sh)', size: 34 });
const runCold = el('button', { id: 'run-cold-btn', type: 'button' }, 'Chạy 1 lạnh + 5 ấm');
const runWarm = el('button', { id: 'run-warm-btn', type: 'button' }, 'Chạy 5 ấm');
const status = el('p', { id: 'run-status' }, 'Chưa chạy. Cần bộ thu kết quả: chạy `npm run collector` trong services/ (hoặc dùng `npm run matrix`)');
const body = el('tbody');
const table = el('table');
const head = el('thead');
const headRow = el('tr');
for (const h of ['Lần', 'Hoàn tất (ms)', 'Request', 'Payload (B)', 'Một phần']) headRow.append(el('th', {}, h));
head.append(headRow);
table.append(head, body);

const panel = el('details', { className: 'runner' });
panel.append(el('summary', {}, `Công cụ đo số liệu (${client}): không cần cho demo`));
if (params.get('series') === '1') panel.open = true;
const row = el('div', { className: 'row' });
row.append(field('Biến thể', variant), field('Kích thước dữ liệu', size), field('Cold session', cold), runCold, runWarm);
panel.append(row, status, table);
document.querySelector('main').append(panel);

for (const k of ['variant', 'size']) if (params.get(k)) (k === 'variant' ? variant : size).value = params.get(k);
if (params.get('cold')) cold.value = params.get('cold');

// GraphQL trả {data, errors}; render của trang cần {user?, orders, partial, errors}.
const normalize = (r) => ({ ...r.data, partial: Boolean(r.errors?.length), errors: r.errors || [] });
const load = async (cfg) => {
  const r = await Measure.loadContract(cfg);
  return cfg.variant.startsWith('graphql') ? normalize(r) : r;
};
const save = async (r) => {
  const res = await fetch(COLLECTOR, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) });
  if (!res.ok) throw new Error(`Bộ thu kết quả từ chối: ${await res.text()}`);
  const tr = el('tr');
  for (const v of [r.mode === 'cold' ? 'lạnh' : `ấm ${r.run}`, Math.round(r.completeMs), r.clientRequests, r.payloadBytes, r.partial ? 'có' : 'không']) tr.append(el('td', {}, v));
  body.append(tr);
};

async function run(withCold) {
  if (withCold && !cold.value.trim()) { status.textContent = 'Cần nhập cold session (chạy: bash services/restart-cold.sh).'; return null; }
  for (const b of [runCold, runWarm]) b.disabled = true;
  body.replaceChildren();
  status.textContent = `Đang đo ${variant.value} / ${client} / ${size.value}...`;
  try {
    const rows = await Measure.runSeries({
      config: { variant: variant.value, client, size: size.value },
      coldSession: withCold ? cold.value.trim() : null,
      load, render: (data) => window.Dashboard.render(data),
      resetMetrics: () => Measure.metrics('reset'), readMetrics: () => Measure.metrics('read'), save,
    });
    status.textContent = `Xong: ${rows.length} lần đã lưu vào bộ thu kết quả.`;
    document.body.dataset.runDone = 'ok';
    return rows;
  } catch (e) {
    status.textContent = `Lỗi: ${e.message}`;
    document.body.dataset.runDone = 'error';
    return null;
  } finally { for (const b of [runCold, runWarm]) b.disabled = false; }
}
runCold.addEventListener('click', () => run(true));
runWarm.addEventListener('click', () => run(false));
window.P2Runner = { run };
if (params.get('series') === '1') setTimeout(() => run(Boolean(cold.value.trim())), 300);
