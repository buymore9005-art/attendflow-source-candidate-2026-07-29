# AttendFlow API Reference

## 1. Authentication model

Frontend menggunakan Supabase JS. Request tabel/RPC membawa JWT user dan publishable key secara otomatis. Edge Function yang dipanggil user membutuhkan:

```http
Authorization: Bearer USER_ACCESS_TOKEN
apikey: SUPABASE_PUBLISHABLE_KEY
Content-Type: application/json
x-correlation-id: UUID
```

Permission diperiksa dua kali: `requirePermission` pada Edge Function dan RLS/RPC `has_permission` pada database. Endpoint perangkat/vendor memakai mekanisme berbeda yang dijelaskan per endpoint.

## 2. Response error Edge Function

```json
{
  "error": "validation_error",
  "message": "organization_id is required.",
  "correlation_id": "e97f2a55-946c-42ad-9d8f-9eef128cbeca"
}
```

| HTTP | Arti |
|---:|---|
| 400 | JSON/field/action invalid |
| 401 | JWT, device token, webhook signature, atau cron secret invalid |
| 403 | Permission ditolak |
| 404 | Entity/route tidak ditemukan |
| 409 | State/credential/data eligible tidak tersedia |
| 413 | Batch/payload terlalu besar |
| 429 | Rate limit |
| 500 | Error internal; gunakan correlation ID pada logs |

## 3. Database RPC

### `create_organization`

```text
create_organization(p_name text, p_code text) → uuid
Permission: authenticated user
```

Membuat organisasi, Admin membership, settings, default roles, General department, Staff position, dan Regular shift.

### `register_employee`

```text
register_employee(p_organization_id uuid, p_payload jsonb) → jsonb
Permission: employees.create
```

Payload memakai kolom employee; nomor employee server-side, upload path sudah dibuat frontend. RPC memvalidasi permission dan organization relation.

### `next_number`

```text
next_number(p_organization_id, p_sequence_key, p_prefix, p_period_key) → text
```

Dipakai trigger employee, payroll run, payslip, dan leave request. Lock row sequence mencegah nomor ganda.

### `log_client_activity`

```text
log_client_activity(p_event_type, p_action, p_entity_type, p_entity_id, p_metadata) → void
```

Untuk login/logout dan event client yang tidak memiliki row trigger.

### `log_organization_activity`

```text
log_organization_activity(p_organization_id, p_event_type, p_action, p_entity_type, p_entity_id, p_metadata) → void
```

Memerlukan membership organisasi; digunakan ekspor, print, bulk action, dan aktivitas UI.

### `recalculate_attendance_record`

```text
recalculate_attendance_record(
  p_attendance_id uuid default null,
  p_organization_id uuid default null,
  p_employee_id uuid default null,
  p_work_date date default null
) → uuid
Permission: attendance.update; service-role bypass
```

Menghitung shift, work minutes, late, early leave, overtime, dan status. Record locked tidak diubah.

### `generate_daily_absences`

```text
generate_daily_absences(p_organization_id uuid, p_work_date date) → integer
Permission: attendance.create; service-role bypass
```

Membuat record holiday/leave/sick/permit/off/absent idempotent untuk karyawan aktif.

### `decide_leave_request`

```text
decide_leave_request(p_request_id uuid, p_decision text, p_rejection_reason text default null) → void
Permission: leave.approve
```

Decision `approve` atau `reject`. Approval menulis attendance status pada rentang tanggal.

### `generate_payroll_run`

```text
generate_payroll_run(
  p_organization_id uuid,
  p_period_start date,
  p_period_end date,
  p_frequency payroll_base_type,
  p_notes text default null
) → uuid
Permission: payroll.create
```

Menghasilkan run/item dan men-settle adjustment. Finalized run ditolak.

### `transition_payroll_run`

```text
transition_payroll_run(p_run_id uuid, p_action text) → void
```

Action `submit`, `approve`, `reject`, `finalize`; permission approval/finalization diperiksa sesuai transition.

### `set_organization_secret`

```text
set_organization_secret(p_organization_id uuid, p_secret_name text, p_secret_value text) → void
Permission: settings.update
```

Write-only secret ke Vault. `get_organization_secret` hanya diberikan ke service-role.

