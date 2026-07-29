# Instalasi Lokal AttendFlow

## 1. Siapkan tool

Pastikan tersedia:

```bash
node --version
npm --version
git --version
```

Node.js yang direkomendasikan adalah 22 LTS. Untuk deploy Edge Functions, instal Supabase CLI sesuai dokumentasi resmi, lalu cek:

```bash
supabase --version
```

## 2. Clone repository

```bash
git clone URL_REPOSITORY_GITHUB
cd attendance-payroll-system
npm install
```

Nama repository boleh berbeda; perintah berikutnya dijalankan dari root yang memiliki `package.json`.

## 3. Siapkan Supabase

Ikuti [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Minimal, schema `sql/000_full_schema.sql` harus sudah dijalankan dan user pertama sudah dibuat.

## 4. Isi environment frontend

```bash
cp .env.example .env
```

Isi:

- `VITE_SUPABASE_URL`: Project URL dari **Project Settings → API**.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: publishable key; untuk project lama gunakan anon key.
- `VITE_APP_URL`: `http://localhost:5173` untuk development.
- `VITE_DEFAULT_LOCALE`: `id`, `en`, atau `zh`.
- `VITE_DEFAULT_TIME_ZONE`: zona IANA, misalnya `Asia/Jakarta`.
- `VITE_ENABLE_OFFLINE_CACHE`: `true` atau `false`.

Jangan menggunakan service-role key di `.env` frontend.

## 5. Jalankan pemeriksaan awal

```bash
npm run test:core
npm run verify:static
npm run typecheck
npm run lint
npm run test
npm run build
```

Build yang berhasil menghasilkan folder `dist/`.

## 6. Jalankan development server

```bash
npm run dev
```

Buka alamat yang dicetak Vite. Default biasanya `http://localhost:5173`.

## 7. Login pertama

1. Buka Supabase Dashboard → Authentication → Users.
2. Tambah user email/password dan konfirmasi emailnya.
3. Login ke AttendFlow.
4. Isi nama dan kode perusahaan pada onboarding.
5. Sistem membuat organisasi, settings awal, role permission, departemen General, jabatan Staff, dan shift Regular.

## 8. Data demonstrasi opsional

Setelah onboarding dan saat user admin sedang login, jalankan melalui SQL Editor dengan konteks user yang sesuai tidak selalu tersedia. Cara yang paling konsisten adalah memanggil RPC dari aplikasi/dev console menggunakan session admin, atau sementara menjalankan:

```sql
select public.seed_demo_data('UUID_ORGANISASI_YANG_VALID');
```

`sql/001_seed.sql` harus sudah diimport. Seed bersifat idempotent untuk data demonstrasi utamanya dan tidak mengisi credential vendor.

## 9. Troubleshooting instalasi

### Environment tidak terbaca

- Nama file harus `.env` di root.
- Prefix frontend wajib `VITE_`.
- Restart `npm run dev` setelah mengubah environment.

### Login berhasil tetapi tidak ada organisasi

Halaman onboarding akan muncul. Bila tidak, cek row `profiles` dan `organization_members`, serta pastikan trigger `on_auth_user_created` ada.

### Request ditolak RLS

Pastikan membership berstatus `active`, role permission sudah di-seed, dan `organization_id` record sama dengan organisasi aktif.

### Dependency gagal diunduh

Cek koneksi dan registry npm:

```bash
npm config get registry
npm cache verify
npm install --no-audit --no-fund
```

### Port Vite digunakan aplikasi lain

```bash
npm run dev -- --port 5174
```

Tambahkan URL tersebut ke Auth redirect URLs Supabase selama development.
