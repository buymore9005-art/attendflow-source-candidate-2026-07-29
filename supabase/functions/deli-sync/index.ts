import { createDeliSignature } from '../_shared/deli-signature.ts';
import { retry } from '../_shared/retry.ts';
import { drainCursorPages } from '../_shared/pagination.ts';
import { validateAllowedHttpsWebhook } from '../_shared/outbound-webhook.ts';
import { adminClient, auditEvent, requirePermission } from '../_shared/supabase.ts';
import { correlationId, errorResponse, HttpError, jsonResponse, optionsResponse, readJsonObject, requiredString } from '../_shared/http.ts';

const DELI_BASE_URL = 'https://v2-api.delicloud.com';

interface DeliCredentials { appKey: string; appSecret: string }
interface DeliEnvelope<T = unknown> { code: number; msg?: string; data?: T }
interface IntegrationRow { id: string; organization_id: string; configuration: Record<string, unknown> }
interface JobRow { id: string; organization_id: string; integration_id: string | null; job_type: string; attempts: number; max_attempts: number; payload: Record<string, unknown> }
interface DeliAttendanceRecord { id: number | string; ext_id?: string; terminal_id?: string; check_type?: string; check_time: number; check_data?: string }
interface DeliIngestionResult { received?: number; inserted?: number; duplicates?: number; skipped?: number; skipped_records?: Array<{ id?: string; ext_id?: string }> }

function compactUuid(value: string): string { return value.replaceAll('-', '').slice(0, 32); }
function stableMobile(value: string): string {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `139${String(hash >>> 0).padStart(10, '0').slice(-8)}`;
}

function relatedName(value: unknown): string {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object' && 'name' in first ? String((first as { name?: unknown }).name ?? '') : '';
  }
  return value && typeof value === 'object' && 'name' in value ? String((value as { name?: unknown }).name ?? '') : '';
}

async function digestHex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function safeWebhookHeaders(request: Request): Record<string, string> {
  const allowed = ['content-type', 'user-agent', 'app-timestamp', 'x-forwarded-for', 'x-real-ip'];
  return Object.fromEntries(allowed.flatMap((name) => {
    const value = request.headers.get(name);
    return value ? [[name, value.slice(0, 500)] as const] : [];
  }));
}