### `rotate_device_token`

```text
rotate_device_token(p_device_id uuid) → text
Permission: devices.update
```

Mengembalikan plaintext sekali; database menyimpan hash.

### Device service RPC

| Function | Caller | Hasil |
|---|---|---|
| `verify_device_token(serial, token)` | service-role | device UUID/null |
| `mark_device_seen(device, metadata)` | service-role | update online/last seen |
| `ingest_adms_logs(device, rows, ip, ua)` | service-role | jumlah insert baru |
| `claim_device_command(device)` | service-role | command queued berikutnya |
| `complete_device_command(id, succeeded, result, error)` | service-role | complete/requeue/fail |
| `complete_device_command_by_no(device, command_no, ...)` | service-role | complete berdasarkan nomor |
| `check_rate_limit(bucket, limit, seconds)` | service-role | boolean |

### `get_dashboard_summary`

```text
get_dashboard_summary(p_organization_id uuid, p_date date) → jsonb
Permission: dashboard.read
```

Mengembalikan `kpis`, series ISO daily/monthly, attendance status, recent activity, dan notification translation keys.

## 4. Edge Function `device-command`

```http
POST /functions/v1/device-command
Authorization: Bearer USER_ACCESS_TOKEN
```

### Rotate token

```json
{
  "organization_id": "UUID_ORGANISASI",
  "action": "rotate_device_token",
  "device_id": "UUID_MESIN"
}
```

Response:

```json
{
  "tokens": [
    {
      "device_id": "UUID_MESIN",
      "name": "Gate A",
      "serial_number": "SN123",
      "token": "PLAINTEXT_SEKALI_TAMPIL"
    }
  ],
  "correlation_id": "UUID"
}
```

### Queue action

```json
{
  "organization_id": "UUID_ORGANISASI",
  "device_id": "UUID_MESIN",
  "action": "pull_logs",
  "from": "2026-07-01T00:00:00.000Z",
  "to": "2026-07-31T23:59:59.999Z"
}
```

Action: `test_connection`, `sync`, `pull_logs`, `push_users`, `push_cards`, `push_fingers`, `push_faces`, `sync_biometrics`. `employee_id` opsional untuk mempersempit push. Response HTTP 202 berisi `queued`, `device_id`, dan correlation ID.

## 5. Edge Function `adms`

Authentication:

```text
SN query parameter + token query parameter
atau x-device-token header
```

### Options/heartbeat

```http
GET /functions/v1/adms/iclock/cdata?SN=SERIAL&token=DEVICE_TOKEN
```

Response text berisi GET OPTION FROM, interval, TransFlag, Realtime, dan Encrypt.

### ATTLOG

```http
POST /functions/v1/adms/iclock/cdata?SN=SERIAL&token=DEVICE_TOKEN&table=ATTLOG
Content-Type: text/plain

1001\t2026-07-28 08:01:02\t0\t1\t\t
```

Response: `OK: N`.

### Operation log

```http
POST /functions/v1/adms/iclock/cdata?SN=SERIAL&token=DEVICE_TOKEN&table=OPERLOG
```

Menerima key-value USER/FINGERTMP/FACE yang dipetakan ke employee PIN dan disimpan ke enrollment/Storage.

### Claim command

```http
GET /functions/v1/adms/iclock/getrequest?SN=SERIAL&token=DEVICE_TOKEN
```

Response `OK` bila kosong atau `C:<number>:<vendor command>`.

### Command result

```http
POST /functions/v1/adms/iclock/devicecmd?SN=SERIAL&token=DEVICE_TOKEN

ID=123&Return=0
```

## 6. Edge Function `deli-sync`

```http
POST /functions/v1/deli-sync
Authorization: Bearer USER_ACCESS_TOKEN
```

Payload:

```json
{
  "organization_id": "UUID_ORGANISASI",
  "action": "sync_attendance"
}
```

Action: `validate_credentials`, `sync_employees`, `sync_devices`, `sync_attendance`, `sync_payroll`, `retry_job` (`job_id` wajib). Response HTTP 202:

```json
{
  "job_id": "UUID_JOB",
  "status": "succeeded",
  "result": {},
  "correlation_id": "UUID"
}
```


