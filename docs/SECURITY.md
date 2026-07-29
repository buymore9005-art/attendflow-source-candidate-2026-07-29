# Keamanan AttendFlow

Dokumen ini menjelaskan kontrol yang benar-benar diterapkan, batas kepercayaan, dan pekerjaan operasional yang tetap menjadi tanggung jawab perusahaan. Tidak ada frontend yang dapat menggantikan RLS, permission server-side, pengelolaan secret, patch dependency, dan monitoring.

## 1. Batas kepercayaan

```text
Browser tidak tepercaya
  ├─ Supabase Auth JWT
  ├─ PostgREST/RPC yang dilindungi RLS
  ├─ Storage yang dilindungi policy
  └─ Edge Function berpermission

Device/vendor tidak tepercaya
  ├─ serial + token perangkat
  ├─ rate limit dan ukuran payload
  ├─ parsing/sanitasi/idempotency
  └─ audit/log yang direduksi

Service role dan vendor secret sangat tepercaya
  └─ hanya Supabase Edge Function/Vault, tidak pernah bundle Vite
```

Route guard React meningkatkan UX, tetapi bukan boundary keamanan. Operasi authoritative harus ditolak oleh RLS, database function, Storage policy, atau Edge Function ketika user tidak berhak.

## 2. Klasifikasi rahasia

| Nilai | Lokasi yang benar | Dilarang |
|---|---|---|
| Supabase Project URL | `.env`/Vercel `VITE_*` | — |
| Publishable/anon key | `.env`/Vercel `VITE_*` | menganggapnya secret |
| Service-role key | Supabase Function secret | browser, Git, log |
| Deli app secret | Vault/Function secret | browser, audit payload |
| `BACKUP_ENCRYPTION_KEY` | Function secret | Git, frontend |
| `CRON_SECRET` | Function secret/Vault | query publik/log |
| `DELI_PAYROLL_WEBHOOK_ALLOWED_ORIGINS` | Function secret/config deployment | dikendalikan tenant/browser |
| Token perangkat | hanya perangkat/relay; hash di DB | plaintext di DB/Git |
| Biometric template | bucket privat | audit/UI/log publik |

Bila secret pernah masuk Git atau browser bundle, anggap bocor dan rotasi. Menghapus commit terbaru saja tidak menghapus dari history atau deployment lama.

Outbound payroll webhook menggunakan exact-origin allowlist pada deployment. Validasi HTTPS saja tidak cukup untuk mencegah SSRF; hostname/IP lokal dan URL ber-credential ditolak, sedangkan origin tujuan harus diset oleh operator Supabase, bukan oleh user tenant saja.

## 3. Authentication dan session

- Supabase Auth menangani session/JWT.
- Public signup sebaiknya nonaktif pada production.
- Akun pertama dibuat melalui Dashboard Supabase; akun berikutnya melalui flow admin.
- Auth Site URL dan Redirect URLs dibatasi ke domain resmi.
- Aplikasi menggunakan bearer token dari Supabase client, bukan service-role.
- Masa hidup session, MFA, password policy, dan SSO mengikuti konfigurasi organisasi/Supabase yang dipilih.

Untuk perusahaan dengan risiko tinggi, aktifkan MFA/SSO yang tersedia dan review session/device secara berkala.

## 4. Isolasi tenant dan permission

- Row memiliki `organization_id` dan policy memeriksa membership/permission.
- Foreign key komposit organisasi mengurangi referensi lintas tenant.
- Role default dapat diperhalus dengan `permission_grants` dan `permission_denials`; denial menang.
- Edge Function user-facing memanggil pemeriksaan permission sebelum memakai admin client.
- Service-role hanya dipakai setelah identitas, organisasi, action, dan input divalidasi.
- Seluruh function `SECURITY DEFINER` mencabut `EXECUTE` dari `PUBLIC`, `anon`, dan `authenticated` terlebih dahulu; hanya RPC yang memang dibutuhkan yang diberi grant kembali secara eksplisit.
- Helper trigger/internal tidak diekspos ke PostgREST. RPC perangkat dan secret hanya diberikan kepada `service_role`.

Test RLS harus memakai JWT user biasa. Query service-role tidak membuktikan policy aman. Jalankan juga audit function privilege setelah setiap perubahan SQL karena PostgreSQL memberi `EXECUTE` kepada `PUBLIC` secara default pada function baru.

## 5. Input, XSS, dan injection

- Form memakai React Hook Form/Zod pada flow yang membutuhkan validasi terstruktur.
- Supabase client/RPC menggunakan parameter, bukan konkatenasi SQL dari user.
- React melakukan escaping text secara default.
- Text yang perlu disanitasi menggunakan helper/DOMPurify; hindari `dangerouslySetInnerHTML`.
- CSV/spreadsheet export menetralkan prefix formula berbahaya.
- Import membatasi ukuran/baris dan menormalisasi header/value.
- ADMS/vendor payload memiliki size limit, parser khusus, dan idempotency key.

Frontend validation adalah UX; constraint/database function tetap dibutuhkan untuk integritas.

## 6. CSRF dan origin

State-changing browser request memakai Authorization bearer token yang ditambahkan client, bukan ambient application cookie yang otomatis dikirim ke origin lain. Ini mengurangi pola CSRF cookie klasik, tetapi tidak menghilangkan kebutuhan untuk:

- CORS origin yang terbatas;
- redirect URL yang ketat;
- tidak mengekspos token ke XSS;
- permission server-side;
- verifikasi signature/token pada webhook/device endpoint.

