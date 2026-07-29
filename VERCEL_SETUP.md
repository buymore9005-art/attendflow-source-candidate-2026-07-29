# Setup GitHub dan Vercel

## Batas penggunaan paket gratis

Secara teknis SPA ini dapat dibangun dan di-host di Vercel. Namun, paket **Vercel Hobby dibatasi untuk penggunaan personal non-komersial**. Aplikasi absensi internal perusahaan yang dibuat atau dioperasikan untuk kepentingan bisnis tidak boleh dinyatakan sebagai deployment produksi yang sesuai ketentuan Hobby. Pilihan realistis untuk penggunaan perusahaan adalah Vercel Pro atau static hosting lain yang ketentuannya mengizinkan penggunaan komersial.

Supabase Free dapat digunakan untuk development, demo, pilot kecil, dan acceptance test. Supabase Free memiliki quota, tidak memberikan SLA produksi, dan project yang aktivitasnya rendah dapat di-pause setelah periode tidak aktif. Untuk sistem absensi/payroll yang harus selalu tersedia, rencanakan upgrade atau operasional recovery yang sesuai.

Batas ini adalah batas layanan, bukan error source code.

## 1. Push repository ke GitHub

Jangan commit `.env`, Function secrets, file token relay, `node_modules`, atau `dist`.

```bash
git add .
git commit -m "feat: release AttendFlow"
git push origin main
```

Source candidate ini belum menyertakan `package-lock.json` karena registry npm pada lingkungan validasi mengembalikan HTTP 503. Gunakan `npm install` untuk instalasi pertama pada registry yang sehat, jalankan seluruh quality gate, lalu commit lockfile dan ubah Install Command menjadi `npm ci` sebelum go-live.

## 2. Import project

1. Masuk ke Vercel.
2. Pilih **Add New → Project**.
3. Import repository GitHub.
4. Framework preset: **Vite**.
5. Root Directory: root repository.
6. Install Command: `npm install --no-audit --no-fund` untuk validasi pertama; setelah lockfile berhasil dibuat dan di-commit, ubah menjadi `npm ci --no-audit --no-fund`.
7. Build Command: `npm run build`.
8. Output Directory: `dist`.
9. Node.js Version: 22.x.

`vercel.json` berisi SPA rewrite dan security headers sehingga refresh route seperti `/employees` kembali ke `index.html`.

## 3. Environment Variables

Tambahkan ke environment yang sesuai:

| Key | Nilai |
|---|---|
| `VITE_SUPABASE_URL` | Project URL Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key |
| `VITE_APP_URL` | Domain frontend utama |
| `VITE_DEFAULT_LOCALE` | `id`, `en`, atau `zh` |
| `VITE_DEFAULT_TIME_ZONE` | Zona IANA, default `Asia/Jakarta` |
| `VITE_ENABLE_OFFLINE_CACHE` | `true` atau `false` |

Tidak ada service-role key, Deli secret, backup key, atau token mesin di Vercel frontend. Semua variable dengan prefix `VITE_` dianggap publik pada bundle browser.

## 4. Deploy

Klik **Deploy**, lalu:

1. Buka domain deployment.
2. Pastikan halaman login tampil tanpa configuration error.
3. Tambahkan domain ke Supabase Auth Site URL dan Redirect URLs.
4. Set `APP_URL` pada Supabase Function secrets.

```bash
supabase secrets set APP_URL="https://DOMAIN_PRODUKSI"
```

## 5. Custom domain

Setelah domain custom aktif:

- ubah `VITE_APP_URL`;
- ubah Supabase Auth Site URL;
- tambahkan `https://DOMAIN_CUSTOM/**` ke Redirect URLs;
- ubah Function secret `APP_URL`;
- redeploy frontend.

## 6. Preview deployment

Domain preview berubah pada tiap branch/deployment. Untuk Auth, gunakan staging branch dengan domain tetap atau daftarkan hanya preview yang benar-benar dipakai. Jangan membuka wildcard redirect lebih luas dari kebutuhan.

## 7. Cache

Asset Vite memakai content hash dan diberi cache immutable. Query cache browser dapat dipersist ke `localStorage` selama 24 jam bila `VITE_ENABLE_OFFLINE_CACHE=true`. Ini hanya cache baca; mutasi payroll, absensi, dan administrasi tidak dianggap berhasil ketika offline.

## 8. Troubleshooting

### Build gagal pada dependency

```bash
rm -rf node_modules dist
if [ -f package-lock.json ]; then npm ci; else npm install; fi
npm run check
```

Jangan gunakan `--force` atau `--legacy-peer-deps`; perbaiki root cause dependency.

### Route refresh 404

Pastikan `vercel.json` berada di root dan Vercel menggunakan Output Directory `dist`.

### Environment missing

Vite membaca environment saat build. Perbarui Environment Variables lalu redeploy.

### Supabase Auth redirect gagal

Scheme, host, dan path redirect harus cocok dengan deployment. Periksa browser Network tab dan Supabase Auth logs.

### UI lama setelah deploy

Lakukan hard refresh atau hapus site data. Cache baca berada di localStorage, bukan IndexedDB mutation queue.

## 9. Checklist sebelum penggunaan perusahaan

- Ketentuan paket hosting mengizinkan penggunaan komersial.
- Project Supabase tidak bergantung pada Free pause/recovery untuk operasi kritis.
- `npm ci` dan `npm run check` lulus di CI.
- Database staging, RLS, backup/restore, payroll, dan hardware acceptance test lulus.
- Monitoring dan incident owner ditetapkan.
