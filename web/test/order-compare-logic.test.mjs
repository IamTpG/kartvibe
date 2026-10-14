// Test hàm so sánh của order-compare.html. Chạy: node --test test/ (trong web/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBody, compareResults, describeDifference, makeRequestId, normalizeBody, parseBody, pushHistory, summarizeLogEntry,
} from '../public/js/order-compare-logic.js';

const col = (title, result, optional = false) => ({ key: title, title, optional, result });
const ok = (status, body) => ({ state: 'ok', status, body });
const created = (orderId) => ok(201, { orderId, sku: 'SKU-OK', quantity: 2, status: 'CONFIRMED' });

test('hai phản hồi chỉ khác orderId thì GIỐNG NHAU', () => {
  const v = compareResults([col('REST', created(1)), col('gRPC', created(2))]);
  assert.equal(v.verdict, 'GIỐNG NHAU');
  assert.deepEqual(v.differences, []);
  assert.deepEqual(v.compared, ['REST', 'gRPC']);
});

test('khác status thì KHÁC, chỉ ra cột và trường', () => {
  const v = compareResults([
    col('REST', ok(409, { code: 'OUT_OF_STOCK', message: 'm' })),
    col('gRPC', ok(500, { code: 'OUT_OF_STOCK', message: 'm' })),
  ]);
  assert.equal(v.verdict, 'KHÁC');
  assert.deepEqual(v.differences.map((d) => [d.column, d.field]), [['gRPC', 'status']]);
  assert.match(describeDifference(v.differences[0]), /gRPC: status là 500, còn REST là 409/);
});

test('khác body thì KHÁC, chỉ ra trường body', () => {
  const v = compareResults([
    col('REST', ok(409, { code: 'OUT_OF_STOCK', message: 'm' })),
    col('gRPC', ok(409, { code: 'INTERNAL_ERROR', message: 'm' })),
  ]);
  assert.equal(v.verdict, 'KHÁC');
  assert.deepEqual(v.differences.map((d) => d.field), ['body.code']);
});

test('trường chỉ có ở một bên cũng là KHÁC', () => {
  const v = compareResults([col('REST', created(1)), col('gRPC', ok(201, { orderId: 2, sku: 'SKU-OK', quantity: 2, status: 'CONFIRMED', available: 8 }))]);
  assert.equal(v.verdict, 'KHÁC');
  assert.deepEqual(v.differences.map((d) => [d.field, d.expected, d.actual]), [['body.available', '(không có)', '8']]);
});

test('cột tùy chọn "không chạy" bị bỏ qua, không tính vào kết luận', () => {
  const v = compareResults([
    col('REST', created(1)),
    col('gRPC', created(2)),
    col('gRPC cũ', { state: 'down', error: 'không kết nối được' }, true),
  ]);
  assert.equal(v.verdict, 'GIỐNG NHAU');
  assert.deepEqual(v.skipped, ['gRPC cũ']);
  assert.deepEqual(v.compared, ['REST', 'gRPC']);
});

test('cột tùy chọn có chạy thì được so', () => {
  const v = compareResults([col('REST', created(1)), col('gRPC', created(2)), col('gRPC cũ', ok(409, { code: 'OUT_OF_STOCK', message: 'm' }), true)]);
  assert.equal(v.verdict, 'KHÁC');
  assert.ok(v.differences.every((d) => d.column === 'gRPC cũ'));
});

test('cột bắt buộc không trả lời thì KHÁC', () => {
  const v = compareResults([col('REST', created(1)), col('gRPC', { state: 'down', error: 'không kết nối được' })]);
  assert.equal(v.verdict, 'KHÁC');
  assert.equal(v.differences[0].column, 'gRPC');
});

test('body không phải JSON được so nguyên chuỗi', () => {
  assert.equal(compareResults([col('A', ok(400, 'Bad')), col('B', ok(400, 'Bad'))]).verdict, 'GIỐNG NHAU');
  assert.equal(compareResults([col('A', ok(400, 'Bad')), col('B', ok(400, { code: 'VALIDATION_ERROR' }))]).verdict, 'KHÁC');
});

