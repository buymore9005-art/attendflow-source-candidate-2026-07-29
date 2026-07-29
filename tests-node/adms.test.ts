import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdmsIdempotencyKey, parseAdmsAttLog } from '../supabase/functions/_shared/adms-parser.ts';

test('parses common ADMS ATTLOG rows', () => {
  const rows = parseAdmsAttLog('23\t2026-07-28 08:01:04\t0\t1\t0\t0\n24\t2026-07-28 08:04:10\t1\t1\t0\t0');
  assert.deepEqual(rows[0], {
    deviceUserId: '23', punchedAt: '2026-07-28 08:01:04', statusCode: 0,
    verificationMode: 1, workCode: '0', reserved: '0'
  });
  assert.equal(rows.length, 2);
});

test('creates stable idempotency keys for duplicate device events', async () => {
  const a = await createAdmsIdempotencyKey('SN001', '23', '2026-07-28 08:01:04', '0');
  const b = await createAdmsIdempotencyKey('SN001', '23', '2026-07-28 08:01:04', '0');
  const c = await createAdmsIdempotencyKey('SN002', '23', '2026-07-28 08:01:04', '0');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{64}$/);
});