function isInternalRequest(request: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET');
  const provided = request.headers.get('x-cron-secret');
  if (!expected || !provided || expected.length !== provided.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  return difference === 0;
}

async function secret(organizationId: string, name: string): Promise<string> {
  const { data, error } = await adminClient.rpc('get_organization_secret', { p_organization_id: organizationId, p_secret_name: name });
  if (error) throw error;
  if (!data) throw new HttpError(409, `${name} has not been configured.`, 'missing_credentials');
  return String(data);
}

async function credentials(organizationId: string): Promise<DeliCredentials> {
  const [appKey, appSecret] = await Promise.all([secret(organizationId, 'deli_app_key'), secret(organizationId, 'deli_app_secret')]);
  return { appKey, appSecret };
}

async function deliRequest<T>(credentialsValue: DeliCredentials, path: string, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}): Promise<T> {
  return retry(async () => {
    const timestamp = Date.now().toString();
    const signature = createDeliSignature(path, timestamp, credentialsValue.appKey, credentialsValue.appSecret);
    const response = await fetch(`${DELI_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'App-Key': credentialsValue.appKey,
        'App-Timestamp': timestamp,
        'App-Sig': signature,
        ...extraHeaders
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000)
    });
    const envelope = await response.json().catch(() => null) as DeliEnvelope<T> | null;
    if (!response.ok) throw new Error(`Deli HTTP ${response.status}`);
    if (!envelope || envelope.code !== 0) throw new Error(`Deli API ${envelope?.code ?? 'invalid'}: ${envelope?.msg ?? 'Unknown response'}`);
    return envelope.data as T;
  }, { attempts: 4, baseDelayMs: 400 });
}

async function loadIntegration(organizationId: string): Promise<IntegrationRow> {
  const { data: existing, error } = await adminClient.from('integrations').select('id,organization_id,configuration').eq('organization_id', organizationId).eq('provider', 'deli').eq('name', 'Deli E+').maybeSingle();
  if (error) throw error;
  if (existing) return { ...existing, configuration: (existing.configuration ?? {}) as Record<string, unknown> } as IntegrationRow;
  const { data, error: insertError } = await adminClient.from('integrations').insert({ organization_id: organizationId, provider: 'deli', name: 'Deli E+', is_enabled: true, configuration: { attendance_next_id: 0, attendance_initialized: false } }).select('id,organization_id,configuration').single();
  if (insertError) throw insertError;
  return data as IntegrationRow;
}

async function updateIntegration(integration: IntegrationRow, patch: Record<string, unknown>, markSuccess = true): Promise<void> {
  integration.configuration = { ...integration.configuration, ...patch };
  const update: Record<string, unknown> = { configuration: integration.configuration };
  if (markSuccess) Object.assign(update, { last_success_at: new Date().toISOString(), last_error: null });
  const { error } = await adminClient.from('integrations').update(update).eq('id', integration.id);
  if (error) throw error;
}

function jobDirection(action: string): 'inbound' | 'outbound' {
  return ['sync_attendance', 'sync_devices'].includes(action) ? 'inbound' : 'outbound';
}

async function createJob(organizationId: string, integrationId: string, action: string, userId: string | null, correlation: string): Promise<JobRow> {
  const direction = jobDirection(action);
  const { data, error } = await adminClient.from('integration_jobs').insert({ organization_id: organizationId, integration_id: integrationId, job_type: `deli_${action.replace('sync_', '').replace('validate_credentials', 'credentials')}`, direction, status: 'running', attempts: 1, started_at: new Date().toISOString(), payload: { action }, created_by: userId, correlation_id: correlation }).select('*').single();
  if (error) throw error;
  return data as JobRow;
}

async function enqueueContinuation(job: JobRow, payload: Record<string, unknown>): Promise<string> {
  const action = String(payload.action ?? job.payload.action ?? job.job_type.replace(/^deli_/, 'sync_'));
  const { data: existing, error: existingError } = await adminClient.from('integration_jobs').select('id').eq('organization_id', job.organization_id).eq('continuation_of', job.id).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return String(existing.id);

  const insert = {
    organization_id: job.organization_id,
    integration_id: job.integration_id,
    continuation_of: job.id,
    job_type: `deli_${action.replace('sync_', '').replace('validate_credentials', 'credentials')}`,
    direction: jobDirection(action),
    status: 'queued',
    attempts: 0,
    max_attempts: job.max_attempts,
    next_attempt_at: new Date().toISOString(),
    payload: { ...payload, action }
  };
  const { data, error } = await adminClient.from('integration_jobs').insert(insert).select('id').single();
  if (!error) return String(data.id);
  if (error.code === '23505') {
    const { data: raced, error: racedError } = await adminClient.from('integration_jobs').select('id').eq('organization_id', job.organization_id).eq('continuation_of', job.id).single();
    if (racedError) throw racedError;
    return String(raced.id);
  }
  throw error;
}

async function logJob(job: JobRow, level: 'debug' | 'info' | 'warning' | 'error', message: string, details: Record<string, unknown> = {}): Promise<void> {
  const { error } = await adminClient.from('integration_logs').insert({ organization_id: job.organization_id, integration_job_id: job.id, level, message, details, correlation_id: job.id });
  if (error) console.error(JSON.stringify({ integration_log_error: error.message, job_id: job.id }));
}

async function finishJob(job: JobRow, result: Record<string, unknown>): Promise<void> {
  const { error } = await adminClient.from('integration_jobs').update({ status: 'succeeded', result, completed_at: new Date().toISOString(), error_message: null }).eq('id', job.id);
  if (error) throw error;
  await logJob(job, 'info', 'Deli synchronization completed.', result);
}

async function failJob(job: JobRow, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Unknown Deli synchronization error';
  const exhausted = job.attempts >= job.max_attempts;
  const nextAttempt = new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.max(0, job.attempts - 1))).toISOString();
  await adminClient.from('integration_jobs').update({ status: exhausted ? 'failed' : 'queued', error_message: message.slice(0, 2000), next_attempt_at: exhausted ? null : nextAttempt, completed_at: exhausted ? new Date().toISOString() : null }).eq('id', job.id);
  await adminClient.from('integrations').update({ last_error_at: new Date().toISOString(), last_error: message.slice(0, 2000) }).eq('id', job.integration_id);
  await logJob(job, 'error', message);
}

async function validateCredentials(credentialsValue: DeliCredentials): Promise<Record<string, unknown>> {
  const data = await deliRequest<{ total?: string; rows?: unknown[] }>(credentialsValue, '/v2.0/employee/query', { limit: 1, offset: 0 });
  return { valid: true, visible_employees: Number(data?.total ?? 0) };
}

async function syncEmployees(organizationId: string, credentialsValue: DeliCredentials, job: JobRow): Promise<Record<string, unknown>> {
  const rootExtId = compactUuid(organizationId);
  const batchSize = 50;
  const phase = job.payload.phase === 'employees' ? 'employees' : 'departments';
  const offset = Number(job.payload.offset ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, 'Invalid Deli continuation offset.', 'invalid_continuation');

  if (phase === 'departments') {
    if (offset === 0) await deliRequest(credentialsValue, '/v2.0/department/init', { department_ext_id: rootExtId });
    const { data, error } = await adminClient.from('departments')
      .select('id,name,parent_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at')
      .order('id')
      .range(offset, offset + batchSize);
    if (error) throw error;
    const page = (data ?? []) as Array<{ id: string; name: string; parent_id: string | null }>;
    const departments = page.slice(0, batchSize);
    for (const department of departments) {
      await deliRequest(credentialsValue, '/v2.0/department', {
        department_ext_id: compactUuid(department.id),
        name: String(department.name).slice(0, 30),
        p_ext_id: department.parent_id ? compactUuid(department.parent_id) : rootExtId
      });
    }
    const hasMore = page.length > batchSize;
    const continuationJobId = await enqueueContinuation(job, {
      action: 'sync_employees',
      phase: hasMore ? 'departments' : 'employees',
      offset: hasMore ? offset + departments.length : 0
    });
    const result = { phase, offset, departments: departments.length, employees: 0, complete: false, continuation_job_id: continuationJobId };
    await logJob(job, 'info', 'Deli department batch synchronized; continuation queued.', result);
    return result;
  }

  const { data, error } = await adminClient.from('employees')
    .select('id,employee_no,full_name,phone,department_id,external_ids,position:positions(name)')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at')
    .order('id')
    .range(offset, offset + batchSize);
  if (error) throw error;
  const page = (data ?? []) as Array<{
    id: string;
    employee_no: string;
    full_name: string;
    phone: string | null;
    department_id: string | null;
    external_ids: Record<string, unknown> | null;
    position: unknown;
  }>;
  const employees = page.slice(0, batchSize);
  for (const employee of employees) {
    const positionName = relatedName(employee.position);
    const employeeExtId = compactUuid(employee.id);
    await deliRequest(credentialsValue, '/v2.0/employee', {
      employee_ext_id: employeeExtId,
      name: String(employee.full_name).slice(0, 30),
      mobile: String(employee.phone || stableMobile(employee.id)).slice(0, 20),
      employee_num: String(employee.employee_no).slice(0, 20),
      department_infos: [{ ext_id: employee.department_id ? compactUuid(employee.department_id) : rootExtId, title: positionName.slice(0, 16) }]
    });
    const currentExternalIds = employee.external_ids && typeof employee.external_ids === 'object' && !Array.isArray(employee.external_ids) ? employee.external_ids : {};
    const { error: updateError } = await adminClient.from('employees').update({ external_ids: { ...currentExternalIds, deli_ext_id: employeeExtId } }).eq('id', employee.id).eq('organization_id', organizationId);
    if (updateError) throw updateError;
  }

  const hasMore = page.length > batchSize;
  const continuationJobId = hasMore
    ? await enqueueContinuation(job, { action: 'sync_employees', phase: 'employees', offset: offset + employees.length })
    : null;
  const result = { phase, offset, departments: 0, employees: employees.length, complete: !hasMore, continuation_job_id: continuationJobId };
  await logJob(job, 'info', hasMore ? 'Deli employee batch synchronized; continuation queued.' : 'Deli employee synchronization completed.', result);
  return result;
}

async function syncDevices(organizationId: string, credentialsValue: DeliCredentials, job: JobRow): Promise<Record<string, unknown>> {
  const batchSize = 100;
  const offset = Number(job.payload.offset ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, 'Invalid Deli device continuation offset.', 'invalid_continuation');
  const data = await deliRequest<{ total?: string; rows?: Array<{ sn: string; name: string; online: boolean }> }>(credentialsValue, '/v2.0/org/device/query', { limit: batchSize, offset });
  const rows = data?.rows ?? [];
  const total = Number(data?.total ?? offset + rows.length);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Deli returned an invalid device total.');
  if (rows.some((device) => !String(device.sn ?? '').trim())) throw new Error('Deli returned a device without a serial number.');

  const deviceRows = rows.map((device) => ({
    organization_id: organizationId,
    vendor: 'deli',
    protocol: 'deli_cloud',
    name: String(device.name || device.sn).slice(0, 200),
    serial_number: String(device.sn).slice(0, 120),
    status: device.online ? 'online' : 'offline',
    last_seen_at: device.online ? new Date().toISOString() : null,
    metadata: { deli_managed: true }
  }));
  if (deviceRows.length > 0) {
    const { error } = await adminClient.from('attendance_devices').upsert(deviceRows, { onConflict: 'organization_id,serial_number' });
    if (error) throw error;
  }

  const nextOffset = offset + rows.length;
  if (rows.length === 0 && nextOffset < total) throw new Error('Deli device pagination did not advance.');
  const hasMore = nextOffset < total;
  const continuationJobId = hasMore
    ? await enqueueContinuation(job, { action: 'sync_devices', offset: nextOffset })
    : null;
  return { devices: rows.length, offset, total, complete: !hasMore, continuation_job_id: continuationJobId };
}

async function syncAttendance(organizationId: string, credentialsValue: DeliCredentials, integration: IntegrationRow, job: JobRow): Promise<Record<string, unknown>> {
  if (!integration.configuration.attendance_initialized) {
    await deliRequest(credentialsValue, '/v2.0/cloudappapi', {}, { 'Api-Module': 'CHECKIN', 'Api-Cmd': 'checkin_query_init' });
    await updateIntegration(integration, {
      attendance_initialized: true,
      attendance_initialized_at: new Date().toISOString(),
      attendance_next_id: 0,
      attendance_history_available: false
    }, false);
  }

  const initialNextId = Number(integration.configuration.attendance_next_id ?? 0);
  if (!Number.isSafeInteger(initialNextId) || initialNextId < 0) throw new HttpError(409, 'Stored Deli attendance cursor is invalid.', 'invalid_cursor');
  const totals = { received: 0, inserted: 0, duplicates: 0, skipped: 0 };

  const drained = await drainCursorPages<DeliAttendanceRecord, number>(initialNextId, async (cursor) => {
    const data = await deliRequest<{ next_id?: number; data?: DeliAttendanceRecord[] }>(credentialsValue, '/v2.0/cloudappapi', { next_id: cursor, page_size: 500 }, { 'Api-Module': 'CHECKIN', 'Api-Cmd': 'checkin_query' });
    const nextCursor = Number(data?.next_id ?? cursor);
    if (!Number.isSafeInteger(nextCursor) || nextCursor < 0) throw new Error('Deli returned an invalid attendance cursor.');
    return { rows: data?.data ?? [], nextCursor };
  }, async (records, nextCursor) => {
    const { data, error } = await adminClient.rpc('ingest_deli_attendance', { p_organization_id: organizationId, p_rows: records });
    if (error) throw error;
    const result = (data ?? {}) as DeliIngestionResult;
    totals.received += Number(result.received ?? records.length);
    totals.inserted += Number(result.inserted ?? 0);
    totals.duplicates += Number(result.duplicates ?? 0);
    totals.skipped += Number(result.skipped ?? 0);
    if ((result.skipped ?? 0) > 0) {
      await logJob(job, 'warning', 'Deli attendance records were skipped because employee mappings were not found.', {
        skipped: result.skipped ?? 0,
        sample: (result.skipped_records ?? []).slice(0, 50)
      });
    }
    await updateIntegration(integration, { attendance_next_id: nextCursor }, false);
  }, { maxPages: 4, maxRows: 2_000 });

  const continuationJobId = drained.complete
    ? null
    : await enqueueContinuation(job, { action: 'sync_attendance' });
  const syncedAt = new Date().toISOString();
  await updateIntegration(integration, {
    attendance_next_id: drained.nextCursor,
    attendance_last_sync_at: syncedAt,
    attendance_has_backlog: !drained.complete
  });
  return {
    ...totals,
    pages: drained.pages,
    next_id: drained.nextCursor,
    has_more: !drained.complete,
    continuation_job_id: continuationJobId,
    historical_data_available: false
  };
}

async function syncPayroll(organizationId: string, integration: IntegrationRow, job: JobRow): Promise<Record<string, unknown>> {
  const batchSize = 20;
  const epoch = '1970-01-01T00:00:00.000Z';
  const zeroUuid = '00000000-0000-0000-0000-000000000000';
  const configuredTimestamp = integration.configuration.payroll_cursor_updated_at;
  const configuredId = integration.configuration.payroll_cursor_id;
  const cursorDate = configuredTimestamp === undefined ? new Date(epoch) : new Date(String(configuredTimestamp));
  const payrollCursorId = configuredId === undefined ? zeroUuid : String(configuredId).toLowerCase();
  const validPayrollCursorId = payrollCursorId === zeroUuid || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(payrollCursorId);
  if (!Number.isFinite(cursorDate.getTime()) || !validPayrollCursorId) {
    throw new HttpError(409, 'Stored payroll export cursor is invalid.', 'invalid_cursor');
  }
  const cursorUpdatedAt = cursorDate.toISOString();

  let query = adminClient.from('payroll_runs')
    .select('*,items:payroll_items(*,employee:employees(employee_no,full_name))')
    .eq('organization_id', organizationId)
    .eq('status', 'finalized')
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(batchSize + 1);
  if (cursorUpdatedAt !== epoch || payrollCursorId !== zeroUuid) {
    query = query.or(`updated_at.gt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.gt.${payrollCursorId})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const page = (data ?? []) as Array<{ id: string; updated_at: string; [key: string]: unknown }>;
  const runs = page.slice(0, batchSize);
  const exportedAt = new Date().toISOString();
  if (runs.length === 0) {
    await updateIntegration(integration, { payroll_last_sync_at: exportedAt });
    return {
      payroll_runs: 0,
      storage_path: null,
      webhook_delivered: false,
      complete: true,
      continuation_job_id: null,
      note: 'The official Deli attendance API has no payroll endpoint; no finalized payroll rows were waiting for the configured HTTPS export adapter.'
    };
  }

  const payload = {
    schema: 'attendflow.deli-payroll-export.v1',
    organization_id: organizationId,
    source_job_id: job.id,
    exported_at: exportedAt,
    payroll_runs: runs
  };
  const path = `${organizationId}/deli/payroll-${job.id}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const { error: uploadError } = await adminClient.storage.from('integration-payloads').upload(path, bytes, { contentType: 'application/json', upsert: true });
  if (uploadError) throw uploadError;

  const webhookUrl = integration.configuration.payroll_webhook_url;
  const allowedWebhookUrl = validateAllowedHttpsWebhook(
    webhookUrl,
    Deno.env.get('DELI_PAYROLL_WEBHOOK_ALLOWED_ORIGINS'),
  );
  let delivered = false;
  if (allowedWebhookUrl) {
    const response = await retry(() => fetch(allowedWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `attendflow-${job.id}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000)
    }), { attempts: 4, baseDelayMs: 400 });
    if (!response.ok) throw new Error(`Payroll webhook returned HTTP ${response.status}`);
    delivered = true;
  }

  const lastRun = runs.at(-1)!;
  const lastUpdatedAt = new Date(lastRun.updated_at).toISOString();
  const lastId = String(lastRun.id).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(lastId)) throw new Error('Payroll query returned an invalid run ID.');
  await updateIntegration(integration, {
    payroll_cursor_updated_at: lastUpdatedAt,
    payroll_cursor_id: lastId,
    payroll_last_sync_at: exportedAt
  });
  const hasMore = page.length > batchSize;
  const continuationJobId = hasMore
    ? await enqueueContinuation(job, { action: 'sync_payroll' })
    : null;
  return {
    payroll_runs: runs.length,
    storage_path: path,
    webhook_delivered: delivered,
    complete: !hasMore,
    continuation_job_id: continuationJobId,
    cursor: { updated_at: lastUpdatedAt, id: lastId },
    note: 'The official Deli attendance API has no payroll endpoint; this export uses the configured HTTPS payroll webhook.'
  };
}

