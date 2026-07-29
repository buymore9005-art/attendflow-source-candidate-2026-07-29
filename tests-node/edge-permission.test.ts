import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Edge Function permission checks execute with the caller JWT, not the service role', async () => {
  const source = await readFile(new URL('../supabase/functions/_shared/supabase.ts', import.meta.url), 'utf8');
  const requirePermission = source.slice(source.indexOf('export async function requirePermission'), source.indexOf('export async function auditEvent'));

  assert.match(requirePermission, /requestClient\(request\)\.rpc\('has_permission'/);
  assert.doesNotMatch(requirePermission, /adminClient\.rpc\('has_permission'/);
  assert.doesNotMatch(requirePermission, /p_user_id\s*:/);
});

test('has_permission does not treat an explicit user lookup as an automatic service-role allow', async () => {
  const sql = await readFile(new URL('../sql/000_full_schema.sql', import.meta.url), 'utf8');
  const start = sql.indexOf('create or replace function public.has_permission');
  const end = sql.indexOf('$$;', start) + 3;
  const definition = sql.slice(start, end);

  assert.match(definition, /auth\.role\(\)\s*=\s*'service_role'\s+and\s+p_user_id\s+is\s+null/i);
  assert.doesNotMatch(definition, /if\s+auth\.role\(\)\s*=\s*'service_role'\s+then\s+return\s+true/i);
});