Sinkronisasi menggunakan bounded continuation jobs: departemen/karyawan 50 row per job, perangkat 100 row per job, attendance maksimum empat halaman atau 2.000 record per job, dan payroll 20 run finalized per job. Satu job dapat selesai dengan `continuation_job_id`; scheduler memproses maksimal tiga child invocation Deli secara paralel. Attendance page dimasukkan melalui RPC `ingest_deli_attendance`, maksimum 500 record per RPC, dan retry job diklaim atomik melalui `claim_integration_job`. Data attendance sebelum initialization Deli tidak tersedia melalui incremental API.

Outbound payroll webhook bersifat opsional. Selain `payroll_webhook_url` pada konfigurasi integration, exact origin harus berada pada Function secret `DELI_PAYROLL_WEBHOOK_ALLOWED_ORIGINS`.

### Deli webhook

```http
POST /functions/v1/deli-sync/webhook/UUID_ORGANISASI
App-Key: APP_KEY
App-Timestamp: 13_DIGIT_MILLISECONDS
App-Sig: LOWERCASE_MD5_SIGNATURE
```

Signature input adalah exact URL pathname + timestamp + app key + app secret. Timestamp window 10 menit. Event dedupe memakai `organization_id + provider + external_event_id`.

## 7. Edge Function `admin-users`

### Invite

```json
{
  "organization_id": "UUID_ORGANISASI",
  "action": "invite",
  "email": "pegawai@perusahaan.co.id",
  "full_name": "Nama Pegawai",
  "role": "viewer",
  "department_id": "UUID_DEPARTEMEN"
}
```

Permission `users.create`. Membuat Supabase Auth invitation bila user belum ada, upsert profile, dan upsert membership.

### Bulk invite

```json
{
  "organization_id": "UUID_ORGANISASI",
  "action": "bulk_invite",
  "rows": [
    { "email": "a@perusahaan.co.id", "full_name": "A", "role": "hr" }
  ]
}
```

Maksimum 200 row. Response 201 bila semua sukses atau 207 bila sebagian gagal, dengan arrays `successes` dan `failures`.

## 8. Edge Function `backup-restore`

### Backup

```json
{
  "organization_id": "UUID_ORGANISASI",
  "action": "backup"
}
```

Response 201 berisi job, path `.afbackup`, checksum, record count, dan created time.

### Restore

```json
{
  "organization_id": "UUID_ORGANISASI",
  "action": "restore",
  "confirmation": "RESTORE UUID_ORGANISASI",
  "storage_path": "UUID_ORGANISASI/FILE.afbackup"
}
```

`storage_path` opsional; bila kosong menggunakan backup sukses terbaru. Mode merge. Audit rows hanya ada di archive dan tidak ditulis kembali, sehingga audit live tidak dapat dipalsukan melalui restore.

## 9. Edge Function `scheduled-maintenance`

```http
POST /functions/v1/scheduled-maintenance
x-cron-secret: CRON_SECRET
```

Response:

```json
{
  "ok": true,
  "offline_devices": 0,
  "reset_commands": 0,
  "reset_jobs": 0,
  "generated_absence_rows": 0,
  "scheduled_deli_syncs": 0,
  "retried_jobs": 0,
  "correlation_id": "UUID"
}
```

## 10. PostgREST table access

UI menggunakan Supabase SDK, bukan custom REST wrapper. Semua query harus menyertakan `organization_id`; RLS tetap authoritative. Generic entity service hanya menerima table config dari source code, bukan nama tabel dari input user. Search dinormalisasi, filters memakai SDK methods, dan pagination memakai `.range()`.

## 11. Realtime channels

Client subscribe pada organization-scoped filter untuk attendance, devices, biometrics, commands/jobs, payroll, dan notifications. Event hanya menginvalidasi TanStack Query; data baru tetap dibaca melalui RLS.

## 12. Idempotency dan correlation

- ADMS: SHA-256-derived stable event key.
- Deli attendance: `deli:<record_id>`.
- Payroll webhook: `Idempotency-Key` per org/export timestamp.
- Mutasi browser tidak diantrikan saat offline; request harus berhasil diterima Supabase. Idempotensi untuk integrasi dan payroll ditangani server-side.
- Edge response/log/audit: UUID correlation ID.
