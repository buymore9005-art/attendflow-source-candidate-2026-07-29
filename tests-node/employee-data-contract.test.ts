import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('employee listing disambiguates every embedded foreign-key relationship', async () => {
  const page = await source('src/pages/employees/EmployeesPage.tsx');

  assert.match(page, /department:departments!employees_department_fk\(id,name\)/);
  assert.match(page, /position:positions!employees_position_fk\(id,name\)/);
  assert.match(page, /shift:shifts!employees_shift_fk\(id,name\)/);
});

test('employee registration invalidates the employee list before navigating back', async () => {
  const page = await source('src/pages/employees/EmployeeRegistrationPage.tsx');

  assert.match(page, /useQueryClient/);
  assert.match(page, /invalidateQueries\(\{\s*queryKey:\s*\['employees',\s*organizationId\]\s*\}\)/s);
  assert.ok(
    page.indexOf("invalidateQueries({ queryKey: ['employees', organizationId] })")
      < page.indexOf("navigate('/employees'"),
    'employee cache must be invalidated before navigation',
  );
});

test('employee changes participate in centralized Supabase cache reconciliation', async () => {
  const { REALTIME_TABLES, realtimeInvalidationRoots } = await import('../src/lib/realtime-sync.ts');

  assert.ok((REALTIME_TABLES as readonly string[]).includes('employees'));
  const roots = realtimeInvalidationRoots('employees');
  for (const root of ['employees', 'attendance-lookups', 'payroll-employees', 'dashboard']) {
    assert.ok(roots.includes(root), `employees must invalidate ${root}`);
  }

  const schema = await source('sql/000_full_schema.sql');
  const publication = schema.slice(schema.indexOf('-- Realtime'));
  assert.match(publication, /'employees'/);
});
