import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  REALTIME_TABLES,
  isRealtimeFailureStatus,
  isRealtimeManagedQuery,
  realtimeInvalidationRoots,
  realtimeQueryMatches
} from '../src/lib/realtime-sync.ts';

const organizationId = '11111111-1111-1111-1111-111111111111';
const otherOrganizationId = '22222222-2222-2222-2222-222222222222';

test('integration job changes refresh job monitoring and Deli cursor settings', () => {
  const jobKey = ['integration-jobs', true, organizationId, 0, 20, ''] as const;
  const settingsKey = ['deli-integration-settings', organizationId] as const;
  assert.equal(realtimeQueryMatches(jobKey, 'integration_jobs', organizationId), true);
  assert.equal(realtimeQueryMatches(settingsKey, 'integration_jobs', organizationId), true);
  assert.equal(realtimeQueryMatches(jobKey, 'integration_jobs', otherOrganizationId), false);
  assert.equal(realtimeQueryMatches(['payroll-runs', organizationId], 'integration_jobs', organizationId), false);
});

test('dashboard is reconciled for attendance, device, and notification changes', () => {
  const dashboardKey = ['dashboard', organizationId, '2026-07-29'] as const;
  assert.equal(realtimeQueryMatches(dashboardKey, 'attendance_records', organizationId), true);
  assert.equal(realtimeQueryMatches(dashboardKey, 'attendance_devices', organizationId), true);
  assert.equal(realtimeQueryMatches(dashboardKey, 'biometric_enrollments', organizationId), true);
  assert.equal(realtimeQueryMatches(dashboardKey, 'system_notifications', organizationId), true);
  assert.equal(realtimeQueryMatches(dashboardKey, 'payroll_runs', organizationId), true);
});

test('attendance record changes also refresh the derived monthly summary', () => {
  const summaryKey = ['attendance-summary', false, organizationId, 0, 20, ''] as const;
  assert.equal(realtimeQueryMatches(summaryKey, 'attendance_records', organizationId), true);
  assert.equal(realtimeQueryMatches(summaryKey, 'attendance_devices', organizationId), false);
});

test('managed query detection includes all published operational cache roots', () => {
  for (const table of REALTIME_TABLES) {
    assert.ok(realtimeInvalidationRoots(table).length > 0, `${table} must invalidate at least one cache root`);
  }
  assert.equal(isRealtimeManagedQuery(['notifications', organizationId], organizationId), true);
  assert.equal(isRealtimeManagedQuery(['signed-file', 'bucket', 'path'], organizationId), false);
});

test('realtime status classifier enables fallback reconciliation on connection failures', () => {
  assert.equal(isRealtimeFailureStatus('CHANNEL_ERROR'), true);
  assert.equal(isRealtimeFailureStatus('TIMED_OUT'), true);
  assert.equal(isRealtimeFailureStatus('CLOSED'), true);
  assert.equal(isRealtimeFailureStatus('SUBSCRIBED'), false);
});

test('client realtime table list stays aligned with the Supabase publication', async () => {
  const schema = await readFile(new URL('../sql/000_full_schema.sql', import.meta.url), 'utf8');
  const realtimeSection = schema.slice(schema.indexOf('-- Realtime'));
  const publication = realtimeSection.match(/foreach t in array array\[([^\]]+)] loop/i)?.[1] ?? '';
  const publishedTables = [...publication.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...REALTIME_TABLES].sort(), publishedTables.sort());
});