test('normalizeBody thay orderId ở mọi mức, giữ nguyên phần còn lại', () => {
  assert.deepEqual(normalizeBody({ orderId: 7, nested: [{ orderId: 3, x: 1 }] }), { orderId: '<ID>', nested: [{ orderId: '<ID>', x: 1 }] });
  assert.equal(normalizeBody('text'), 'text');
});

test('buildBody: JSON thường, quantity rỗng thành null, rawBody gửi nguyên văn', () => {
  assert.equal(buildBody({ sku: 'SKU-OK', quantity: '2' }), '{"sku":"SKU-OK","quantity":2}');
  assert.equal(buildBody({ sku: 'SKU-OK', quantity: '' }), '{"sku":"SKU-OK","quantity":null}');
  assert.equal(buildBody({ sku: 'SKU-OK', quantity: 'abc' }), '{"sku":"SKU-OK","quantity":"abc"}');
  assert.equal(buildBody({ sku: 'x', quantity: 1, rawBody: '{oops' }), '{oops');
  assert.throws(() => JSON.parse(buildBody({ rawBody: '{"sku": "SKU-OK", "quantity": ' })));
});

test('parseBody, makeRequestId, pushHistory', () => {
  assert.deepEqual(parseBody('{"a":1}'), { a: 1 });
  assert.equal(parseBody('not json'), 'not json');
  assert.equal(makeRequestId('grpc', () => 'abcd1234'), 'ui-abcd1234-grpc');
  let h = [];
  for (let i = 1; i <= 12; i++) h = pushHistory(h, i);
  assert.deepEqual(h, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
});

test('summarizeLogEntry: Order gọi Inventory bằng gRPC, quá hạn', () => {
  const r = summarizeLogEntry({ service: 'order', direction: 'outbound', protocol: 'grpc', operation: 'Reserve', clientVersion: 'v2', available: 'absent', grpcStatus: 'DEADLINE_EXCEEDED', errorCode: 'INVENTORY_TIMEOUT', status: 4, ms: 502 });
  assert.equal(r.where, 'order gọi đi');
  assert.equal(r.text, 'GRPC Reserve · DEADLINE_EXCEEDED (INVENTORY_TIMEOUT) · client v2 · available=absent · 502 ms');
});

test('summarizeLogEntry: Order gọi Inventory bằng REST, không có grpcStatus', () => {
  const r = summarizeLogEntry({ service: 'order', direction: 'outbound', protocol: 'rest', operation: 'Reserve', clientVersion: 'v2', status: 409, errorCode: 'OUT_OF_STOCK', ms: 7 });
  assert.equal(r.text, 'REST Reserve · 409 (OUT_OF_STOCK) · client v2 · 7 ms');
});

test('summarizeLogEntry: dòng nhận ở Order không có protocol, và khóa vắng thì bỏ qua', () => {
  const r = summarizeLogEntry({ service: 'order', direction: 'inbound', method: 'POST', path: '/orders', status: 201, ms: 12 });
  assert.deepEqual(r, { where: 'order nhận', text: 'POST /orders · 201 · 12 ms' });
});

test('summarizeLogEntry: clientVersion "unknown" không hiện; available=0 vẫn hiện', () => {
  const r = summarizeLogEntry({ service: 'inventory', direction: 'inbound', protocol: 'grpc', operation: 'Reserve', clientVersion: 'unknown', available: 0, grpcStatus: 'OK' });
  assert.equal(r.text, 'GRPC Reserve · OK · available=0');
});

test('summarizeLogEntry: trả lời thành công thì hiện reservationId (gRPC kèm available, REST không có available)', () => {
  const grpc = summarizeLogEntry({ service: 'order', direction: 'outbound', protocol: 'grpc', operation: 'Reserve', clientVersion: 'v2', available: 6, grpcStatus: 'OK', status: 0, reservationId: 'RSV-2', ms: 24 });
  assert.equal(grpc.text, 'GRPC Reserve · OK · client v2 · available=6 · reservationId=RSV-2 · 24 ms');
  const rest = summarizeLogEntry({ service: 'order', direction: 'outbound', protocol: 'rest', operation: 'Reserve', clientVersion: 'v2', status: 201, reservationId: 'RSV-1', ms: 35 });
  assert.equal(rest.text, 'REST Reserve · 201 · client v2 · reservationId=RSV-1 · 35 ms');
});
