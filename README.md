## Status validasi source candidate

Lihat [`docs/VALIDATION_REPORT.md`](docs/VALIDATION_REPORT.md). Static verifier dan core test telah dijalankan, tetapi instalasi dependency/build belum dapat diverifikasi karena registry npm lingkungan validasi mengembalikan HTTP 503. Repository ini tidak boleh diberi label production-ready sebelum seluruh gate pada laporan tersebut lulus di clone bersih dan staging nyata.

# AttendFlow — Attendance & Payroll Management System

AttendFlow adalah aplikasi absensi, biometrik, cuti, payroll, integrasi, audit, dan administrasi perusahaan berbasis **React 19 + Vite + TypeScript + Supabase + Vercel**. Seluruh data bisnis berada di Supabase PostgreSQL/Auth/Storage/Realtime. Repository ini tidak membutuhkan Firebase atau backend bisnis mandiri. Mesin LAN-only tetap memerlukan relay/bridge lokal karena browser dan cloud tidak dapat membuka socket ke jaringan privat.

## Isi repository

- SPA React dengan route lazy-loading, responsive desktop/tablet/mobile, light/dark/system theme, sidebar persisten, command palette, error boundary, toast, dialog konfirmasi, dan aksesibilitas keyboard.
- Bahasa Indonesia, English, dan 简体中文 dengan 400+ key antarmuka serta pergantian realtime.
- Tabel universal: pencarian debounce, filter lanjutan, reset, server sorting, pagination, virtualisasi, impor XLSX, ekspor XLSX/CSV/PDF, print, pilihan tunggal/massal/semua, bulk update/delete, refresh, skeleton, empty state, dan error state.
- Modul dashboard, karyawan, registrasi wizard, departemen, jabatan, shift, mesin, biometrik, absensi, izin/cuti, payroll, pengguna, role, audit, pengaturan, notifikasi, Deli E+, backup/restore.
- Supabase SQL lengkap: 33 tabel, PK/FK/index/constraint, 3 view, trigger, function/RPC, RLS, Storage policy, Realtime publication, seed demo, scheduler, dan audit immutable.
- Supabase Edge Functions untuk ADMS, perintah mesin, Deli E+, administrasi pengguna, backup/restore, dan scheduled maintenance.
- Cache baca TanStack Query dengan persistensi localStorage opsional, realtime invalidation, code splitting, dan optimasi ekspor. Mutasi tidak diantrikan ketika offline agar operasi payroll, absensi, dan administrasi tidak tampak berhasil sebelum diterima Supabase.

## Arsitektur

```text
Browser / React SPA on Vercel
        │
        ├── Supabase Auth (session/JWT)
        ├── PostgREST + RPC ── PostgreSQL + RLS + audit trigger
        ├── Storage ────────── dokumen, logo, biometrik, payload, backup
        ├── Realtime ───────── absensi, mesin, job, payroll, notifikasi
        └── Edge Functions
              ├── ADMS cloud-push endpoint
              ├── device command queue
              ├── Deli E+ signed API/webhook
              ├── user invitation
              ├── encrypted backup/restore
              └── scheduled maintenance via Supabase Cron
```

Rahasia vendor dan service-role tidak pernah dimasukkan ke bundle Vite. Nilai tersebut disimpan sebagai Supabase Function secrets atau Vault-backed organization secrets.

## Persyaratan

- Node.js 22 LTS atau Node.js minimal 20.19
- npm 10+
- Akun GitHub
- Project Supabase Free untuk development/pilot; produksi kritis memerlukan evaluasi quota, pause, backup, dan SLA
- Vercel Hobby hanya untuk personal non-komersial; penggunaan perusahaan memerlukan plan/hosting yang ketentuannya sesuai
- Supabase CLI hanya diperlukan untuk deploy Edge Functions; instalasi lokal SPA tetap dapat dilakukan tanpa CLI

## Mulai cepat

