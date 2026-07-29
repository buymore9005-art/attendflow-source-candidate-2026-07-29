# Troubleshooting AttendFlow

Mulai dari pesan error yang pertama, reproduksi pada clone/staging bersih, dan ubah satu hal setiap kali. Jangan menggunakan `--force`, menonaktifkan RLS, atau memasukkan service-role key ke frontend sebagai jalan pintas.

## 1. `npm install` / `npm ci`

### HTTP 503, `EAI_AGAIN`, `ETIMEDOUT`, atau registry tidak dapat dijangkau

Ini adalah kegagalan jaringan/registry sebelum dependency selesai di-resolve.

```bash
npm config get registry
npm ping
npm cache verify
```

Periksa proxy, DNS, VPN, firewall, atau registry perusahaan. Ulangi setelah registry sehat. Jangan mengganti versi package secara acak karena error 503 bukan bukti dependency conflict.

### `npm ci` mengatakan lockfile tidak sesuai

`package.json` dan `package-lock.json` berubah tidak bersamaan. Pada branch yang memang mengubah dependency:

```bash
rm -rf node_modules
npm install --no-audit --no-fund
npm run check
git diff -- package.json package-lock.json
```

Commit kedua file. Pada CI/deployment gunakan kembali `npm ci`.

### `ERESOLVE unable to resolve dependency tree`

Baca package yang meminta peer version berbeda:

```bash
npm explain NAMA_PACKAGE
npm view NAMA_PACKAGE peerDependencies
```

Pilih kombinasi versi yang kompatibel dan uji. Jangan menyembunyikan konflik dengan `--legacy-peer-deps` untuk release production.

### `EBADENGINE`

Gunakan Node.js 22 LTS atau minimal 20.19:

```bash
node --version
```

Samakan versi lokal, GitHub Actions, dan Vercel.

## 2. Development dan build

### `vite: command not found`

Dependency belum terpasang atau install gagal. Hapus instalasi parsial lalu jalankan `npm ci` setelah registry sehat.

### Port 5173 sudah digunakan

```bash
npm run dev -- --port 5174 --strictPort
```

Atau hentikan proses yang memakai port 5173.

### `Cannot find module '@/...'`

Periksa kapitalisasi nama file, ekstensi, dan alias pada `vite.config.ts` serta `tsconfig.app.json`. Linux/Vercel case-sensitive walaupun sebagian filesystem lokal tidak.

### Type definition tidak ditemukan

Pastikan dev dependency terpasang dan install tidak diproduksi dengan flag yang membuang dev dependency. Build Vercel memerlukan TypeScript dan type packages karena script menjalankan `tsc -b`.

### Vercel build lulus lokal tetapi gagal remote

Bandingkan Node version, environment, case sensitivity, lockfile, dan build command. Gunakan:

```bash
npm ci
npm run build
```

pada clone bersih, bukan working tree dengan dependency lama.

## 3. Environment frontend

### Halaman configuration error muncul

Pastikan `.env` berisi:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_APP_URL=http://localhost:5173
```

Restart Vite setelah mengubah `.env`. Variable Vite dibaca saat build/start, bukan dinamis setelah bundle dibuat.

### `Invalid Supabase URL` atau request ke domain kosong

Gunakan Project URL lengkap dengan `https://`. Jangan gunakan database connection string sebagai `VITE_SUPABASE_URL`.

### `No API key found in request`

Request mencapai gateway Supabase tanpa header `apikey`. Periksa `VITE_SUPABASE_PUBLISHABLE_KEY`, pastikan key berasal dari project yang sama dengan `VITE_SUPABASE_URL`, lalu redeploy karena variable `VITE_*` dibaca saat build. Source terbaru memasang transport guard untuk RPC, query tabel seperti `/rest/v1/employees`, Storage, dan request SDK lain ke origin Supabase tanpa menimpa JWT user.

### Service-role terlihat di browser

