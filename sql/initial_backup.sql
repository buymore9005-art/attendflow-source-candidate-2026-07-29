-- AttendFlow initial database bootstrap
-- Generated file: do not edit directly.
-- Run `npm run sql:bootstrap` after changing canonical files in sql/.
-- This is a reproducible initial schema/seed/scheduler bootstrap, not a live data dump.
-- ============================================================================
-- SOURCE: sql/000_full_schema.sql
-- ============================================================================
-- AttendFlow: full Supabase schema
-- Run once in the Supabase SQL editor on a new project. The script is safe to re-run for policies, functions, views, triggers, buckets, and publications.
begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists supabase_vault with schema vault;

set search_path = public, extensions;

-- Enumerations ----------------------------------------------------------------
do $$ begin create type public.app_role as enum ('admin','hr','supervisor','finance','manager','leader','viewer'); exception when duplicate_object then null; end $$;
do $$ begin create type public.member_status as enum ('invited','active','suspended'); exception when duplicate_object then null; end $$;
do $$ begin create type public.employee_status as enum ('active','inactive','probation','resigned','terminated'); exception when duplicate_object then null; end $$;
do $$ begin create type public.gender_type as enum ('male','female','other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.device_status as enum ('online','offline','warning','maintenance'); exception when duplicate_object then null; end $$;
do $$ begin create type public.sync_status as enum ('synced','pending','failed','not_linked'); exception when duplicate_object then null; end $$;
do $$ begin create type public.job_status as enum ('queued','running','succeeded','failed','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.approval_status as enum ('draft','pending','approved','rejected','finalized','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.attendance_status as enum ('present','late','absent','permit','sick','leave','holiday','off','incomplete'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payroll_base_type as enum ('daily','weekly','monthly'); exception when duplicate_object then null; end $$;
do $$ begin create type public.shift_type as enum ('fixed','rotating','night','off'); exception when duplicate_object then null; end $$;
do $$ begin create type public.device_vendor as enum ('zkteco','solution_time','deli','other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.device_protocol as enum ('adms','push','deli_cloud','lan_bridge','manual'); exception when duplicate_object then null; end $$;
do $$ begin create type public.notification_severity as enum ('info','success','warning','error'); exception when duplicate_object then null; end $$;

-- Identity and organization ---------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  time_zone text not null default 'Asia/Jakarta',
  locale text not null default 'id' check (locale in ('id','en','zh')),
  logo_path text,
  address text,
  email extensions.citext,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_code_format check (code ~ '^[A-Z0-9_-]{2,32}$'),
  constraint organizations_name_length check (char_length(name) between 2 and 160),
  unique (code),
  unique (id, code)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email extensions.citext,
  phone text,
  avatar_path text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'viewer',
  status public.member_status not null default 'invited',
  permission_grants text[] not null default '{}',
  permission_denials text[] not null default '{}',
  department_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.app_role not null,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, role),
  unique (organization_id, id)
);

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  work jsonb not null default '{}',
  payroll jsonb not null default '{}',
  numbering jsonb not null default '{}',
  integrations jsonb not null default '{}',
  security jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_settings_objects check (jsonb_typeof(work)='object' and jsonb_typeof(payroll)='object' and jsonb_typeof(numbering)='object' and jsonb_typeof(integrations)='object' and jsonb_typeof(security)='object')
);

-- HR master data --------------------------------------------------------------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  parent_id uuid,
  manager_employee_id uuid,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id),
  constraint departments_code_format check (code ~ '^[A-Za-z0-9_-]{1,32}$'),
  constraint departments_parent_fk foreign key (organization_id, parent_id) references public.departments(organization_id, id) deferrable initially deferred
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  level integer not null default 1 check (level between 1 and 100),
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  shift_type public.shift_type not null default 'fixed',
  start_time time not null default '08:00',
  end_time time not null default '17:00',
  break_minutes integer not null default 60 check (break_minutes between 0 and 720),
  grace_minutes integer not null default 0 check (grace_minutes between 0 and 240),
  late_tolerance_minutes integer not null default 0 check (late_tolerance_minutes between 0 and 240),
  early_leave_tolerance_minutes integer not null default 0 check (early_leave_tolerance_minutes between 0 and 240),
  overtime_after_minutes integer not null default 0 check (overtime_after_minutes between 0 and 720),
  cross_midnight boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id),
  constraint shift_cross_midnight_consistency check (cross_midnight or end_time > start_time or shift_type = 'off')
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_no text not null,
  nik text,
  full_name text not null,
  gender public.gender_type,
  birth_place text,
  birth_date date,
  address text,
  phone text,
  email extensions.citext,
  department_id uuid,
  position_id uuid,
  status public.employee_status not null default 'active',
  shift_id uuid,
  join_date date not null default current_date,
  bpjs_status boolean not null default false,
  bpjs_number text,
  npwp text,
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  emergency_contact_name text,
  emergency_contact_phone text,
  photo_path text,
  ktp_path text,
  kk_path text,
  notes text,
  fingerprint_pin text,
  external_ids jsonb not null default '{}',
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_no),
  unique (organization_id, id),
  constraint employees_name_length check (char_length(full_name) between 2 and 160),
  constraint employees_birth_before_join check (birth_date is null or birth_date < join_date),
  constraint employees_external_ids_object check (jsonb_typeof(external_ids)='object'),
  constraint employees_department_fk foreign key (organization_id, department_id) references public.departments(organization_id, id),
  constraint employees_position_fk foreign key (organization_id, position_id) references public.positions(organization_id, id),
  constraint employees_shift_fk foreign key (organization_id, shift_id) references public.shifts(organization_id, id)
);
create unique index if not exists employees_org_nik_unique on public.employees(organization_id, nik) where nik is not null and deleted_at is null;
create unique index if not exists employees_org_fingerprint_pin_unique on public.employees(organization_id, fingerprint_pin) where fingerprint_pin is not null and deleted_at is null;

alter table public.organization_members drop constraint if exists organization_members_department_fk;
alter table public.organization_members add constraint organization_members_department_fk foreign key (organization_id, department_id) references public.departments(organization_id, id);
alter table public.departments drop constraint if exists departments_manager_fk;
alter table public.departments add constraint departments_manager_fk foreign key (organization_id, manager_employee_id) references public.employees(organization_id, id) deferrable initially deferred;

create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  shift_id uuid not null,
  effective_from date not null,
  effective_to date,
  rotation_group text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_id, effective_from),
  unique (organization_id, id),
  constraint shift_assignments_dates check (effective_to is null or effective_to >= effective_from),
  constraint shift_assignments_employee_fk foreign key (organization_id, employee_id) references public.employees(organization_id, id) on delete cascade,
  constraint shift_assignments_shift_fk foreign key (organization_id, shift_id) references public.shifts(organization_id, id)
);

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  is_paid boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, holiday_date),
  unique (organization_id, id)
);

-- Devices and biometrics ------------------------------------------------------
create table if not exists public.attendance_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendor public.device_vendor not null,
  protocol public.device_protocol not null,
  name text not null,
  location text,
  ip_address inet,
  port integer check (port between 1 and 65535),
  serial_number text not null,
  model text,
  firmware text,
  capabilities_verified boolean not null default false,
  supports_attendance_push boolean not null default false,
  supports_log_pull boolean not null default false,
  supports_user_push boolean not null default false,
  supports_fingerprint_push boolean not null default false,
  supports_face_push boolean not null default false,
  supports_card_push boolean not null default false,
  requires_lan_bridge boolean not null default false,
  capability_verified_at timestamptz,
  capability_notes text,
  status public.device_status not null default 'offline',
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  auto_sync boolean not null default true,
  retry_count integer not null default 0 check (retry_count >= 0),
  next_retry_at timestamptz,
  token_hash text,
  metadata jsonb not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, serial_number),
  unique (organization_id, id),
  constraint devices_metadata_object check (jsonb_typeof(metadata)='object')
);


-- Keep re-running the bootstrap safe for projects created by an earlier release.
alter table public.attendance_devices add column if not exists model text;
alter table public.attendance_devices add column if not exists capabilities_verified boolean not null default false;
alter table public.attendance_devices add column if not exists supports_attendance_push boolean not null default false;
alter table public.attendance_devices add column if not exists supports_log_pull boolean not null default false;
alter table public.attendance_devices add column if not exists supports_user_push boolean not null default false;
alter table public.attendance_devices add column if not exists supports_fingerprint_push boolean not null default false;
alter table public.attendance_devices add column if not exists supports_face_push boolean not null default false;
alter table public.attendance_devices add column if not exists supports_card_push boolean not null default false;
alter table public.attendance_devices add column if not exists requires_lan_bridge boolean not null default false;
alter table public.attendance_devices add column if not exists capability_verified_at timestamptz;
alter table public.attendance_devices add column if not exists capability_notes text;

create table if not exists public.biometric_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  device_id uuid,
  device_user_id text,
  pin text,
  card_number text,
  fingerprint_templates integer not null default 0 check (fingerprint_templates between 0 and 10),
  has_face boolean not null default false,
  has_card boolean not null default false,
  status public.sync_status not null default 'not_linked',
  last_synced_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_id, device_id),
  unique (organization_id, id),
  constraint biometric_employee_fk foreign key (organization_id, employee_id) references public.employees(organization_id, id) on delete cascade,
  constraint biometric_device_fk foreign key (organization_id, device_id) references public.attendance_devices(organization_id, id) on delete cascade
);
create unique index if not exists biometric_device_user_unique on public.biometric_enrollments(organization_id, device_id, device_user_id) where device_user_id is not null;

create table if not exists public.biometric_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  enrollment_id uuid not null,
  employee_id uuid not null,
  device_id uuid,
  asset_type text not null check (asset_type in ('finger','face')),
  slot integer not null default 0 check (slot between 0 and 19),
  template_format text not null,
  storage_path text not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer not null check (byte_size > 0 and byte_size <= 2097152),
  status public.sync_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, enrollment_id, asset_type, slot),
  unique (organization_id, id),
  constraint biometric_assets_enrollment_fk foreign key (organization_id, enrollment_id) references public.biometric_enrollments(organization_id, id) on delete cascade,
  constraint biometric_assets_employee_fk foreign key (organization_id, employee_id) references public.employees(organization_id, id) on delete cascade,
  constraint biometric_assets_device_fk foreign key (organization_id, device_id) references public.attendance_devices(organization_id, id) on delete cascade
);
create index if not exists biometric_assets_sync_idx on public.biometric_assets(organization_id, device_id, status, asset_type);

create table if not exists public.device_commands (
  id uuid primary key default gen_random_uuid(),
  command_no bigint generated always as identity unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null,
  command_type text not null,
  payload jsonb not null default '{}',
  status public.job_status not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error_message text,
  correlation_id uuid not null default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint device_commands_device_fk foreign key (organization_id, device_id) references public.attendance_devices(organization_id, id) on delete cascade,
  constraint device_commands_payload_object check (jsonb_typeof(payload)='object'),
  constraint device_commands_attempts check (attempts >= 0 and max_attempts between 1 and 20)
);

create table if not exists public.raw_attendance_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null,
  employee_pin text not null,
  event_time timestamptz not null,
  verify_mode integer,
  status_code integer,
  work_code text,
  idempotency_key text not null,
  raw_payload text,
  source text not null default 'adms' check (source in ('adms','deli','bridge','import')),
  source_ip inet,
  user_agent text,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (organization_id, id),
  constraint raw_logs_device_fk foreign key (organization_id, device_id) references public.attendance_devices(organization_id, id) on delete cascade
);

-- Attendance and leave --------------------------------------------------------
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  work_date date not null,
  shift_id uuid,
  clock_in timestamptz,
  clock_out timestamptz,
  break_start timestamptz,
  break_end timestamptz,
  work_minutes integer not null default 0 check (work_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  late_minutes integer not null default 0 check (late_minutes >= 0),
  early_leave_minutes integer not null default 0 check (early_leave_minutes >= 0),
  status public.attendance_status not null default 'incomplete',
  location text,
  device_id uuid,
  notes text,
  source text not null default 'manual' check (source in ('manual','adms','deli','import','system')),
  approved_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_id, work_date),
  unique (organization_id, id),
  constraint attendance_clock_order check (clock_out is null or clock_in is null or clock_out >= clock_in),
  constraint attendance_break_order check (break_end is null or break_start is null or break_end >= break_start),
  constraint attendance_employee_fk foreign key (organization_id, employee_id) references public.employees(organization_id, id) on delete cascade,
  constraint attendance_shift_fk foreign key (organization_id, shift_id) references public.shifts(organization_id, id),
  constraint attendance_device_fk foreign key (organization_id, device_id) references public.attendance_devices(organization_id, id)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_number text not null default '',
  employee_id uuid not null,
  leave_type text not null check (leave_type in ('permit','sick','leave','other')),
  start_date date not null,
  end_date date not null,
  total_days numeric(6,2) not null default 1 check (total_days > 0),
  reason text not null,
  attachment_path text,
  status public.approval_status not null default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint leave_date_range check (end_date >= start_date),
  constraint leave_employee_fk foreign key (organization_id, employee_id) references public.employees(organization_id, id) on delete cascade
);


alter table public.leave_requests add column if not exists request_number text not null default '';
update public.leave_requests set request_number='LEGACY-'||replace(id::text,'-','') where coalesce(request_number,'')='';
create unique index if not exists leave_requests_org_number_unique on public.leave_requests(organization_id, request_number);


