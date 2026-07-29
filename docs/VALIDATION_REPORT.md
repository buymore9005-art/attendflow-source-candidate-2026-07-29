# Laporan Validasi Source Candidate AttendFlow

Tanggal validasi: **29 Juli 2026 (Asia/Jakarta)**

## Kesimpulan

Perbaikan cache lokal, transport Supabase, dan alur Data Karyawan telah melewati seluruh pemeriksaan yang tidak membutuhkan dependency browser terpasang: **167/167 core test lulus**, verifikasi kontrak project lulus, dan **160 file TypeScript/TSX** dapat diparse tanpa error syntax.

Source candidate ini belum boleh disebut build produksi terverifikasi pada lingkungan ini. Clean install dari lockfile terblokir oleh registry npm yang tersedia, sehingga typecheck lengkap, ESLint, Vitest browser, dan Vite build tidak dapat diselesaikan. Status paket adalah **source candidate — cache/sync/API-key/employee-data patch verified; dependency validation blocked**.

## Lingkungan

| Komponen | Nilai |
|---|---|
| Node.js | `v22.16.0` |
| npm | `10.9.2` |
| TypeScript global untuk parser | `5.8.3` |
| Engine project | Node `22.x`, npm `>=10` |
| Lockfile | `package-lock.json` v3, 631 package entries, di-commit |

## Hasil yang berhasil diverifikasi

### Core test

Perintah:

```bash
npm run test:core
```

Hasil fresh terakhir:

```text
tests 167
pass 167
fail 0
```

Selain kontrak bisnis yang sudah ada, suite kini mencakup:

- isolasi persisted query cache per user;
- penolakan persist untuk signed URL sementara;
- pembatalan write tertunda setelah logout/pergantian akun;
- eviksi saat kuota storage penuh;
- bootstrap profil, organisasi, dan izin dari cache ketika offline;
- kestabilan Query Client saat token refresh user yang sama;
- pemetaan seluruh tabel publication Realtime ke query cache organisasi;
- fallback rekonsiliasi untuk koneksi Realtime yang terputus atau perubahan yang terlewat;
- injeksi header `apikey` pada batas transport untuk RPC dan query tabel karyawan tanpa membocorkan key ke origin lain;
- disambiguasi foreign key pada query Data Karyawan;
- invalidasi cache langsung setelah registrasi dan sinkronisasi Realtime tabel `employees`.

### Static project verifier

Perintah:

```bash
npm run verify:static
```

Hasil fresh terakhir:

```text
Static verification passed: 495 i18n keys, 417 literal references, 33 tables, 37 functions.
```

Verifier memeriksa import lokal/dependency declaration, kesetaraan kamus, freshness SQL bootstrap, transaksi/dollar quote, kontrak table/view/RPC/Storage/Edge Function, serta privilege function `SECURITY DEFINER`.

### Parser syntax TypeScript/TSX

Source diperiksa dengan parser TypeScript global tanpa module resolution ke package npm:

```text
TypeScript/TSX syntax passed: 160 files, 0 parse errors.
```

Pemeriksaan parser membuktikan source dapat diparse, tetapi bukan pengganti semantic typecheck penuh.

### Integritas source

- `git diff --no-index --check` terhadap baseline tidak menemukan whitespace error.
- `docs/PROJECT_TREE.txt` diregenerasi dari isi paket final.
- `docs/SOURCE_MANIFEST.sha256` memuat **212 checksum** file source final, dengan manifest itu sendiri dan `package-lock.json` dikecualikan mengikuti format paket sebelumnya.

## Gate yang terblokir oleh lingkungan

### Clean install dari lockfile

Perintah:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

Registry npm lingkungan mengembalikan:

```text
npm ERR! code E404
npm ERR! 404 Not Found ... zustand-5.0.14.tgz
```

Percobaan query langsung ke registry publik tidak selesai sebelum batas waktu jaringan. Karena instalasi tidak berhasil, hasil ini tidak membuktikan adanya konflik dependency pada project; hanya menunjukkan dependency tidak dapat dipulihkan pada lingkungan validasi ini.

### Typecheck

Perintah:

```bash
npm run typecheck
```

Berhenti sebelum memeriksa source aplikasi karena type definition dari dependency belum tersedia:

```text
Cannot find type definition file for '@testing-library/jest-dom'
Cannot find type definition file for 'vitest/globals'
Cannot find type definition file for 'node'
```

### ESLint dan Vitest browser

```text
eslint: not found
vitest: not found
```

### Production build

`npm run build` berhenti pada missing type definitions yang sama sebelum Vite dijalankan. Tidak ada klaim bahwa build produksi telah lulus pada sesi ini.

## Validasi yang masih memerlukan infrastruktur nyata

- clean install dan `npm run check` pada CI/registry yang sehat;
- import SQL ke project Supabase staging;
- pengujian RLS menggunakan role organisasi nyata;
- smoke test Realtime, putus-sambung jaringan, dan perubahan `DELETE`;
- deploy Vercel/static hosting serta refresh route SPA;
- credential Deli E+ aktual;
- unit fisik Solution X105 dan acceptance test firmware/protocol.

## Gate wajib sebelum release produksi

Dari clone bersih dengan Node sesuai `.nvmrc`:

```bash
npm ci --no-audit --no-fund
npm run check
```

Lanjutkan checklist staging dan hardware pada `docs/TEST_CHECKLIST.md`. Jangan menggunakan `--force` atau `--legacy-peer-deps` untuk menyembunyikan konflik dependency.
