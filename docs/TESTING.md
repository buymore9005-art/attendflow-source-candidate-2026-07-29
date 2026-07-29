# Panduan Pengujian AttendFlow

Dokumen ini memisahkan pengujian yang dapat dijalankan otomatis dari acceptance test yang memerlukan project Supabase, credential vendor, atau perangkat fisik. Release tidak boleh dinyatakan siap produksi hanya berdasarkan unit test frontend.

## 1. Lingkungan acuan

Gunakan lingkungan berikut agar hasil lokal, CI, dan Vercel konsisten:

- Node.js 22 LTS; batas minimum project adalah Node.js 20.19.
- npm 10 atau versi npm bawaan Node.js 22.
- Browser Chromium/Chrome, Firefox, dan Safari versi yang masih didukung vendor.
- Project Supabase staging yang terpisah dari production.
- Mesin fingerprint dengan model dan firmware yang sama dengan unit produksi untuk pengujian ADMS.

Periksa versi:

```bash
node --version
npm --version
git --version
```

## 2. Instalasi deterministik

Pada source candidate tanpa lockfile, lakukan instalasi pertama dengan registry yang sehat:

```bash
npm install --no-audit --no-fund
npm ls --depth=0
```

Setelah instalasi, review dan commit `package-lock.json`. Mulai saat itu gunakan `npm ci --no-audit --no-fund` pada clone bersih, CI, dan deployment. Jangan menghapus konflik dengan `--force` atau `--legacy-peer-deps`; cari akar konflik dan pilih versi yang kompatibel.

Untuk menguji benar-benar dari keadaan bersih:

```bash
rm -rf node_modules dist coverage
if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
```

Pada Windows PowerShell:

```powershell
Remove-Item node_modules,dist,coverage -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path package-lock.json) { npm ci --no-audit --no-fund } else { npm install --no-audit --no-fund }
```

## 3. Pemeriksaan otomatis

### 3.1 Tes inti tanpa browser

```bash
npm run test:core
```

Cakupan tes inti meliputi kalkulasi absensi dan payroll, permission, tiga kamus bahasa, retry, parser ADMS, idempotency, signature Deli, keamanan CSV, generator bootstrap SQL, serta helper verifikasi project.

### 3.2 Verifikasi struktur dan artefak

```bash
npm run verify:static
```

Verifier memeriksa file wajib, konsistensi kamus, key terjemahan literal, transaksi SQL, pasangan dollar-quote, jumlah minimum table/function, Edge Function wajib, dan kesegaran `sql/initial_backup.sql`.

Setelah mengubah salah satu SQL kanonik, regenerasi bootstrap:

```bash
npm run sql:bootstrap
npm run verify:static
```

### 3.3 Type-check, lint, unit test, dan build

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Atau jalankan seluruh rangkaian:

```bash
npm run check
```

Kriteria lulus:

- exit code setiap perintah adalah `0`;
- tidak ada warning ESLint karena project memakai `--max-warnings 0`;
- folder `dist/` terbentuk;
- tidak ada unresolved import atau missing type declaration;
- test tidak bergantung pada urutan eksekusi atau network production.

## 4. Smoke test development server

Jalankan server pada port tetap:

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Di terminal lain:

```bash
curl --fail --silent --show-error http://127.0.0.1:5173/ > /dev/null
curl --fail --silent --show-error http://127.0.0.1:5173/login > /dev/null
```

Kemudian uji melalui browser:

1. Halaman login tampil tanpa error console.
2. Refresh pada nested route tidak kehilangan state aplikasi.
3. Pergantian Indonesia, English, dan 中文 terjadi tanpa reload.
4. Light/dark/system theme dan sidebar bertahan setelah reload.
5. Tampilan tetap dapat digunakan pada lebar 360 px, tablet, dan desktop.

## 5. Uji production bundle lokal

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Buka `http://127.0.0.1:4173`. Pastikan lazy chunk, source map, font, ikon, dan route utama dapat dimuat. Periksa Network tab untuk request 404 dan Console untuk error CSP atau runtime.

## 6. Validasi Supabase staging

Gunakan project staging kosong, bukan production.

1. Jalankan `sql/000_full_schema.sql` di SQL Editor.
2. Jalankan `sql/001_seed.sql` bila memerlukan data demo.
3. Deploy semua Edge Functions.
4. Jalankan `sql/002_scheduler.sql` setelah extension dan secrets tersedia.
5. Buat user pertama dan selesaikan onboarding.
6. Verifikasi semua bucket privat dan policy Storage.
7. Verifikasi Realtime publication hanya berisi table yang diperlukan.

SQL Editor harus selesai tanpa error. Re-run schema pada staging untuk menguji idempotensi bagian yang dinyatakan aman diulang. Jangan menganggap file SQL sebagai migration rollback; perubahan production harus melalui migration terkontrol.