## 7. Storage dan file

- Bucket employee documents, organization assets, biometrics, integration payloads, dan backups bersifat privat.
- Object path diawali organization UUID dan policy memeriksa membership/permission.
- Preview memakai signed URL berumur terbatas.
- MIME type dan file size dibatasi pada bucket/flow.
- Template biometrik memiliki checksum; kompatibilitas algoritma tetap harus diuji.

Antivirus/content scanning tidak disediakan otomatis oleh repository. Organisasi yang menerima dokumen dari sumber tak tepercaya harus menambahkan scanning pipeline atau proses manual yang sesuai risiko.

## 8. Device dan ADMS

- Serial number bukan secret; autentikasi memakai token unik per mesin.
- Database menyimpan hash token, bukan plaintext.
- Rotasi token menonaktifkan token lama.
- Endpoint menerapkan rate limit, payload limit, sanitasi, idempotency, dan status command.
- Mesin/relay hanya boleh melakukan outbound ke endpoint; port mesin tidak diekspos ke internet.
- Relay lokal harus dijalankan dengan user OS terbatas dan secret file permission ketat.

Firmware yang tidak dapat membawa token memerlukan relay untuk menambahkan token. Menghapus autentikasi endpoint agar perangkat lama dapat masuk bukan solusi aman.

## 9. Integrasi vendor

- Deli signature dibuat server-side.
- Credential disimpan di Vault/secret.
- Retry dibatasi dan job/log tidak boleh memuat secret/raw data sensitif tanpa kebutuhan.
- Webhook diverifikasi dan dibuat idempotent.
- Correlation ID dipakai untuk diagnosis tanpa membocorkan credential.

## 10. Audit

Audit mencatat actor, organization, event/action, entity, waktu, serta request context yang tersedia. Field rahasia/sensitif harus direduksi. Audit tidak boleh dapat diedit user biasa.

Audit log bukan pengganti log platform. Simpan juga Function logs, database observability, deployment history, dan alert sesuai retensi perusahaan. Free tier memiliki quota/retensi terbatas.

## 11. Backup dan cryptography

Backup organisasi dienkripsi AES-256-GCM menggunakan key 32 byte dari Function secret. Checksum SHA-256 dihitung atas plaintext untuk integritas/identifikasi. File berada pada bucket privat.

Backup aplikasi bukan backup penuh Supabase: Auth user, Vault secret, dan binary Storage object memerlukan prosedur terpisah. Lihat `BACKUP_RESTORE.md`. Lindungi encryption key di luar project; kehilangan key membuat file tidak dapat didekripsi, sedangkan kebocoran key mengurangi kerahasiaan seluruh backup yang memakai key tersebut.

## 12. Security headers Vercel

`vercel.json` menetapkan:

- Content-Security-Policy;
- Strict-Transport-Security;
- X-Content-Type-Options;
- X-Frame-Options;
- Referrer-Policy;
- Permissions-Policy;
- Cross-Origin-Opener-Policy.

Bila memakai custom Supabase domain, analytics, CDN, atau layanan lain yang dipanggil browser, update CSP dengan origin spesifik dan uji. Custom SMTP Supabase Auth dikonfigurasi pada tingkat project dan tidak memerlukan origin SMTP di CSP browser. Jangan memakai wildcard global sebagai perbaikan cepat.

## 13. Dependency dan supply chain

- Commit `package-lock.json`.
- CI memakai clean install dari lockfile.
- Review `npm audit` dan advisory upstream pada setiap release.
- Hindari package unmaintained untuk parsing input tak tepercaya.
- Jangan menjalankan install dengan `--force` atau script dari sumber tidak dipercaya.
- Aktifkan Dependabot/Renovate bila kebijakan organisasi mengizinkan.
- Review perubahan lockfile, GitHub Action pin/version, dan package lifecycle script.

## 14. Rate limit dan abuse

Database rate-limit bucket dan retry tersedia untuk endpoint berisiko. Batas harus disetel berdasarkan volume nyata. Free tier bukan platform anti-DDoS khusus; untuk exposure besar, pertimbangkan gateway/WAF/rate limiter yang sesuai dan rencana upgrade.

## 15. Data pribadi dan kepatuhan

Data karyawan, attendance, payroll, rekening, identitas, dan biometrik adalah data sensitif. Perusahaan bertanggung jawab atas dasar pemrosesan, consent bila diperlukan, retensi, akses, data residency, hak subjek data, dan peraturan lokal. Batasi data yang dikumpulkan dan akses berdasarkan tugas.

## 16. Respons insiden

1. Isolasi akun/device/integration yang terlibat.
2. Rotasi key/token yang mungkin bocor.
3. Simpan audit, Function logs, deployment, dan correlation ID.
4. Identifikasi organization/record/time range yang terdampak.
5. Patch akar masalah dan uji pada staging.
6. Pulihkan dari backup tervalidasi bila perlu.
7. Dokumentasikan notifikasi internal/regulator sesuai kewajiban.

Jangan menghapus log sebelum preservasi bukti.

## 17. Gate keamanan sebelum produksi

- RLS lintas tenant diuji untuk seluruh role.
- Service-role tidak ditemukan dalam bundle/Git.
- Storage private dan signed URL diuji.
- Dependency advisory ditinjau.
- Security headers diverifikasi pada domain production.
- Backup/restore drill lulus.
- Hardware/vendor acceptance lulus.
- Payroll/data privacy mendapat persetujuan owner yang berwenang.
