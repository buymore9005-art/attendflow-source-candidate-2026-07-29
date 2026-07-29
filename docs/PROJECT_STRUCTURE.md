# Struktur Project AttendFlow

Struktur disusun agar UI reusable, business logic murni, akses data, integrasi server-side, SQL, dan dokumentasi memiliki batas yang jelas.

```text
attendance-payroll-system/
├── .github/
│   └── workflows/ci.yml              # Clean install dan quality gate GitHub Actions
├── docs/
│   ├── API.md                         # Kontrak RPC dan Edge Functions
│   ├── BACKUP_RESTORE.md              # Cakupan dan recovery backup organisasi
│   ├── ERD.md                         # Relasi database
│   ├── PROJECT_STRUCTURE.md           # Dokumen ini
│   ├── SECURITY.md                    # Threat model dan kontrol keamanan
│   ├── TESTING.md                     # Strategi/perintah pengujian
│   ├── TEST_CHECKLIST.md              # Acceptance dan go-live checklist
│   ├── TROUBLESHOOTING.md             # Error umum dan diagnosis
│   ├── VALIDATION_REPORT.md            # Bukti quality gate dan blocker lingkungan
│   ├── PROJECT_TREE.txt                # Struktur file source candidate
│   ├── SOURCE_MANIFEST.sha256          # Checksum seluruh file paket (kecuali manifest)
│   └── superpowers/                   # Design/spec/implementation plan historis
├── scripts/
│   ├── generate-initial-backup.mjs    # Menggabungkan SQL kanonik secara deterministik
│   ├── verify-project-helpers.mjs     # Helper verifier yang dapat diuji
│   └── verify-project.mjs             # Pemeriksaan artefak/i18n/SQL/functions
├── sql/
│   ├── 000_full_schema.sql            # Schema, RLS, trigger, function, bucket, realtime
│   ├── 001_seed.sql                   # Role seed dan demo opt-in
│   ├── 002_scheduler.sql              # Cron/maintenance setup
│   └── initial_backup.sql             # Bootstrap generated dari tiga file di atas
├── src/
│   ├── app/                           # Router dan smoke test aplikasi
│   ├── assets/                        # Asset statis milik project
│   ├── components/
│   │   ├── crud/                      # Form/dialog CRUD reusable
│   │   ├── data-table/                # Table, toolbar, filter, state reusable
│   │   └── ui/                        # Primitive UI bergaya Shadcn/Radix
│   ├── context/                       # Auth, locale, provider, sinkronisasi Supabase terpusat
│   ├── hooks/                         # Hook lintas fitur
│   ├── i18n/                          # Kamus id/en/zh dan translator
│   ├── layout/                        # Shell, header, sidebar, command palette
│   ├── lib/                           # Supabase client, env, kebijakan cache/auth/realtime, shared infra
│   ├── middleware/                    # Route guard auth/permission
│   ├── pages/                         # Halaman per domain bisnis
│   │   ├── admin/
│   │   ├── attendance/
│   │   ├── auth/
│   │   ├── common/
│   │   ├── dashboard/
│   │   ├── devices/
│   │   ├── employees/
│   │   ├── errors/
│   │   ├── integrations/
│   │   ├── notifications/
│   │   ├── organization/
│   │   ├── payroll/
│   │   └── settings/
│   ├── services/                      # Query/mutation/export/import/storage/function calls
│   ├── stores/                        # Zustand UI state
│   ├── test/                          # Setup Vitest/Testing Library
│   ├── types/                         # Domain/form/table types
│   ├── utils/                         # Pure calculator, format, retry, security helpers
│   ├── index.css                      # Tailwind tokens dan global CSS
│   └── main.tsx                       # Browser entry point
├── supabase/
│   ├── config.toml                    # Konfigurasi local Supabase
│   └── functions/
│       ├── _shared/                   # Auth, HTTP, crypto, retry, ADMS/Deli helper
│       ├── admin-users/               # Invite/update admin user
│       ├── adms/                      # Endpoint PUSH/ADMS
│       ├── backup-restore/            # Backup organisasi terenkripsi
│       ├── deli-sync/                 # Deli API/webhook/job
│       ├── device-command/            # Queue command mesin
│       └── scheduled-maintenance/     # Retry/offline/retention worker
├── tests-node/                        # Tes business logic tanpa dependency browser
├── .env.example                      # Public frontend environment contract
├── .gitignore
├── ADMS_SETUP.md
├── DELI_E_PLUS_SETUP.md
├── DEPLOY.md
├── FINGERPRINT_GUIDE.md
├── INSTALL.md
├── PAYROLL_GUIDE.md
├── README.md
├── SUPABASE_SETUP.md
├── USER_MANUAL.md
├── VERCEL_SETUP.md
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json                 # Lockfile npm v3 yang disertakan dan di-commit
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
├── vercel.json
└── vite.config.ts
```

## Aturan dependensi antarbagian

- `components/ui` tidak mengakses Supabase atau business table secara langsung.
- `components/data-table` menerima konfigurasi/callback agar dapat digunakan lintas domain.
- `pages` mengorkestrasi component, query, permission, dan user flow.
- `services` menjadi batas utama browser terhadap Supabase/Edge Functions.
- `utils` berisi fungsi murni yang dapat diuji tanpa network.
- `middleware` hanya menangani gate route; keamanan authoritative tetap RLS/Edge Function.
- Rahasia server-side hanya berada di Supabase Function secrets/Vault.
- Edge Functions tidak diikutkan ke `tsconfig.app.json` karena runtime dan type Deno berbeda dari browser.
- `sql/initial_backup.sql` generated; ubah file SQL kanonik lalu jalankan `npm run sql:bootstrap`.

## File generated dan yang tidak boleh di-commit

Jangan commit:

```text
node_modules/
dist/
coverage/
.env
.env.*.local
*.tsbuildinfo
Vercel/Supabase local state
backup/data produksi
```

`package-lock.json` disertakan dan di-commit. Gunakan `npm ci` pada clone bersih, CI, dan deployment. Saat dependency diubah, jalankan instalasi pada registry yang sehat, review diff lockfile, lalu ulangi seluruh quality gate sebelum commit.

## Menambah fitur baru

1. Tambahkan pure domain rule di `src/utils` beserta tes.
2. Tambahkan akses data di `src/services`.
3. Buat page/domain component yang kecil dan reusable.
4. Tambahkan route lazy di `src/app/App.tsx`.
5. Tambahkan key pada ketiga kamus.
6. Tambahkan permission/RLS bila ada operasi baru.
7. Tambahkan audit dan dokumentasi API.
8. Jalankan seluruh quality gate pada `docs/TESTING.md`.
