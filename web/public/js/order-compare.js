// Điều khiển trang order-compare.html: gửi yêu cầu, hiện kết quả, khối điều khiển Inventory, lịch sử.
// Phần tính toán (chuẩn hóa, so sánh) nằm ở order-compare-logic.js.
import {
  COLUMNS, PRESETS, buildBody, compareResults, describeDifference, makeRequestId, parseBody, pushHistory, summarizeLogEntry,
} from './order-compare-logic.js';

const ORDER_TIMEOUT_MS = 5000;
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const skuInput = $('sku');
const quantityInput = $('quantity');
const buttons = [...document.querySelectorAll('button')];
let preset = 'ok';
let history = [];

// ---------- Cột và địa chỉ ----------
const columns = COLUMNS.map((c) => {
  const urlInput = el('input', { value: c.url });
  $('address-grid').prepend(el('label', {}, `${c.title}${c.optional ? ' (tùy chọn)' : ''}`, urlInput));
  const badge = el('span', { className: 'status idle', textContent: 'CHƯA GỬI' });
  const url = el('p', { className: 'url', textContent: c.url });
  urlInput.addEventListener('input', () => { url.textContent = urlInput.value; });
  const fields = { status: el('dd', { textContent: '—' }), time: el('dd', { textContent: '—' }), requestId: el('dd', { textContent: '—' }), reset: el('dd', { textContent: '—' }) };
  const body = el('pre', { textContent: '' });
  const logBox = el('ul', { className: 'logs' });
  const card = el('article', { className: 'order-card' },
    el('div', { className: 'order-head' }, el('div', {}, el('h3', { textContent: c.title }), url), badge),
    el('dl', {},
      el('dt', { textContent: 'status' }), fields.status,
      el('dt', {}, 'thời gian', el('br'), el('span', { className: 'timing-note', textContent: 'đo ở trình duyệt, chỉ để tham khảo' })), fields.time,
      el('dt', { textContent: 'requestId' }), fields.requestId,
      el('dt', { textContent: 'Xóa đơn' }), fields.reset),
    body,
    el('details', { className: 'inside', open: true }, el('summary', { textContent: 'Bên trong (từ log)' }), logBox));
  $('columns').append(card);
  return { ...c, urlInput, badge, fields, body, logBox, result: undefined };
});

const baseUrl = (input) => input.value.trim().replace(/\/+$/, '');

function setBadge(col, text, kind) {
  col.badge.textContent = text;
  col.badge.className = `status ${kind}`;
}

// ---------- Tình huống ----------
function scenarioLabel() {
  const p = PRESETS[preset];
  if (p) return p.label;
  return `Tùy chỉnh (sku=${skuInput.value}, quantity=${quantityInput.value})`;
}
function showScenario() { $('scenario').textContent = scenarioLabel(); }

document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  preset = b.dataset.preset;
  skuInput.value = PRESETS[preset].sku;
  quantityInput.value = String(PRESETS[preset].quantity);
  showScenario();
}));
[skuInput, quantityInput].forEach((i) => i.addEventListener('input', () => { preset = undefined; showScenario(); }));