async function executeAction(action: string, organizationId: string, integration: IntegrationRow, job: JobRow): Promise<Record<string, unknown>> {
  if (action === 'sync_payroll') return syncPayroll(organizationId, integration, job);
  const credentialsValue = await credentials(organizationId);
  if (action === 'validate_credentials') return validateCredentials(credentialsValue);
  if (action === 'sync_employees') return syncEmployees(organizationId, credentialsValue, job);
  if (action === 'sync_devices') return syncDevices(organizationId, credentialsValue, job);
  if (action === 'sync_attendance') return syncAttendance(organizationId, credentialsValue, integration, job);
  throw new HttpError(400, 'Unsupported Deli synchronization action.', 'unsupported_action');
}

async function verifyWebhook(request: Request, organizationId: string, url: URL): Promise<void> {
  const appKey = await secret(organizationId, 'deli_app_key');
  const appSecret = await secret(organizationId, 'deli_app_secret');
  const headerKey = request.headers.get('App-Key') ?? request.headers.get('app-key') ?? '';
  const timestamp = request.headers.get('App-Timestamp') ?? request.headers.get('app-timestamp') ?? '';
  const signature = request.headers.get('App-Sig') ?? request.headers.get('app-sig') ?? '';
  if (headerKey !== appKey || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 10 * 60 * 1000) throw new HttpError(401, 'Invalid Deli webhook credentials or timestamp.', 'invalid_signature');
  const expected = createDeliSignature(url.pathname, timestamp, appKey, appSecret);
  if (signature.toLowerCase() !== expected) throw new HttpError(401, 'Invalid Deli webhook signature.', 'invalid_signature');
}

