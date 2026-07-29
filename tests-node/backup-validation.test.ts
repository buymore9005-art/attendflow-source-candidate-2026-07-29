import assert from 'node:assert/strict';
import test from 'node:test';
import { validateOrganizationBackup } from '../supabase/functions/_shared/backup-validation.ts';

const organizationId = '11111111-1111-4111-8111-111111111111';
const allowedTables = ['employees', 'departments'] as const;

function validBackup() {
  return {
    schema: 'attendflow.organization-backup.v1',
    created_at: '2026-07-29T00:00:00.000Z',
    organization_id: organizationId,
    organization: { id: organizationId, name: 'Example' },
    tables: {
      employees: [{ id: 'e1', organization_id: organizationId, full_name: 'Alice' }],
      departments: [{ id: 'd1', organization_id: organizationId, name: 'HR' }],
    },
    record_count: 3,
  };
}

test('accepts a consistent organization-scoped backup envelope', () => {
  const result = validateOrganizationBackup(validBackup(), organizationId, allowedTables);
  assert.equal(result.record_count, 3);
});

test('rejects a backup whose organization row belongs to another tenant', () => {
  const payload = validBackup();
  payload.organization.id = '22222222-2222-4222-8222-222222222222';
  assert.throws(() => validateOrganizationBackup(payload, organizationId, allowedTables), /organization row/i);
});

test('rejects a table row belonging to another tenant', () => {
  const payload = validBackup();
  payload.tables.employees[0]!.organization_id = '22222222-2222-4222-8222-222222222222';
  assert.throws(() => validateOrganizationBackup(payload, organizationId, allowedTables), /employees.*organization/i);
});

test('rejects unknown tables and forged record counts', () => {
  const unknown = { ...validBackup(), tables: { ...validBackup().tables, secrets: [] } };
  assert.throws(() => validateOrganizationBackup(unknown, organizationId, allowedTables), /unknown backup table/i);

  const wrongCount = validBackup();
  wrongCount.record_count = 99;
  assert.throws(() => validateOrganizationBackup(wrongCount, organizationId, allowedTables), /record count/i);
});
