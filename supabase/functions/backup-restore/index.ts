import { decryptBackup, encryptBackup, sha256 } from '../_shared/crypto.ts';
import { auditEvent, adminClient, requirePermission } from '../_shared/supabase.ts';
import { correlationId, errorResponse, HttpError, jsonResponse, optionsResponse, readJsonObject, requiredString } from '../_shared/http.ts';
import { collectPaginatedRows } from '../_shared/pagination.ts';
import { validateOrganizationBackup, type OrganizationBackupEnvelope } from '../_shared/backup-validation.ts';

const backupTables = [
  'role_permissions', 'organization_settings', 'organization_members',
  'departments', 'positions', 'shifts', 'employees', 'shift_assignments', 'holidays',
  'attendance_devices', 'biometric_enrollments', 'biometric_assets', 'device_commands',
  'raw_attendance_logs', 'attendance_records', 'leave_requests',
  'payroll_profiles', 'payroll_runs', 'payroll_items', 'financial_adjustments',
  'integrations', 'integration_jobs', 'integration_logs', 'webhook_events',
  'audit_logs', 'system_notifications', 'number_sequences'
] as const;

const restoreOrder = [
  'role_permissions', 'organization_settings', 'departments', 'positions', 'shifts', 'employees',
  'organization_members', 'shift_assignments', 'holidays', 'attendance_devices', 'biometric_enrollments',
  'biometric_assets', 'device_commands', 'raw_attendance_logs', 'attendance_records', 'leave_requests',
  'payroll_profiles', 'payroll_runs', 'payroll_items', 'financial_adjustments', 'integrations',
  'integration_jobs', 'integration_logs', 'webhook_events', 'system_notifications',
  'number_sequences'
] as const;

const BACKUP_PAGE_SIZE = 500;
const BACKUP_MAX_ROWS_PER_TABLE = 100_000;
const backupOrderColumns: Partial<Record<(typeof backupTables)[number], readonly string[]>> = {
  organization_settings: ['organization_id'],
  number_sequences: ['sequence_key', 'period_key'],
};

async function fetchOrganizationRows(
  table: (typeof backupTables)[number],
  organizationId: string,
): Promise<Record<string, unknown>[]> {
  try {
    return await collectPaginatedRows(async (from, to) => {
      let query = adminClient.from(table).select('*').eq('organization_id', organizationId);
      for (const column of backupOrderColumns[table] ?? ['id']) query = query.order(column, { ascending: true });
      const { data, error } = await query.range(from, to);
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    }, { pageSize: BACKUP_PAGE_SIZE, maxRows: BACKUP_MAX_ROWS_PER_TABLE });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown pagination error';
    throw new Error(`Backup failed for ${table}: ${message}`);
  }
}

type BackupEnvelope = OrganizationBackupEnvelope;

async function createBackup(organizationId: string, jobId: string): Promise<Record<string, unknown>> {
  const { data: organization, error: organizationError } = await adminClient.from('organizations').select('*').eq('id', organizationId).single();
  if (organizationError) throw organizationError;
  const tables: Record<string, Record<string, unknown>[]> = {};
  let recordCount = 1;
  for (const table of backupTables) {
    const data = await fetchOrganizationRows(table, organizationId);
    tables[table] = data;
    recordCount += data.length;
  }
  const payload: BackupEnvelope = { schema: 'attendflow.organization-backup.v1', created_at: new Date().toISOString(), organization_id: organizationId, organization: organization as Record<string, unknown>, tables, record_count: recordCount };
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const checksum = await sha256(plaintext);
  const encrypted = await encryptBackup(plaintext);
  const storagePath = `${organizationId}/${payload.created_at.replace(/[:.]/g, '-')}-${checksum.slice(0, 16)}.afbackup`;
  const { error: uploadError } = await adminClient.storage.from('backups').upload(storagePath, encrypted, { contentType: 'application/octet-stream', upsert: false });
  if (uploadError) throw uploadError;
  const { error: updateError } = await adminClient.from('backup_jobs').update({ status: 'succeeded', storage_path: storagePath, checksum, record_count: recordCount, completed_at: new Date().toISOString() }).eq('id', jobId);
  if (updateError) throw updateError;
  return { storage_path: storagePath, checksum, record_count: recordCount, created_at: payload.created_at };
}

