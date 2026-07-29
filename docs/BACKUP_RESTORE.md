# Backup dan Restore AttendFlow

Fitur ini membuat backup data bisnis satu organisasi melalui Supabase Edge Function `backup-restore`. Ini adalah **backup aplikasi per organisasi**, bukan snapshot penuh project Supabase atau pengganti backup database platform.

## 1. Prasyarat

- Schema dan bucket `backups` sudah dibuat oleh `sql/000_full_schema.sql`.
- Edge Function `backup-restore` sudah di-deploy dengan JWT verification aktif.
- User memiliki permission `settings.update` pada organisasi.
- `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` tersedia sebagai Function secret.
- `BACKUP_ENCRYPTION_KEY` tersedia sebagai Function secret dan decode menjadi tepat 32 byte.

Buat key acak 32 byte, simpan melalui secret manager perusahaan/Supabase, dan simpan recovery copy secara terpisah dari project. Jangan menaruhnya pada `.env` frontend.

## 2. Format dan enkripsi

Payload plaintext menggunakan schema:

```text
attendflow.organization-backup.v1
```

Payload JSON berisi metadata organisasi, waktu pembuatan, row per table, dan record count. Sebelum upload:

1. SHA-256 dihitung atas plaintext.
2. Plaintext dienkripsi AES-256-GCM dengan IV acak 12 byte.
3. Envelope terenkripsi disimpan sebagai `.afbackup` dengan content type `application/octet-stream`.

Path object:

```text
ORGANIZATION_ID/TIMESTAMP-CHECKSUM_PREFIX.afbackup
```

Bucket `backups` bersifat privat.

## 3. Data yang dicakup

Backup mencakup record organisasi dan table bisnis berikut:

```text
role_permissions
organization_settings
organization_members
departments
positions
shifts
employees
shift_assignments
holidays
attendance_devices
biometric_enrollments
biometric_assets
device_commands
raw_attendance_logs
attendance_records
leave_requests
payroll_profiles
payroll_runs
payroll_items
financial_adjustments
integrations
integration_jobs
integration_logs
webhook_events
audit_logs
system_notifications
number_sequences
```

Setiap row difilter menggunakan `organization_id`.

## 4. Data yang tidak dicakup

Backup ini tidak mengekspor:

- akun/password/MFA Supabase Auth;
- Vault secrets dan Function secrets;
- binary object pada employee documents, organization assets, biometrics, integration payloads, atau bucket lain;
- deployment configuration Vercel/GitHub;
- database extension, policy, trigger, function, dan schema—gunakan file SQL repository;
- log/metadata platform yang berada di luar table aplikasi.

`biometric_assets` dan field file lain hanya membawa metadata/path/checksum; file binary pada Storage tetap perlu backup terpisah.

Supabase Auth tidak dipulihkan oleh file `.afbackup`: akun, password hash, MFA, identity provider, dan session harus direkonstruksi melalui prosedur platform yang terpisah dan diuji pada staging.

## 5. Membuat backup

Dari UI:

1. Buka **Pengaturan → Backup**.
2. Pilih **Backup**.
3. Tunggu notifikasi berhasil.
4. Verifikasi row `backup_jobs` berstatus `succeeded`, `storage_path`, `checksum`, `record_count`, dan `completed_at` terisi.

Request Edge Function secara konseptual:

```json
{
  "organization_id": "UUID_ORGANISASI",
  "action": "backup"
}
```

Authorization harus memakai JWT user yang berhak; browser service menggunakan session Supabase.

## 6. Restore

Restore default memilih backup sukses terbaru. Request dapat menyertakan `storage_path` yang masih berada di prefix organisasi yang sama.

UI meminta teks konfirmasi exact:

```text
RESTORE UUID_ORGANISASI
```

Restore melakukan:

1. download file privat;
2. decrypt AES-GCM;
3. validasi schema dan organization ID;
4. hitung checksum plaintext;
5. upsert organization;
6. upsert table dalam urutan dependency, batch 500 row;
7. sambungkan kembali manager departemen setelah employee tersedia;
8. tulis status job dan audit.

## 7. Semantik merge

Restore adalah **merge/upsert**, bukan replace penuh:

- row dengan conflict key sama diperbarui;
- row dari backup yang belum ada dibuat;
- row saat ini yang tidak ada di backup **tidak otomatis dihapus**;
- generated `device_commands.command_no` tidak dipulihkan langsung;
- `audit_logs` ada di backup sebagai arsip, tetapi tidak dimasukkan kembali oleh restore;
- Auth account dan Storage file tidak dibuat kembali.