Segera rotasi key. Hapus dari semua variable `VITE_*`, Git history, CI log, dan deployment. Service-role hanya boleh menjadi secret Supabase Edge Function/server-side.

## 4. Authentication

### Login berhasil tetapi kembali ke login

Periksa browser storage/cookie policy, waktu komputer, Auth logs, dan apakah user memiliki `organization_members` aktif. Pastikan onboarding telah selesai.

### Magic link/OAuth kembali ke domain salah

Perbarui Supabase Auth Site URL dan Redirect URLs, `VITE_APP_URL`, serta `APP_URL` Function secret agar sama dengan domain aktif.

### User baru tidak dapat mendaftar

Production memang dirancang dengan public signup nonaktif. Admin membuat/invite user melalui menu Pengguna/Edge Function atau Dashboard Supabase untuk akun pertama.

## 5. RLS dan permission

### Query mengembalikan array kosong tanpa error

RLS mungkin menolak row secara diam-diam. Verifikasi:

- user memiliki membership aktif;
- `organization_id` request sesuai membership;
- role/grant memberi permission;
- explicit denial tidak aktif;
- request memakai session user yang benar.

Jangan memakai service-role untuk mendiagnosis apakah policy user bekerja.

### `permission denied for table/function`

Periksa GRANT dan policy pada schema, lalu jalankan schema terbaru pada staging. Pastikan RPC dipanggil dengan signature yang benar.

### Data Karyawan menampilkan `PGRST201` atau relasi departemen ambigu

Schema memiliki relasi karyawan-ke-departemen dan departemen-ke-manager. Gunakan source terbaru yang memilih constraint `employees_department_fk` secara eksplisit, lalu redeploy frontend. Jangan menghapus foreign key manager sebagai workaround.

### Data organisasi lain terlihat

Hentikan go-live. Simpan request reproduksi, user ID, JWT claims, table, dan query. Audit policy/FK organisasi sebelum melanjutkan; ini adalah insiden isolasi tenant.

## 6. Storage

### Upload ditolak

Periksa bucket, MIME type, ukuran, path yang harus diawali organization UUID, permission, dan RLS `storage.objects`.

### Foto tidak tampil

Bucket privat memerlukan signed URL yang belum kedaluwarsa. Pastikan object path benar dan clock browser tidak jauh melenceng.

### CSP memblokir gambar/custom domain Supabase

`vercel.json` mengizinkan `https://*.supabase.co`. Bila memakai custom domain, tambahkan hostname spesifik ke `img-src` dan `connect-src`, lalu uji ulang header.

## 7. Realtime

### UI tidak diperbarui otomatis

Periksa apakah sembilan tabel operasional tercantum di publication `supabase_realtime`, koneksi WebSocket, CSP `connect-src`, RLS user, dan status project. Aplikasi memakai satu channel terpusat per user/organisasi dan rekonsiliasi setiap 30 detik ketika tab online serta terlihat. Refresh manual harus tetap bekerja sebagai fallback. Untuk project yang sudah ada sebelum hotfix data karyawan, jalankan schema terbaru atau tambahkan `public.employees` ke publication agar perubahan dari perangkat/browser lain ikut tersinkron.

### Perubahan hapus baru terlihat terlambat

Event `INSERT` dan `UPDATE` memakai filter organisasi. Perubahan `DELETE` dipulihkan melalui rekonsiliasi berkala, saat channel tersambung kembali, saat browser kembali online, atau saat tab kembali terlihat. Bila lebih dari 30 detik tidak berubah, periksa request refetch pada Network tab dan error RLS/PostgREST.

### Event ganda

Pastikan tidak ada page yang membuka channel tambahan untuk tabel yang sudah dikelola `SupabaseSyncController`. Subscription terpusat akan dilepas otomatis saat user atau organisasi berubah; backend tetap harus idempoten terhadap event yang dapat dikirim ulang.

## 8. Cache offline

### Reload offline diarahkan ke onboarding