-- Payroll --------------------------------------------------------------------
create table if not exists public.payroll_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  base_type public.payroll_base_type not null default 'monthly',
  daily_salary numeric(18,2) not null default 0 check (daily_salary >= 0),
  weekly_salary numeric(18,2) not null default 0 check (weekly_salary >= 0),
  monthly_salary numeric(18,2) not null default 0 check (monthly_salary >= 0),
  overtime_hourly_rate numeric(18,2) not null default 0 check (overtime_hourly_rate >= 0),
  late_deduction_per_minute numeric(18,2) not null default 0 check (late_deduction_per_minute >= 0),
  absence_deduction_per_day numeric(18,2) not null default 0 check (absence_deduction_per_day >= 0),
  early_deduction_per_minute numeric(18,2) not null default 0 check (early_deduction_per_minute >= 0),
  default_bonus numeric(18,2) not null default 0 check (default_bonus >= 0),
  tax_percent numeric(7,4) not null default 0 check (tax_percent between 0 and 100),
  bpjs_employee_percent numeric(7,4) not null default 0 check (bpjs_employee_percent between 0 and 100),
  work_days_per_month integer not null default 22 check (work_days_per_month between 1 and 31),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_id, effective_from),
  unique (organization_id, id),
  constraint payroll_profile_date_range check (effective_to is null or effective_to >= effective_from),
  constraint payroll_profile_employee_fk foreign key (organization_id, employee_id) references public.employees(organization_id, id) on delete cascade
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_number text not null,
  period_start date not null,
  period_end date not null,
  frequency public.payroll_base_type not null,
  status public.approval_status not null default 'draft',
  generated_at timestamptz,
  submitted_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  total_gross numeric(20,2) not null default 0,
  total_deductions numeric(20,2) not null default 0,
  total_net numeric(20,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, run_number),
  unique (organization_id, period_start, period_end, frequency),
  unique (organization_id, id),
  constraint payroll_run_dates check (period_end >= period_start)
);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payroll_run_id uuid not null,
  employee_id uuid not null,
  payslip_number text not null,
  base_pay numeric(20,2) not null default 0,
  overtime_pay numeric(20,2) not null default 0,
  bonus numeric(20,2) not null default 0,
  incentive numeric(20,2) not null default 0,
  thr numeric(20,2) not null default 0,
  tax numeric(20,2) not null default 0,
  bpjs numeric(20,2) not null default 0,
  loan numeric(20,2) not null default 0,
  cash_advance numeric(20,2) not null default 0,
  fine numeric(20,2) not null default 0,
  late_deduction numeric(20,2) not null default 0,
  absence_deduction numeric(20,2) not null default 0,
  early_leave_deduction numeric(20,2) not null default 0,
  other_addition numeric(20,2) not null default 0,
  other_deduction numeric(20,2) not null default 0,
  gross_pay numeric(20,2) not null default 0,
  total_deductions numeric(20,2) not null default 0,
  net_pay numeric(20,2) not null default 0,
  calculation_details jsonb not null default '{}',
  status public.approval_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, payroll_run_id, employee_id),
  unique (organization_id, payslip_number),
  unique (organization_id, id),
  constraint payroll_items_run_fk foreign key (organization_id, payroll_run_id) references public.payroll_runs(organization_id, id) on delete cascade,
  constraint payroll_items_employee_fk foreign key (organization_id, employee_id) references public.employees(organization_id, id),
  constraint payroll_details_object check (jsonb_typeof(calculation_details)='object')
);

create table if not exists public.financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  adjustment_type text not null check (adjustment_type in ('bonus','incentive','thr','loan','cash_advance','fine','other_addition','other_deduction')),
  amount numeric(20,2) not null check (amount >= 0),
  effective_date date not null,
  description text,
  reference_no text,
  settled_payroll_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint financial_employee_fk foreign key (organization_id, employee_id) references public.employees(organization_id, id) on delete cascade,
  constraint financial_settlement_fk foreign key (organization_id, settled_payroll_item_id) references public.payroll_items(organization_id, id)
);

-- Integrations, audit and operations -----------------------------------------
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('deli','adms','zkteco','solution_time','smtp','other')),
  name text not null,
  is_enabled boolean not null default true,
  configuration jsonb not null default '{}',
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, name),
  unique (organization_id, id),
  constraint integrations_configuration_object check (jsonb_typeof(configuration)='object')
);

create table if not exists public.organization_secrets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  secret_name text not null,
  vault_secret_id uuid not null,
  rotated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, secret_name)
);

create table if not exists public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid,
  job_type text not null,
  direction text not null check (direction in ('inbound','outbound')),
  status public.job_status not null default 'queued',
  payload jsonb not null default '{}',
  continuation_of uuid,
  result jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  correlation_id uuid not null default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint integration_jobs_continuation_key unique (organization_id, continuation_of),
  constraint integration_jobs_continuation_fk foreign key (organization_id, continuation_of) references public.integration_jobs(organization_id, id) on delete cascade,
  constraint integration_jobs_integration_fk foreign key (organization_id, integration_id) references public.integrations(organization_id, id) on delete set null,
  constraint integration_job_attempts check (attempts >= 0 and max_attempts between 1 and 20),
  constraint integration_job_payload_object check (jsonb_typeof(payload)='object')
);


alter table public.integration_jobs add column if not exists continuation_of uuid;
do $$
begin
  if not exists(select 1 from pg_constraint where conname='integration_jobs_continuation_key' and conrelid='public.integration_jobs'::regclass) then
    alter table public.integration_jobs add constraint integration_jobs_continuation_key unique(organization_id,continuation_of);
  end if;
  if not exists(select 1 from pg_constraint where conname='integration_jobs_continuation_fk' and conrelid='public.integration_jobs'::regclass) then
    alter table public.integration_jobs add constraint integration_jobs_continuation_fk foreign key(organization_id,continuation_of) references public.integration_jobs(organization_id,id) on delete cascade;
  end if;
end $$;

create table if not exists public.integration_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_job_id uuid,
  level text not null check (level in ('debug','info','warning','error')),
  message text not null,
  details jsonb not null default '{}',
  correlation_id uuid,
  created_at timestamptz not null default now(),
  constraint integration_logs_job_fk foreign key (organization_id, integration_job_id) references public.integration_jobs(organization_id, id) on delete cascade
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  external_event_id text,
  signature text,
  headers jsonb not null default '{}',
  payload jsonb not null default '{}',
  status public.job_status not null default 'queued',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  unique (organization_id, provider, external_event_id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  device_info jsonb not null default '{}',
  correlation_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.system_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  notification_type text not null,
  title_key text not null,
  message_key text not null,
  params jsonb not null default '{}',
  severity public.notification_severity not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint notification_params_object check (jsonb_typeof(params)='object')
);

create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.idempotency_keys (
  idempotency_key text primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  locked_until timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null check (action in ('backup','restore')),
  status public.job_status not null default 'queued',
  storage_path text,
  checksum text,
  record_count integer,
  error_message text,
  requested_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, id)
);

create table if not exists public.number_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sequence_key text not null,
  period_key text not null,
  current_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, sequence_key, period_key)
);

-- Indexes --------------------------------------------------------------------
create index if not exists organization_members_user_idx on public.organization_members(user_id, status);
create index if not exists organization_members_org_role_idx on public.organization_members(organization_id, role, status);
create index if not exists departments_org_active_idx on public.departments(organization_id, is_active) where deleted_at is null;
create index if not exists positions_org_active_idx on public.positions(organization_id, is_active) where deleted_at is null;
create index if not exists shifts_org_active_idx on public.shifts(organization_id, is_active) where deleted_at is null;
create index if not exists employees_org_status_idx on public.employees(organization_id, status, is_active) where deleted_at is null;
create index if not exists employees_org_name_idx on public.employees(organization_id, lower(full_name)) where deleted_at is null;
create index if not exists devices_org_status_idx on public.attendance_devices(organization_id, status) where deleted_at is null;
create index if not exists device_commands_poll_idx on public.device_commands(device_id, status, available_at);
create index if not exists biometric_employee_idx on public.biometric_enrollments(organization_id, employee_id);
create index if not exists raw_logs_device_time_idx on public.raw_attendance_logs(device_id, event_time desc);
create index if not exists raw_logs_unprocessed_idx on public.raw_attendance_logs(organization_id, created_at) where processed_at is null;
create index if not exists attendance_org_date_idx on public.attendance_records(organization_id, work_date desc);
create index if not exists attendance_employee_date_idx on public.attendance_records(employee_id, work_date desc);
create index if not exists attendance_status_date_idx on public.attendance_records(organization_id, status, work_date desc);
create index if not exists leave_org_status_idx on public.leave_requests(organization_id, status, start_date);
create index if not exists payroll_profile_effective_idx on public.payroll_profiles(employee_id, effective_from desc);
create index if not exists payroll_runs_org_period_idx on public.payroll_runs(organization_id, period_start desc, status);
create index if not exists payroll_items_run_idx on public.payroll_items(payroll_run_id);
create index if not exists financial_adjustments_employee_date_idx on public.financial_adjustments(employee_id, effective_date) where settled_payroll_item_id is null;
create index if not exists integration_jobs_queue_idx on public.integration_jobs(status, next_attempt_at, created_at);
create unique index if not exists integration_jobs_one_running_deli_per_org_idx
  on public.integration_jobs(organization_id)
  where status='running' and left(job_type,5)='deli_';
create index if not exists integration_logs_job_idx on public.integration_logs(integration_job_id, created_at desc);
create index if not exists audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(organization_id, entity_type, entity_id);
create index if not exists notifications_user_unread_idx on public.system_notifications(organization_id, user_id, created_at desc) where read_at is null;
create index if not exists idempotency_expiry_idx on public.idempotency_keys(expires_at);
create index if not exists backup_jobs_org_idx on public.backup_jobs(organization_id, created_at desc);

-- Core helpers ----------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.is_org_member(p_organization_id uuid, p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select auth.role() = 'service_role' or (p_user_id is not null and exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id=m.organization_id and o.is_active
    where m.organization_id=p_organization_id and m.user_id=p_user_id and m.status='active'
  ));
$$;

