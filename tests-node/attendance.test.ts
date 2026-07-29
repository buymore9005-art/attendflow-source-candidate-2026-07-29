import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAttendance } from '../src/utils/attendance-calculator.ts';

const base = {
  workDate: '2026-07-28',
  shiftStart: '08:00',
  shiftEnd: '17:00',
  graceMinutes: 10,
  breakMinutes: 60,
  overtimeStartsAfterMinutes: 30,
  crossMidnight: false
};

test('calculates normal working minutes after break and grace', () => {
  const result = calculateAttendance({ ...base, clockIn: '08:07', clockOut: '17:00' });
  assert.equal(result.status, 'present');
  assert.equal(result.lateMinutes, 0);
  assert.equal(result.earlyLeaveMinutes, 0);
  assert.equal(result.workMinutes, 473);
  assert.equal(result.overtimeMinutes, 0);
});

test('calculates late, early leave and overtime independently', () => {
  const late = calculateAttendance({ ...base, clockIn: '08:25', clockOut: '17:00' });
  assert.equal(late.lateMinutes, 15);
  const early = calculateAttendance({ ...base, clockIn: '08:00', clockOut: '16:20' });
  assert.equal(early.earlyLeaveMinutes, 40);
  const overtime = calculateAttendance({ ...base, clockIn: '08:00', clockOut: '18:10' });
  assert.equal(overtime.overtimeMinutes, 70);
});

test('supports a shift crossing midnight', () => {
  const result = calculateAttendance({
    ...base,
    shiftStart: '22:00',
    shiftEnd: '06:00',
    crossMidnight: true,
    clockIn: '21:55',
    clockOut: '06:30'
  });
  assert.equal(result.workMinutes, 455);
  assert.equal(result.overtimeMinutes, 30);
});

test('returns an explicit approved absence status without punches', () => {
  const result = calculateAttendance({ ...base, clockIn: null, clockOut: null, approvedStatus: 'sick' });
  assert.equal(result.status, 'sick');
  assert.equal(result.workMinutes, 0);
});
