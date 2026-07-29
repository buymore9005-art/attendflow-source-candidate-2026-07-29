import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const users = readFileSync('src/pages/admin/UsersPage.tsx', 'utf8');
const leave = readFileSync('src/pages/attendance/LeavePage.tsx', 'utf8');
const payroll = readFileSync('src/pages/payroll/PayrollRunsPage.tsx', 'utf8');
const payrollSettings = readFileSync('src/pages/payroll/PayrollSettingsPage.tsx', 'utf8');
const devices = readFileSync('src/pages/devices/DevicesPage.tsx', 'utf8');

test('database enum values are translated in user-facing status and frequency cells', () => {
  for (const source of [users, leave, payroll, payrollSettings, devices]) {
    assert.doesNotMatch(source, />\{String\(value\)\}<\/Badge>/);
    assert.doesNotMatch(source, />\{value\}<\/Badge>/);
    assert.doesNotMatch(source, />\{status\}<\/Badge>/);
  }
  assert.match(users, /t\(`status\.\$\{String\(value\)\}`\)/);
  assert.match(leave, /t\(`status\.\$\{String\(value\)\}`\)/);
  assert.match(payroll, /t\(`status\.\$\{value\}`\)/);
  assert.match(payroll, /t\(`payroll\.\$\{String\(value\)\}`\)/);
  assert.match(payrollSettings, /t\(`payroll\.\$\{String\(value\)\}`\)/);
  assert.match(devices, /t\(`status\.\$\{status\}`\)/);
});