Deno.serve(async (request) => {
  const requestCorrelationId = correlationId(request);
  if (request.method === 'OPTIONS') return optionsResponse();
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Only POST is supported.', 'method_not_allowed');
    const url = new URL(request.url);
    const webhookMatch = url.pathname.match(/\/webhook\/([0-9a-f-]{36})\/?$/i);
    if (webhookMatch) {
      const organizationId = webhookMatch[1]!;
      await verifyWebhook(request, organizationId, url);
      const payload = await readJsonObject(request);
      const externalEventId = String(payload.id ?? payload.event_id ?? requestCorrelationId).slice(0, 200);
      const receivedSignature = request.headers.get('App-Sig') ?? request.headers.get('app-sig') ?? '';
      const signatureHash = receivedSignature ? `sha256:${await digestHex(receivedSignature)}` : null;
      const { error } = await adminClient.from('webhook_events').upsert({ organization_id: organizationId, provider: 'deli', external_event_id: externalEventId, signature: signatureHash, headers: safeWebhookHeaders(request), payload, status: 'succeeded', processed_at: new Date().toISOString() }, { onConflict: 'organization_id,provider,external_event_id' });
      if (error) throw error;
      return jsonResponse({ received: true, correlation_id: requestCorrelationId });
    }

    const body = await readJsonObject(request);
    const organizationId = requiredString(body.organization_id, 'organization_id', 36);
    const action = requiredString(body.action, 'action', 64);
    const permission = action === 'retry_job' ? 'integrations.update' : 'integrations.sync';
    const internal = isInternalRequest(request);
    const user = internal ? null : await requirePermission(request, organizationId, permission);
    const actorId = user?.id ?? null;
    const integration = await loadIntegration(organizationId);

    let job: JobRow;
    let effectiveAction = action;
    if (action === 'retry_job') {
      const jobId = requiredString(body.job_id, 'job_id', 36);
      const { data, error } = await adminClient.rpc('claim_integration_job', { p_organization_id: organizationId, p_job_id: jobId });
      if (error) throw error;
      if (!data) throw new HttpError(409, 'Deli job is not queued, has exhausted its attempts, or was already claimed.', 'job_not_claimable');
      job = data as JobRow;
      effectiveAction = String(job.payload.action ?? job.job_type.replace(/^deli_/, 'sync_'));
    } else {
      job = await createJob(organizationId, integration.id, action, actorId, requestCorrelationId);
    }

    try {
      const result = await executeAction(effectiveAction, organizationId, integration, job);
      await finishJob(job, result);
      await auditEvent({ organizationId, userId: actorId, eventType: 'integration', entityType: 'integration_jobs', entityId: job.id, action: effectiveAction, newData: result, request, correlationId: requestCorrelationId });
      return jsonResponse({ job_id: job.id, status: 'succeeded', result, correlation_id: requestCorrelationId }, 202);
    } catch (executionError) {
      await failJob(job, executionError);
      throw executionError;
    }
  } catch (error) {
    return errorResponse(error, requestCorrelationId);
  }
});
