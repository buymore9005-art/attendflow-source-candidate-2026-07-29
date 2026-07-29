export interface OrganizationBackupEnvelope {
  schema: 'attendflow.organization-backup.v1';
  created_at: string;
  organization_id: string;
  organization: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
  record_count: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateOrganizationBackup(
  value: unknown,
  organizationId: string,
  allowedTables: readonly string[],
): OrganizationBackupEnvelope {
  if (!isRecord(value)) throw new Error('Backup payload is invalid.');
  if (value.schema !== 'attendflow.organization-backup.v1' || value.organization_id !== organizationId) {
    throw new Error('Backup schema or organization does not match.');
  }
  if (typeof value.created_at !== 'string' || Number.isNaN(Date.parse(value.created_at))) {
    throw new Error('Backup creation timestamp is invalid.');
  }
  if (!isRecord(value.organization) || value.organization.id !== organizationId) {
    throw new Error('Backup organization row does not match the requested organization.');
  }
  if (!isRecord(value.tables)) throw new Error('Backup tables are invalid.');

  const allowed = new Set(allowedTables);
  const tables: Record<string, Record<string, unknown>[]> = {};
  let countedRecords = 1;
  for (const [table, rowsValue] of Object.entries(value.tables)) {
    if (!allowed.has(table)) throw new Error(`Unknown backup table: ${table}.`);
    if (!Array.isArray(rowsValue)) throw new Error(`Backup table ${table} must be an array.`);
    const rows = rowsValue.map((row, index) => {
      if (!isRecord(row)) throw new Error(`Backup table ${table} contains an invalid row at index ${index}.`);
      if (row.organization_id !== organizationId) {
        throw new Error(`Backup table ${table} contains a row for a different organization.`);
      }
      return row;
    });
    tables[table] = rows;
    countedRecords += rows.length;
  }

  if (!Number.isSafeInteger(value.record_count) || value.record_count !== countedRecords) {
    throw new Error(`Backup record count is invalid; expected ${countedRecords}.`);
  }

  return {
    schema: 'attendflow.organization-backup.v1',
    created_at: value.created_at,
    organization_id: organizationId,
    organization: value.organization,
    tables,
    record_count: value.record_count,
  };
}
