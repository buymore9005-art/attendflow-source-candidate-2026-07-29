import assert from 'node:assert/strict';
import test from 'node:test';
import { can, mergePermissions } from '../src/utils/permissions.ts';

test('merges role permissions with explicit grants and denials', () => {
  const permissions = mergePermissions(['employees.read', 'employees.write'], ['payroll.read'], ['employees.write']);
  assert.deepEqual([...permissions].sort(), ['employees.read', 'payroll.read']);
  assert.equal(can(permissions, 'employees.read'), true);
  assert.equal(can(permissions, 'employees.delete'), false);
});

test('wildcard permission grants all actions in a module', () => {
  assert.equal(can(mergePermissions(['attendance.*']), 'attendance.approve'), true);
  assert.equal(can(mergePermissions(['*']), 'settings.manage'), true);
});

test('an explicit denial overrides a role module wildcard', () => {
  const permissions = mergePermissions(['employees.*'], [], ['employees.delete']);

  assert.equal(can(permissions, 'employees.read'), true);
  assert.equal(can(permissions, 'employees.delete'), false);
});

test('a module denial overrides a global wildcard', () => {
  const permissions = mergePermissions(['*'], [], ['payroll.*']);

  assert.equal(can(permissions, 'settings.update'), true);
  assert.equal(can(permissions, 'payroll.read'), false);
});
