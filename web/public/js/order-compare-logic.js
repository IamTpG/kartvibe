// Hàm thuần cho order-compare.html: chuẩn hóa phản hồi và kết luận giống/khác giữa các cột.
// Không đụng DOM hay mạng để kiểm được bằng node --test (web/test/order-compare-logic.test.mjs).

export const ID_PLACEHOLDER = '<ID>';
export const HISTORY_LIMIT = 10;

export const COLUMNS = [
  { key: 'rest', title: 'Order REST', url: 'http://localhost:4002', optional: false },
  { key: 'grpc', title: 'Order gRPC', url: 'http://localhost:4012', optional: false },
  { key: 'grpc-v1', title: 'Order gRPC cũ (proto v1)', url: 'http://localhost:4022', optional: true },
];

// Bốn tình huống mẫu. rawBody: chuỗi gửi nguyên văn (không phải JSON) cho tình huống "Body sai".
export const PRESETS = {
  ok: { label: 'Đủ hàng', sku: 'SKU-OK', quantity: 2 },
  zero: { label: 'Hết hàng', sku: 'SKU-ZERO', quantity: 1 },
  qty0: { label: 'Số lượng 0', sku: 'SKU-OK', quantity: 0 },
  badBody: { label: 'Body sai', sku: 'SKU-OK', quantity: 2, rawBody: '{"sku": "SKU-OK", "quantity": ' },
};

// Thân request gửi đi: rawBody nếu có, nếu không thì JSON { sku, quantity }.
// quantity rỗng gửi null; chuỗi số gửi dạng số; còn lại gửi nguyên chuỗi để Order tự báo 400.
export function buildBody({ sku, quantity, rawBody }) {
  if (rawBody !== undefined) return rawBody;
  const q = String(quantity ?? '').trim();
  const n = Number(q);
  return JSON.stringify({ sku, quantity: q === '' ? null : Number.isFinite(n) ? n : q });
}

// x-request-id cho từng lần gửi, kèm tên cột để tra log.
export function makeRequestId(columnKey, random = () => Math.random().toString(16).slice(2, 10)) {
  return `ui-${random()}-${columnKey}`;
}

// Thân phản hồi: JSON nếu đọc được, nếu không giữ chuỗi.
export function parseBody(text) {
  try { return JSON.parse(text); } catch { return text; }
}

// Thay mọi orderId (ở bất kỳ mức nào) bằng "<ID>"; giữ nguyên phần còn lại.
export function normalizeBody(body) {
  if (Array.isArray(body)) return body.map(normalizeBody);
  if (body && typeof body === 'object') {
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, k === 'orderId' ? ID_PLACEHOLDER : normalizeBody(v)]));
  }
  return body;
}

// Làm phẳng thành { "body.code": ..., ... } để chỉ ra trường khác nhau.
function flatten(value, prefix, out) {
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) out[prefix] = Array.isArray(value) ? '[]' : '{}';
    for (const [k, v] of entries) flatten(v, `${prefix}.${k}`, out);
  } else {
    out[prefix] = value;
  }
  return out;
}

const show = (v) => (v === undefined ? '(không có)' : JSON.stringify(v));

// columns: [{ key, title, optional, result }]
//   result: { state: 'ok', status, body } | { state: 'down', error }
// Cột tùy chọn không chạy: bỏ qua, không tính vào kết luận.
// Cột bắt buộc không chạy: tính là KHÁC (không thể nói hai bản cho cùng kết quả).
export function compareResults(columns) {
  const compared = [];
  const skipped = [];
  const differences = [];
  for (const c of columns) {
    if (c.result?.state === 'ok') compared.push(c);
    else if (c.optional) skipped.push(c.title);
    else differences.push({ column: c.title, field: 'phản hồi', expected: 'có phản hồi', actual: `không trả lời (${c.result?.error ?? 'không rõ'})` });
  }
  const [ref, ...rest] = compared;
  if (ref) {
    const refFlat = flatten(normalizeBody(ref.result.body), 'body', { status: ref.result.status });
    for (const c of rest) {
      const flat = flatten(normalizeBody(c.result.body), 'body', { status: c.result.status });
      for (const field of new Set([...Object.keys(refFlat), ...Object.keys(flat)])) {
        if (refFlat[field] !== flat[field]) {
          differences.push({ column: c.title, field, expected: show(refFlat[field]), actual: show(flat[field]), reference: ref.title });
        }
      }
    }
  }
  const same = differences.length === 0 && compared.length >= 2;
  return {
    verdict: same ? 'GIỐNG NHAU' : 'KHÁC',
    compared: compared.map((c) => c.title),
    skipped,
    differences,
    note: compared.length < 2 && differences.length === 0 ? 'Cần ít nhất hai cột có phản hồi để so' : '',
  };
}

// Dòng mô tả từng khác biệt, để hiện bằng chữ.
export function describeDifference(d) {
  if (d.reference) return `${d.column}: ${d.field} là ${d.actual}, còn ${d.reference} là ${d.expected}`;
  return `${d.column}: ${d.actual}`;
}

// Một dòng log của service thành chữ ngắn: ai ghi, hướng, giao thức, kết quả.
// Chỉ lấy các khóa quan trọng để thấy chặng trong: protocol, operation, grpcStatus/status, errorCode,
// clientVersion, available (có thể "absent"), reservationId, ms. Khóa nào vắng thì bỏ qua, không đoán.
export function summarizeLogEntry(e) {
  const where = `${e.service ?? e.file ?? '?'} ${e.direction === 'outbound' ? 'gọi đi' : 'nhận'}`;
  const proto = e.protocol ? e.protocol.toUpperCase() : undefined;
  const call = proto ? `${proto} ${e.operation ?? e.path ?? ''}`.trim() : `${e.method ?? ''} ${e.path ?? ''}`.trim();
  const result = e.grpcStatus ?? (e.status !== undefined ? String(e.status) : undefined);
  const parts = [call];
  if (result) parts.push(e.errorCode ? `${result} (${e.errorCode})` : result);
  else if (e.errorCode) parts.push(e.errorCode);
  if (e.clientVersion && e.clientVersion !== 'unknown') parts.push(`client ${e.clientVersion}`);
  if (e.available !== undefined) parts.push(`available=${e.available}`);
  if (e.reservationId) parts.push(`reservationId=${e.reservationId}`);
  if (e.ms !== undefined) parts.push(`${e.ms} ms`);
  return { where, text: parts.filter(Boolean).join(' · ') };
}

// Thêm vào lịch sử, mới nhất lên đầu, giữ tối đa HISTORY_LIMIT dòng.
export function pushHistory(history, entry, limit = HISTORY_LIMIT) {
  return [entry, ...history].slice(0, limit);
}