// ---------- Gửi ----------
async function send(col, body) {
  const requestId = makeRequestId(col.key);
  col.fields.requestId.textContent = requestId;
  const started = performance.now();
  try {
    const res = await fetch(`${baseUrl(col.urlInput)}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': requestId },
      body,
      signal: AbortSignal.timeout(ORDER_TIMEOUT_MS),
    });
    const text = await res.text();
    return { state: 'ok', status: res.status, body: parseBody(text), ms: performance.now() - started, requestId };
  } catch (e) {
    const error = e.name === 'TimeoutError' ? `không trả lời trong ${ORDER_TIMEOUT_MS} ms` : 'không kết nối được';
    return { state: 'down', error, ms: performance.now() - started, requestId };
  }
}

function showResult(col, r) {
  col.result = r;
  col.fields.time.textContent = `${r.ms.toFixed(0)} ms`;
  if (r.state === 'ok') {
    setBadge(col, `HTTP ${r.status}`, r.status < 400 ? '' : 'down');
    col.fields.status.textContent = String(r.status);
    col.body.textContent = typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2);
  } else {
    setBadge(col, col.optional ? 'KHÔNG CHẠY' : 'KHÔNG TRẢ LỜI', 'down');
    col.fields.status.textContent = '—';
    col.body.textContent = col.optional ? `không chạy (${r.error}); không tính vào kết luận` : r.error;
  }
}

function showVerdict(v) {
  const box = $('verdict');
  box.className = `verdict ${v.verdict === 'GIỐNG NHAU' ? 'same' : 'diff'}`;
  const parts = [el('strong', { textContent: v.verdict })];
  parts.push(el('p', { textContent: `So status và body (orderId thay bằng "<ID>") giữa: ${v.compared.join(', ') || 'không cột nào'}.` }));
  if (v.skipped.length) parts.push(el('p', { textContent: `Bỏ qua (không chạy): ${v.skipped.join(', ')}.` }));
  if (v.note) parts.push(el('p', { textContent: v.note }));
  if (v.differences.length) parts.push(el('ul', {}, ...v.differences.map((d) => el('li', { textContent: describeDifference(d) }))));
  box.replaceChildren(...parts);
}

function renderHistory() {
  $('history').replaceChildren(...history.map((h) => el('tr', {},
    el('td', { textContent: h.time }), el('td', { textContent: h.scenario }), el('td', { textContent: h.verdict }))));
}

function setBusy(busy) { buttons.forEach((b) => { b.disabled = busy; }); }

$('order-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  setBusy(true);
  const scenario = scenarioLabel();
  const body = buildBody({ sku: skuInput.value, quantity: quantityInput.value, rawBody: PRESETS[preset]?.rawBody });
  for (const col of columns) {
    setBadge(col, 'ĐANG GỬI', 'idle');
    col.body.textContent = '';
    col.logBox.replaceChildren();
  }
  // Tuần tự theo thứ tự cột: các bản Order dùng chung tồn kho.
  for (const col of columns) showResult(col, await send(col, body));
  const verdict = compareResults(columns);
  showVerdict(verdict);
  history = pushHistory(history, { time: new Date().toLocaleTimeString('vi-VN'), scenario, verdict: verdict.verdict });
  renderHistory();
  await loadAllLogs();
  setBusy(false);
});

// ---------- Log bên trong ----------
// Tra log của các service theo requestId của từng cột (endpoint /_logs của web/server.mjs, cần ENABLE_TEST_HOOKS=1).
// Đây là bằng chứng về chặng trong; phản hồi ở trên không cho biết điều đó.
function showLogNote(col, text) { col.logBox.replaceChildren(el('li', { className: 'log-note', textContent: text })); }

async function loadLogs(col) {
  const requestId = col.result?.requestId;
  if (!requestId) return;
  try {
    const res = await fetch(`/_logs?requestId=${encodeURIComponent(requestId)}`, { signal: AbortSignal.timeout(ORDER_TIMEOUT_MS) });
    if (res.status === 404) { showLogNote(col, 'Trang chưa bật tra log: chạy web bằng ENABLE_TEST_HOOKS=1 npm start.'); return; }
    if (!res.ok) { showLogNote(col, `Không tra được log (HTTP ${res.status}).`); return; }
    const entries = await res.json();
    if (entries.length === 0) { showLogNote(col, 'Chưa có dòng log nào cho requestId này (Inventory có thể ghi chậm hơn); bấm "Làm mới log".'); return; }
    col.logBox.replaceChildren(...entries.map((e) => {
      const { where, text } = summarizeLogEntry(e);
      return el('li', { title: JSON.stringify(e) }, el('b', { textContent: `${where}: ` }), text);
    }));
  } catch {
    showLogNote(col, 'Không tra được log (không kết nối được web server).');
  }
}
const loadAllLogs = () => Promise.all(columns.map(loadLogs));
$('refresh-logs').addEventListener('click', async () => { setBusy(true); await loadAllLogs(); setBusy(false); });

// ---------- Xóa đơn ----------
async function post(url, json) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      ...(json === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(json) }),
      signal: AbortSignal.timeout(ORDER_TIMEOUT_MS),
    });
    return { ok: res.ok, text: `${res.status}` };
  } catch (e) {
    return { ok: false, text: e.name === 'TimeoutError' ? 'không trả lời' : 'không kết nối được' };
  }
}

$('reset-orders').addEventListener('click', async () => {
  setBusy(true);
  for (const col of columns) {
    const r = await post(`${baseUrl(col.urlInput)}/_reset`);
    col.fields.reset.textContent = `POST /_reset → ${r.text}`;
  }
  setBusy(false);
});

// ---------- Inventory ----------
const inventoryUrl = () => baseUrl($('inventory-url'));
async function inventoryAction(path, json, label, onOk) {
  setBusy(true);
  const r = await post(`${inventoryUrl()}${path}`, json);
  $('inv-last').textContent = `${label}: POST ${path}${json ? ` ${JSON.stringify(json)}` : ''} → ${r.text} (${new Date().toLocaleTimeString('vi-VN')})`;
  if (r.ok && onOk) onOk();
  setBusy(false);
}
$('inv-reset').addEventListener('click', () => inventoryAction('/_reset', undefined, 'Nạp lại tồn kho'));
$('inv-normal').addEventListener('click', () => inventoryAction('/_fault', { delayMs: 0 }, 'Inventory bình thường', () => {
  $('inv-state').textContent = 'Inventory bình thường (delayMs 0)';
}));
$('inv-slow').addEventListener('click', () => inventoryAction('/_fault', { delayMs: 2000 }, 'Làm chậm', () => {
  $('inv-state').textContent = 'Inventory đang bị làm chậm 2000 ms';
}));

$('inv-stop').addEventListener('click', () => {
  if (!window.confirm('Tắt Inventory (cả REST và gRPC)? Trang không bật lại được.')) return;
  inventoryAction('/_shutdown', undefined, 'Tắt Inventory', () => {
    $('inv-state').textContent = 'Inventory đã tắt (chạy lại start:measure để bật)';
  });
});

showScenario();