1. Buat project Supabase.
2. Jalankan `sql/000_full_schema.sql` di SQL Editor.
3. Opsional: jalankan `sql/001_seed.sql`, login sebagai admin, lalu panggil `select public.seed_demo_data_for_current_user();` untuk data demonstrasi.
4. Deploy seluruh folder `supabase/functions` dan isi Function secrets.
5. Jalankan `sql/002_scheduler.sql`, lalu konfigurasi scheduler dengan URL project dan `CRON_SECRET` yang sama.
6. Salin `.env.example` menjadi `.env`, isi URL dan publishable key Supabase.
7. Jalankan aplikasi lokal atau push ke GitHub dan import ke Vercel.

Instruksi terperinci tersedia di [INSTALL.md](INSTALL.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md), dan [VERCEL_SETUP.md](VERCEL_SETUP.md).

## Environment frontend

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_APP_URL=http://localhost:5173
VITE_DEFAULT_LOCALE=id
VITE_DEFAULT_TIME_ZONE=Asia/Jakarta
VITE_ENABLE_OFFLINE_CACHE=true
```

Hanya publishable/anon key yang boleh ada di frontend. Jangan pernah menambahkan service-role key ke environment Vercel yang diawali `VITE_`.

## Perintah

```bash
npm install
npm run dev
npm run test:core
npm run verify:static
npm run typecheck
npm run lint
npm run test
npm run build
```

`npm run check` menjalankan rangkaian pemeriksaan proyek penuh. `npm run test:core` tidak memerlukan browser dan menguji kalkulasi absensi/payroll, i18n, CSV safety, permission, retry, parser ADMS, serta signature Deli.

## Akun pertama

Hosted Supabase sebaiknya menonaktifkan public signup. Buat satu user pertama melalui **Authentication → Users → Add user**, tandai email sebagai confirmed, lalu login. Halaman onboarding membuat organisasi dan menjadikan akun tersebut sebagai Admin. Pengguna berikutnya diundang dari menu **Pengguna** melalui Edge Function `admin-users`.

## Role bawaan

| Role | Akses awal |
|---|---|
| Admin | Semua modul dan permission |
| HR | Karyawan, organisasi, absensi, shift, cuti, baca payroll/audit/settings |
| Supervisor | Baca karyawan/mesin, update/approval absensi, baca shift, approval cuti |
| Finance | Baca karyawan/absensi/cuti, seluruh payroll, baca settings |
| Manager | Dashboard, read lintas modul, approval absensi/cuti/payroll, audit |
| Leader | Baca karyawan/shift/cuti, update absensi, approval cuti |
| Viewer | Dashboard serta akses baca dasar |

Setiap membership dapat memiliki `permission_grants` dan `permission_denials`; denial mengalahkan grant. RLS memeriksa permission yang sama di sisi database.

## Struktur utama

```text
src/
  app/ components/ pages/ layout/ hooks/ context/ services/
  utils/ types/ assets/ middleware/ stores/ i18n/ lib/
sql/
  000_full_schema.sql
  001_seed.sql
  002_scheduler.sql
  initial_backup.sql
supabase/
  config.toml
  functions/
docs/
  API.md ERD.md TESTING.md TEST_CHECKLIST.md TROUBLESHOOTING.md
