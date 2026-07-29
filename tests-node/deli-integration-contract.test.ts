import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Deli employee synchronization uses bounded continuation jobs instead of silent query limits', async () => {
  const source = await readFile(new URL('../supabase/functions/deli-sync/index.ts', import.meta.url), 'utf8');
  const start = source.indexOf('async function syncEmployees');
  const end = source.indexOf('async function syncDevices');
  assert.ok(start >= 0 && end > start);
  const syncEmployees = source.slice(start, end);

  assert.match(syncEmployees, /range\(offset,\s*offset \+ batchSize\)/);
  assert.match(syncEmployees, /enqueueContinuation/);
  assert.doesNotMatch(syncEmployees, /\.limit\((?:500|1000)\)/);
});

test('Deli attendance synchronization drains cursors in bounded pages and ingests each page in one RPC', async () => {
  const source = await readFile(new URL('../supabase/functions/deli-sync/index.ts', import.meta.url), 'utf8');
  const start = source.indexOf('async function syncAttendance');
  const end = source.indexOf('async function syncPayroll');
  assert.ok(start >= 0 && end > start);
  const syncAttendance = source.slice(start, end);

  assert.match(source, /drainCursorPages/);
  assert.match(syncAttendance, /rpc\('ingest_deli_attendance'/);
  assert.match(syncAttendance, /enqueueContinuation/);
  assert.doesNotMatch(syncAttendance, /for \(const record of records\)/);
});

test('database Deli ingestion is service-role-only, bounded and idempotent', async () => {
  const schema = await readFile(new URL('../sql/000_full_schema.sql', import.meta.url), 'utf8');
  const start = schema.search(/create or replace function public\.ingest_deli_attendance\(/i);
  assert.ok(start >= 0, 'missing ingest_deli_attendance RPC');
  const tail = schema.slice(start);
  const end = tail.search(/\ncreate or replace function public\./i);
  const fn = end > 0 ? tail.slice(0, end) : tail;

  assert.match(fn, /auth\.role\(\)\s*<>\s*'service_role'/i);
  assert.match(fn, /jsonb_array_length\(p_rows\)\s*>\s*500/i);
  assert.match(fn, /on conflict\s*\(organization_id,idempotency_key\)\s*do nothing/i);
  assert.match(fn, /'deli'/i);
});

test('Deli device synchronization batches one API page and queues explicit continuation work', async () => {
  const source = await readFile(new URL('../supabase/functions/deli-sync/index.ts', import.meta.url), 'utf8');
  const start = source.indexOf('async function syncDevices');
  const end = source.indexOf('async function syncAttendance');
  assert.ok(start >= 0 && end > start);
  const syncDevices = source.slice(start, end);

  assert.match(syncDevices, /enqueueContinuation/);
  assert.match(syncDevices, /upsert\(deviceRows/);
  assert.doesNotMatch(syncDevices, /for \(let page = 0; page < 20/);
});

test('payroll export uses a durable tuple cursor and a retry-stable job identity', async () => {
  const source = await readFile(new URL('../supabase/functions/deli-sync/index.ts', import.meta.url), 'utf8');
  const start = source.indexOf('async function syncPayroll');
  const end = source.indexOf('async function executeAction');
  assert.ok(start >= 0 && end > start);
  const syncPayroll = source.slice(start, end);

  assert.match(syncPayroll, /payroll_cursor_updated_at/);
  assert.match(syncPayroll, /payroll_cursor_id/);
  assert.match(syncPayroll, /job\.id/);
  assert.match(syncPayroll, /upsert:\s*true/);
  assert.match(syncPayroll, /enqueueContinuation/);
  assert.doesNotMatch(syncPayroll, /payroll_last_sync_at.*1970/);
});

test('scheduled maintenance only retries Deli jobs and caps concurrent child invocations', async () => {
  const source = await readFile(new URL('../supabase/functions/scheduled-maintenance/index.ts', import.meta.url), 'utf8');
  assert.match(source, /like\('job_type',\s*'deli_%'\)/);
  assert.match(source, /MAX_DELI_INVOCATIONS\s*=\s*3/);
  assert.match(source, /Promise\.allSettled/);
  assert.doesNotMatch(source, /\.limit\(20\)/);
});

test('Deli retry jobs are claimed atomically before execution', async () => {
  const source = await readFile(new URL('../supabase/functions/deli-sync/index.ts', import.meta.url), 'utf8');
  const retryStart = source.indexOf("if (action === 'retry_job')");
  const retryEnd = source.indexOf('} else {', retryStart);
  assert.ok(retryStart >= 0 && retryEnd > retryStart);
  const retryBranch = source.slice(retryStart, retryEnd);
  assert.match(retryBranch, /rpc\('claim_integration_job'/);
  assert.doesNotMatch(retryBranch, /from\('integration_jobs'\)\.select/);

  const schema = await readFile(new URL('../sql/000_full_schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /create or replace function public\.claim_integration_job\(/i);
  assert.match(schema, /where organization_id=p_organization_id and id=p_job_id and status='queued'/i);
});

test('payroll cursor validation occurs before converting an invalid date to ISO', async () => {
  const source = await readFile(new URL('../supabase/functions/deli-sync/index.ts', import.meta.url), 'utf8');
  const start = source.indexOf('async function syncPayroll');
  const end = source.indexOf('async function executeAction');
  assert.ok(start >= 0 && end > start);
  const syncPayroll = source.slice(start, end);
  const validation = syncPayroll.indexOf('Number.isFinite(cursorDate.getTime())');
  const conversion = syncPayroll.indexOf('cursorDate.toISOString()');
  assert.ok(validation >= 0 && conversion >= 0);
  assert.ok(validation < conversion, 'cursorDate must be validated before toISOString can throw');
});

test('stale integration jobs are recovered atomically and exhausted jobs become failed', async () => {
  const scheduler = await readFile(new URL('../supabase/functions/scheduled-maintenance/index.ts', import.meta.url), 'utf8');
  assert.match(scheduler, /rpc\('recover_stale_integration_jobs'/);
  assert.doesNotMatch(scheduler, /from\('integration_jobs'\)[\s\S]{0,300}update\(\{\s*status:\s*'queued'/);

  const schema = await readFile(new URL('../sql/000_full_schema.sql', import.meta.url), 'utf8');
  const start = schema.search(/create or replace function public\.recover_stale_integration_jobs\(/i);
  assert.ok(start >= 0, 'missing recover_stale_integration_jobs RPC');
  const tail = schema.slice(start);
  const end = tail.search(/\ncreate or replace function public\./i);
  const fn = end > 0 ? tail.slice(0, end) : tail;
  assert.match(fn, /attempts\s*>=\s*max_attempts[\s\S]*status='failed'/i);
  assert.match(fn, /attempts\s*<\s*max_attempts[\s\S]*status='queued'/i);
  assert.match(fn, /auth\.role\(\)\s*<>\s*'service_role'/i);
});

test('database prevents two running Deli jobs for one organization', async () => {
  const schema = await readFile(new URL('../sql/000_full_schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /create unique index[^;]+on public\.integration_jobs\s*\(organization_id\)[^;]+status='running'[^;]+left\(job_type,5\)='deli_'/is);
});