Cache offline hanya tersedia setelah profil, membership organisasi, izin, dan query pernah berhasil dimuat oleh user yang sama. Pastikan `VITE_ENABLE_OFFLINE_CACHE=true`, session Supabase masih tersimpan, dan site data tidak dihapus. Login pertama atau organisasi yang belum pernah dibuka memerlukan jaringan.

### Data user sebelumnya masih terlihat

Gunakan source terbaru, logout melalui aplikasi, lalu periksa bahwa tidak ada key lama `attendflow-query-cache`. Cache baru memakai key per user dan dicabut saat logout, sign-out otomatis, atau pergantian akun. Pada komputer bersama, gunakan browser profile terpisah dan hapus site data bila versi lama pernah dipakai.

### Cache gagal tersimpan karena kuota

Aplikasi membuang query tertua ketika persisten query melampaui kuota. Signed URL tidak ikut dipersist. Bila browser tetap menolak storage, hapus site data yang tidak diperlukan atau nonaktifkan cache dengan `VITE_ENABLE_OFFLINE_CACHE=false`; aplikasi online tetap dapat digunakan.

## 9. SQL Supabase

### Extension tidak tersedia

Hosted Supabase menyediakan kumpulan extension tertentu. Aktifkan extension melalui Dashboard/SQL sesuai project. Bila extension tidak tersedia pada plan/region, jangan menghapus dependency SQL tanpa memahami function yang menggunakannya.

### Policy/trigger sudah ada saat re-run

Gunakan file schema terbaru yang melakukan drop/create atau `if not exists` pada bagian yang didukung. Untuk production, gunakan migration terurut; jangan berulang kali menjalankan full schema tanpa review.

### Scheduler gagal

Pastikan `pg_cron`, `pg_net`, dan Vault/secret dikonfigurasi, Edge Function sudah ter-deploy, URL benar, dan `CRON_SECRET` sama. Periksa `cron.job_run_details` serta Function logs.

### `initial_backup.sql is stale`

```bash
npm run sql:bootstrap
npm run verify:static
```

Jangan mengedit `sql/initial_backup.sql` langsung.

## 10. ADMS / ZKTeco / Solution X105

### Unit X105 tidak memiliki menu ADMS/Cloud

Firmware tersebut tidak dapat diarahkan langsung ke endpoint PUSH hanya karena model memiliki TCP/IP. Minta firmware/SDK resmi dari distributor atau gunakan bridge SDK vendor pada PC LAN. Jangan mengarang command TCP atau membuka port 4370 ke internet.

### Mesin hanya menerima server dan port 80

Gunakan relay lokal HTTP pada jaringan perusahaan. Mesin mengirim ke IP LAN relay; relay meneruskan HTTPS ke Supabase dan menambahkan token. Supabase Edge Function/Vercel tidak dapat membuka listener LAN port 80 pada jaringan perusahaan.

### Mesin tidak mendukung HTTPS atau custom path

Direct URL Supabase tidak kompatibel. Gunakan relay yang menerima format firmware dan meneruskan ke `/functions/v1/adms/iclock/...`.

### `Device serial number and token are required`

Request tidak membawa `SN` dan token. Pada direct mode, gunakan field push key/query yang didukung firmware. Pada relay mode, petakan serial ke token pada secret relay.

### `Invalid device token`

Token salah, telah dirotasi, atau serial tidak cocok. Rotasi token dari UI dan update hanya perangkat/relay terkait.

### Mesin terlihat offline

Periksa power, link LAN, gateway/DNS, NTP, server/port/path, relay service, firewall outbound, Edge Function logs, dan `last_seen_at`.

### ATTLOG masuk tetapi karyawan tidak terpetakan

Samakan PIN yang dikirim mesin dengan `fingerprint_pin`, biometric enrollment, atau employee number yang digunakan implementasi. Jangan mengubah NIK sebagai workaround tanpa menyepakati identifier.

### Command tetap queued

