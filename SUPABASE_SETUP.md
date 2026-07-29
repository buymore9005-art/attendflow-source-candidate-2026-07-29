# Setup Supabase

## 1. Buat project

1. Buat project baru di Supabase.
2. Simpan database password pada password manager.
3. Catat Project URL, publishable/anon key, service-role key, dan project reference.
4. Pilih region yang dekat dengan pengguna perusahaan.

## 2. Import schema

Buka SQL Editor dan jalankan file berurutan:

1. `sql/000_full_schema.sql`
2. `sql/001_seed.sql` bila memerlukan fungsi data demonstrasi
3. `sql/002_scheduler.sql` setelah Edge Function `scheduled-maintenance` sudah dideploy

Setiap file dibungkus transaction. Bila eksekusi gagal, transaction dibatalkan sehingga tidak meninggalkan schema setengah jadi.

`sql/000_full_schema.sql` membuat:

- extension UUID/crypto dan seluruh enum;
- 33 tabel tenant-aware;
- foreign key, unique/partial index, check constraint;
- view directory/audit/monthly attendance;
- function organisasi, nomor otomatis, attendance, leave, payroll, device, secret, dashboard;
- trigger updated-at, audit, nomor, raw log processing, dan payroll lock;
- RLS serta permission policy;
- bucket Storage privat dan policy;
- Realtime publication;
- grant yang diperlukan authenticated/service-role.

## 3. Verifikasi schema

Jalankan:

```sql
select count(*) as public_tables
from information_schema.tables
where table_schema='public' and table_type='BASE TABLE';

select tablename, rowsecurity
from pg_tables
where schemaname='public'
order by tablename;

select id, public, file_size_limit
from storage.buckets
where id in ('employee-documents','organization-assets','integration-payloads','biometrics','backups')
order by id;

select schemaname, tablename
from pg_publication_tables
where pubname='supabase_realtime'
order by tablename;
```

Semua tabel bisnis yang dapat diakses client harus menunjukkan `rowsecurity = true`.

## 4. Storage

SQL membuat bucket berikut otomatis; tidak perlu membuat manual:

| Bucket | Maksimum file | Isi |
|---|---:|---|
| `employee-documents` | 8 MiB | Foto, KTP, KK, PDF |
| `organization-assets` | 8 MiB | Logo perusahaan |
| `integration-payloads` | 50 MiB | Payload Deli/export integrasi |
| `biometrics` | 2 MiB | Template fingerprint/face |
| `backups` | 50 MiB | Backup organisasi terenkripsi |

Path wajib dimulai dengan UUID organisasi. Policy memeriksa UUID segmen pertama dan permission user. Semua bucket privat; UI menggunakan signed URL berdurasi pendek.

## 5. Authentication

### Konfigurasi disarankan

- Email provider aktif.
- Public signup nonaktif untuk aplikasi perusahaan.
- Email confirmation aktif sesuai kebutuhan.
- JWT expiry default 3600 detik dapat dipertahankan.
- Aktifkan MFA di Supabase bila kebijakan perusahaan mewajibkan; flag organisasi di aplikasi digunakan sebagai kebijakan administratif dan tidak menggantikan konfigurasi Auth provider.

### User pertama

1. Authentication → Users → Add user.
2. Buat email/password dan tandai confirmed.
3. Login ke AttendFlow.
4. Onboarding memanggil `create_organization`, membuat Admin membership, settings, role permission, dan master data awal.

### Redirect URL

Development:

```text
http://localhost:5173/**
```

Production:

```text
https://DOMAIN_VERCEL/**
```

Set Site URL ke domain produksi utama.

## 6. Deploy Edge Functions

Login dan link project:

```bash
supabase login
read -rp "Supabase project reference: " SUPABASE_PROJECT_REF
supabase link --project-ref "$SUPABASE_PROJECT_REF"
```

Siapkan secrets lokal:

```bash
cp supabase/functions/.env.example supabase/functions/.env
```

Isi nilai aktual. `BACKUP_ENCRYPTION_KEY` harus 32 byte base64; `CRON_SECRET` minimal 32 karakter. `DELI_PAYROLL_WEBHOOK_ALLOWED_ORIGINS` boleh kosong bila outbound payroll webhook tidak digunakan; bila digunakan, isi exact HTTPS origin seperti `https://adapter.example.com` (tanpa path), dipisahkan koma.

```bash
openssl rand -base64 32
openssl rand -hex 32
supabase secrets set --env-file supabase/functions/.env
```

Deploy:

