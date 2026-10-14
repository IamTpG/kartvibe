// Test của web/logs.mjs (tra log theo requestId). Chạy: node --test test/logs.test.mjs (trong web/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findLogs } from '../logs.mjs';

const line = (o) => JSON.stringify(o);

test('gom dòng theo requestId từ nhiều tệp, sắp theo ts, bỏ dòng khác và dòng hỏng', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logs-'));
  try {
    await writeFile(join(dir, 'order.log'), [
      line({ ts: '2026-01-01T00:00:02.000Z', service: 'order', requestId: 'ui-aaaa-rest', direction: 'inbound' }),
      line({ ts: '2026-01-01T00:00:01.000Z', service: 'order', requestId: 'ui-aaaa-rest', direction: 'outbound' }),
      line({ ts: '2026-01-01T00:00:03.000Z', service: 'order', requestId: 'ui-bbbb-rest' }),
      'không phải JSON ui-aaaa-rest',
    ].join('\n') + '\n');
    await writeFile(join(dir, 'inventory.log'), line({ ts: '2026-01-01T00:00:01.500Z', service: 'inventory', requestId: 'ui-aaaa-rest' }) + '\n');
    await writeFile(join(dir, 'ghi-chu.txt'), line({ requestId: 'ui-aaaa-rest' }));
    const got = await findLogs(dir, 'ui-aaaa-rest');
    assert.deepEqual(got.map((e) => [e.file, e.direction ?? '-']), [['order', 'outbound'], ['inventory', '-'], ['order', 'inbound']]);
  } finally { await rm(dir, { recursive: true }); }
});

test('requestId chứa ký tự đường dẫn hoặc quá dài bị từ chối (null)', async () => {
  assert.equal(await findLogs('.', '../etc/passwd'), null);
  assert.equal(await findLogs('.', 'a b'), null);
  assert.equal(await findLogs('.', ''), null);
  assert.equal(await findLogs('.', 'x'.repeat(81)), null);
});

test('thư mục log không tồn tại thì trả mảng rỗng', async () => {
  assert.deepEqual(await findLogs(join(tmpdir(), 'khong-ton-tai-xyz'), 'ui-aaaa-rest'), []);
});