Mesin belum polling `/iclock/getrequest`, relay tidak meneruskan response, atau dialect command tidak didukung firmware. Periksa access log relay/Function dan raw command result.

### Fingerprint/face ditolak

Template biometrik bergantung algoritma, format, firmware, dan slot. Uji round-trip pada model identik. Metadata berhasil disimpan tidak berarti template lintas perangkat kompatibel.

## 11. Deli E+

### Signature invalid

Pastikan path yang ditandatangani sama persis dengan path request, timestamp dalam format yang diminta vendor, app key benar, app secret tidak memiliki whitespace, dan hasil MD5 lowercase.

### Attendance terduplikasi

Periksa cursor incremental, external event ID, timezone, dan idempotency record. Jangan hanya menghapus row; perbaiki key pemetaan.

### 429 atau 5xx berulang

Hentikan retry tak terbatas. Gunakan backoff yang dibatasi, hormati `Retry-After` bila tersedia, dan lihat status vendor.

### Payroll sync tidak menemukan endpoint Deli

Implementasi tidak mengklaim payroll API native Deli. Gunakan ekspor file privat atau webhook perusahaan yang dikonfigurasi.

## 12. Payroll

### Total berbeda dari hitung manual

Bandingkan profile yang aktif pada tanggal periode, attendance finalized, unit gaji, rate overtime, deduction, adjustment, pembulatan, dan timezone. Simpan contoh input/output sebelum mengubah rumus.

### Payroll finalized tidak dapat diedit

Ini perilaku proteksi. Buat adjustment/settlement sesuai workflow; jangan menonaktifkan trigger langsung di production.

### Slip PDF kosong atau font bermasalah

Periksa data payroll item, lazy-loaded export dependency, browser memory, dan karakter yang didukung font PDF. CSV/print dapat digunakan sebagai fallback diagnosis, bukan pengganti perbaikan.

## 13. Backup dan restore

### `BACKUP_ENCRYPTION_KEY is required`

Set Function secret dengan key acak 32 byte berformat base64/base64url, lalu redeploy bila diperlukan. Jangan menyimpan key di frontend atau repository.

### `Backup schema or organization does not match`

File bukan format AttendFlow v1, rusak, atau berasal dari organisasi lain. Jangan memodifikasi organization ID di file terenkripsi.

### `No completed organization backup was found`

Buat backup sukses terlebih dahulu atau kirim `storage_path` yang valid dalam prefix organisasi.

### Restore gagal di tengah proses

Restore memakai upsert bertahap, bukan satu transaksi lintas seluruh Function. Catat table/error, jangan ulang di production secara membabi buta, dan lakukan recovery pada staging dari backup yang sama. Baca `docs/BACKUP_RESTORE.md`.

### Data Auth/secret/file Storage tidak kembali

Backup organisasi tidak mencakup Supabase Auth accounts, Vault secrets, atau binary Storage object. Pulihkan komponen tersebut melalui prosedur terpisah yang terdokumentasi.

## 14. Vercel

### Refresh nested route menghasilkan 404

Pastikan `vercel.json` ikut ter-deploy dan rewrite ke `/index.html` aktif.

### CSP memblokir API

Lihat browser Console dan header response. Tambahkan hanya origin yang benar-benar diperlukan; jangan mengganti CSP menjadi `*`.

### Environment baru tidak terbaca

Redeploy setelah mengubah Vercel Environment Variables. Pastikan scope Preview/Production tepat.

## 15. Data yang harus disertakan saat eskalasi

Sertakan:

- commit SHA dan versi release;
- Node/npm/browser/OS;
- command dan error lengkap pertama;
- correlation ID request;
- Supabase Function/Database log yang sudah direduksi;
- route/table/role/organization ID non-rahasia;
- model, serial yang dimasking, firmware, mode ADMS, dan waktu kejadian;
- langkah reproduksi minimal;
- perubahan terakhir yang relevan.

Jangan mengirim JWT, service-role key, app secret, token mesin, template biometrik, atau data payroll pribadi ke kanal publik.