```bash
supabase functions deploy adms --no-verify-jwt
supabase functions deploy device-command
supabase functions deploy deli-sync --no-verify-jwt
supabase functions deploy admin-users
supabase functions deploy backup-restore
supabase functions deploy scheduled-maintenance --no-verify-jwt
```

Alasan endpoint tanpa JWT platform:

- `adms`: mesin menggunakan token perangkat ter-hash, bukan Supabase user JWT.
- `deli-sync`: route UI tetap memverifikasi JWT/permission di kode; route webhook memverifikasi signature Deli; scheduler menggunakan `CRON_SECRET`.
- `scheduled-maintenance`: hanya menerima `x-cron-secret` yang cocok secara constant-time.

## 7. Scheduler

Setelah menjalankan `sql/002_scheduler.sql`, pastikan `CRON_SECRET` pada Function secrets sama dengan nilai yang disimpan scheduler.

Di SQL Editor, panggil:

```sql
select public.configure_attendflow_scheduler(
  'https://PROJECT_REF.supabase.co',
  'CRON_SECRET_YANG_SAMA_DENGAN_FUNCTION_SECRET',
  '*/5 * * * *'
);
```

Fungsi menyimpan URL dan secret di Vault, menghapus job lama dengan nama yang sama, lalu membuat job lima menit. Verifikasi:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname='attendflow-scheduled-maintenance';

select *
from net._http_response
order by created desc
limit 10;
```

Untuk mematikan:

```sql
select public.disable_attendflow_scheduler();
```

Scheduled maintenance menangani status mesin offline, lease job basi, pembuatan alpha harian, auto-sync Deli, dan retry job. Orchestrator hanya memilih `deli_*`, mengklaim retry secara atomik di database, membatasi satu pekerjaan per organisasi dalam satu batch, dan menjalankan maksimal tiga child invocation paralel.

## 8. Organization secrets dan SMTP

UI Settings memanggil `set_organization_secret` untuk credential integrasi organisasi. Nilai terenkripsi disimpan melalui Supabase Vault dan metadata non-rahasia disimpan di `organization_secrets`. Hanya service-role Function yang dapat membaca kembali nilai.

Secret organisasi yang dipakai aplikasi:

- `deli_app_key`
- `deli_app_secret`
- `deli_webhook_secret`
- `adms_shared_secret`

Nilai secret tidak dikembalikan ke browser dan tidak masuk audit payload.

SMTP untuk email Supabase Auth **bukan** konfigurasi per organisasi dan tidak dibaca dari tabel aplikasi. Konfigurasikan pada tingkat project melalui **Supabase Dashboard → Authentication → Emails → SMTP Settings** atau melalui Supabase Management API dengan access token administrator project. Jangan menyimpan Supabase access token tersebut di frontend, tabel tenant, atau environment Vercel yang terekspos ke browser.

SMTP bawaan Supabase hanya cocok untuk pengembangan: penerima dibatasi pada alamat yang diotorisasi dan batas email sangat rendah. Untuk penggunaan perusahaan, gunakan SMTP milik perusahaan atau provider yang mendukung SMTP. Pastikan SPF, DKIM, dan DMARC dikonfigurasi pada domain pengirim.

## 9. Realtime

Schema menambahkan tabel operasional ke publication `supabase_realtime`. UI membuka channel organization-scoped dan menginvalidasi query terkait. Bila perubahan tidak realtime:

```sql
select * from pg_publication_tables where pubname='supabase_realtime';
```

Periksa juga koneksi websocket browser dan quota project.

## 10. Seed demonstrasi

`sql/001_seed.sql` membuat fungsi, bukan credential atau user. Setelah organisasi ada:

```sql
select public.seed_demo_data('UUID_ORGANISASI');
```

Data demo meliputi departemen, posisi, shift, empat karyawan, profile payroll, mesin offline contoh, biometrik metadata, absensi 14 hari, adjustment, integration disabled, dan notifikasi. Jangan menjalankan seed pada tenant produksi yang sudah berisi data nyata.

## 11. Backup awal

`sql/initial_backup.sql` adalah gabungan schema, seed function, dan scheduler untuk bootstrap project baru. Backup data runtime dibuat melalui menu Settings dan disimpan terenkripsi di bucket `backups`.

## 12. Security checklist Supabase

- Jangan expose service-role key ke Vercel frontend.
- Gunakan user terpisah untuk staging dan production.
- Audit setiap perubahan RLS dengan user non-admin.
- Rotasi device token setelah kebocoran atau pergantian teknisi.
- Rotasi Deli secret melalui vendor dan Settings.
- Pantau Auth logs, Edge Function logs, database logs, dan `audit_logs`.
- Terapkan retensi raw attendance/integration payload sesuai kebijakan perusahaan.
