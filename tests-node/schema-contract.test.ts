import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { collectFunctionPrivileges, collectSqlContract, collectSupabaseReferences } from '../scripts/schema-contract.mjs';

async function walk(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) result.push(full);
  }
  return result;
}

test('extracts SQL and Supabase client contracts without confusing Storage buckets with tables', () => {
  const contract = collectSqlContract(`
    create table if not exists public.employees(id uuid);
    create or replace view public.employee_directory as select * from public.employees;
    create or replace function public.find_employee() returns void language sql as $$ select; $$;
    insert into storage.buckets(id,name,public) values ('biometrics','biometrics',false);
  `);
  const references = collectSupabaseReferences(`
    client.from('employees');
    client.from('employee_directory');
    client.rpc('find_employee');
    client.storage.from('biometrics');
    client.functions.invoke('adms');
  `);

  assert.deepEqual([...contract.tables], ['employees']);
  assert.deepEqual([...contract.views], ['employee_directory']);
  assert.deepEqual([...contract.functions], ['find_employee']);
  assert.deepEqual([...contract.buckets], ['biometrics']);
  assert.deepEqual([...references.relations], ['employees', 'employee_directory']);
  assert.deepEqual([...references.rpcs], ['find_employee']);
  assert.deepEqual([...references.buckets], ['biometrics']);
  assert.deepEqual([...references.edgeFunctions], ['adms']);
});


test('every SECURITY DEFINER function explicitly revokes API execution before selective grants', async () => {
  const root = process.cwd();
  const sqlFiles = [
    'sql/000_full_schema.sql',
    'sql/001_seed.sql',
    'sql/002_scheduler.sql'
  ];
  const sql = (await Promise.all(sqlFiles.map((file) => readFile(path.join(root, file), 'utf8')))).join('\n');
  const privileges = collectFunctionPrivileges(sql);
  const requiredRevocations = ['public', 'anon', 'authenticated'];

  assert.ok(privileges.securityDefiners.size > 20, 'expected the canonical SQL to define many SECURITY DEFINER functions');
  assert.deepEqual(
    [...privileges.securityDefiners]
      .filter((name) => requiredRevocations.some((role) => !privileges.revokedFrom.get(name)?.has(role)))
      .sort(),
    []
  );
});

test('all literal Supabase references resolve to repository backend contracts', async () => {
  const root = process.cwd();
  const sql = await Promise.all([
    readFile(path.join(root, 'sql/000_full_schema.sql'), 'utf8'),
    readFile(path.join(root, 'sql/001_seed.sql'), 'utf8'),
    readFile(path.join(root, 'sql/002_scheduler.sql'), 'utf8')
  ]);
  const contract = collectSqlContract(sql.join('\n'));
  const references = { relations: new Set<string>(), rpcs: new Set<string>(), buckets: new Set<string>(), edgeFunctions: new Set<string>() };
  for (const file of [...await walk(path.join(root, 'src')), ...await walk(path.join(root, 'supabase/functions'))]) {
    const current = collectSupabaseReferences(await readFile(file, 'utf8'));
    for (const key of Object.keys(references) as Array<keyof typeof references>) {
      for (const value of current[key]) references[key].add(value);
    }
  }
  const edgeDirectories = new Set((await readdir(path.join(root, 'supabase/functions'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name));

  assert.deepEqual([...references.relations].filter((name) => !contract.tables.has(name) && !contract.views.has(name)).sort(), []);
  assert.deepEqual([...references.rpcs].filter((name) => !contract.functions.has(name)).sort(), []);
  assert.deepEqual([...references.buckets].filter((name) => !contract.buckets.has(name)).sort(), []);
  assert.deepEqual([...references.edgeFunctions].filter((name) => !edgeDirectories.has(name)).sort(), []);
});
