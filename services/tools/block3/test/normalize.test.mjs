import assert from 'node:assert';
import { normalizeResponse, compareSnapshots } from '../lib/normalize.mjs';

console.log('[test:normalize] Running normalization unit tests...');

// Test 1: Hai phản hồi chỉ khác orderId -> PASS
{
  const respA = {
    status: 201,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-aaa', 'date': 'Mon, 12 Oct 2026 10:00:00 GMT' },
    body: { orderId: 101, sku: 'SKU-OK', quantity: 2, status: 'CONFIRMED' }
  };
  const respB = {
    status: 201,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-bbb', 'date': 'Mon, 12 Oct 2026 10:00:01 GMT' },
    body: { orderId: 202, sku: 'SKU-OK', quantity: 2, status: 'CONFIRMED' }
  };

  const result = compareSnapshots(respA, respB);
  assert.strictEqual(result.match, true, 'Hai phản hồi chỉ khác orderId và dynamic headers phải PASS');
  console.log('  ✓ Test 1 PASSED: Chỉ khác orderId và headers động -> PASS');
}

// Test 2: Khác status code -> FAIL
{
  const respA = {
    status: 201,
    body: { orderId: 101, sku: 'SKU-OK', quantity: 2, status: 'CONFIRMED' }
  };
  const respB = {
    status: 500,
    body: { orderId: 101, sku: 'SKU-OK', quantity: 2, status: 'CONFIRMED' }
  };

  const result = compareSnapshots(respA, respB);
  assert.strictEqual(result.match, false, 'Khác status phải FAIL');
  assert.ok(result.diff.includes('Status code mismatch'), 'Diff phải thông báo lệch status');
  console.log('  ✓ Test 2 PASSED: Khác status code -> FAIL');
}

// Test 3: Khác body fields -> FAIL
{
  const respA = {
    status: 409,
    body: { code: 'OUT_OF_STOCK', message: 'Item is out of stock' }
  };
  const respB = {
    status: 409,
    body: { code: 'OTHER_ERROR', message: 'Item is out of stock' }
  };

  const result = compareSnapshots(respA, respB);
  assert.strictEqual(result.match, false, 'Khác error code trong body phải FAIL');
  assert.ok(result.diff.includes('Body mismatch'), 'Diff phải thông báo lệch body');
  console.log('  ✓ Test 3 PASSED: Khác nội dung body -> FAIL');
}

// Test 4: Body dạng chuỗi không phải JSON (invalid-body)
{
  const respA = {
    status: 400,
    body: 'Bad Request: Not JSON'
  };
  const respB = {
    status: 400,
    body: 'Bad Request: Not JSON'
  };

  const result = compareSnapshots(respA, respB);
  assert.strictEqual(result.match, true, 'Hai chuỗi lỗi giống nhau phải PASS');
  console.log('  ✓ Test 4 PASSED: Non-JSON raw string body -> PASS');
}

console.log('[test:normalize] All normalization tests PASSED successfully!\n');
