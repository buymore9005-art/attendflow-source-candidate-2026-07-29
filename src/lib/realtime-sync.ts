export const REALTIME_TABLES = [
  'attendance_records',
  'attendance_devices',
  'biometric_enrollments',
  'biometric_assets',
  'device_commands',
  'integration_jobs',
  'system_notifications',
  'payroll_runs'
] as const;

export type RealtimeTable = (typeof REALTIME_TABLES)[number];

const INVALIDATION_ROOTS: Record<RealtimeTable, readonly string[]> = {
  attendance_records: ['attendance', 'attendance-summary', 'dashboard'],
  attendance_devices: ['devices', 'attendance-lookups', 'dashboard'],
  biometric_enrollments: ['biometrics', 'dashboard'],
  biometric_assets: ['biometrics'],
  device_commands: ['devices'],
  integration_jobs: ['integration-jobs', 'deli-integration-settings'],
  system_notifications: ['notifications', 'dashboard'],
  payroll_runs: ['payroll-runs', 'dashboard']
};

export function realtimeInvalidationRoots(table: RealtimeTable): readonly string[] {
  return INVALIDATION_ROOTS[table];
}

export function realtimeQueryMatches(queryKey: readonly unknown[], table: RealtimeTable, organizationId: string): boolean {
  const root = queryKey[0];
  return typeof root === 'string'
    && INVALIDATION_ROOTS[table].includes(root)
    && queryKey.some((part) => part === organizationId);
}

export function isRealtimeManagedQuery(queryKey: readonly unknown[], organizationId: string): boolean {
  return REALTIME_TABLES.some((table) => realtimeQueryMatches(queryKey, table, organizationId));
}

export function isRealtimeFailureStatus(status: string): boolean {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED';
}
