import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeliInvocationPlan } from '../supabase/functions/_shared/deli-scheduler.ts';

const now = new Date('2026-07-29T10:00:00.000Z');

test('scheduler prioritizes due queued Deli retries, limits concurrency, and selects one job per organization', () => {
  const plan = buildDeliInvocationPlan([
    { id: 'job-a1', organization_id: 'org-a', job_type: 'deli_attendance', status: 'queued', attempts: 1, max_attempts: 5, next_attempt_at: null },
    { id: 'job-a2', organization_id: 'org-a', job_type: 'deli_devices', status: 'queued', attempts: 0, max_attempts: 5, next_attempt_at: '2026-07-29T09:00:00.000Z' },
    { id: 'job-b', organization_id: 'org-b', job_type: 'deli_employees', status: 'queued', attempts: 0, max_attempts: 5, next_attempt_at: '2026-07-29T09:30:00.000Z' },
    { id: 'job-c', organization_id: 'org-c', job_type: 'deli_payroll', status: 'queued', attempts: 0, max_attempts: 5, next_attempt_at: '2026-07-29T09:45:00.000Z' },
    { id: 'job-x', organization_id: 'org-x', job_type: 'other_provider', status: 'queued', attempts: 0, max_attempts: 5, next_attempt_at: null },
  ], [], now, 3);

  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((item) => item.organizationId), ['org-a', 'org-b', 'org-c']);
  assert.ok(plan.every((item) => item.kind === 'retry'));
  assert.deepEqual(plan[0]?.body, { organization_id: 'org-a', action: 'retry_job', job_id: 'job-a1' });
});

test('scheduler only creates attendance work when the organization has no active Deli job and the interval is due', () => {
  const plan = buildDeliInvocationPlan([
    { id: 'future-a', organization_id: 'org-a', job_type: 'deli_payroll', status: 'queued', attempts: 0, max_attempts: 5, next_attempt_at: '2026-07-30T10:00:00.000Z' },
    { id: 'running-b', organization_id: 'org-b', job_type: 'deli_devices', status: 'running', attempts: 1, max_attempts: 5, next_attempt_at: null },
    { id: 'exhausted-c', organization_id: 'org-c', job_type: 'deli_attendance', status: 'queued', attempts: 5, max_attempts: 5, next_attempt_at: null },
  ], [
    { organization_id: 'org-a', configuration: { attendance_auto_sync: true, attendance_sync_interval_minutes: 15 }, last_success_at: null },
    { organization_id: 'org-b', configuration: { attendance_auto_sync: true, attendance_sync_interval_minutes: 15 }, last_success_at: null },
    { organization_id: 'org-c', configuration: { attendance_auto_sync: true, attendance_sync_interval_minutes: 15 }, last_success_at: null },
    { organization_id: 'org-d', configuration: { attendance_auto_sync: true, attendance_sync_interval_minutes: 15, attendance_last_sync_at: '2026-07-29T09:40:00.000Z' }, last_success_at: null },
    { organization_id: 'org-e', configuration: { attendance_auto_sync: false }, last_success_at: null },
    { organization_id: 'org-f', configuration: { attendance_auto_sync: true, attendance_sync_interval_minutes: 15, attendance_last_sync_at: '2026-07-29T09:50:00.000Z' }, last_success_at: null },
  ], now, 3);

  assert.deepEqual(plan, [
    {
      kind: 'attendance',
      organizationId: 'org-c',
      body: { organization_id: 'org-c', action: 'sync_attendance' },
    },
    {
      kind: 'attendance',
      organizationId: 'org-d',
      body: { organization_id: 'org-d', action: 'sync_attendance' },
    },
  ]);
});

test('scheduler rejects an invalid concurrency limit instead of silently over-scheduling', () => {
  assert.throws(() => buildDeliInvocationPlan([], [], now, 0), /maximumInvocations/);
});
