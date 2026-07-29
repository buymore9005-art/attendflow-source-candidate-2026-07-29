# Database ERD

Semua tabel bisnis utama memakai `organization_id` untuk isolasi tenant. Foreign key komposit organisasi digunakan pada relasi yang berisiko lintas tenant. Kolom audit waktu (`created_at`, `updated_at`) dipersingkat pada diagram.

## Organisasi dan akses

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : owns
  AUTH_USERS ||--o{ ORGANIZATION_MEMBERS : joins
  ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : has
  ORGANIZATIONS ||--o{ ROLE_PERMISSIONS : configures
  ORGANIZATIONS ||--|| ORGANIZATION_SETTINGS : has
  ORGANIZATIONS ||--o{ ORGANIZATION_SECRETS : indexes
  ORGANIZATIONS ||--o{ NUMBER_SEQUENCES : numbers

  ORGANIZATIONS {
    uuid id PK
    text code UK
    text name
    text time_zone
    text locale
    boolean is_active
  }
  PROFILES {
    uuid id PK_FK
    text full_name
    text email
    text phone
    text avatar_path
  }
  ORGANIZATION_MEMBERS {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    app_role role
    member_status status
    uuid department_id FK
    text_array permission_grants
    text_array permission_denials
  }
  ROLE_PERMISSIONS {
    uuid id PK
    uuid organization_id FK
    app_role role
    text_array permissions
  }
  ORGANIZATION_SETTINGS {
    uuid organization_id PK_FK
    jsonb work
    jsonb payroll
    jsonb numbering
    jsonb integrations
    jsonb security
  }
  ORGANIZATION_SECRETS {
    uuid id PK
    uuid organization_id FK
    text secret_name
    uuid vault_secret_id
  }
  NUMBER_SEQUENCES {
    uuid organization_id PK_FK
    text sequence_key PK
    text period_key PK
    bigint current_value
  }
```

## Karyawan dan struktur

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ DEPARTMENTS : has
  ORGANIZATIONS ||--o{ POSITIONS : has
  ORGANIZATIONS ||--o{ SHIFTS : has
  ORGANIZATIONS ||--o{ EMPLOYEES : employs
  DEPARTMENTS ||--o{ DEPARTMENTS : parent
  DEPARTMENTS ||--o{ EMPLOYEES : groups
  POSITIONS ||--o{ EMPLOYEES : assigns
  SHIFTS ||--o{ EMPLOYEES : defaults
  EMPLOYEES ||--o{ SHIFT_ASSIGNMENTS : history
  SHIFTS ||--o{ SHIFT_ASSIGNMENTS : scheduled
  ORGANIZATIONS ||--o{ HOLIDAYS : defines

  DEPARTMENTS {
    uuid id PK
    uuid organization_id FK
    text code
    text name
    uuid parent_id FK
    uuid manager_employee_id FK
    boolean is_active
    timestamptz deleted_at
  }
  POSITIONS {
    uuid id PK
    uuid organization_id FK
    text code
    text name
    int level
    boolean is_active
    timestamptz deleted_at
  }
  SHIFTS {
    uuid id PK
    uuid organization_id FK
    text code
    text name
    shift_type shift_type
    time start_time
    time end_time
    int break_minutes
    int grace_minutes
    int late_tolerance_minutes
    int early_leave_tolerance_minutes
    int overtime_after_minutes
    boolean cross_midnight
  }
  EMPLOYEES {
    uuid id PK
    uuid organization_id FK
    text employee_no
    text nik
    text full_name
    employee_status status
    uuid department_id FK
    uuid position_id FK
    uuid shift_id FK
    date join_date
    text fingerprint_pin
    jsonb external_ids
    boolean is_active
    timestamptz deleted_at
  }
  SHIFT_ASSIGNMENTS {
    uuid id PK
    uuid organization_id FK
    uuid employee_id FK
    uuid shift_id FK
    date effective_from
    date effective_to
  }
  HOLIDAYS {
    uuid id PK
    uuid organization_id FK
    date holiday_date
    text name
    boolean is_paid
  }
```

## Perangkat, biometrik, dan absensi

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ ATTENDANCE_DEVICES : owns
  ATTENDANCE_DEVICES ||--o{ BIOMETRIC_ENROLLMENTS : enrolls
  EMPLOYEES ||--o{ BIOMETRIC_ENROLLMENTS : enrolled
  BIOMETRIC_ENROLLMENTS ||--o{ BIOMETRIC_ASSETS : contains
  EMPLOYEES ||--o{ BIOMETRIC_ASSETS : owns
  ATTENDANCE_DEVICES ||--o{ BIOMETRIC_ASSETS : source
  ATTENDANCE_DEVICES ||--o{ DEVICE_COMMANDS : receives
  ATTENDANCE_DEVICES ||--o{ RAW_ATTENDANCE_LOGS : emits
  EMPLOYEES ||--o{ ATTENDANCE_RECORDS : has
  SHIFTS ||--o{ ATTENDANCE_RECORDS : calculates
  ATTENDANCE_DEVICES ||--o{ ATTENDANCE_RECORDS : source
  EMPLOYEES ||--o{ LEAVE_REQUESTS : requests

  ATTENDANCE_DEVICES {
    uuid id PK
    uuid organization_id FK
    text vendor
    text protocol
    text name
    inet ip_address
    int port
    text serial_number
    device_status status
    timestamptz last_seen_at
    timestamptz last_sync_at
    text token_hash
    boolean auto_sync
  }
  BIOMETRIC_ENROLLMENTS {
    uuid id PK
    uuid organization_id FK
    uuid employee_id FK
    uuid device_id FK
    text device_user_id
    text pin
    text card_number
    int fingerprint_templates
    boolean has_face
    boolean has_card
    sync_status status
  }
  BIOMETRIC_ASSETS {
    uuid id PK
    uuid organization_id FK
    uuid enrollment_id FK
    uuid employee_id FK
    uuid device_id FK
    biometric_type asset_type
    int slot
    text template_format
    text storage_path
    text checksum_sha256
    int byte_size
  }
  DEVICE_COMMANDS {
    uuid id PK
    uuid organization_id FK
    uuid device_id FK
    bigint command_no
    text command_type
    jsonb payload
    job_status status
    int attempts
    int max_attempts
    timestamptz available_at
  }
  RAW_ATTENDANCE_LOGS {
    bigint id PK
    uuid organization_id FK
    uuid device_id FK
    text employee_pin
    timestamptz event_time
    text idempotency_key
    text source
    timestamptz processed_at
  }
  ATTENDANCE_RECORDS {
    uuid id PK
    uuid organization_id FK
    uuid employee_id FK
    date work_date
    uuid shift_id FK
    timestamptz clock_in
    timestamptz clock_out
    int work_minutes
    int overtime_minutes
    int late_minutes
    int early_leave_minutes
    attendance_status status
    uuid device_id FK
    timestamptz locked_at
  }
  LEAVE_REQUESTS {
    uuid id PK
    uuid organization_id FK
    text request_number
    uuid employee_id FK
    leave_type leave_type
    date start_date
    date end_date
    numeric total_days
    approval_status status
    uuid approved_by FK
  }
```

## Payroll

```mermaid
erDiagram
  EMPLOYEES ||--o{ PAYROLL_PROFILES : configured
  ORGANIZATIONS ||--o{ PAYROLL_RUNS : processes
  PAYROLL_RUNS ||--o{ PAYROLL_ITEMS : contains
  EMPLOYEES ||--o{ PAYROLL_ITEMS : receives
  EMPLOYEES ||--o{ FINANCIAL_ADJUSTMENTS : has
  PAYROLL_ITEMS ||--o{ FINANCIAL_ADJUSTMENTS : settles

  PAYROLL_PROFILES {
    uuid id PK
    uuid organization_id FK
    uuid employee_id FK
    payroll_base_type base_type
    numeric daily_salary
    numeric weekly_salary
    numeric monthly_salary
    numeric overtime_hourly_rate
    numeric late_deduction_per_minute
    numeric absence_deduction_per_day
    numeric tax_percent
    numeric bpjs_employee_percent
    date effective_from
    date effective_to
  }
  PAYROLL_RUNS {
    uuid id PK
    uuid organization_id FK
    text run_number
    date period_start
    date period_end
    payroll_base_type frequency
    approval_status status
    numeric total_gross
    numeric total_deductions
    numeric total_net
    uuid approved_by FK
    uuid finalized_by FK
  }
  PAYROLL_ITEMS {
    uuid id PK
    uuid organization_id FK
    uuid payroll_run_id FK
    uuid employee_id FK
    text payslip_number
    numeric base_pay
    numeric overtime_pay
    numeric bonus
    numeric tax
    numeric bpjs
    numeric total_deductions
    numeric net_pay
    jsonb calculation_details
  }
  FINANCIAL_ADJUSTMENTS {
    uuid id PK
    uuid organization_id FK
    uuid employee_id FK
    adjustment_type adjustment_type
    numeric amount
    date effective_date
    uuid settled_payroll_item_id FK
    text reference_no
  }
```

## Integrasi, audit, dan operasi

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ INTEGRATIONS : configures
  INTEGRATIONS ||--o{ INTEGRATION_JOBS : runs
  INTEGRATION_JOBS ||--o{ INTEGRATION_LOGS : logs
  ORGANIZATIONS ||--o{ WEBHOOK_EVENTS : receives
  ORGANIZATIONS ||--o{ AUDIT_LOGS : audits
  ORGANIZATIONS ||--o{ SYSTEM_NOTIFICATIONS : notifies
  ORGANIZATIONS ||--o{ RATE_LIMIT_BUCKETS : limits
  ORGANIZATIONS ||--o{ IDEMPOTENCY_KEYS : deduplicates
  ORGANIZATIONS ||--o{ BACKUP_JOBS : archives

  INTEGRATIONS {
    uuid id PK
    uuid organization_id FK
    text provider
    text name
    boolean is_enabled
    jsonb configuration
    timestamptz last_success_at
    timestamptz last_error_at
  }
  INTEGRATION_JOBS {
    uuid id PK
    uuid organization_id FK
    uuid integration_id FK
    text job_type
    job_direction direction
    job_status status
    int attempts
    int max_attempts
    timestamptz next_attempt_at
    jsonb payload
    jsonb result
    uuid correlation_id
  }
  INTEGRATION_LOGS {
    bigint id PK
    uuid organization_id FK
    uuid integration_job_id FK
    log_level level
    text message
    jsonb details
  }
  WEBHOOK_EVENTS {
    uuid id PK
    uuid organization_id FK
    text provider
    text external_event_id
    text signature
    jsonb headers
    jsonb payload
    job_status status
  }
  AUDIT_LOGS {
    bigint id PK
    uuid organization_id FK
    uuid user_id FK
    text event_type
    text entity_type
    text entity_id
    text action
    jsonb old_data
    jsonb new_data
    inet ip_address
    text user_agent
    uuid correlation_id
  }
  SYSTEM_NOTIFICATIONS {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    text notification_type
    text title_key
    text message_key
    jsonb params
    notification_severity severity
    timestamptz read_at
  }
  RATE_LIMIT_BUCKETS {
    text bucket_key PK
    int hit_count
    timestamptz window_started_at
  }
  IDEMPOTENCY_KEYS {
    text key PK
    uuid organization_id FK
    jsonb response
    timestamptz expires_at
  }
  BACKUP_JOBS {
    uuid id PK
    uuid organization_id FK
    text action
    job_status status
    text storage_path
    text checksum
    bigint record_count
  }
```

## Storage relationship

Object path menggunakan format:

```text
organization_uuid/domain/entity_uuid/file
```

`path_organization_id(name)` membaca segmen pertama dan Storage RLS memanggil `is_org_member`/`has_permission`. Bucket bukan public.

## View

- `organization_member_directory`: membership + profile + department.
- `audit_log_directory`: audit + actor profile.
- `attendance_monthly_summary`: aggregate per employee dan month.

## Invariant penting

- Unique organization code.
- Unique employee number/NIK/email aktif per organisasi sesuai index.
- Unique device serial per organisasi.
- Unique attendance `(organization_id, employee_id, work_date)`.
- Unique payroll run period/frequency per organisasi.
- Unique enrollment employee/device.
- Unique raw log idempotency per device/source.
- Finalized payroll dilindungi trigger.
- Audit data sensitif direduksi.
