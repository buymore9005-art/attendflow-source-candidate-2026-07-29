# Panduan Deployment AttendFlow

Deployment terdiri dari tiga bagian independen: database/Edge Functions di Supabase, source di GitHub, dan frontend di Vercel.

## Kelayakan paket gratis

Vercel Hobby hanya untuk personal non-komersial. Deployment perusahaan harus memakai Vercel Pro atau hosting lain yang mengizinkan penggunaan komersial. Supabase Free cocok untuk development/pilot kecil, tetapi memiliki quota, dapat dipause saat aktivitas rendah, dan tidak memberi jaminan ketersediaan produksi. Jangan menyatakan sistem payroll kritis production-ready hanya karena build berhasil.

## Urutan deployment

1. Buat project Supabase.
2. Import `sql/000_full_schema.sql`.
3. Deploy Edge Functions dan set secrets.
4. Import `sql/002_scheduler.sql` dan aktifkan scheduler.
5. Buat user admin pertama.
6. Push source ke GitHub.
7. Import repository ke Vercel dan isi environment.
8. Atur Site URL/Redirect URL Supabase ke domain Vercel.
9. Jalankan smoke test dan checklist acceptance.

## GitHub

```bash
git init
git add .
git commit -m "feat: deploy AttendFlow"
git branch -M main
git remote add origin URL_REPOSITORY_GITHUB
git push -u origin main
```

Repository menyertakan workflow `.github/workflows/ci.yml`. Workflow menginstal dependency dan menjalankan `npm run check` pada push dan pull request.

## Supabase

Ikuti [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Edge Functions harus aktif sebelum UI integration digunakan. Pastikan secrets berikut tersedia:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `APP_URL`
- `BACKUP_ENCRYPTION_KEY`
- `CRON_SECRET`
- `DELI_PAYROLL_WEBHOOK_ALLOWED_ORIGINS` (opsional; wajib bila outbound payroll webhook aktif)

App key/secret Deli disimpan melalui menu Settings ke organization Vault, bukan pada environment frontend.

## Vercel

Ikuti [VERCEL_SETUP.md](VERCEL_SETUP.md). Build command adalah `npm run build`; output `dist`.

## Setelah domain berubah

Perbarui tiga tempat:

1. `VITE_APP_URL` di Vercel.
2. `APP_URL` Function secret di Supabase.
3. Auth Site URL dan Redirect URLs di Supabase.

Deploy ulang frontend dan Function secret bila diperlukan.

## Smoke test produksi

1. Buka `/login`, ganti tiga bahasa, dan login.
2. Pastikan route refresh langsung tidak 404.
3. Buat satu departemen, jabatan, shift, dan karyawan.
4. Unggah foto/dokumen dan buka preview signed URL.
5. Buat mesin, rotasi token, queue test connection.
6. Buat absensi manual dan hitung ulang.
7. Buat profile payroll, generate payroll, submit, approve, finalize, lalu ekspor slip.
8. Buka audit log; setiap perubahan harus tercatat.
9. Buat backup dan pastikan file berada di bucket privat.
10. Jalankan Deli validation hanya setelah credential resmi diisi.

## Rollback

- Frontend: gunakan Vercel deployment history dan promote deployment sebelumnya.
- Edge Function: redeploy commit Git sebelumnya.
- Database: jangan mengembalikan schema dengan menghapus tabel. Buat migration kompensasi dan uji di project staging.
- Data organisasi: gunakan backup terenkripsi dari menu Settings. Restore menggunakan mode merge; baca `docs/BACKUP_RESTORE.md`.

## Kriteria go-live

- `npm run check` lulus di CI.
- SQL berhasil dijalankan di project staging baru.
- RLS diuji minimal dengan Admin, HR, Finance, Viewer.
- Restore backup diuji di project staging.
- Model mesin fingerprint aktual lulus test log, command, user, finger, face/card yang relevan.
- Credential Deli aktual lulus validation dan sync incremental tanpa duplikasi.
- Rumus payroll ditandatangani Finance/HR sesuai kebijakan perusahaan dan peraturan lokal.