async function latestBackupPath(organizationId: string, requestedPath: unknown): Promise<string> {
  if (typeof requestedPath === 'string' && requestedPath.startsWith(`${organizationId}/`) && requestedPath.endsWith('.afbackup')) return requestedPath;
  const { data, error } = await adminClient.from('backup_jobs').select('storage_path').eq('organization_id', organizationId).eq('action', 'backup').eq('status', 'succeeded').not('storage_path', 'is', null).order('completed_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.storage_path) throw new HttpError(404, 'No completed organization backup was found.', 'backup_not_found');
  return data.storage_path;
}

function validateBackup(value: unknown, organizationId: string): BackupEnvelope {
  return validateOrganizationBackup(value, organizationId, backupTables);
}

function stripGenerated(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  if (table === 'device_commands') delete copy.command_no;
  return copy;
}

async function restoreBackup(organizationId: string, jobId: string, storagePath: string): Promise<Record<string, unknown>> {
  const { data: file, error: downloadError } = await adminClient.storage.from('backups').download(storagePath);
  if (downloadError || !file) throw downloadError ?? new Error('Backup object could not be downloaded.');
  const encrypted = new Uint8Array(await file.arrayBuffer());
  const plaintext = await decryptBackup(encrypted);
  const checksum = await sha256(plaintext);
  const payload = validateBackup(JSON.parse(new TextDecoder().decode(plaintext)), organizationId);
  const { error: organizationError } = await adminClient.from('organizations').upsert(payload.organization, { onConflict: 'id' });
  if (organizationError) throw organizationError;
  let restored = 1;
  const departmentManagers: Array<{ id: string; manager_employee_id: string }> = [];
  for (const table of restoreOrder) {
    let rows = (payload.tables[table] ?? []).map((row) => stripGenerated(table, row));
    if (table === 'departments') {
      rows = rows.map((row) => {
        if (typeof row.id === 'string' && typeof row.manager_employee_id === 'string') {
          departmentManagers.push({ id: row.id, manager_employee_id: row.manager_employee_id });
        }
        return { ...row, manager_employee_id: null };
      });
    }
    if (rows.length > 0) {
      const onConflict = table === 'number_sequences'
        ? 'organization_id,sequence_key,period_key'
        : table === 'organization_settings'
          ? 'organization_id'
          : 'id';
      for (let offset = 0; offset < rows.length; offset += 500) {
        const { error } = await adminClient.from(table).upsert(rows.slice(offset, offset + 500), { onConflict });
        if (error) throw new Error(`Restore failed for ${table}: ${error.message}`);
      }
      restored += rows.length;
    }
    if (table === 'employees' && departmentManagers.length > 0) {
      for (const manager of departmentManagers) {
        const { error } = await adminClient.from('departments').update({ manager_employee_id: manager.manager_employee_id }).eq('organization_id', organizationId).eq('id', manager.id);
        if (error) throw new Error(`Restore failed while reconnecting department managers: ${error.message}`);
      }
    }
  }
  const { error: jobError } = await adminClient.from('backup_jobs').update({ status: 'succeeded', storage_path: storagePath, checksum, record_count: restored, completed_at: new Date().toISOString() }).eq('id', jobId);
  if (jobError) throw jobError;
  return { storage_path: storagePath, checksum, restored_records: restored, backup_created_at: payload.created_at, mode: 'merge', archived_only_tables: ['audit_logs'] };
}

Deno.serve(async (request) => {
  const requestCorrelationId = correlationId(request);
  if (request.method === 'OPTIONS') return optionsResponse();
  let jobId: string | null = null;
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Only POST is supported.', 'method_not_allowed');
    const body = await readJsonObject(request);
    const organizationId = requiredString(body.organization_id, 'organization_id', 36);
    const action = requiredString(body.action, 'action', 16);
    if (!['backup', 'restore'].includes(action)) throw new HttpError(400, 'Unsupported backup action.', 'unsupported_action');
    const actor = await requirePermission(request, organizationId, 'settings.update');
    if (action === 'restore' && body.confirmation !== `RESTORE ${organizationId}`) throw new HttpError(400, `Restore requires confirmation text: RESTORE ${organizationId}`, 'restore_confirmation_required');
    const { data: job, error: jobError } = await adminClient.from('backup_jobs').insert({ organization_id: organizationId, action, status: 'running', requested_by: actor.id }).select('id').single();
    if (jobError) throw jobError;
    jobId = job.id;
    const result = action === 'backup' ? await createBackup(organizationId, jobId) : await restoreBackup(organizationId, jobId, await latestBackupPath(organizationId, body.storage_path));
    await auditEvent({ organizationId, userId: actor.id, eventType: 'backup', entityType: 'backup_jobs', entityId: jobId, action, newData: result, request, correlationId: requestCorrelationId });
    return jsonResponse({ job_id: jobId, status: 'succeeded', result, correlation_id: requestCorrelationId }, action === 'backup' ? 201 : 200);
  } catch (error) {
    if (jobId) await adminClient.from('backup_jobs').update({ status: 'failed', error_message: error instanceof Error ? error.message.slice(0, 2000) : 'Backup operation failed', completed_at: new Date().toISOString() }).eq('id', jobId);
    return errorResponse(error, requestCorrelationId);
  }
});