Karena operasi berjalan bertahap melalui Edge Function, restore bukan satu transaksi database atomik untuk seluruh table. Kegagalan di tengah proses dapat meninggalkan sebagian upsert sudah diterapkan. Oleh sebab itu, lakukan recovery drill pada staging dan simpan bukti sebelum production.

## 8. Batas volume

Implementasi Edge Function memaginasi query secara deterministik dalam batch 500 dan menerapkan batas keras **100.000 row per table per backup**. Bila satu table organisasi melewati batas itu, job gagal secara eksplisit; file parsial tidak boleh dianggap sebagai backup yang sah. Batas ini mencegah pemotongan diam-diam dan membatasi memory/runtime karena payload JSON serta enkripsi masih diproses dalam satu invocation.

Perhatikan quota Supabase project, batas runtime/memory Edge Function, batas response PostgREST, dan batas file bucket. Backup organisasi besar harus diuji dengan volume nyata. Retensi raw logs, integration logs, dan audit logs sangat memengaruhi ukuran/waktu.

Untuk table di atas batas tersebut atau disaster recovery project penuh, gunakan proses database-native seperti `pg_dump` melalui koneksi database yang diizinkan atau alur backup yang didukung Supabase CLI/platform, serta ekspor Storage secara terpisah. Job ekspor terpartisi yang dikelola perusahaan juga dapat digunakan. Jangan mengklaim backup sukses hanya karena job dapat dibuat; cocokkan record count dengan query sumber.

## 9. Recovery drill yang wajib

Pada project staging:

1. Catat jumlah row per table organisasi.
2. Buat backup dan simpan path/checksum/record count.
3. Download/copy file sesuai policy recovery perusahaan bila diperlukan.
4. Ubah beberapa data yang mudah dikenali.
5. Jalankan restore dengan confirmation benar.
6. Bandingkan row count dan sampel data.
7. Verifikasi department manager, attendance, payroll, integration metadata, dan number sequence.
8. Verifikasi audit log lama tidak diduplikasi ke table aktif.
9. Verifikasi Auth user, Vault secret, dan binary Storage secara terpisah.
10. Catat durasi, error, dan langkah recovery parsial.

## 10. Rotasi key

File hanya dapat didekripsi dengan key yang digunakan saat dibuat. Bila `BACKUP_ENCRYPTION_KEY` dirotasi:

- simpan key lama di secure archive selama backup lama masih harus dapat direstore; atau
- decrypt dan re-encrypt backup lama melalui proses offline yang diaudit;
- tandai periode/key ID pada inventory eksternal tanpa memasukkan key ke metadata file.

Implementasi saat ini tidak menyimpan key version dalam envelope selain versi format. Kehilangan key berarti kehilangan kemampuan restore backup terkait.

## 11. Retensi

Tentukan kebijakan berdasarkan kebutuhan perusahaan:

- frekuensi backup;
- jumlah generasi;
- lokasi salinan terpisah;
- masa retensi attendance/payroll/audit;
- siapa yang dapat restore;
- recovery time objective dan recovery point objective;
- jadwal recovery drill.

Free tier memiliki quota; scheduled maintenance/retensi harus disesuaikan agar bucket tidak penuh.

## 12. Error umum

| Error | Makna/tindakan |
|---|---|
| `backup_not_found` | Belum ada backup sukses atau path salah |
| `restore_confirmation_required` | Teks konfirmasi tidak exact |
| `Backup schema or organization does not match` | Format/tenant tidak sesuai |
| `BACKUP_ENCRYPTION_KEY ...` | Secret hilang atau bukan 32 byte |
| download/upload error | Periksa bucket, quota, policy, dan service-role secret |
| restore table error | Catat table dan lakukan diagnosis di staging sebelum retry |

Lihat juga `TROUBLESHOOTING.md`.

## 13. Disaster recovery penuh

Recovery project penuh membutuhkan kombinasi:

1. source dan lockfile dari GitHub;
2. schema/function/policy dari folder `sql/` dan `supabase/functions/`;
3. backup data database yang tervalidasi;
4. salinan binary Storage;
5. prosedur rekreasi/import Auth user sesuai kemampuan platform dan kebijakan password;
6. inventory Vault/Function/Vercel secrets;
7. domain/redirect/scheduler configuration;
8. hardware/device token re-provisioning bila key/token berubah.

Dokumentasikan owner dan lokasi setiap komponen. Satu file `.afbackup` saja tidak memenuhi disaster recovery penuh.
