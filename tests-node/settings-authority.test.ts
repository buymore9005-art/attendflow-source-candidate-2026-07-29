import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('settings page links to authoritative work, holiday, and payroll modules instead of persisting duplicate values', async () => {
  const settings = await read('src/pages/settings/SettingsPage.tsx');

  assert.match(settings, /to="\/shifts"/);
  assert.match(settings, /to="\/holidays"/);
  assert.match(settings, /to="\/payroll\/settings"/);
  assert.doesNotMatch(settings, /default_start_time|default_end_time|work_days_per_month/);
  assert.doesNotMatch(settings, /default_late_deduction|default_absent_deduction|default_bpjs_percent|default_tax_percent/);
  assert.doesNotMatch(settings, /session_timeout_minutes|mfa_required|export_watermark/);
});

test('holiday records have a real CRUD route and navigation entry backed by the holidays table', async () => {
  const [app, navigation, pages] = await Promise.all([
    read('src/app/App.tsx'),
    read('src/layout/navigation.ts'),
    read('src/pages/organization/MasterDataPages.tsx')
  ]);

  assert.match(app, /path="holidays"/);
  assert.match(app, /HolidaysPage/);
  assert.match(navigation, /path:\s*'\/holidays'/);
  assert.match(pages, /export function HolidaysPage/);
  assert.match(pages, /table:\s*'holidays'/);
  assert.match(pages, /permissionPrefix="settings"/);
});

test('new organizations do not seed settings keys that have no runtime consumer', async () => {
  const schema = await read('sql/000_full_schema.sql');

  assert.doesNotMatch(schema, /jsonb_build_object\('default_start_time'/);
  assert.doesNotMatch(schema, /jsonb_build_object\('default_late_deduction'/);
  assert.doesNotMatch(schema, /jsonb_build_object\('session_timeout_minutes'/);
  assert.match(schema, /insert into public\.organization_settings[\s\S]*?'\{\}'::jsonb,[\s\S]*?'\{\}'::jsonb,[\s\S]*?jsonb_build_object\('employee_prefix'/);
});

test('master data status labels are translated instead of hard-coded in English', async () => {
  const pages = await read('src/pages/organization/MasterDataPages.tsx');
  assert.doesNotMatch(pages, />Active<|>Inactive</);
  assert.match(pages, /t\('common\.active'\)/);
  assert.match(pages, /t\('common\.inactive'\)/);
});
