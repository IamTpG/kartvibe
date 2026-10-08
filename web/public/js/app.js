const client = document.body.dataset.client;
const $ = id => document.getElementById(id);
const host = location.hostname || 'localhost';
const base = port => `${location.protocol}//${host}:${port}`;
const endpoints = { user: base(4001), order: base(4002), product: base(4003), bff: base(4004), graphql: base(4005) };
const webQuery = `query Web($userId: Int!) { user(id: $userId) { id name } orders(userId: $userId) { id status createdAt items { productId quantity product { name price } } } }`;
const mobileQuery = `query Mobile($userId: Int!) { orders(userId: $userId) { id status items { product { name thumbnail } } } }`;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

async function apiFetch(url, options = {}, tally) {
  tally.requests++;
  const response = await fetch(url, { cache: 'no-store', ...options });
  const bytes = await response.arrayBuffer();
  tally.bytes += bytes.byteLength;
  let json;
  try { json = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error(`Phản hồi không phải JSON từ ${url}`); }
  if (!response.ok) throw new Error(`${response.status}: ${json.message || json.errors?.[0]?.message || 'Lỗi dịch vụ'}`);
  return json;
}

async function baseline(userId, tally) {
  // Strict waterfall: User -> Order -> one Product request per item.
  // Mobile skips User because its data contract has no user fields.
  const user = client === 'web' ? await apiFetch(`${endpoints.user}/users/${userId}`, {}, tally) : null;
  const result = await apiFetch(`${endpoints.order}/orders?userId=${userId}`, {}, tally);
  const orders = [];
  for (const order of result.data) {
    const items = [];
    for (const item of order.items) {
      let product = null;
      try { product = await apiFetch(`${endpoints.product}/products/${item.productId}`, {}, tally); }
      catch (error) { throw new Error(`Baseline Product ${item.productId}: ${error.message}`); }
      items.push(client === 'web'
        ? { productId: item.productId, quantity: item.quantity, product: { name: product.name, price: product.price } }
        : { product: { name: product.name, thumbnail: product.thumbnail } });
    }
    orders.push(client === 'web'
      ? { id: order.id, status: order.status, createdAt: order.createdAt, items }
      : { id: order.id, status: order.status, items });
  }
  return client === 'web' ? { user, orders, partial: false, errors: [] } : { orders, partial: false, errors: [] };
}

async function bff(userId, tally) {
  const path = client === 'web' ? '/bff/web/dashboard' : '/bff/mobile/orders';
  return apiFetch(`${endpoints.bff}${path}?userId=${userId}`, {}, tally);
}

async function graphql(userId, tally, loader) {
  // loader: 'off' = N+1 (DataLoader tắt), 'on' = đã sửa; bỏ trống = theo cấu hình của GraphQL service.
  const result = await apiFetch(`${endpoints.graphql}/graphql${loader ? `?dataloader=${loader}` : ''}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: client === 'web' ? webQuery : mobileQuery, variables: { userId } })
  }, tally);
  if (!result.data?.orders || (client === 'web' && !result.data.user))
    throw new Error(result.errors?.[0]?.message || 'GraphQL không trả đủ dữ liệu');
  return { ...result.data, partial: Boolean(result.errors?.length), errors: result.errors || [] };
}

function render(data) {
  const content = $('content');
  content.replaceChildren();
  if (client === 'web' && data.user) {
    const title = element('h2', 'section-title', data.user.name);
    content.append(title);
  }
  if (!data.orders.length) { content.append(element('p', 'empty', 'Chưa có đơn hàng.')); return; }
  const grid = element('div', 'order-grid');
  for (const order of data.orders) {
    const card = element('article', 'order-card');
    const heading = element('div', 'order-head');
    heading.append(element('h3', '', `#${order.id}`), element('span', 'status', order.status));
    card.append(heading);
    if (client === 'web') card.append(element('p', 'date', order.createdAt));
    const list = element('ul', 'items');
    for (const item of order.items) {
      const row = element('li', 'item');
      const detail = element('div', 'item-detail');
      detail.append(element('strong', '', item.product?.name ?? '—'));
      if (client === 'web') {
        detail.append(element('span', '', `ID ${item.productId} · SL ${item.quantity}`));
        row.append(detail, element('span', 'price', item.product ? `${item.product.price.toLocaleString('vi-VN')} ₫` : '—'));
      } else {
        detail.append(element('span', 'thumbnail-url', item.product?.thumbnail ?? '—'));
        row.append(detail);
      }
      list.append(row);
    }
    card.append(list);
    grid.append(card);
  }
  content.append(grid);
}

export async function loadDashboard() {
  const userId = Number($('user-id').value);
  if (!Number.isSafeInteger(userId) || userId < 1) { $('error').hidden = false; $('error').textContent = 'User ID phải là số nguyên dương.'; return null; }
  const button = $('load');
  button.disabled = true;
  $('error').hidden = true;
  $('state').textContent = 'Đang tải';
  $('content').replaceChildren();
  await window.DashboardDemo?.before?.();
  const tally = { requests: 0, bytes: 0 };
  const started = performance.now();
  let completeMs = null;
  let result = null;
  try {
    const mode = $('mode').value;
    result = await ({ baseline, bff, graphql,
      'graphql-naive': (u, t) => graphql(u, t, 'off'),
      'graphql-fixed': (u, t) => graphql(u, t, 'on') })[mode](userId, tally);
    render(result);
    performance.mark('screen-complete');
    completeMs = Math.round(performance.now() - started);
    $('state').textContent = result.partial ? 'Một phần' : 'Hoàn tất';
    if (result.partial) {
      $('error').hidden = false;
      $('error').textContent = 'Một số product chưa có dữ liệu; các dòng thiếu hiển thị “—”.';
    }
  } catch (error) {
    $('state').textContent = 'Lỗi';
    $('error').hidden = false;
    $('error').textContent = error.message;
  } finally {
    $('requests').textContent = String(tally.requests);
    $('bytes').textContent = `${tally.bytes.toLocaleString('vi-VN')} B`;
    $('duration').textContent = completeMs === null ? '—' : `${completeMs} ms`;
    button.disabled = false;
  }
  const out = { data: result, clientRequests: tally.requests, payloadBytes: tally.bytes,
    completeMs, partial: result?.partial ?? null };
  await window.DashboardDemo?.after?.(out, $('mode').value);
  return out;
}

window.Dashboard = { loadDashboard, endpoints, render };
$('load').addEventListener('click', loadDashboard);
const initial = new URLSearchParams(location.search);
if (['baseline', 'bff', 'graphql', 'graphql-naive', 'graphql-fixed'].includes(initial.get('mode'))) $('mode').value = initial.get('mode');
if (initial.has('userId')) $('user-id').value = initial.get('userId');
if (initial.get('auto') === '1') loadDashboard();