```

Daftar file lengkap ada di `docs/PROJECT_STRUCTURE.md`.

## Integrasi mesin

Endpoint ADMS disediakan melalui Supabase Edge Function, bukan koneksi socket dari browser. Mesin yang mendukung cloud-push dapat mengarah ke:

```text
https://PROJECT_REF.supabase.co/functions/v1/adms
```

Route yang diterima: `/iclock/cdata`, `/iclock/getrequest`, `/iclock/devicecmd`, `/iclock/registry`, dan `/health`. Setiap mesin memakai token unik yang disimpan sebagai hash. Dialek command firmware ZKTeco/Solution/ADMS berbeda antar model; lakukan acceptance test pada model dan firmware perusahaan sebelum produksi.

Untuk **Solution X105**, dokumentasi resmi yang ditemukan menjamin TCP/IP/USB dan mencantumkan model tersebut sebagai kompatibel dengan **ZKEM SDK**, tetapi tidak menyatakan ADMS/PUSH sebagai fitur standar. Karena itu, AttendFlow tidak mengklaim semua X105 dapat diarahkan langsung ke Supabase. Periksa firmware unit aktual:

- bila tersedia ADMS/PUSH dengan HTTPS dan full URL, perangkat dapat mengirim langsung ke Edge Function;
- bila tersedia ADMS/PUSH HTTP dengan fixed path `/iclock/*`, gunakan relay HTTP LAN yang disertakan;
- bila hanya tersedia ZKEM SDK/TCP LAN, diperlukan Windows service/gateway lokal berbasis SDK vendor. Bridge ZKEM proprietary tersebut tidak disertakan dan tidak boleh digantikan dengan kode tebakan.

Browser, Vercel, dan Supabase tidak dapat membuka socket langsung ke IP privat mesin. Relay HTTP yang disertakan juga bukan bridge ZKEM dan tidak membaca port 4370.

Lihat [ADMS_SETUP.md](ADMS_SETUP.md) dan [FINGERPRINT_GUIDE.md](FINGERPRINT_GUIDE.md).

## Integrasi Deli E+

Implementasi memakai API resmi Deli Cloud dengan base URL `https://v2-api.delicloud.com`, request POST JSON, dan signature MD5 dari path + timestamp + app key + app secret. Modul mendukung validasi credential, sinkronisasi departemen/karyawan, perangkat, absensi incremental, retry, webhook bertanda tangan, log, dan monitoring.

Dokumentasi resmi Deli yang digunakan tidak menyediakan endpoint payroll. Karena itu, **Sync Payroll** mengekspor payroll finalized ke Storage privat dan dapat mengirim payload ke HTTPS webhook yang dikonfigurasi perusahaan; fitur ini tidak diklaim sebagai endpoint payroll native Deli. Lihat [DELI_E_PLUS_SETUP.md](DELI_E_PLUS_SETUP.md).

## Keamanan

- Supabase Auth dengan RLS organisasi dan permission per operasi.
- Foreign key organisasi komposit untuk mencegah referensi lintas tenant.
- Parameterized PostgREST/RPC; tidak ada SQL dari input pengguna.
- Zod/RHF validation, sanitasi display, DOMPurify, dan proteksi formula injection CSV/XLSX.
- Bearer token, bukan cookie aplikasi, sehingga request state-changing tidak menerima ambient credential browser; origin dan permission tetap diperiksa.
- Rate limit, idempotency key, retry capped exponential backoff, checksum biometrik, token perangkat ter-hash, serta payload/log yang direduksi.
- Audit trigger menolak perubahan bila penulisan audit gagal; secret dan field sensitif direduksi.
- Header Vercel: CSP-adjacent platform defaults, frame denial, nosniff, referrer policy, dan permission policy.

Baca `docs/SECURITY.md` sebelum go-live.

## Batas operasional free tier

Repository tidak memerlukan layanan berbayar, tetapi quota Supabase/Vercel/GitHub tetap berlaku. Arsip payload besar, retensi log, jumlah realtime connection, bandwidth, dan durasi Edge Function harus dipantau. Scheduled maintenance memproses batch terbatas agar sesuai pola serverless. Untuk organisasi dengan volume besar, jalankan load test dan atur retensi sebelum produksi.

## Verifikasi release

```bash
npm run test:core
npm run verify:static
npm run check
```

Checklist acceptance lengkap ada di `docs/TEST_CHECKLIST.md`. Integrasi hardware dan Deli harus diuji menggunakan credential/perangkat milik perusahaan; pengujian unit lokal tidak menggantikan vendor acceptance test.

## Referensi resmi

- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase scheduled functions: https://supabase.com/docs/guides/functions/schedule-functions
- Supabase Vault: https://supabase.com/docs/guides/database/vault
- ZKTeco Push Protocol: https://www.zkteco.com.br/produto/protocolo-push/
- Deli Cloud attendance integration: https://doc.delicloud.com/v3/integration/oa.html
