import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePayroll } from '../src/utils/payroll-calculator.ts';

test('calculates monthly payroll additions and deductions with integer currency precision', () => {
  const result = calculatePayroll({
    baseType: 'monthly',
    monthlySalary: 6_000_000,
    dailySalary: 0,
    payableDays: 22,
    attendedDays: 20,
    overtimeMinutes: 180,
    overtimeHourlyRate: 35_000,
    lateMinutes: 40,
    lateDeductionPerMinute: 1_000,
    absentDays: 1,
    absentDeductionPerDay: 250_000,
    earlyLeaveMinutes: 20,
    earlyDeductionPerMinute: 1_000,
    bonus: 300_000,
    incentive: 150_000,
    thr: 0,
    tax: 100_000,
    bpjs: 75_000,
    loan: 200_000,
    cashAdvance: 100_000,
    fine: 25_000,
    otherAddition: 0,
    otherDeduction: 0
  });
  assert.equal(result.overtimePay, 105_000);
  assert.equal(result.grossPay, 6_555_000);
  assert.equal(result.totalDeductions, 810_000);
  assert.equal(result.netPay, 5_745_000);
});

test('calculates daily salary from attended days', () => {
  const result = calculatePayroll({
    baseType: 'daily', monthlySalary: 0, dailySalary: 200_000, payableDays: 22, attendedDays: 18,
    overtimeMinutes: 0, overtimeHourlyRate: 0, lateMinutes: 0, lateDeductionPerMinute: 0,
    absentDays: 0, absentDeductionPerDay: 0, earlyLeaveMinutes: 0, earlyDeductionPerMinute: 0,
    bonus: 0, incentive: 0, thr: 0, tax: 0, bpjs: 0, loan: 0, cashAdvance: 0, fine: 0,
    otherAddition: 0, otherDeduction: 0
  });
  assert.equal(result.basePay, 3_600_000);
  assert.equal(result.netPay, 3_600_000);
});
