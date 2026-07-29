export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;
export type AppRole = 'admin' | 'hr' | 'supervisor' | 'finance' | 'manager' | 'leader' | 'viewer';
export type MemberStatus = 'invited' | 'active' | 'suspended';
export type EmployeeStatus = 'active' | 'inactive' | 'probation' | 'resigned' | 'terminated';
export type Gender = 'male' | 'female' | 'other';
export type DeviceStatus = 'online' | 'offline' | 'warning' | 'maintenance';
export type SyncStatus = 'synced' | 'pending' | 'failed' | 'not_linked';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'finalized' | 'cancelled';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'permit' | 'sick' | 'leave' | 'holiday' | 'off' | 'incomplete';
export type PayrollBaseType = 'daily' | 'weekly' | 'monthly';

export interface Timestamped {
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Organization extends Timestamped {
  id: UUID;
  code: string;
  name: string;
  time_zone: string;
  locale: 'id' | 'en' | 'zh';
  logo_path: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface Profile extends Timestamped {
  id: UUID;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_path: string | null;
  last_seen_at: ISODateTime | null;
}

export interface OrganizationMembership extends Timestamped {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  role: AppRole;
  status: MemberStatus;
  permission_grants: string[];
  permission_denials: string[];
  department_id: UUID | null;
  organization?: Organization;
  profile?: Profile;
  role_permissions?: string[];
}

export interface Department extends Timestamped {
  id: UUID;
  organization_id: UUID;
  code: string;
  name: string;
  parent_id: UUID | null;
  manager_employee_id: UUID | null;
  is_active: boolean;
  deleted_at: ISODateTime | null;
}

export interface Position extends Timestamped {
  id: UUID;
  organization_id: UUID;
  code: string;
  name: string;
  level: number;
  is_active: boolean;
  deleted_at: ISODateTime | null;
}

export interface Shift extends Timestamped {
  id: UUID;
  organization_id: UUID;
  code: string;
  name: string;
  shift_type: 'fixed' | 'rotating' | 'night' | 'off';
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_minutes: number;
  late_tolerance_minutes: number;
  early_leave_tolerance_minutes: number;
  overtime_after_minutes: number;
  cross_midnight: boolean;
  is_active: boolean;
  deleted_at: ISODateTime | null;
}

export interface Employee extends Timestamped {
  id: UUID;
  organization_id: UUID;
  employee_no: string;
  nik: string | null;
  full_name: string;
  gender: Gender | null;
  birth_place: string | null;
  birth_date: ISODate | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  department_id: UUID | null;
  position_id: UUID | null;
  status: EmployeeStatus;
  shift_id: UUID | null;
  join_date: ISODate;
  bpjs_status: boolean;
  bpjs_number: string | null;
  npwp: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  photo_path: string | null;
  ktp_path: string | null;
  kk_path: string | null;
  notes: string | null;
  fingerprint_pin: string | null;
  external_ids: Record<string, string>;
  is_active: boolean;
  deleted_at: ISODateTime | null;
  department?: Pick<Department, 'id' | 'name'> | null;
  position?: Pick<Position, 'id' | 'name'> | null;
  shift?: Pick<Shift, 'id' | 'name'> | null;
}

export interface Holiday extends Timestamped {
  id: UUID;
  organization_id: UUID;
  holiday_date: ISODate;
  name: string;
  is_paid: boolean;
}

export interface AttendanceDevice extends Timestamped {
  id: UUID;
  organization_id: UUID;
  vendor: 'zkteco' | 'solution_time' | 'deli' | 'other';
  protocol: 'adms' | 'push' | 'deli_cloud' | 'lan_bridge' | 'manual';
  name: string;
  location: string | null;
  ip_address: string | null;
  port: number | null;
  serial_number: string;
  model: string | null;
  firmware: string | null;
  capabilities_verified: boolean;
  supports_attendance_push: boolean;
  supports_log_pull: boolean;
  supports_user_push: boolean;
  supports_fingerprint_push: boolean;
  supports_face_push: boolean;
  supports_card_push: boolean;
  requires_lan_bridge: boolean;
  capability_verified_at: ISODateTime | null;
  capability_notes: string | null;
  status: DeviceStatus;
  last_seen_at: ISODateTime | null;
  last_sync_at: ISODateTime | null;
  auto_sync: boolean;
  retry_count: number;
  next_retry_at: ISODateTime | null;
  metadata: Record<string, unknown>;
  deleted_at: ISODateTime | null;
}

export interface BiometricEnrollment extends Timestamped {
  id: UUID;
  organization_id: UUID;
  employee_id: UUID;
  device_id: UUID | null;
  device_user_id: string | null;
  pin: string | null;
  card_number: string | null;
  fingerprint_templates: number;
  has_face: boolean;
  has_card: boolean;
  status: SyncStatus;
  last_synced_at: ISODateTime | null;
  error_message: string | null;
  employee?: Pick<Employee, 'employee_no' | 'full_name' | 'photo_path'>;
  device?: Pick<AttendanceDevice, 'name' | 'serial_number'> | null;
}

export interface AttendanceRecord extends Timestamped {
  id: UUID;
  organization_id: UUID;
  employee_id: UUID;
  work_date: ISODate;
  shift_id: UUID | null;
  clock_in: ISODateTime | null;
  clock_out: ISODateTime | null;
  break_start: ISODateTime | null;
  break_end: ISODateTime | null;
  work_minutes: number;
  overtime_minutes: number;
  late_minutes: number;
  early_leave_minutes: number;
  status: AttendanceStatus;
  location: string | null;
  device_id: UUID | null;
  notes: string | null;
  approved_by: UUID | null;
  locked_at: ISODateTime | null;
  employee?: Pick<Employee, 'employee_no' | 'full_name'>;
  shift?: Pick<Shift, 'name'> | null;
  device?: Pick<AttendanceDevice, 'name'> | null;
}

export interface LeaveRequest extends Timestamped {
  id: UUID;
  organization_id: UUID;
  request_number: string;
  employee_id: UUID;
  leave_type: 'permit' | 'sick' | 'leave' | 'other';
  start_date: ISODate;
  end_date: ISODate;
  total_days: number;
  reason: string;
  attachment_path: string | null;
  status: ApprovalStatus;
  approved_by: UUID | null;
  approved_at: ISODateTime | null;
  rejection_reason: string | null;
  employee?: Pick<Employee, 'employee_no' | 'full_name'>;
}

export interface PayrollProfile extends Timestamped {
  id: UUID;
  organization_id: UUID;
  employee_id: UUID;
  base_type: PayrollBaseType;
  daily_salary: number;
  weekly_salary: number;
  monthly_salary: number;
  overtime_hourly_rate: number;
  late_deduction_per_minute: number;
  absence_deduction_per_day: number;
  early_deduction_per_minute: number;
  default_bonus: number;
  tax_percent: number;
  bpjs_employee_percent: number;
  work_days_per_month: number;
  effective_from: ISODate;
  effective_to: ISODate | null;
  employee?: Pick<Employee, 'employee_no' | 'full_name'>;
}

export interface PayrollRun extends Timestamped {
  id: UUID;
  organization_id: UUID;
  run_number: string;
  period_start: ISODate;
  period_end: ISODate;
  frequency: PayrollBaseType;
  status: ApprovalStatus;
  generated_at: ISODateTime | null;
  approved_at: ISODateTime | null;
  finalized_at: ISODateTime | null;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  notes: string | null;
}

export interface PayrollItem extends Timestamped {
  id: UUID;
  organization_id: UUID;
  payroll_run_id: UUID;
  employee_id: UUID;
  payslip_number: string;
  base_pay: number;
  overtime_pay: number;
  bonus: number;
  incentive: number;
  thr: number;
  tax: number;
  bpjs: number;
  loan: number;
  cash_advance: number;
  fine: number;
  late_deduction: number;
  absence_deduction: number;
  early_leave_deduction: number;
  other_addition: number;
  other_deduction: number;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  status: ApprovalStatus;
  employee?: Pick<Employee, 'employee_no' | 'full_name' | 'bank_name' | 'bank_account_number'>;
}

export interface IntegrationJob extends Timestamped {
  id: UUID;
  organization_id: UUID;
  integration_id: UUID | null;
  job_type: string;
  direction: 'inbound' | 'outbound';
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at: ISODateTime | null;
  started_at: ISODateTime | null;
  completed_at: ISODateTime | null;
  error_message: string | null;
  correlation_id: UUID;
}

export interface AuditLog {
  id: number;
  organization_id: UUID | null;
  user_id: UUID | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  device_info: Record<string, unknown>;
  correlation_id: UUID | null;
  created_at: ISODateTime;
  profile?: Pick<Profile, 'full_name' | 'email'> | null;
}

export interface SystemNotification {
  id: UUID;
  organization_id: UUID;
  user_id: UUID | null;
  notification_type: string;
  title_key: string;
  message_key: string;
  params: Record<string, string | number>;
  severity: 'info' | 'success' | 'warning' | 'error';
  read_at: ISODateTime | null;
  created_at: ISODateTime;
}