create or replace function public.has_permission(p_organization_id uuid, p_permission text, p_user_id uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public, auth as $$
declare m public.organization_members%rowtype; role_perms text[]; module_wildcard text;
begin
  if auth.role() = 'service_role' and p_user_id is null then return true; end if;
  if p_user_id is null or p_organization_id is null then return false; end if;
  select * into m from public.organization_members where organization_id=p_organization_id and user_id=p_user_id and status='active';
  if not found then return false; end if;
  if m.role='admin' then return true; end if;
  module_wildcard := split_part(p_permission,'.',1) || '.*';
  if '*' = any(m.permission_denials) or p_permission = any(m.permission_denials) or module_wildcard = any(m.permission_denials) then return false; end if;
  select permissions into role_perms from public.role_permissions where organization_id=p_organization_id and role=m.role;
  role_perms := coalesce(role_perms,'{}');
  return '*' = any(role_perms) or p_permission = any(role_perms) or module_wildcard = any(role_perms)
      or '*' = any(m.permission_grants) or p_permission = any(m.permission_grants) or module_wildcard = any(m.permission_grants);
end $$;

create or replace function public.default_role_permissions(p_role public.app_role) returns text[]
language sql immutable set search_path = public as $$
select case p_role
  when 'admin' then array['*']
  when 'hr' then array['dashboard.read','employees.*','organization.read','organization.create','organization.update','devices.read','devices.sync','attendance.*','shifts.*','leave.*','payroll.read','audit.read','settings.read']
  when 'supervisor' then array['dashboard.read','employees.read','devices.read','attendance.read','attendance.update','attendance.approve','shifts.read','leave.read','leave.approve']
  when 'finance' then array['dashboard.read','employees.read','attendance.read','leave.read','payroll.*','settings.read']
  when 'manager' then array['dashboard.read','employees.read','organization.read','devices.read','attendance.read','attendance.approve','shifts.read','leave.read','leave.approve','payroll.read','payroll.approve','audit.read','settings.read']
  when 'leader' then array['dashboard.read','employees.read','attendance.read','attendance.update','shifts.read','leave.read','leave.approve']
  else array['dashboard.read','employees.read','attendance.read','shifts.read','leave.read'] end;
$$;

create or replace function public.seed_role_permissions(p_organization_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.app_role;
begin
  foreach r in array enum_range(null::public.app_role) loop
    insert into public.role_permissions(organization_id,role,permissions) values(p_organization_id,r,public.default_role_permissions(r))
    on conflict (organization_id,role) do nothing;
  end loop;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  insert into public.profiles(id,full_name,email) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.email)
  on conflict(id) do update set email=excluded.email, full_name=coalesce(nullif(profiles.full_name,''),excluded.full_name), updated_at=now();
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email,raw_user_meta_data on auth.users for each row execute function public.handle_new_user();

create or replace function public.create_organization(p_name text, p_code text) returns uuid
language plpgsql security definer set search_path=public,auth as $$
declare new_id uuid; uid uuid := auth.uid(); normalized_code text := upper(trim(p_code));
begin
  if uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if char_length(trim(p_name)) < 2 or normalized_code !~ '^[A-Z0-9_-]{2,32}$' then raise exception 'Invalid organization name or code' using errcode='22023'; end if;
  insert into public.profiles(id,full_name,email) select id,coalesce(raw_user_meta_data->>'full_name',''),email from auth.users where id=uid on conflict(id) do nothing;
  insert into public.organizations(name,code) values(trim(p_name),normalized_code) returning id into new_id;
  insert into public.organization_members(organization_id,user_id,role,status) values(new_id,uid,'admin','active');
  insert into public.organization_settings(organization_id,work,payroll,numbering,integrations,security) values(
    new_id,
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('employee_prefix','EMP','payroll_prefix','PAY','payslip_prefix','SLIP','leave_prefix','LV'),
    jsonb_build_object('adms_auto_sync',true),
    '{}'::jsonb
  );
  perform public.seed_role_permissions(new_id);
  insert into public.departments(organization_id,code,name) values(new_id,'GENERAL','General');
  insert into public.positions(organization_id,code,name,level) values(new_id,'STAFF','Staff',1);
  insert into public.shifts(organization_id,code,name,shift_type,start_time,end_time,break_minutes,grace_minutes) values(new_id,'REGULAR','Regular','fixed','08:00','17:00',60,10);
  return new_id;
end $$;

create or replace function public.next_number(p_organization_id uuid, p_sequence_key text, p_prefix text, p_period_key text default to_char(current_date,'YYYYMM')) returns text
language plpgsql security definer set search_path=public as $$
declare next_value bigint;
begin
  insert into public.number_sequences(organization_id,sequence_key,period_key,current_value) values(p_organization_id,p_sequence_key,p_period_key,1)
  on conflict (organization_id,sequence_key,period_key) do update set current_value=public.number_sequences.current_value+1,updated_at=now()
  returning current_value into next_value;
  return p_prefix || '-' || p_period_key || '-' || lpad(next_value::text,6,'0');
end $$;

create or replace function public.assign_generated_numbers() returns trigger language plpgsql security definer set search_path=public as $$
declare cfg jsonb := '{}'; prefix text;
begin
  select numbering into cfg from public.organization_settings where organization_id=new.organization_id;
  cfg := coalesce(cfg,'{}'::jsonb);
  if tg_table_name='employees' and coalesce(new.employee_no,'')='' then
    prefix := coalesce(nullif(cfg->>'employee_prefix',''),'EMP');
    new.employee_no=public.next_number(new.organization_id,'employee',prefix);
  end if;
  if tg_table_name='payroll_runs' and coalesce(new.run_number,'')='' then
    prefix := coalesce(nullif(cfg->>'payroll_prefix',''),'PAY');
    new.run_number=public.next_number(new.organization_id,'payroll_run',prefix,to_char(new.period_start,'YYYYMM'));
  end if;
  if tg_table_name='payroll_items' and coalesce(new.payslip_number,'')='' then
    prefix := coalesce(nullif(cfg->>'payslip_prefix',''),'SLIP');
    new.payslip_number=public.next_number(new.organization_id,'payslip',prefix,to_char(current_date,'YYYYMM'));
  end if;
  if tg_table_name='leave_requests' and coalesce(new.request_number,'')='' then
    prefix := coalesce(nullif(cfg->>'leave_prefix',''),'LV');
    new.request_number=public.next_number(new.organization_id,'leave_request',prefix,to_char(new.start_date,'YYYYMM'));
  end if;
  return new;
end $$;

drop trigger if exists employees_number_trigger on public.employees;
create trigger employees_number_trigger before insert on public.employees for each row execute function public.assign_generated_numbers();
drop trigger if exists payroll_runs_number_trigger on public.payroll_runs;
create trigger payroll_runs_number_trigger before insert on public.payroll_runs for each row execute function public.assign_generated_numbers();
drop trigger if exists payroll_items_number_trigger on public.payroll_items;
create trigger payroll_items_number_trigger before insert on public.payroll_items for each row execute function public.assign_generated_numbers();
drop trigger if exists leave_requests_number_trigger on public.leave_requests;
create trigger leave_requests_number_trigger before insert on public.leave_requests for each row execute function public.assign_generated_numbers();

create or replace function public.register_employee(p_organization_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare e public.employees%rowtype;
begin
  if not public.has_permission(p_organization_id,'employees.create') then raise exception 'Forbidden' using errcode='42501'; end if;
  insert into public.employees(
    organization_id,employee_no,nik,full_name,gender,birth_place,birth_date,address,phone,email,department_id,position_id,status,shift_id,join_date,bpjs_status,bpjs_number,npwp,bank_name,bank_account_number,bank_account_name,emergency_contact_name,emergency_contact_phone,notes,fingerprint_pin,is_active
  ) values (
    p_organization_id,'',nullif(trim(p_payload->>'nik'),''),trim(p_payload->>'full_name'),nullif(p_payload->>'gender','')::public.gender_type,nullif(trim(p_payload->>'birth_place'),''),nullif(p_payload->>'birth_date','')::date,nullif(trim(p_payload->>'address'),''),nullif(trim(p_payload->>'phone'),''),nullif(lower(trim(p_payload->>'email')),'')::extensions.citext,
    nullif(p_payload->>'department_id','')::uuid,nullif(p_payload->>'position_id','')::uuid,coalesce(nullif(p_payload->>'status',''),'active')::public.employee_status,nullif(p_payload->>'shift_id','')::uuid,coalesce(nullif(p_payload->>'join_date','')::date,current_date),coalesce((p_payload->>'bpjs_status')::boolean,false),nullif(trim(p_payload->>'bpjs_number'),''),nullif(trim(p_payload->>'npwp'),''),nullif(trim(p_payload->>'bank_name'),''),nullif(trim(p_payload->>'bank_account_number'),''),nullif(trim(p_payload->>'bank_account_name'),''),nullif(trim(p_payload->>'emergency_contact_name'),''),nullif(trim(p_payload->>'emergency_contact_phone'),''),nullif(trim(p_payload->>'notes'),''),nullif(trim(p_payload->>'fingerprint_pin'),''),true
  ) returning * into e;
  return jsonb_build_object('id',e.id,'employee_no',e.employee_no);
end $$;

-- Audit ----------------------------------------------------------------------
create or replace function public.redact_audit_data(p_data jsonb) returns jsonb language sql immutable as $$
  select case when p_data is null then null else p_data - array['password','secret','token','token_hash','fingerprint_template','face_template','raw_payload','bank_account_number'] end;
$$;

create or replace function public.safe_inet(p_value text) returns inet
language plpgsql immutable set search_path=public as $$
begin
  return nullif(trim(split_part(coalesce(p_value,''),',',1)),'')::inet;
exception when others then
  return null;
end $$;

create or replace function public.write_audit_log() returns trigger
language plpgsql security definer set search_path=public,auth as $$
declare old_j jsonb; new_j jsonb; org_id uuid; headers jsonb := '{}'; ua text; correlation uuid;
begin
  old_j := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  new_j := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  org_id := coalesce(
    nullif(new_j->>'organization_id','')::uuid,
    nullif(old_j->>'organization_id','')::uuid,
    case when tg_table_name='organizations' then coalesce(nullif(new_j->>'id','')::uuid,nullif(old_j->>'id','')::uuid) end
  );
  begin headers := coalesce(current_setting('request.headers',true)::jsonb,'{}'); exception when others then headers := '{}'; end;
  ua := left(headers->>'user-agent',1000);
  begin correlation := nullif(headers->>'x-correlation-id','')::uuid; exception when others then correlation := null; end;
  insert into public.audit_logs(organization_id,user_id,event_type,entity_type,entity_id,action,old_data,new_data,ip_address,user_agent,device_info,correlation_id)
  values(org_id,auth.uid(),'data_change',tg_table_name,coalesce(new_j->>'id',old_j->>'id'),lower(tg_op),public.redact_audit_data(old_j),public.redact_audit_data(new_j),public.safe_inet(coalesce(headers->>'x-forwarded-for',headers->>'x-real-ip')),ua,jsonb_build_object('role',auth.role()),correlation);
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

create or replace function public.log_client_activity(p_event_type text,p_action text,p_entity_type text default null,p_entity_id text default null,p_metadata jsonb default '{}') returns void
language plpgsql security definer set search_path=public,auth as $$
declare org_id uuid; headers jsonb := '{}';
begin
  select organization_id into org_id from public.organization_members where user_id=auth.uid() and status='active' order by created_at limit 1;
  begin headers := coalesce(current_setting('request.headers',true)::jsonb,'{}'); exception when others then headers := '{}'; end;
  insert into public.audit_logs(organization_id,user_id,event_type,entity_type,entity_id,action,ip_address,user_agent,device_info)
  values(org_id,auth.uid(),left(p_event_type,100),left(p_entity_type,100),left(p_entity_id,200),left(p_action,100),public.safe_inet(coalesce(headers->>'x-forwarded-for',headers->>'x-real-ip')),left(coalesce(p_metadata->>'user_agent',headers->>'user-agent'),1000),coalesce(p_metadata,'{}')-array['password','secret','token']);
end $$;

create or replace function public.log_organization_activity(p_organization_id uuid,p_event_type text,p_action text,p_entity_type text default null,p_entity_id text default null,p_metadata jsonb default '{}') returns void
language plpgsql security definer set search_path=public,auth as $$
declare headers jsonb := '{}'; correlation uuid;
begin
  if not public.is_org_member(p_organization_id) then raise exception 'Forbidden' using errcode='42501'; end if;
  begin headers := coalesce(current_setting('request.headers',true)::jsonb,'{}'); exception when others then headers := '{}'; end;
  begin correlation := nullif(headers->>'x-correlation-id','')::uuid; exception when others then correlation := null; end;
  insert into public.audit_logs(organization_id,user_id,event_type,entity_type,entity_id,action,ip_address,user_agent,device_info,correlation_id)
  values(p_organization_id,auth.uid(),left(p_event_type,100),left(p_entity_type,100),left(p_entity_id,200),left(p_action,100),public.safe_inet(coalesce(headers->>'x-forwarded-for',headers->>'x-real-ip')),left(coalesce(p_metadata->>'user_agent',headers->>'user-agent'),1000),coalesce(p_metadata,'{}')-array['password','secret','token'],correlation);
end $$;

-- Attendance calculation -----------------------------------------------------
create or replace function public.recalculate_attendance_record(
  p_attendance_id uuid default null,
  p_organization_id uuid default null,
  p_employee_id uuid default null,
  p_work_date date default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare a public.attendance_records%rowtype; s public.shifts%rowtype; tz text; scheduled_start timestamptz; scheduled_end timestamptz; actual_break integer;
begin
  if p_attendance_id is not null then select * into a from public.attendance_records where id=p_attendance_id; else select * into a from public.attendance_records where organization_id=p_organization_id and employee_id=p_employee_id and work_date=p_work_date; end if;
  if not found then return null; end if;
  if auth.role()<>'service_role' and not public.has_permission(a.organization_id,'attendance.update') then raise exception 'Forbidden' using errcode='42501'; end if;
  if a.locked_at is not null then return a.id; end if;
  if a.shift_id is null then select e.shift_id into a.shift_id from public.employees e where e.id=a.employee_id; end if;
  select * into s from public.shifts where id=a.shift_id and organization_id=a.organization_id;
  if not found or s.shift_type='off' then
    update public.attendance_records set work_minutes=greatest(0,extract(epoch from (clock_out-clock_in))/60)::int,overtime_minutes=0,late_minutes=0,early_leave_minutes=0,status=case when status in ('permit','sick','leave','holiday','off','absent') then status when clock_in is null then 'incomplete' else 'present' end,updated_at=now() where id=a.id;
    return a.id;
  end if;
  select time_zone into tz from public.organizations where id=a.organization_id;
  scheduled_start := (a.work_date + s.start_time) at time zone tz;
  scheduled_end := (a.work_date + s.end_time + case when s.cross_midnight then interval '1 day' else interval '0 day' end) at time zone tz;
  actual_break := case when a.break_start is not null and a.break_end is not null then greatest(0,extract(epoch from (a.break_end-a.break_start))/60)::int else s.break_minutes end;
  update public.attendance_records set
    shift_id=s.id,
    work_minutes=case when a.clock_in is not null and a.clock_out is not null then greatest(0,(extract(epoch from (a.clock_out-a.clock_in))/60)::int-actual_break) else 0 end,
    late_minutes=case when a.clock_in is null then 0 else greatest(0,extract(epoch from (a.clock_in-scheduled_start))/60::int-s.grace_minutes-s.late_tolerance_minutes) end,
    early_leave_minutes=case when a.clock_out is null then 0 else greatest(0,extract(epoch from (scheduled_end-a.clock_out))/60::int-s.early_leave_tolerance_minutes) end,
    overtime_minutes=case when a.clock_out is null then 0 else greatest(0,extract(epoch from (a.clock_out-(scheduled_end+make_interval(mins=>s.overtime_after_minutes))))/60::int) end,
    status=case when a.status in ('permit','sick','leave','holiday','off','absent') then a.status when a.clock_in is null or a.clock_out is null then 'incomplete'::public.attendance_status when a.clock_in > scheduled_start+make_interval(mins=>s.grace_minutes+s.late_tolerance_minutes) then 'late'::public.attendance_status else 'present'::public.attendance_status end,
    updated_at=now()
  where id=a.id;
  return a.id;
end $$;

create or replace function public.process_raw_attendance_log() returns trigger language plpgsql security definer set search_path=public as $$
declare employee_uuid uuid; employee_shift uuid; shift_row public.shifts%rowtype; tz text; local_time timestamp; work_day date; attendance_uuid uuid;
begin
  select b.employee_id into employee_uuid from public.biometric_enrollments b where b.organization_id=new.organization_id and b.device_id=new.device_id and (b.device_user_id=new.employee_pin or b.pin=new.employee_pin) order by b.updated_at desc limit 1;
  if employee_uuid is null then select id into employee_uuid from public.employees where organization_id=new.organization_id and (fingerprint_pin=new.employee_pin or employee_no=new.employee_pin) and deleted_at is null limit 1; end if;
  if employee_uuid is null then update public.raw_attendance_logs set processing_error='employee_not_found',processed_at=now() where id=new.id; return new; end if;
  select e.shift_id,o.time_zone into employee_shift,tz from public.employees e join public.organizations o on o.id=e.organization_id where e.id=employee_uuid;
  local_time := new.event_time at time zone tz;
  work_day := local_time::date;
  select * into shift_row from public.shifts where id=employee_shift;
  if found and shift_row.cross_midnight and local_time::time <= shift_row.end_time then work_day := work_day-1; end if;
  insert into public.attendance_records(organization_id,employee_id,work_date,shift_id,clock_in,clock_out,status,device_id,location,source)
  select new.organization_id,employee_uuid,work_day,employee_shift,new.event_time,null,'incomplete',new.device_id,d.location,new.source from public.attendance_devices d where d.id=new.device_id
  on conflict (organization_id,employee_id,work_date) do update set clock_in=least(coalesce(public.attendance_records.clock_in,excluded.clock_in),excluded.clock_in),clock_out=case when public.attendance_records.clock_in is null then null when excluded.clock_in > public.attendance_records.clock_in then greatest(coalesce(public.attendance_records.clock_out,excluded.clock_in),excluded.clock_in) else public.attendance_records.clock_out end,device_id=excluded.device_id,source=excluded.source,updated_at=now()
  returning id into attendance_uuid;
  perform public.recalculate_attendance_record(attendance_uuid);
  update public.raw_attendance_logs set processed_at=now(),processing_error=null where id=new.id;
  return new;
exception when others then
  update public.raw_attendance_logs set processing_error=sqlerrm,processed_at=now() where id=new.id;
  return new;
end $$;
drop trigger if exists raw_attendance_process_trigger on public.raw_attendance_logs;
create trigger raw_attendance_process_trigger after insert on public.raw_attendance_logs for each row execute function public.process_raw_attendance_log();

create or replace function public.generate_daily_absences(p_organization_id uuid,p_work_date date) returns integer
language plpgsql security definer set search_path=public as $$
declare inserted_count integer;
begin
  if auth.role()<>'service_role' and not public.has_permission(p_organization_id,'attendance.create') then raise exception 'Forbidden' using errcode='42501'; end if;
  insert into public.attendance_records(organization_id,employee_id,work_date,shift_id,status,source)
  select e.organization_id,e.id,p_work_date,e.shift_id,
    case when exists(select 1 from public.holidays h where h.organization_id=e.organization_id and h.holiday_date=p_work_date) then 'holiday'::public.attendance_status
         when exists(select 1 from public.leave_requests l where l.organization_id=e.organization_id and l.employee_id=e.id and l.status='approved' and p_work_date between l.start_date and l.end_date) then (select case l.leave_type when 'sick' then 'sick'::public.attendance_status when 'permit' then 'permit'::public.attendance_status else 'leave'::public.attendance_status end from public.leave_requests l where l.organization_id=e.organization_id and l.employee_id=e.id and l.status='approved' and p_work_date between l.start_date and l.end_date order by l.created_at desc limit 1)
         when extract(isodow from p_work_date) in (6,7) then 'off'::public.attendance_status else 'absent'::public.attendance_status end,'system'
  from public.employees e where e.organization_id=p_organization_id and e.is_active and e.deleted_at is null
  on conflict (organization_id,employee_id,work_date) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $$;

create or replace function public.decide_leave_request(p_request_id uuid,p_decision text,p_rejection_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare req public.leave_requests%rowtype;
begin
  select * into req from public.leave_requests where id=p_request_id;
  if not found then raise exception 'Leave request not found'; end if;
  if not public.has_permission(req.organization_id,'leave.approve') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  update public.leave_requests set status=p_decision::public.approval_status,approved_by=auth.uid(),approved_at=now(),rejection_reason=case when p_decision='rejected' then nullif(trim(p_rejection_reason),'') else null end where id=p_request_id;
  if p_decision='approved' then
    insert into public.attendance_records(organization_id,employee_id,work_date,shift_id,status,source,notes)
    select req.organization_id,req.employee_id,d::date,e.shift_id,
      case req.leave_type when 'sick' then 'sick'::public.attendance_status when 'permit' then 'permit'::public.attendance_status else 'leave'::public.attendance_status end,'system',req.reason
    from generate_series(req.start_date,req.end_date,interval '1 day') d
    join public.employees e on e.id=req.employee_id
    on conflict(organization_id,employee_id,work_date) do update set status=excluded.status,notes=excluded.notes,updated_at=now();
  end if;
end $$;

-- Payroll procedures ---------------------------------------------------------
create or replace function public.generate_payroll_run(p_organization_id uuid,p_period_start date,p_period_end date,p_frequency public.payroll_base_type,p_notes text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_run_id uuid; emp record; prof public.payroll_profiles%rowtype; att record; adj record; base numeric; overtime_pay numeric; bonus numeric; incentive numeric; thr numeric; loan numeric; cash_advance numeric; fine numeric; other_add numeric; other_ded numeric; late_ded numeric; absence_ded numeric; early_ded numeric; gross numeric; tax_amt numeric; bpjs_amt numeric; deductions numeric; net numeric; item_id uuid;
begin
  if p_period_end<p_period_start then raise exception 'Invalid date range' using errcode='22007'; end if;
  if not public.has_permission(p_organization_id,'payroll.create') then raise exception 'Forbidden' using errcode='42501'; end if;
  insert into public.payroll_runs(organization_id,run_number,period_start,period_end,frequency,status,generated_at,notes) values(p_organization_id,'',p_period_start,p_period_end,p_frequency,'draft',now(),p_notes)
  on conflict (organization_id,period_start,period_end,frequency) do update set generated_at=now(),notes=excluded.notes,status=case when public.payroll_runs.status='finalized' then public.payroll_runs.status else 'draft'::public.approval_status end
  returning id into v_run_id;
  if exists(select 1 from public.payroll_runs where id=v_run_id and status='finalized') then raise exception 'Finalized payroll cannot be regenerated'; end if;
  update public.financial_adjustments set settled_payroll_item_id=null where settled_payroll_item_id in (select id from public.payroll_items where payroll_run_id=v_run_id);
  delete from public.payroll_items where payroll_run_id=v_run_id;
  for emp in select id from public.employees where organization_id=p_organization_id and is_active and deleted_at is null and join_date<=p_period_end loop
    select * into prof from public.payroll_profiles where organization_id=p_organization_id and employee_id=emp.id and effective_from<=p_period_end and (effective_to is null or effective_to>=p_period_start) order by effective_from desc limit 1;
    if not found then continue; end if;
    select count(*) filter(where status in ('present','late'))::numeric attended_days,count(*) filter(where status='absent')::numeric absent_days,coalesce(sum(overtime_minutes),0)::numeric overtime_minutes,coalesce(sum(late_minutes),0)::numeric late_minutes,coalesce(sum(early_leave_minutes),0)::numeric early_minutes into att from public.attendance_records where organization_id=p_organization_id and employee_id=emp.id and work_date between p_period_start and p_period_end;
    select coalesce(sum(amount) filter(where adjustment_type='bonus'),0),coalesce(sum(amount) filter(where adjustment_type='incentive'),0),coalesce(sum(amount) filter(where adjustment_type='thr'),0),coalesce(sum(amount) filter(where adjustment_type='loan'),0),coalesce(sum(amount) filter(where adjustment_type='cash_advance'),0),coalesce(sum(amount) filter(where adjustment_type='fine'),0),coalesce(sum(amount) filter(where adjustment_type='other_addition'),0),coalesce(sum(amount) filter(where adjustment_type='other_deduction'),0) into bonus,incentive,thr,loan,cash_advance,fine,other_add,other_ded from public.financial_adjustments where organization_id=p_organization_id and employee_id=emp.id and effective_date between p_period_start and p_period_end and settled_payroll_item_id is null;
    bonus:=coalesce(bonus,0)+prof.default_bonus; incentive:=coalesce(incentive,0);thr:=coalesce(thr,0);loan:=coalesce(loan,0);cash_advance:=coalesce(cash_advance,0);fine:=coalesce(fine,0);other_add:=coalesce(other_add,0);other_ded:=coalesce(other_ded,0);
    base:=case prof.base_type when 'monthly' then prof.monthly_salary when 'weekly' then prof.weekly_salary*ceil(coalesce(att.attended_days,0)/7.0) else prof.daily_salary*coalesce(att.attended_days,0) end;
    overtime_pay:=round(coalesce(att.overtime_minutes,0)/60.0*prof.overtime_hourly_rate,2);
    late_ded:=round(coalesce(att.late_minutes,0)*prof.late_deduction_per_minute,2); absence_ded:=round(coalesce(att.absent_days,0)*prof.absence_deduction_per_day,2); early_ded:=round(coalesce(att.early_minutes,0)*prof.early_deduction_per_minute,2);
    gross:=round(base+overtime_pay+bonus+incentive+thr+other_add,2); tax_amt:=round(gross*prof.tax_percent/100.0,2); bpjs_amt:=round(gross*prof.bpjs_employee_percent/100.0,2); deductions:=round(tax_amt+bpjs_amt+loan+cash_advance+fine+late_ded+absence_ded+early_ded+other_ded,2); net:=round(gross-deductions,2);
    insert into public.payroll_items(organization_id,payroll_run_id,employee_id,payslip_number,base_pay,overtime_pay,bonus,incentive,thr,tax,bpjs,loan,cash_advance,fine,late_deduction,absence_deduction,early_leave_deduction,other_addition,other_deduction,gross_pay,total_deductions,net_pay,status,calculation_details)
    values(p_organization_id,v_run_id,emp.id,'',base,overtime_pay,bonus,incentive,thr,tax_amt,bpjs_amt,loan,cash_advance,fine,late_ded,absence_ded,early_ded,other_add,other_ded,gross,deductions,net,'draft',jsonb_build_object('attended_days',coalesce(att.attended_days,0),'absent_days',coalesce(att.absent_days,0),'overtime_minutes',coalesce(att.overtime_minutes,0),'late_minutes',coalesce(att.late_minutes,0),'early_leave_minutes',coalesce(att.early_minutes,0),'profile_id',prof.id)) returning id into item_id;
    update public.financial_adjustments set settled_payroll_item_id=item_id where organization_id=p_organization_id and employee_id=emp.id and effective_date between p_period_start and p_period_end and settled_payroll_item_id is null;
  end loop;
  update public.payroll_runs set
    total_gross=coalesce((select sum(gross_pay) from public.payroll_items where payroll_run_id=v_run_id),0),
    total_deductions=coalesce((select sum(total_deductions) from public.payroll_items where payroll_run_id=v_run_id),0),
    total_net=coalesce((select sum(net_pay) from public.payroll_items where payroll_run_id=v_run_id),0),updated_at=now()
  where id=v_run_id;
  return v_run_id;
end $$;

create or replace function public.transition_payroll_run(p_run_id uuid,p_action text) returns void language plpgsql security definer set search_path=public as $$
declare run public.payroll_runs%rowtype; target public.approval_status;
begin
  select * into run from public.payroll_runs where id=p_run_id for update;
  if not found then raise exception 'Payroll run not found'; end if;
  if p_action='submit' and run.status='draft' then target='pending';
  elsif p_action='approve' and run.status='pending' then target='approved';
  elsif p_action='reject' and run.status='pending' then target='rejected';
  elsif p_action='finalize' and run.status='approved' then target='finalized';
  else raise exception 'Invalid payroll transition from % using %',run.status,p_action; end if;
  if p_action in ('approve','reject') and not public.has_permission(run.organization_id,'payroll.approve') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_action='finalize' and not public.has_permission(run.organization_id,'payroll.finalize') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_action='submit' and not public.has_permission(run.organization_id,'payroll.update') then raise exception 'Forbidden' using errcode='42501'; end if;
  update public.payroll_items set status=target,updated_at=now() where payroll_run_id=p_run_id;
  update public.payroll_runs set status=target,submitted_at=case when target='pending' then now() else submitted_at end,approved_by=case when target in ('approved','rejected') then auth.uid() else approved_by end,approved_at=case when target='approved' then now() else approved_at end,finalized_by=case when target='finalized' then auth.uid() else finalized_by end,finalized_at=case when target='finalized' then now() else finalized_at end,updated_at=now() where id=p_run_id;
  if target='finalized' then update public.attendance_records set locked_at=now() where organization_id=run.organization_id and work_date between run.period_start and run.period_end and locked_at is null; end if;
end $$;

create or replace function public.protect_finalized_payroll() returns trigger language plpgsql set search_path=public as $$
declare state public.approval_status;
begin
  if tg_table_name='payroll_runs' then state:=old.status; else select status into state from public.payroll_runs where id=old.payroll_run_id; end if;
  if state='finalized' then raise exception 'Finalized payroll is immutable' using errcode='55000'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists protect_finalized_runs on public.payroll_runs;
create trigger protect_finalized_runs before update or delete on public.payroll_runs for each row when (old.status='finalized') execute function public.protect_finalized_payroll();
drop trigger if exists protect_finalized_items on public.payroll_items;
create trigger protect_finalized_items before update or delete on public.payroll_items for each row execute function public.protect_finalized_payroll();

-- Secrets and rate limits -----------------------------------------------------
create or replace function public.set_organization_secret(p_organization_id uuid,p_secret_name text,p_secret_value text) returns void
language plpgsql security definer set search_path=public,vault as $$
declare existing_id uuid; new_id uuid; allowed text[]:=array['deli_app_key','deli_app_secret','adms_shared_secret','deli_webhook_secret'];
begin
  if not public.has_permission(p_organization_id,'settings.update') then raise exception 'Forbidden' using errcode='42501'; end if;
  if not p_secret_name=any(allowed) or char_length(p_secret_value)<1 then raise exception 'Invalid secret'; end if;
  select vault_secret_id into existing_id from public.organization_secrets where organization_id=p_organization_id and secret_name=p_secret_name;
  if existing_id is null then
    select vault.create_secret(p_secret_value,p_organization_id::text||':'||p_secret_name,'AttendFlow organization secret') into new_id;
    insert into public.organization_secrets(organization_id,secret_name,vault_secret_id,created_by) values(p_organization_id,p_secret_name,new_id,auth.uid());
  else
    perform vault.update_secret(existing_id,p_secret_value,p_organization_id::text||':'||p_secret_name,'AttendFlow organization secret');
    update public.organization_secrets set rotated_at=now(),created_by=auth.uid() where organization_id=p_organization_id and secret_name=p_secret_name;
  end if;
  perform public.log_organization_activity(p_organization_id,'setting','rotate_secret','organization_secrets',p_secret_name,jsonb_build_object('secret_name',p_secret_name));
end $$;

create or replace function public.get_organization_secret(p_organization_id uuid,p_secret_name text) returns text
language plpgsql stable security definer set search_path=public,vault,auth as $$
declare result text;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select d.decrypted_secret into result from public.organization_secrets s join vault.decrypted_secrets d on d.id=s.vault_secret_id where s.organization_id=p_organization_id and s.secret_name=p_secret_name;
  return result;
end $$;

create or replace function public.check_rate_limit(p_bucket_key text,p_limit integer,p_window_seconds integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare count_now integer;
begin
  if p_limit<1 or p_window_seconds<1 then raise exception 'Invalid rate limit'; end if;
  insert into public.rate_limit_buckets(bucket_key,window_started_at,request_count) values(p_bucket_key,now(),1)
  on conflict(bucket_key) do update set window_started_at=case when public.rate_limit_buckets.window_started_at+make_interval(secs=>p_window_seconds)<=now() then now() else public.rate_limit_buckets.window_started_at end,request_count=case when public.rate_limit_buckets.window_started_at+make_interval(secs=>p_window_seconds)<=now() then 1 else public.rate_limit_buckets.request_count+1 end,updated_at=now()
  returning request_count into count_now;
  return count_now<=p_limit;
end $$;

create or replace function public.rotate_device_token(p_device_id uuid) returns text language plpgsql security definer set search_path=public,extensions as $$
declare d public.attendance_devices%rowtype; raw_token text:=encode(gen_random_bytes(32),'hex');
begin
  select * into d from public.attendance_devices where id=p_device_id;
  if not found or (auth.role()<>'service_role' and not public.has_permission(d.organization_id,'devices.update')) then raise exception 'Forbidden' using errcode='42501'; end if;
  update public.attendance_devices set token_hash=crypt(raw_token,gen_salt('bf')),updated_at=now() where id=p_device_id;
  return raw_token;
end $$;

create or replace function public.verify_device_token(p_serial_number text,p_token text) returns uuid language sql stable security definer set search_path=public,extensions as $$
  select id from public.attendance_devices where serial_number=p_serial_number and deleted_at is null and token_hash is not null and crypt(p_token,token_hash)=token_hash limit 1;
$$;

create or replace function public.mark_device_seen(p_device_id uuid,p_metadata jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.attendance_devices set status='online',last_seen_at=now(),retry_count=0,next_retry_at=null,metadata=metadata||coalesce(p_metadata,'{}'),updated_at=now() where id=p_device_id;
end $$;

create or replace function public.ingest_adms_logs(p_device_id uuid,p_rows jsonb,p_source_ip inet default null,p_user_agent text default null) returns integer
language plpgsql security definer set search_path=public as $$
declare d public.attendance_devices%rowtype; tz text; item jsonb; inserted_count integer:=0; local_time timestamp; event_utc timestamptz;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>2000 then raise exception 'Invalid ADMS batch' using errcode='22023'; end if;
  select * into d from public.attendance_devices where id=p_device_id and deleted_at is null;
  if not found then raise exception 'Device not found'; end if;
  select time_zone into tz from public.organizations where id=d.organization_id;
  for item in select value from jsonb_array_elements(p_rows) loop
    if coalesce(item->>'punched_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$' then raise exception 'Invalid device timestamp'; end if;
    local_time := (item->>'punched_at')::timestamp;
    event_utc := local_time at time zone tz;
    insert into public.raw_attendance_logs(organization_id,device_id,employee_pin,event_time,verify_mode,status_code,work_code,idempotency_key,raw_payload,source,source_ip,user_agent)
    values(d.organization_id,d.id,item->>'device_user_id',event_utc,coalesce((item->>'verification_mode')::integer,0),coalesce((item->>'status_code')::integer,0),coalesce(item->>'work_code','0'),item->>'idempotency_key',left(item->>'raw_payload',10000),'adms',p_source_ip,left(p_user_agent,1000))
    on conflict(organization_id,idempotency_key) do nothing;
    if found then inserted_count:=inserted_count+1; end if;
  end loop;
  return inserted_count;
end $$;

create or replace function public.ingest_deli_attendance(p_organization_id uuid,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  item jsonb;
  ext_value text;
  record_id text;
  terminal text;
  check_type text;
  employee_uuid uuid;
  employee_number text;
  device_uuid uuid;
  event_epoch bigint;
  affected integer;
  inserted_count integer:=0;
  duplicate_count integer:=0;
  skipped_count integer:=0;
  skipped_records jsonb:='[]'::jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'Invalid Deli attendance batch' using errcode='22023'; end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and is_active) then raise exception 'Organization not found'; end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item)<>'object' then raise exception 'Invalid Deli attendance record' using errcode='22023'; end if;
    record_id:=nullif(trim(item->>'id'),'');
    ext_value:=nullif(trim(item->>'ext_id'),'');
    terminal:=left(coalesce(nullif(trim(item->>'terminal_id'),''),'deli-cloud'),120);
    check_type:=left(coalesce(item->>'check_type',''),50);
    if record_id is null or coalesce(item->>'check_time','') !~ '^[0-9]{1,12}$' then raise exception 'Invalid Deli attendance record' using errcode='22023'; end if;
    event_epoch:=(item->>'check_time')::bigint;
    if event_epoch<1 then raise exception 'Invalid Deli attendance timestamp' using errcode='22023'; end if;

    employee_uuid:=null;
    employee_number:=null;
    if ext_value ~* '^[0-9a-f]{32}$' then
      begin
        employee_uuid:=(substr(ext_value,1,8)||'-'||substr(ext_value,9,4)||'-'||substr(ext_value,13,4)||'-'||substr(ext_value,17,4)||'-'||substr(ext_value,21,12))::uuid;
      exception when invalid_text_representation then employee_uuid:=null;
      end;
    end if;
    if employee_uuid is not null then
      select id,employee_no into employee_uuid,employee_number from public.employees where organization_id=p_organization_id and id=employee_uuid and deleted_at is null limit 1;
    end if;
    if employee_number is null and ext_value is not null then
      select id,employee_no into employee_uuid,employee_number from public.employees where organization_id=p_organization_id and external_ids->>'deli_ext_id'=ext_value and deleted_at is null order by created_at limit 1;
    end if;
    if employee_number is null then
      skipped_count:=skipped_count+1;
      if jsonb_array_length(skipped_records)<50 then skipped_records:=skipped_records||jsonb_build_array(jsonb_build_object('id',record_id,'ext_id',ext_value)); end if;
      continue;
    end if;

    insert into public.attendance_devices(organization_id,vendor,protocol,name,serial_number,status,last_seen_at,metadata)
    values(p_organization_id,'deli','deli_cloud',terminal,terminal,'online',now(),jsonb_build_object('deli_managed',true))
    on conflict(organization_id,serial_number) do update set
      name=excluded.name,
      status='online',
      last_seen_at=excluded.last_seen_at,
      metadata=public.attendance_devices.metadata||excluded.metadata,
      updated_at=now()
    returning id into device_uuid;

    insert into public.raw_attendance_logs(organization_id,device_id,employee_pin,event_time,verify_mode,status_code,work_code,idempotency_key,raw_payload,source)
    values(
      p_organization_id,
      device_uuid,
      employee_number,
      to_timestamp(event_epoch),
      case check_type when 'fp' then 1 when 'pass' then 2 when 'card' then 3 when 'fa' then 15 else 0 end,
      0,
      check_type,
      'deli:'||record_id,
      left(item::text,10000),
      'deli'
    )
    on conflict(organization_id,idempotency_key) do nothing;
    get diagnostics affected=row_count;
    if affected=1 then inserted_count:=inserted_count+1; else duplicate_count:=duplicate_count+1; end if;
  end loop;

  return jsonb_build_object(
    'received',jsonb_array_length(p_rows),
    'inserted',inserted_count,
    'duplicates',duplicate_count,
    'skipped',skipped_count,
    'skipped_records',skipped_records
  );
end $$;

create or replace function public.claim_integration_job(p_organization_id uuid,p_job_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare claimed public.integration_jobs%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.integration_jobs
  set status='running',attempts=attempts+1,started_at=now(),completed_at=null,next_attempt_at=null,error_message=null,updated_at=now()
  where organization_id=p_organization_id and id=p_job_id and status='queued'
    and attempts<max_attempts and job_type like 'deli\_%' escape '\'
  returning * into claimed;
  if not found then return null; end if;
  return to_jsonb(claimed);
end $$;

create or replace function public.recover_stale_integration_jobs(p_stale_before timestamptz) returns jsonb
language plpgsql security definer set search_path=public as $$
declare requeued_count integer:=0; failed_count integer:=0;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_stale_before is null or p_stale_before>now() then
    raise exception 'p_stale_before must be a timestamp in the past' using errcode='22023';
  end if;

  with exhausted as (
    select id
    from public.integration_jobs
    where status='running'
      and job_type like 'deli\_%' escape '\'
      and (started_at is null or started_at<p_stale_before)
      and attempts>=max_attempts
    for update skip locked
  )
  update public.integration_jobs j
  set status='failed',completed_at=now(),next_attempt_at=null,
      error_message='Worker lease expired after final attempt.',updated_at=now()
  where j.id in(select id from exhausted);
  get diagnostics failed_count=row_count;

  with retriable as (
    select id
    from public.integration_jobs
    where status='running'
      and job_type like 'deli\_%' escape '\'
      and (started_at is null or started_at<p_stale_before)
      and attempts<max_attempts
    for update skip locked
  )
  update public.integration_jobs j
  set status='queued',started_at=null,completed_at=null,next_attempt_at=now(),
      error_message='Worker lease expired; job requeued.',updated_at=now()
  where j.id in(select id from retriable);
  get diagnostics requeued_count=row_count;

  return jsonb_build_object('requeued',requeued_count,'failed',failed_count);
end $$;

create or replace function public.claim_device_command(p_device_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.device_commands%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into c from public.device_commands
  where device_id=p_device_id and status in ('queued','failed') and available_at<=now() and attempts<max_attempts
  order by available_at,created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.device_commands set status='running',attempts=attempts+1,claimed_at=now(),error_message=null,updated_at=now() where id=c.id returning * into c;
  return to_jsonb(c);
end $$;

create or replace function public.complete_device_command(p_command_id uuid,p_succeeded boolean,p_result jsonb default '{}',p_error_message text default null) returns void
language plpgsql security definer set search_path=public as $$
declare c public.device_commands%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into c from public.device_commands where id=p_command_id for update;
  if not found then raise exception 'Command not found'; end if;
  if p_succeeded then
    update public.device_commands set status='succeeded',completed_at=now(),result=coalesce(p_result,'{}'),error_message=null,updated_at=now() where id=p_command_id;
  elsif c.attempts<c.max_attempts then
    update public.device_commands set status='queued',available_at=now()+make_interval(secs=>least(3600,30*(2^greatest(c.attempts-1,0)))),error_message=left(coalesce(p_error_message,'Device command failed'),2000),updated_at=now() where id=p_command_id;
  else
    update public.device_commands set status='failed',completed_at=now(),error_message=left(coalesce(p_error_message,'Device command failed'),2000),updated_at=now() where id=p_command_id;
  end if;
end $$;

create or replace function public.complete_device_command_by_no(p_device_id uuid,p_command_no bigint,p_succeeded boolean,p_result jsonb default '{}',p_error_message text default null) returns void
language plpgsql security definer set search_path=public as $$
declare command_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select id into command_id from public.device_commands where device_id=p_device_id and command_no=p_command_no;
  if not found then raise exception 'Command not found'; end if;
  perform public.complete_device_command(command_id,p_succeeded,p_result,p_error_message);
end $$;

-- Dashboard and directory views ---------------------------------------------
create or replace view public.organization_member_directory with (security_invoker=true) as
select m.id,m.organization_id,m.user_id,p.full_name,p.email::text email,p.phone,m.role,m.status,d.name department_name,m.permission_grants,m.permission_denials,m.created_at,m.updated_at
from public.organization_members m left join public.profiles p on p.id=m.user_id left join public.departments d on d.id=m.department_id;

create or replace view public.audit_log_directory with (security_invoker=true) as
select a.id::text id,a.organization_id,a.user_id,p.full_name actor_name,p.email::text actor_email,a.event_type,a.entity_type,a.entity_id,a.action,a.old_data,a.new_data,a.ip_address::text ip_address,a.user_agent,a.device_info,a.correlation_id::text correlation_id,a.created_at
from public.audit_logs a left join public.profiles p on p.id=a.user_id;

create or replace view public.attendance_monthly_summary with (security_invoker=true) as
select md5(a.organization_id::text||a.employee_id::text||to_char(date_trunc('month',a.work_date),'YYYY-MM'))::uuid id,a.organization_id,a.employee_id,to_char(date_trunc('month',a.work_date),'YYYY-MM') month,e.employee_no,e.full_name,
count(*) filter(where a.status='present')::int present_days,count(*) filter(where a.status='late')::int late_days,count(*) filter(where a.status='absent')::int absent_days,count(*) filter(where a.status='permit')::int permit_days,count(*) filter(where a.status='sick')::int sick_days,count(*) filter(where a.status='leave')::int leave_days,coalesce(sum(a.overtime_minutes),0)::int overtime_minutes,coalesce(sum(a.work_minutes),0)::int work_minutes
from public.attendance_records a join public.employees e on e.id=a.employee_id group by a.organization_id,a.employee_id,to_char(date_trunc('month',a.work_date),'YYYY-MM'),e.employee_no,e.full_name;

create or replace function public.get_dashboard_summary(p_organization_id uuid,p_date date default current_date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb; tz text;
begin
  if not public.has_permission(p_organization_id,'dashboard.read') then raise exception 'Forbidden' using errcode='42501'; end if;
  select time_zone into tz from public.organizations where id=p_organization_id;
  select jsonb_build_object(
    'kpis',jsonb_build_object(
      'totalEmployees',(select count(*) from public.employees where organization_id=p_organization_id and deleted_at is null),
      'activeEmployees',(select count(*) from public.employees where organization_id=p_organization_id and deleted_at is null and is_active),
      'inactiveEmployees',(select count(*) from public.employees where organization_id=p_organization_id and deleted_at is null and not is_active),
      'fingerprintConnected',(select count(distinct employee_id) from public.biometric_enrollments where organization_id=p_organization_id and status='synced'),
      'fingerprintUnconnected',(select count(*) from public.employees e where e.organization_id=p_organization_id and e.is_active and e.deleted_at is null and not exists(select 1 from public.biometric_enrollments b where b.employee_id=e.id and b.status='synced')),
      'presentToday',(select count(*) from public.attendance_records where organization_id=p_organization_id and work_date=p_date and status in ('present','late')),
      'lateToday',(select count(*) from public.attendance_records where organization_id=p_organization_id and work_date=p_date and late_minutes>0),
      'earlyLeaveToday',(select count(*) from public.attendance_records where organization_id=p_organization_id and work_date=p_date and early_leave_minutes>0),
      'absentToday',(select count(*) from public.attendance_records where organization_id=p_organization_id and work_date=p_date and status='absent'),
      'permitToday',(select count(*) from public.attendance_records where organization_id=p_organization_id and work_date=p_date and status='permit'),
      'sickToday',(select count(*) from public.attendance_records where organization_id=p_organization_id and work_date=p_date and status='sick'),
      'leaveToday',(select count(*) from public.attendance_records where organization_id=p_organization_id and work_date=p_date and status='leave'),
      'overtimeToday',(select count(*) from public.attendance_records where organization_id=p_organization_id and work_date=p_date and overtime_minutes>0),
      'workMinutesToday',(select coalesce(sum(work_minutes),0) from public.attendance_records where organization_id=p_organization_id and work_date=p_date),
      'payrollToday',(select coalesce(sum(net_pay),0) from public.payroll_items where organization_id=p_organization_id and (created_at at time zone tz)::date=p_date),
      'payrollMonth',(select coalesce(sum(net_pay),0) from public.payroll_items where organization_id=p_organization_id and date_trunc('month',created_at at time zone tz)=date_trunc('month',p_date::timestamp)),
      'devicesOnline',(select count(*) from public.attendance_devices where organization_id=p_organization_id and deleted_at is null and status='online'),
      'devicesOffline',(select count(*) from public.attendance_devices where organization_id=p_organization_id and deleted_at is null and status<>'online')
    ),
    'dailyAttendance',(select coalesce(jsonb_agg(jsonb_build_object('label',to_char(d,'YYYY-MM-DD'),'value',coalesce(x.value,0)) order by d),'[]') from generate_series(p_date-13,p_date,interval '1 day') d left join lateral(select count(*) value from public.attendance_records a where a.organization_id=p_organization_id and a.work_date=d::date and a.status in ('present','late')) x on true),
    'monthlyAttendance',(select coalesce(jsonb_agg(jsonb_build_object('label',to_char(m,'YYYY-MM'),'value',coalesce(x.value,0)) order by m),'[]') from generate_series(date_trunc('month',p_date::timestamp)-interval '11 months',date_trunc('month',p_date::timestamp),interval '1 month') m left join lateral(select count(*) value from public.attendance_records a where a.organization_id=p_organization_id and date_trunc('month',a.work_date)=m and a.status in ('present','late')) x on true),
    'lateness',(select coalesce(jsonb_agg(jsonb_build_object('label',to_char(d,'YYYY-MM-DD'),'value',coalesce(x.value,0)) order by d),'[]') from generate_series(p_date-13,p_date,interval '1 day') d left join lateral(select coalesce(sum(late_minutes),0) value from public.attendance_records a where a.organization_id=p_organization_id and a.work_date=d::date) x on true),
    'overtime',(select coalesce(jsonb_agg(jsonb_build_object('label',to_char(d,'YYYY-MM-DD'),'value',coalesce(x.value,0)) order by d),'[]') from generate_series(p_date-13,p_date,interval '1 day') d left join lateral(select coalesce(sum(overtime_minutes),0) value from public.attendance_records a where a.organization_id=p_organization_id and a.work_date=d::date) x on true),
    'payroll',(select coalesce(jsonb_agg(jsonb_build_object('label',to_char(m,'YYYY-MM'),'value',coalesce(x.value,0)) order by m),'[]') from generate_series(date_trunc('month',p_date::timestamp)-interval '11 months',date_trunc('month',p_date::timestamp),interval '1 month') m left join lateral(select coalesce(sum(total_net),0) value from public.payroll_runs r where r.organization_id=p_organization_id and date_trunc('month',r.period_end)=m and r.status in ('approved','finalized')) x on true),
    'status',(select coalesce(jsonb_agg(jsonb_build_object('name',status::text,'value',value)),'[]') from (select status,count(*) value from public.attendance_records where organization_id=p_organization_id and work_date=p_date group by status) s),
    'recentActivity',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select a.id::text,a.action,a.entity_type,a.created_at,coalesce(p.full_name,p.email::text) actor from public.audit_logs a left join public.profiles p on p.id=a.user_id where a.organization_id=p_organization_id order by a.created_at desc limit 10) q),
    'notifications',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select id,title_key,message_key,params,severity::text,created_at,read_at from public.system_notifications where organization_id=p_organization_id and (user_id is null or user_id=auth.uid()) order by created_at desc limit 10) q)
  ) into result;
  return result;
end $$;

-- Trigger installation -------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['organizations','profiles','organization_members','role_permissions','organization_settings','departments','positions','shifts','employees','shift_assignments','holidays','attendance_devices','biometric_enrollments','biometric_assets','device_commands','attendance_records','leave_requests','payroll_profiles','payroll_runs','payroll_items','financial_adjustments','integrations','integration_jobs','rate_limit_buckets'] loop
    execute format('drop trigger if exists %I_updated_at on public.%I',t,t);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',t,t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['organizations','organization_members','role_permissions','organization_settings','departments','positions','shifts','employees','shift_assignments','holidays','attendance_devices','biometric_enrollments','biometric_assets','device_commands','attendance_records','leave_requests','payroll_profiles','payroll_runs','payroll_items','financial_adjustments','integrations','integration_jobs','backup_jobs'] loop
    execute format('drop trigger if exists %I_audit on public.%I',t,t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()',t,t);
  end loop;
end $$;

-- Row Level Security ----------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organization_settings enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated using (public.is_org_member(id));
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations for update to authenticated using (public.has_permission(id,'settings.update')) with check (public.has_permission(id,'settings.update'));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id=auth.uid() or exists(select 1 from public.organization_members me join public.organization_members other on other.organization_id=me.organization_id where me.user_id=auth.uid() and me.status='active' and other.user_id=profiles.id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members for select to authenticated using (user_id=auth.uid() or public.has_permission(organization_id,'users.read'));
drop policy if exists members_insert on public.organization_members;
create policy members_insert on public.organization_members for insert to authenticated with check (public.has_permission(organization_id,'users.create'));
drop policy if exists members_update on public.organization_members;
create policy members_update on public.organization_members for update to authenticated using (public.has_permission(organization_id,'users.update')) with check (public.has_permission(organization_id,'users.update'));
drop policy if exists members_delete on public.organization_members;
create policy members_delete on public.organization_members for delete to authenticated using (public.has_permission(organization_id,'users.delete') and user_id<>auth.uid());

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated using (public.has_permission(organization_id,'roles.read') or public.is_org_member(organization_id));
drop policy if exists role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions for insert to authenticated with check (public.has_permission(organization_id,'roles.create'));
drop policy if exists role_permissions_update on public.role_permissions;
create policy role_permissions_update on public.role_permissions for update to authenticated using (public.has_permission(organization_id,'roles.update')) with check (public.has_permission(organization_id,'roles.update'));

drop policy if exists settings_select on public.organization_settings;
create policy settings_select on public.organization_settings for select to authenticated using (public.has_permission(organization_id,'settings.read'));
drop policy if exists settings_insert on public.organization_settings;
create policy settings_insert on public.organization_settings for insert to authenticated with check (public.has_permission(organization_id,'settings.update'));
drop policy if exists settings_update on public.organization_settings;
create policy settings_update on public.organization_settings for update to authenticated using (public.has_permission(organization_id,'settings.update')) with check (public.has_permission(organization_id,'settings.update'));

-- Organization-scoped table policies generated from an explicit permission map.
do $$
declare r record;
begin
  for r in select * from (values
    ('departments','organization'),('positions','organization'),('shifts','shifts'),('employees','employees'),('shift_assignments','shifts'),('holidays','settings'),
    ('attendance_devices','devices'),('biometric_enrollments','devices'),('biometric_assets','devices'),('device_commands','devices'),('raw_attendance_logs','devices'),
    ('attendance_records','attendance'),('leave_requests','leave'),('payroll_profiles','payroll'),('payroll_runs','payroll'),('payroll_items','payroll'),('financial_adjustments','payroll'),
    ('integrations','integrations'),('integration_jobs','integrations'),('integration_logs','integrations'),('webhook_events','integrations'),('backup_jobs','settings')
  ) as x(table_name,module_name) loop
    execute format('alter table public.%I enable row level security',r.table_name);
    execute format('drop policy if exists %I_select on public.%I',r.table_name,r.table_name);
    execute format('drop policy if exists %I_insert on public.%I',r.table_name,r.table_name);
    execute format('drop policy if exists %I_update on public.%I',r.table_name,r.table_name);
    execute format('drop policy if exists %I_delete on public.%I',r.table_name,r.table_name);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.has_permission(organization_id,%L))',r.table_name,r.table_name,r.module_name||'.read');
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(organization_id,%L))',r.table_name,r.table_name,r.module_name||'.create');
    execute format('create policy %I_update on public.%I for update to authenticated using (public.has_permission(organization_id,%L)) with check (public.has_permission(organization_id,%L))',r.table_name,r.table_name,r.module_name||'.update',r.module_name||'.update');
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.has_permission(organization_id,%L))',r.table_name,r.table_name,r.module_name||'.delete');
  end loop;
end $$;

alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated using (organization_id is not null and public.has_permission(organization_id,'audit.read'));

alter table public.system_notifications enable row level security;
drop policy if exists notifications_select on public.system_notifications;
create policy notifications_select on public.system_notifications for select to authenticated using (public.is_org_member(organization_id) and (user_id is null or user_id=auth.uid()));
drop policy if exists notifications_update on public.system_notifications;
create policy notifications_update on public.system_notifications for update to authenticated using (public.is_org_member(organization_id) and (user_id is null or user_id=auth.uid())) with check (public.is_org_member(organization_id) and (user_id is null or user_id=auth.uid()));
drop policy if exists notifications_delete on public.system_notifications;
create policy notifications_delete on public.system_notifications for delete to authenticated using (public.has_permission(organization_id,'settings.update'));

alter table public.organization_secrets enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.number_sequences enable row level security;
-- No client policies: these four tables are accessed only by security-definer functions/service role.

-- Storage --------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('employee-documents','employee-documents',false,8388608,array['image/jpeg','image/png','image/webp','application/pdf']),
('organization-assets','organization-assets',false,8388608,array['image/jpeg','image/png','image/webp','image/svg+xml']),
('integration-payloads','integration-payloads',false,52428800,array['application/json','text/plain','application/octet-stream']),
('biometrics','biometrics',false,2097152,array['application/octet-stream','text/plain']),
('backups','backups',false,52428800,array['application/json','application/gzip','application/zip','application/octet-stream'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.path_organization_id(p_name text) returns uuid language plpgsql immutable set search_path=public,storage as $$
begin return nullif((storage.foldername(p_name))[1],'')::uuid; exception when others then return null; end $$;

drop policy if exists attendflow_storage_select on storage.objects;
create policy attendflow_storage_select on storage.objects for select to authenticated using (
  bucket_id in ('employee-documents','organization-assets','integration-payloads','biometrics','backups') and public.is_org_member(public.path_organization_id(name))
);
drop policy if exists attendflow_storage_insert on storage.objects;
create policy attendflow_storage_insert on storage.objects for insert to authenticated with check (
  (bucket_id='employee-documents' and (public.has_permission(public.path_organization_id(name),'employees.create') or public.has_permission(public.path_organization_id(name),'employees.update')))
  or (bucket_id='organization-assets' and public.has_permission(public.path_organization_id(name),'settings.update'))
  or (bucket_id='integration-payloads' and public.has_permission(public.path_organization_id(name),'integrations.update'))
  or (bucket_id='biometrics' and public.has_permission(public.path_organization_id(name),'devices.update'))
  or (bucket_id='backups' and public.has_permission(public.path_organization_id(name),'settings.update'))
);
drop policy if exists attendflow_storage_update on storage.objects;
create policy attendflow_storage_update on storage.objects for update to authenticated using (public.has_permission(public.path_organization_id(name),'settings.update')) with check (public.has_permission(public.path_organization_id(name),'settings.update'));
drop policy if exists attendflow_storage_delete on storage.objects;
create policy attendflow_storage_delete on storage.objects for delete to authenticated using (public.has_permission(public.path_organization_id(name),case when bucket_id='employee-documents' then 'employees.delete' when bucket_id='biometrics' then 'devices.delete' else 'settings.update' end));

-- Realtime -------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['employees','attendance_records','attendance_devices','biometric_enrollments','biometric_assets','device_commands','integration_jobs','system_notifications','payroll_runs'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
end $$;

-- Grants ---------------------------------------------------------------------
grant usage on schema public to authenticated,service_role;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;
grant select on public.organization_member_directory,public.audit_log_directory,public.attendance_monthly_summary to authenticated;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that
-- implicit API surface first, then grant only the functions each role needs.
revoke all on function public.set_updated_at() from public,anon,authenticated;
revoke all on function public.is_org_member(uuid,uuid) from public,anon,authenticated;
revoke all on function public.has_permission(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.default_role_permissions(public.app_role) from public,anon,authenticated;
revoke all on function public.seed_role_permissions(uuid) from public,anon,authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;
revoke all on function public.create_organization(text,text) from public,anon,authenticated;
revoke all on function public.next_number(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.assign_generated_numbers() from public,anon,authenticated;
revoke all on function public.register_employee(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.redact_audit_data(jsonb) from public,anon,authenticated;
revoke all on function public.safe_inet(text) from public,anon,authenticated;
revoke all on function public.write_audit_log() from public,anon,authenticated;
revoke all on function public.log_client_activity(text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.log_organization_activity(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.recalculate_attendance_record(uuid,uuid,uuid,date) from public,anon,authenticated;
revoke all on function public.process_raw_attendance_log() from public,anon,authenticated;
revoke all on function public.generate_daily_absences(uuid,date) from public,anon,authenticated;
revoke all on function public.decide_leave_request(uuid,text,text) from public,anon,authenticated;
revoke all on function public.generate_payroll_run(uuid,date,date,public.payroll_base_type,text) from public,anon,authenticated;
revoke all on function public.transition_payroll_run(uuid,text) from public,anon,authenticated;
revoke all on function public.protect_finalized_payroll() from public,anon,authenticated;
revoke all on function public.set_organization_secret(uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_organization_secret(uuid,text) from public,anon,authenticated;
revoke all on function public.check_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.rotate_device_token(uuid) from public,anon,authenticated;
revoke all on function public.verify_device_token(text,text) from public,anon,authenticated;
revoke all on function public.mark_device_seen(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.ingest_adms_logs(uuid,jsonb,inet,text) from public,anon,authenticated;
revoke all on function public.ingest_deli_attendance(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.claim_integration_job(uuid,uuid) from public,anon,authenticated;
revoke all on function public.recover_stale_integration_jobs(timestamptz) from public,anon,authenticated;
revoke all on function public.claim_device_command(uuid) from public,anon,authenticated;
revoke all on function public.complete_device_command(uuid,boolean,jsonb,text) from public,anon,authenticated;
revoke all on function public.complete_device_command_by_no(uuid,bigint,boolean,jsonb,text) from public,anon,authenticated;
revoke all on function public.get_dashboard_summary(uuid,date) from public,anon,authenticated;
revoke all on function public.path_organization_id(text) from public,anon,authenticated;

grant execute on function public.is_org_member(uuid,uuid) to authenticated,service_role;
grant execute on function public.has_permission(uuid,text,uuid) to authenticated,service_role;
grant execute on function public.path_organization_id(text) to authenticated,service_role;
grant execute on function public.create_organization(text,text) to authenticated;
grant execute on function public.register_employee(uuid,jsonb) to authenticated;
grant execute on function public.log_client_activity(text,text,text,text,jsonb) to authenticated;
grant execute on function public.log_organization_activity(uuid,text,text,text,text,jsonb) to authenticated;
grant execute on function public.recalculate_attendance_record(uuid,uuid,uuid,date) to authenticated;
grant execute on function public.generate_daily_absences(uuid,date) to authenticated,service_role;
grant execute on function public.decide_leave_request(uuid,text,text) to authenticated;
grant execute on function public.generate_payroll_run(uuid,date,date,public.payroll_base_type,text) to authenticated;
grant execute on function public.transition_payroll_run(uuid,text) to authenticated;
grant execute on function public.get_dashboard_summary(uuid,date) to authenticated;
grant execute on function public.set_organization_secret(uuid,text,text) to authenticated;
grant execute on function public.rotate_device_token(uuid) to service_role;
grant execute on function public.get_organization_secret(uuid,text) to service_role;
grant execute on function public.verify_device_token(text,text) to service_role;
grant execute on function public.check_rate_limit(text,integer,integer) to service_role;
grant execute on function public.mark_device_seen(uuid,jsonb) to service_role;
grant execute on function public.ingest_adms_logs(uuid,jsonb,inet,text) to service_role;
grant execute on function public.ingest_deli_attendance(uuid,jsonb) to service_role;
grant execute on function public.claim_integration_job(uuid,uuid) to service_role;
grant execute on function public.recover_stale_integration_jobs(timestamptz) to service_role;
grant execute on function public.claim_device_command(uuid) to service_role;
grant execute on function public.complete_device_command(uuid,boolean,jsonb,text) to service_role;
grant execute on function public.complete_device_command_by_no(uuid,bigint,boolean,jsonb,text) to service_role;

commit;

-- ============================================================================
-- SOURCE: sql/001_seed.sql
-- ============================================================================
-- AttendFlow optional demonstration seed.
-- Run 000_full_schema.sql first, sign in, create an organization, then execute:
-- select public.seed_demo_data_for_current_user();
-- The function is idempotent for records identified by DEMO codes.

begin;

create or replace function public.seed_demo_data(p_organization_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_time_zone text;
  v_general_department uuid;
  v_hr_department uuid;
  v_operations_department uuid;
  v_staff_position uuid;
  v_supervisor_position uuid;
  v_regular_shift uuid;
  v_night_shift uuid;
  v_device_id uuid;
  v_employee_1 uuid;
  v_employee_2 uuid;
  v_employee_3 uuid;
  v_employee_4 uuid;
  v_day date;
  v_inserted_attendance integer := 0;
begin
  if auth.role() <> 'service_role' and not public.has_permission(p_organization_id,'settings.update') then
    raise exception 'Forbidden' using errcode='42501';
  end if;

  select time_zone into v_time_zone from public.organizations where id=p_organization_id and is_active=true;
  if not found then raise exception 'Organization not found' using errcode='P0002'; end if;

  insert into public.departments(organization_id,code,name,is_active)
  values(p_organization_id,'GENERAL','General',true)
  on conflict(organization_id,code) do update set name=excluded.name,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_general_department;

  insert into public.departments(organization_id,code,name,is_active)
  values(p_organization_id,'HR','Human Resources',true)
  on conflict(organization_id,code) do update set name=excluded.name,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_hr_department;

  insert into public.departments(organization_id,code,name,parent_id,is_active)
  values(p_organization_id,'OPS','Operations',v_general_department,true)
  on conflict(organization_id,code) do update set name=excluded.name,parent_id=excluded.parent_id,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_operations_department;

  insert into public.positions(organization_id,code,name,level,is_active)
  values(p_organization_id,'STAFF','Staff',1,true)
  on conflict(organization_id,code) do update set name=excluded.name,level=excluded.level,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_staff_position;

  insert into public.positions(organization_id,code,name,level,is_active)
  values(p_organization_id,'SUPERVISOR','Supervisor',3,true)
  on conflict(organization_id,code) do update set name=excluded.name,level=excluded.level,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_supervisor_position;

  insert into public.shifts(organization_id,code,name,shift_type,start_time,end_time,break_minutes,grace_minutes,late_tolerance_minutes,early_leave_tolerance_minutes,overtime_after_minutes,cross_midnight,is_active)
  values(p_organization_id,'REGULAR','Regular 08:00-17:00','fixed','08:00','17:00',60,10,0,10,30,false,true)
  on conflict(organization_id,code) do update set name=excluded.name,shift_type=excluded.shift_type,start_time=excluded.start_time,end_time=excluded.end_time,break_minutes=excluded.break_minutes,grace_minutes=excluded.grace_minutes,late_tolerance_minutes=excluded.late_tolerance_minutes,early_leave_tolerance_minutes=excluded.early_leave_tolerance_minutes,overtime_after_minutes=excluded.overtime_after_minutes,cross_midnight=excluded.cross_midnight,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_regular_shift;

  insert into public.shifts(organization_id,code,name,shift_type,start_time,end_time,break_minutes,grace_minutes,late_tolerance_minutes,early_leave_tolerance_minutes,overtime_after_minutes,cross_midnight,is_active)
  values(p_organization_id,'NIGHT','Night 22:00-06:00','night','22:00','06:00',60,10,0,10,30,true,true)
  on conflict(organization_id,code) do update set name=excluded.name,shift_type=excluded.shift_type,start_time=excluded.start_time,end_time=excluded.end_time,break_minutes=excluded.break_minutes,grace_minutes=excluded.grace_minutes,late_tolerance_minutes=excluded.late_tolerance_minutes,early_leave_tolerance_minutes=excluded.early_leave_tolerance_minutes,overtime_after_minutes=excluded.overtime_after_minutes,cross_midnight=excluded.cross_midnight,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_night_shift;

  insert into public.employees(organization_id,employee_no,full_name,gender,phone,email,department_id,position_id,status,shift_id,join_date,bpjs_status,bank_name,bank_account_name,emergency_contact_name,emergency_contact_phone,notes,fingerprint_pin,is_active)
  values(p_organization_id,'DEMO-001','Ayu Pratama','female','+620000000001','ayu.pratama@example.invalid',v_hr_department,v_supervisor_position,'active',v_regular_shift,(current_date-interval '2 years')::date,true,'Demo Bank','Ayu Pratama','Budi Pratama','+620000009001','Demonstration data','1001',true)
  on conflict(organization_id,employee_no) do update set full_name=excluded.full_name,department_id=excluded.department_id,position_id=excluded.position_id,shift_id=excluded.shift_id,status='active',is_active=true,deleted_at=null,updated_at=now()
  returning id into v_employee_1;

  insert into public.employees(organization_id,employee_no,full_name,gender,phone,email,department_id,position_id,status,shift_id,join_date,bpjs_status,bank_name,bank_account_name,emergency_contact_name,emergency_contact_phone,notes,fingerprint_pin,is_active)
  values(p_organization_id,'DEMO-002','Bima Santoso','male','+620000000002','bima.santoso@example.invalid',v_operations_department,v_staff_position,'active',v_regular_shift,(current_date-interval '18 months')::date,true,'Demo Bank','Bima Santoso','Citra Santoso','+620000009002','Demonstration data','1002',true)
  on conflict(organization_id,employee_no) do update set full_name=excluded.full_name,department_id=excluded.department_id,position_id=excluded.position_id,shift_id=excluded.shift_id,status='active',is_active=true,deleted_at=null,updated_at=now()
  returning id into v_employee_2;

  insert into public.employees(organization_id,employee_no,full_name,gender,phone,email,department_id,position_id,status,shift_id,join_date,bpjs_status,bank_name,bank_account_name,emergency_contact_name,emergency_contact_phone,notes,fingerprint_pin,is_active)
  values(p_organization_id,'DEMO-003','Chen Wei','male','+620000000003','chen.wei@example.invalid',v_operations_department,v_staff_position,'active',v_night_shift,(current_date-interval '1 year')::date,false,'Demo Bank','Chen Wei','Li Na','+620000009003','Demonstration data','1003',true)
  on conflict(organization_id,employee_no) do update set full_name=excluded.full_name,department_id=excluded.department_id,position_id=excluded.position_id,shift_id=excluded.shift_id,status='active',is_active=true,deleted_at=null,updated_at=now()
  returning id into v_employee_3;

  insert into public.employees(organization_id,employee_no,full_name,gender,phone,email,department_id,position_id,status,shift_id,join_date,bpjs_status,bank_name,bank_account_name,emergency_contact_name,emergency_contact_phone,notes,fingerprint_pin,is_active)
  values(p_organization_id,'DEMO-004','Dewi Lestari','female','+620000000004','dewi.lestari@example.invalid',v_general_department,v_staff_position,'probation',v_regular_shift,(current_date-interval '2 months')::date,false,'Demo Bank','Dewi Lestari','Eko Lestari','+620000009004','Demonstration data','1004',true)
  on conflict(organization_id,employee_no) do update set full_name=excluded.full_name,department_id=excluded.department_id,position_id=excluded.position_id,shift_id=excluded.shift_id,status='probation',is_active=true,deleted_at=null,updated_at=now()
  returning id into v_employee_4;

  update public.departments set manager_employee_id=v_employee_1,updated_at=now() where organization_id=p_organization_id and id=v_hr_department;
  update public.departments set manager_employee_id=v_employee_1,updated_at=now() where organization_id=p_organization_id and id=v_general_department;

  insert into public.shift_assignments(organization_id,employee_id,shift_id,effective_from)
  values
    (p_organization_id,v_employee_1,v_regular_shift,(current_date-interval '2 years')::date),
    (p_organization_id,v_employee_2,v_regular_shift,(current_date-interval '18 months')::date),
    (p_organization_id,v_employee_3,v_night_shift,(current_date-interval '1 year')::date),
    (p_organization_id,v_employee_4,v_regular_shift,(current_date-interval '2 months')::date)
  on conflict(organization_id,employee_id,effective_from) do update set shift_id=excluded.shift_id,effective_to=null,updated_at=now();

  insert into public.payroll_profiles(organization_id,employee_id,base_type,daily_salary,monthly_salary,overtime_hourly_rate,late_deduction_per_minute,absence_deduction_per_day,early_deduction_per_minute,default_bonus,tax_percent,bpjs_employee_percent,work_days_per_month,effective_from)
  values
    (p_organization_id,v_employee_1,'monthly',0,9500000,70000,2500,430000,2500,500000,5,1,22,date_trunc('year',current_date)::date),
    (p_organization_id,v_employee_2,'monthly',0,6500000,50000,2000,300000,2000,250000,3,1,22,date_trunc('year',current_date)::date),
    (p_organization_id,v_employee_3,'monthly',0,7000000,55000,2000,320000,2000,300000,3,1,22,date_trunc('year',current_date)::date),
    (p_organization_id,v_employee_4,'daily',300000,0,45000,1500,300000,1500,0,0,0,22,date_trunc('year',current_date)::date)
  on conflict(organization_id,employee_id,effective_from) do update set base_type=excluded.base_type,daily_salary=excluded.daily_salary,monthly_salary=excluded.monthly_salary,overtime_hourly_rate=excluded.overtime_hourly_rate,late_deduction_per_minute=excluded.late_deduction_per_minute,absence_deduction_per_day=excluded.absence_deduction_per_day,early_deduction_per_minute=excluded.early_deduction_per_minute,default_bonus=excluded.default_bonus,tax_percent=excluded.tax_percent,bpjs_employee_percent=excluded.bpjs_employee_percent,work_days_per_month=excluded.work_days_per_month,updated_at=now();

  insert into public.attendance_devices(organization_id,vendor,protocol,name,location,ip_address,port,serial_number,firmware,status,auto_sync,metadata)
  values(p_organization_id,'zkteco','adms','Demo ZKTeco Gate','Main Entrance','192.0.2.10',4370,'DEMO-ZK-001','Demo 1.0','offline',true,jsonb_build_object('demo',true))
  on conflict(organization_id,serial_number) do update set name=excluded.name,location=excluded.location,ip_address=excluded.ip_address,port=excluded.port,firmware=excluded.firmware,auto_sync=true,deleted_at=null,metadata=excluded.metadata,updated_at=now()
  returning id into v_device_id;

  insert into public.biometric_enrollments(organization_id,employee_id,device_id,device_user_id,pin,card_number,fingerprint_templates,has_face,has_card,status,last_synced_at)
  values
    (p_organization_id,v_employee_1,v_device_id,'1001','1001','90000001',2,true,true,'synced',now()-interval '1 day'),
    (p_organization_id,v_employee_2,v_device_id,'1002','1002','90000002',1,false,true,'synced',now()-interval '1 day'),
    (p_organization_id,v_employee_3,v_device_id,'1003','1003',null,1,false,false,'synced',now()-interval '1 day')
  on conflict(organization_id,employee_id,device_id) do update set device_user_id=excluded.device_user_id,pin=excluded.pin,card_number=excluded.card_number,fingerprint_templates=excluded.fingerprint_templates,has_face=excluded.has_face,has_card=excluded.has_card,status=excluded.status,last_synced_at=excluded.last_synced_at,error_message=null,updated_at=now();

  for v_day in select generate_series(current_date-13,current_date,'1 day')::date loop
    if extract(isodow from v_day) between 1 and 5 then
      insert into public.attendance_records(organization_id,employee_id,work_date,shift_id,clock_in,clock_out,work_minutes,overtime_minutes,late_minutes,early_leave_minutes,status,location,device_id,source)
      values(
        p_organization_id,
        v_employee_1,
        v_day,
        v_regular_shift,
        (v_day + time '07:55') at time zone v_time_zone,
        (v_day + time '17:10') at time zone v_time_zone,
        495,
        0,
        0,
        0,
        'present',
        'Main Entrance',
        v_device_id,
        'system'
      )
      on conflict(organization_id,employee_id,work_date) do nothing;
      if found then v_inserted_attendance := v_inserted_attendance + 1; end if;

      insert into public.attendance_records(organization_id,employee_id,work_date,shift_id,clock_in,clock_out,work_minutes,overtime_minutes,late_minutes,early_leave_minutes,status,location,device_id,source)
      values(
        p_organization_id,
        v_employee_2,
        v_day,
        v_regular_shift,
        (v_day + case when v_day=current_date-2 then time '08:25' else time '08:04' end) at time zone v_time_zone,
        (v_day + case when v_day=current_date-3 then time '16:35' else time '17:35' end) at time zone v_time_zone,
        480,
        case when v_day=current_date-1 then 5 else 0 end,
        case when v_day=current_date-2 then 15 else 0 end,
        case when v_day=current_date-3 then 15 else 0 end,
        case when v_day=current_date-2 then 'late'::public.attendance_status else 'present'::public.attendance_status end,
        'Main Entrance',
        v_device_id,
        'system'
      )
      on conflict(organization_id,employee_id,work_date) do nothing;
      if found then v_inserted_attendance := v_inserted_attendance + 1; end if;

      insert into public.attendance_records(organization_id,employee_id,work_date,shift_id,clock_in,clock_out,work_minutes,overtime_minutes,late_minutes,early_leave_minutes,status,location,device_id,source)
      values(
        p_organization_id,
        v_employee_4,
        v_day,
        v_regular_shift,
        case when v_day=current_date-4 then null else (v_day + time '08:08') at time zone v_time_zone end,
        case when v_day=current_date-4 then null else (v_day + time '17:03') at time zone v_time_zone end,
        case when v_day=current_date-4 then 0 else 475 end,
        0,
        0,
        0,
        case when v_day=current_date-4 then 'absent'::public.attendance_status else 'present'::public.attendance_status end,
        'Main Entrance',
        v_device_id,
        'system'
      )
      on conflict(organization_id,employee_id,work_date) do nothing;
      if found then v_inserted_attendance := v_inserted_attendance + 1; end if;
    end if;
  end loop;

  insert into public.holidays(organization_id,holiday_date,name,is_paid)
  values(p_organization_id,make_date(extract(year from current_date)::integer,1,1),'New Year',true)
  on conflict(organization_id,holiday_date) do update set name=excluded.name,is_paid=excluded.is_paid,updated_at=now();

  if not exists(select 1 from public.leave_requests where organization_id=p_organization_id and employee_id=v_employee_3 and reason='Demonstration annual leave') then
    insert into public.leave_requests(organization_id,request_number,employee_id,leave_type,start_date,end_date,total_days,reason,status,approved_by,approved_at)
    values(p_organization_id,'',v_employee_3,'leave',current_date+7,current_date+8,2,'Demonstration annual leave','approved',auth.uid(),now());
  end if;

  insert into public.financial_adjustments(organization_id,employee_id,adjustment_type,amount,effective_date,description,reference_no)
  select p_organization_id,v_employee_2,'bonus',250000,current_date,'Demonstration performance bonus','DEMO-BONUS-001'
  where not exists(select 1 from public.financial_adjustments where organization_id=p_organization_id and reference_no='DEMO-BONUS-001');

  insert into public.integrations(organization_id,provider,name,is_enabled,configuration)
  values(p_organization_id,'deli','Deli E+',false,jsonb_build_object('attendance_auto_sync',false,'attendance_sync_interval_minutes',15,'attendance_next_id',0,'attendance_initialized',false))
  on conflict(organization_id,provider,name) do update set configuration=public.integrations.configuration||excluded.configuration,updated_at=now();

  insert into public.system_notifications(organization_id,notification_type,title_key,message_key,params,severity)
  select p_organization_id,'seed','dashboard.systemNotifications','notification.saved',jsonb_build_object('module','demo_seed'),'success'
  where not exists(select 1 from public.system_notifications where organization_id=p_organization_id and notification_type='seed');

  perform public.log_organization_activity(p_organization_id,'setting','seed_demo_data','organizations',p_organization_id::text,jsonb_build_object('attendance_rows',v_inserted_attendance));

  return jsonb_build_object(
    'organization_id',p_organization_id,
    'departments',3,
    'positions',2,
    'shifts',2,
    'employees',4,
    'devices',1,
    'attendance_rows_inserted',v_inserted_attendance
  );
end $$;

create or replace function public.seed_demo_data_for_current_user() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.organization_members
  where user_id=auth.uid() and status='active'
  order by created_at
  limit 1;
  if v_organization_id is null then
    raise exception 'No active organization membership found' using errcode='P0002';
  end if;
  return public.seed_demo_data(v_organization_id);
end $$;

revoke all on function public.seed_demo_data(uuid) from public,anon,authenticated;
revoke all on function public.seed_demo_data_for_current_user() from public,anon,authenticated;
grant execute on function public.seed_demo_data(uuid) to authenticated,service_role;
grant execute on function public.seed_demo_data_for_current_user() to authenticated;

commit;

-- ============================================================================
-- SOURCE: sql/002_scheduler.sql
-- ============================================================================
-- AttendFlow scheduled maintenance.
-- Run after 000_full_schema.sql and after deploying the scheduled-maintenance Edge Function.
-- Configure once with public.configure_attendflow_scheduler(project_url, cron_secret).

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create or replace function public.upsert_vault_secret(
  p_name text,
  p_secret text,
  p_description text
) returns uuid
language plpgsql security definer
set search_path=public,vault
as $$
declare v_id uuid;
begin
  if nullif(trim(p_name),'') is null or nullif(p_secret,'') is null then
    raise exception 'Secret name and value are required' using errcode='22023';
  end if;
  select id into v_id from vault.secrets where name=p_name limit 1;
  if v_id is null then
    select vault.create_secret(p_secret,p_name,p_description) into v_id;
  else
    perform vault.update_secret(v_id,p_secret,p_name,p_description);
  end if;
  return v_id;
end $$;

create or replace function public.invoke_attendflow_maintenance() returns bigint
language plpgsql security definer
set search_path=public,vault,net
as $$
declare
  v_project_url text;
  v_cron_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name='attendflow_project_url'
  order by updated_at desc
  limit 1;

  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets
  where name='attendflow_cron_secret'
  order by updated_at desc
  limit 1;

  if nullif(v_project_url,'') is null or nullif(v_cron_secret,'') is null then
    raise exception 'Scheduler Vault secrets are not configured' using errcode='P0001';
  end if;

  select net.http_post(
    url := rtrim(v_project_url,'/') || '/functions/v1/scheduled-maintenance',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret',v_cron_secret,
      'x-correlation-id',gen_random_uuid()::text
    ),
    body := jsonb_build_object(
      'source','supabase_cron',
      'invoked_at',now()
    ),
    timeout_milliseconds := 10000
  ) into v_request_id;

  return v_request_id;
end $$;

create or replace function public.disable_attendflow_scheduler() returns integer
language plpgsql security definer
set search_path=public,cron
as $$
declare v_job record; v_count integer := 0;
begin
  for v_job in select jobid from cron.job where jobname='attendflow-scheduled-maintenance' loop
    perform cron.unschedule(v_job.jobid);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.configure_attendflow_scheduler(
  p_project_url text,
  p_cron_secret text,
  p_schedule text default '*/5 * * * *'
) returns bigint
language plpgsql security definer
set search_path=public,cron,vault
as $$
declare v_job_id bigint;
begin
  if p_project_url !~ '^https://[a-z0-9-]+\\.supabase\\.co/?$' then
    raise exception 'Project URL must use the hosted Supabase HTTPS URL' using errcode='22023';
  end if;
  if char_length(p_cron_secret) < 32 then
    raise exception 'Cron secret must contain at least 32 characters' using errcode='22023';
  end if;
  if nullif(trim(p_schedule),'') is null or char_length(p_schedule) > 100 then
    raise exception 'A valid cron schedule is required' using errcode='22023';
  end if;

  perform public.upsert_vault_secret('attendflow_project_url',rtrim(p_project_url,'/'),'AttendFlow scheduled-maintenance project URL');
  perform public.upsert_vault_secret('attendflow_cron_secret',p_cron_secret,'AttendFlow scheduled-maintenance shared secret');
  perform public.disable_attendflow_scheduler();

  select cron.schedule(
    'attendflow-scheduled-maintenance',
    p_schedule,
    'select public.invoke_attendflow_maintenance();'
  ) into v_job_id;
  return v_job_id;
end $$;

revoke all on function public.upsert_vault_secret(text,text,text) from public,anon,authenticated;
revoke all on function public.invoke_attendflow_maintenance() from public,anon,authenticated;
revoke all on function public.disable_attendflow_scheduler() from public,anon,authenticated;
revoke all on function public.configure_attendflow_scheduler(text,text,text) from public,anon,authenticated;
grant execute on function public.upsert_vault_secret(text,text,text) to service_role;
grant execute on function public.invoke_attendflow_maintenance() to service_role;
grant execute on function public.disable_attendflow_scheduler() to service_role;
grant execute on function public.configure_attendflow_scheduler(text,text,text) to service_role;

commit;