## 7. Pengujian RLS dan role

Buat user staging untuk Admin, HR, Supervisor, Leader, Finance, Manager, dan Viewer. Untuk setiap role:

- login menggunakan sesi user tersebut, bukan service-role;
- uji read/create/update/delete sesuai matriks permission;
- uji akses langsung melalui Supabase client terhadap organisasi lain;
- pastikan request lintas organisasi ditolak atau mengembalikan nol baris;
- pastikan denial eksplisit mengalahkan grant;
- pastikan audit log tidak dapat diubah oleh client.

Service-role tidak boleh digunakan untuk menguji RLS karena service-role melewati policy.

## 8. Pengujian Storage

Uji upload, preview signed URL, penghapusan, ukuran maksimum, dan MIME type untuk:

- foto/dokumen karyawan;
- logo organisasi;
- biometrik;
- integration payload;
- backup.

Gunakan dua organisasi untuk membuktikan bahwa path organisasi A tidak dapat dibaca oleh organisasi B.

## 9. Pengujian attendance dan payroll

Gunakan tanggal dan zona waktu yang diketahui. Minimal uji:

- hadir normal;
- terlambat di dalam dan di luar grace period;
- pulang cepat;
- lembur;
- shift malam/cross-midnight;
- hari libur dan libur nasional;
- izin, sakit, cuti, dan alpha;
- duplicate punch;
- perubahan shift setelah attendance tercatat;
- payroll daily, weekly, monthly;
- bonus, potongan, BPJS, pajak, pinjaman, kasbon, THR;
- submit, approve, finalize, dan proteksi payroll finalized;
- slip PDF, print, CSV, dan spreadsheet.

Finance/HR harus membandingkan hasil dengan perhitungan manual yang telah disetujui perusahaan. Project ini menyediakan mesin kalkulasi, bukan interpretasi hukum pajak atau ketenagakerjaan untuk semua yurisdiksi.

## 10. Acceptance test ADMS

Unit test parser tidak membuktikan kompatibilitas firmware. Gunakan perangkat aktual dan catat model, serial, versi firmware, menu komunikasi, protocol, host, port, dan hasil setiap skenario.

Uji minimal:

- heartbeat/online status;
- ATTLOG realtime;
- log saat internet putus lalu sinkron ulang;
- duplicate log/idempotency;
- command polling dan result;
- pull log;
- push user/card;
- satu fingerprint/face round-trip bila didukung firmware;
- token rotation;
- payload batch besar;
- retry dan offline detection;
- waktu/NTP dan cross-midnight.

Untuk firmware HTTP port 80, gunakan relay lokal yang dijelaskan di `ADMS_SETUP.md`. Untuk firmware tanpa menu ADMS/Cloud, diperlukan bridge SDK vendor; jangan expose port TCP mesin ke internet.

## 11. Acceptance test Deli E+

Gunakan credential sandbox/test atau tenant yang diizinkan perusahaan. Verifikasi:

- signature dan timestamp;
- sinkronisasi departemen, employee, device, dan attendance;
- pagination/cursor incremental;
- retry pada 429/5xx;
- idempotency webhook;
- log yang tidak membocorkan app secret;
- pemetaan timezone dan employee identifier.

Sync payroll pada project ini adalah ekspor/webhook perusahaan, bukan endpoint payroll native Deli.

## 12. Backup dan restore

Ikuti `docs/BACKUP_RESTORE.md` dan uji pada staging:

1. buat data contoh yang dapat dikenali;
2. buat backup dan catat checksum/path;
3. ubah beberapa record;
4. restore dengan confirmation text yang benar;
5. bandingkan record sebelum/sesudah;
6. verifikasi audit, Auth user, Vault secret, dan Storage object sesuai batas yang terdokumentasi.

Jangan melakukan acceptance test restore pertama kali di production.

## 13. Vercel production smoke test

Setelah deployment:

- buka root, `/login`, dan nested route langsung;
- verifikasi security headers;
- login/logout dan refresh token;
- cek request Supabase/Auth/Realtime dari domain production;
- pastikan redirect URL Auth sesuai domain;
- verifikasi chunk statis mendapat cache immutable;
- uji satu CRUD, satu export, dan satu realtime update.

## 14. Bukti release

Simpan output berikut sebagai artefak CI atau lampiran release:

```text
node/npm version
npm ci output
npm ls --depth=0
npm run test:core
npm run verify:static
npm run typecheck
npm run lint
npm run test
npm run build
```

Tambahkan hasil staging SQL, matriks RLS, hardware acceptance, Deli acceptance, backup/restore, dan Vercel smoke test. Release hanya boleh ditandai production-ready setelah seluruh gate yang relevan lulus.
