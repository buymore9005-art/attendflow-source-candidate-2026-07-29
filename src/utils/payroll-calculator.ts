export type PayrollBaseType = 'daily' | 'weekly' | 'monthly';

export interface PayrollCalculationInput {
  baseType: PayrollBaseType;
  monthlySalary: number;
  dailySalary: number;
  payableDays: number;
  attendedDays: number;
  overtimeMinutes: number;
  overtimeHourlyRate: number;
  lateMinutes: number;
  lateDeductionPerMinute: number;
  absentDays: number;
  absentDeductionPerDay: number;
  earlyLeaveMinutes: number;
  earlyDeductionPerMinute: number;
  bonus: number;
  incentive: number;
  thr: number;
  tax: number;
  bpjs: number;
  loan: number;
  cashAdvance: number;
  fine: number;
  otherAddition: number;
  otherDeduction: number;
}

export interface PayrollCalculationResult {
  basePay: number;
  overtimePay: number;
  additions: number;
  grossPay: number;
  lateDeduction: number;
  absentDeduction: number;
  earlyLeaveDeduction: number;
  totalDeductions: number;
  netPay: number;
}

const money = (value: number): number => Math.round(Number.isFinite(value) ? value : 0);
const nonNegative = (value: number): number => Math.max(0, value);

export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const basePay = input.baseType === 'monthly'
    ? money(nonNegative(input.monthlySalary))
    : money(nonNegative(input.dailySalary) * nonNegative(input.attendedDays));
  const overtimePay = money((nonNegative(input.overtimeMinutes) / 60) * nonNegative(input.overtimeHourlyRate));
  const additions = money(
    nonNegative(input.bonus) +
    nonNegative(input.incentive) +
    nonNegative(input.thr) +
    nonNegative(input.otherAddition)
  );
  const grossPay = money(basePay + overtimePay + additions);
  const lateDeduction = money(nonNegative(input.lateMinutes) * nonNegative(input.lateDeductionPerMinute));
  const absentDeduction = money(nonNegative(input.absentDays) * nonNegative(input.absentDeductionPerDay));
  const earlyLeaveDeduction = money(
    nonNegative(input.earlyLeaveMinutes) * nonNegative(input.earlyDeductionPerMinute)
  );
  const totalDeductions = money(
    lateDeduction +
    absentDeduction +
    earlyLeaveDeduction +
    nonNegative(input.tax) +
    nonNegative(input.bpjs) +
    nonNegative(input.loan) +
    nonNegative(input.cashAdvance) +
    nonNegative(input.fine) +
    nonNegative(input.otherDeduction)
  );
  return {
    basePay,
    overtimePay,
    additions,
    grossPay,
    lateDeduction,
    absentDeduction,
    earlyLeaveDeduction,
    totalDeductions,
    netPay: money(grossPay - totalDeductions)
  };
}
