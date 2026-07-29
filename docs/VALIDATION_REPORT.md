# Laporan Validasi Source Candidate AttendFlow

Tanggal validasi: **29 Juli 2026 (Asia/Jakarta)**

## Kesimpulan

Source repository telah melewati pemeriksaan statis, kontrak backend/frontend, parser TypeScript, dan seluruh core test yang tidak memerlukan package dari registry. Source ini **belum boleh dinyatakan production-ready atau build-verified**, karena registry npm pada lingkungan validasi tidak tersedia sehingga dependency tidak dapat dipasang dan quality gate berbasis Vite/ESLint/Vitest tidak dapat dijalankan.

Paket ZIP diberi status **source candidate — dependency validation blocked**, bukan release produksi final.

## Lingkungan

| Komponen | Nilai |
|---|---|
| Node.js | `v22.16.0` |
| npm | `10.9.2` |
| Engine project | Node `22.x`, npm `>=10` |
| Package manager | npm |
| Lockfile | Belum tersedia karena instalasi registry tidak berhasil |

## Hasil yang berhasil diverifikasi

### Static project verifier

Perintah:

```bash
npm run verify:static
```

Hasil terakhir:

```text
Static verification passed: 494 i18n keys, 417 literal references, 33 tables, 37 functions.
```

Verifier memeriksa antara lain:

- file wajib;
- seluruh import lokal dan dependency declaration;
- dependency runtime yang benar-benar dapat dijangkau dari browser entry;
- kesetaraan key kamus Indonesia, English, dan Simplified Chinese;
- freshness `sql/initial_backup.sql`;
- transaksi SQL dan dollar quote;
- kontrak literal table/view, RPC, Storage bucket, dan Edge Function;
- revoke/grant function `SECURITY DEFINER`;
- keberadaan Edge Function wajib.

### Core test tanpa dependency browser

Perintah:

```bash
npm run test:core
```

Hasil terakhir:

```text
135 tests, 135 passed, 0 failed.
```

Cakupan meliputi attendance, payroll, permission, i18n, export/PDF safety, spreadsheet import, ADMS parser/relay/route, capability perangkat, Deli signature/pagination/continuation/scheduler serta atomic job recovery, SQL privilege contract, backup tenant validation, outbound webhook allowlist, dan source/configuration audit. Seluruh suite dijalankan tiga kali berturut-turut dari source final dan ketiganya menghasilkan 135/135 lulus.

### Parser syntax TypeScript/TSX

Source diperiksa menggunakan parser TypeScript global tanpa melakukan module resolution ke dependency npm.

```text
TypeScript/TSX syntax passed: 147 files, 0 parse errors.
JavaScript syntax passed: 8 files, 0 parse errors.
JSON parse passed: 6 files, 0 errors.
YAML parse passed: 1 file, 0 errors.
```

Pemeriksaan ini membuktikan source dapat diparse, tetapi **bukan pengganti typecheck penuh**.

### SQL bootstrap

Perintah:

```bash
npm run sql:bootstrap
```

Hasil: `sql/initial_backup.sql` berhasil dibentuk ulang secara deterministik dari:

1. `sql/000_full_schema.sql`
2. `sql/001_seed.sql`
3. `sql/002_scheduler.sql`

## Gate yang terblokir oleh lingkungan

### `npm install`

Registry yang dikonfigurasi oleh lingkungan:

```text
https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public
```

Perintah:

```bash
npm ping --fetch-retries=0 --fetch-timeout=15000
npm install --no-audit --no-fund --fetch-retries=0 --fetch-timeout=30000
```

Hasil:

```text
npm ERR! code E503
npm ERR! 503 Service Temporarily Unavailable
# install berhenti pada request pertama: @eslint/js
```

Percobaan langsung ke registry publik juga terblokir oleh DNS lingkungan:

```text
curl: (6) Could not resolve host: registry.npmjs.org
npm ERR! code EAI_AGAIN
```

Ini merupakan kegagalan akses registry eksternal. Hasil tersebut **tidak membuktikan dependency kompatibel maupun konflik**. Karena instalasi tidak pernah selesai:

- `node_modules` tidak disertakan;
- `package-lock.json` belum dapat dibuat secara sah;
- tidak digunakan `--force` atau `--legacy-peer-deps` untuk menyembunyikan konflik.

### `npm run dev`

Hasil aktual:

```text
sh: 1: vite: not found
```

Penyebab langsung: Vite belum terpasang karena `npm install` terblokir. Dev server tidak diklaim berhasil.

### Typecheck dan production build

Perintah:

```bash
npm run typecheck
npm run build
```

Keduanya berhenti pada type definition yang belum terpasang:

```text
Cannot find type definition file for '@testing-library/jest-dom'
Cannot find type definition file for 'vitest/globals'
Cannot find type definition file for 'node'
```

Ini konsisten dengan tidak adanya `node_modules`; tidak ada bukti fresh bahwa typecheck/build penuh lulus.

### ESLint dan Vitest browser

```text
eslint: not found
vitest: not found
```

Keduanya belum terpasang akibat gangguan registry.

## Validasi yang memerlukan infrastruktur nyata

Belum dapat dijalankan pada sesi ini:

- import SQL ke project Supabase staging;
- pengujian RLS dengan JWT Admin/HR/Finance/Viewer;
- deploy dan smoke test seluruh Edge Functions;
- restore backup pada staging;
- deploy Vercel dan refresh-route SPA test;
- credential Deli E+ aktual;
- unit fisik Solution X105 dan identifikasi firmware/protocol;
- hardware acceptance untuk ATTLOG, user, finger, face, card, dan command result.

## Gate wajib pada jaringan/CI yang sehat

Jalankan dari clone bersih memakai Node yang sesuai `.nvmrc`:

```bash
npm install --no-audit --no-fund
npm run check
npm run dev -- --host 127.0.0.1
```

Setelah instalasi pertama berhasil:

```bash
git diff -- package.json package-lock.json
npm ci --no-audit --no-fund
npm run check
```

Review lalu commit `package-lock.json`. Jangan memakai `--force` atau `--legacy-peer-deps`; bila npm melaporkan konflik, selesaikan versi/peer dependency yang menjadi akar masalah dan ulangi seluruh gate.

Untuk release perusahaan, lanjutkan checklist pada `docs/TEST_CHECKLIST.md`, termasuk Supabase staging, RLS, backup/restore, Vercel/hosting, Deli acceptance, dan hardware acceptance X105.
