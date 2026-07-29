export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'absent'
  | 'permit'
  | 'sick'
  | 'leave'
  | 'holiday'
  | 'off'
  | 'incomplete';

export interface AttendanceCalculationInput {
  workDate: string;
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: number;
  breakMinutes: number;
  overtimeStartsAfterMinutes: number;
  crossMidnight: boolean;
  clockIn: string | null;
  clockOut: string | null;
  approvedStatus?: Extract<AttendanceStatus, 'permit' | 'sick' | 'leave' | 'holiday' | 'off'>;
}

export interface AttendanceCalculationResult {
  status: AttendanceStatus;
  scheduledMinutes: number;
  workMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
}

const MINUTE_MS = 60_000;

function parseDateTime(workDate: string, value: string): Date {
  const includesDate = /^\d{4}-\d{2}-\d{2}[ T]/.test(value);
  const normalized = includesDate ? value.replace(' ', 'T') : `${workDate}T${value}:00`;
  const parsed = new Date(`${normalized}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? '' : 'Z'}`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date/time: ${value}`);
  return parsed;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / MINUTE_MS));
}

function moveToNextDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * MINUTE_MS);
}

function alignPunchToShift(date: Date, shiftStart: Date, crossMidnight: boolean): Date {
  if (!crossMidnight) return date;
  const sixHours = 6 * 60 * MINUTE_MS;
  if (date.getTime() < shiftStart.getTime() - sixHours) return moveToNextDay(date);
  return date;
}

export function calculateAttendance(input: AttendanceCalculationInput): AttendanceCalculationResult {
  const shiftStart = parseDateTime(input.workDate, input.shiftStart);
  let shiftEnd = parseDateTime(input.workDate, input.shiftEnd);
  if (input.crossMidnight || shiftEnd <= shiftStart) shiftEnd = moveToNextDay(shiftEnd);

  const scheduledMinutes = minutesBetween(shiftStart, shiftEnd) - Math.max(0, input.breakMinutes);

  if (!input.clockIn && !input.clockOut) {
    return {
      status: input.approvedStatus ?? 'absent',
      scheduledMinutes,
      workMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0
    };
  }

  if (!input.clockIn || !input.clockOut) {
    return {
      status: 'incomplete',
      scheduledMinutes,
      workMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0
    };
  }

  let clockIn = parseDateTime(input.workDate, input.clockIn);
  let clockOut = parseDateTime(input.workDate, input.clockOut);
  clockIn = alignPunchToShift(clockIn, shiftStart, input.crossMidnight);
  clockOut = alignPunchToShift(clockOut, shiftStart, input.crossMidnight);
  if (clockOut <= clockIn) clockOut = moveToNextDay(clockOut);

  const rawLate = minutesBetween(shiftStart, clockIn);
  const lateMinutes = Math.max(0, rawLate - Math.max(0, input.graceMinutes));
  const earlyLeaveMinutes = clockOut < shiftEnd ? minutesBetween(clockOut, shiftEnd) : 0;
  const afterShiftMinutes = clockOut > shiftEnd ? minutesBetween(shiftEnd, clockOut) : 0;
  const overtimeMinutes = afterShiftMinutes >= Math.max(0, input.overtimeStartsAfterMinutes)
    ? afterShiftMinutes
    : 0;
  const grossWorkedMinutes = minutesBetween(clockIn, clockOut);
  const workMinutes = Math.max(0, grossWorkedMinutes - Math.max(0, input.breakMinutes));

  return {
    status: lateMinutes > 0 ? 'late' : 'present',
    scheduledMinutes,
    workMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeMinutes
  };
}
