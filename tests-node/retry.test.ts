import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBackoffMs, retryOperation } from '../src/utils/retry.ts';

test('uses capped exponential backoff without jitter when disabled', () => {
  assert.equal(computeBackoffMs(1, { baseMs: 1000, maxMs: 10_000, jitter: false }), 1000);
  assert.equal(computeBackoffMs(4, { baseMs: 1000, maxMs: 10_000, jitter: false }), 8000);
  assert.equal(computeBackoffMs(6, { baseMs: 1000, maxMs: 10_000, jitter: false }), 10_000);
});

test('retries transient failures and returns the successful value', async () => {
  let attempts = 0;
  const value = await retryOperation(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('temporary');
    return 'ok';
  }, { maxAttempts: 3, delay: async () => undefined });
  assert.equal(value, 'ok');
  assert.equal(attempts, 3);
});
