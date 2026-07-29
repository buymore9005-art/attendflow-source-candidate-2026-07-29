import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAllowedHttpsWebhook } from '../supabase/functions/_shared/outbound-webhook.ts';

test('accepts an HTTPS webhook only when its origin is deployment-allowlisted', () => {
  const result = validateAllowedHttpsWebhook(
    'https://adapter.example.com/payroll/receive?tenant=one',
    'https://adapter.example.com,https://backup.example.com:8443',
  );
  assert.equal(result, 'https://adapter.example.com/payroll/receive?tenant=one');
});

test('rejects a configured webhook when the deployment allowlist is absent or mismatched', () => {
  assert.throws(() => validateAllowedHttpsWebhook('https://adapter.example.com/hook', undefined), /allowed origins/i);
  assert.throws(
    () => validateAllowedHttpsWebhook('https://other.example.com/hook', 'https://adapter.example.com'),
    /not allowlisted/i,
  );
});

test('rejects unsafe schemes, credentials, local hosts and IP literals', () => {
  const allowlist = 'https://adapter.example.com';
  for (const value of [
    'http://adapter.example.com/hook',
    'https://user:password@adapter.example.com/hook',
    'https://localhost/hook',
    'https://127.0.0.1/hook',
    'https://[::1]/hook',
  ]) {
    assert.throws(() => validateAllowedHttpsWebhook(value, allowlist), /invalid|https|credentials|local|IP|allowlisted/i, value);
  }
});

test('treats an empty webhook setting as disabled without requiring an allowlist', () => {
  assert.equal(validateAllowedHttpsWebhook('', undefined), null);
  assert.equal(validateAllowedHttpsWebhook(null, undefined), null);
});

test('Deli payroll export validates the configured webhook against the deployment allowlist before fetch', async () => {
  const source = await (await import('node:fs/promises')).readFile(
    new URL('../supabase/functions/deli-sync/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /validateAllowedHttpsWebhook\(\s*webhookUrl,\s*Deno\.env\.get\('DELI_PAYROLL_WEBHOOK_ALLOWED_ORIGINS'\),?\s*\)/,
  );
  assert.doesNotMatch(source, /\bisHttpsUrl\s*\(/);
});
