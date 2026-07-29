# Setup Integrasi Deli E+

## Kapabilitas

- Validasi App-Key/App-Secret.
- Push departemen dan karyawan AttendFlow ke Deli E+.
- Pull daftar perangkat Deli dan status online.
- Pull absensi incremental dengan cursor `next_id`.
- Retry dengan capped exponential backoff.
- Webhook inbound bertanda tangan.
- Job, correlation ID, payload result, error, dan log monitoring.
- Ekspor payroll finalized ke Storage privat dan optional HTTPS webhook.

## 1. Dapatkan credential resmi

Ajukan akses Open API melalui Deli Cloud/E+ sesuai kontrak perusahaan. Diperlukan:

- App-Key
- App-Secret
- organisasi Deli yang mengizinkan API attendance integration

Jangan menggunakan credential user biasa atau memasukkan secret ke source/frontend.

## 2. Isi secret

1. Login AttendFlow sebagai Admin.
2. Buka **Pengaturan → Integrasi**.
3. Isi Deli App-Key dan App-Secret.
4. Simpan.

Frontend memanggil RPC write-only; secret disimpan di Vault dan tidak pernah dibaca kembali oleh browser. Audit hanya mencatat bahwa secret dirotasi, bukan nilainya.

## 3. Endpoint resmi yang digunakan

Base URL:

```text
https://v2-api.delicloud.com
```

Request berupa POST JSON. Header signature:

```text
App-Key
App-Timestamp
App-Sig = md5(path + timestamp + appKey + appSecret).toLowerCase()
```

Endpoint yang dipakai implementasi:

- `/v2.0/employee/query` untuk validasi credential.
- `/v2.0/department/init` dan `/v2.0/department` untuk struktur departemen.
- `/v2.0/employee` untuk create/update karyawan.
- `/v2.0/org/device/query` untuk perangkat.
- `/v2.0/cloudappapi` dengan `Api-Module: CHECKIN` dan command init/query untuk absensi.

## 4. Deploy Function

```bash
supabase functions deploy deli-sync --no-verify-jwt
```

Endpoint UI/action:

```text
https://PROJECT_REF.supabase.co/functions/v1/deli-sync
```

UI mengirim JWT Supabase; Function memeriksa permission `integrations.sync` atau `integrations.update`. Route tanpa JWT platform diperlukan agar webhook vendor dan scheduler dapat masuk, tetapi keduanya memiliki autentikasi aplikasi sendiri.

## 5. Validasi API

Klik **Validasi API**. Function memanggil employee query dengan limit 1. Hasil job harus `succeeded`; error code Deli disimpan di job/log tanpa menyimpan secret.

Error umum resmi meliputi App-Key salah/hilang, signature salah/hilang, timestamp hilang, body invalid, timeout, dan rate limit. Lihat Integration Logs dan Edge Function logs.

## 6. Sinkronisasi karyawan

Urutan:

1. Inisialisasi root department external ID dari UUID organisasi tanpa dash.
2. Upsert departemen aktif; parent memakai external ID.
3. Upsert karyawan aktif; employee UUID menjadi `employee_ext_id` maksimum 32 karakter.
4. Nomor HP valid digunakan; bila kosong, implementasi membentuk nomor stabil untuk memenuhi format Deli. Untuk login E+ oleh karyawan, isi nomor nyata.
5. External ID Deli disimpan di `employees.external_ids.deli_ext_id` tanpa menghapus mapping vendor lain.

Departemen dan karyawan diproses maksimal 50 row per job. Bila masih ada data, Function membuat `integration_jobs` lanjutan yang idempoten; scheduler mengambil job berikutnya. Tidak ada batas 500/1.000 row yang memotong data secara diam-diam.

## 7. Sinkronisasi perangkat

Function membaca tepat satu halaman berisi maksimal 100 perangkat per job dan melakukan bulk upsert ke `attendance_devices` dengan vendor `deli`, protocol `deli_cloud`, serial, nama, status, dan metadata managed. Bila `total` vendor menunjukkan halaman berikutnya, continuation job idempoten dibuat dengan offset baru. Record perangkat tetap organization-scoped.

## 8. Sinkronisasi absensi

Pertama kali, Function menjalankan initialization. Sesuai kontrak API attendance Deli, query incremental hanya menyediakan data setelah initialization; implementasi tidak mengklaim dapat menarik histori sebelum waktu init. Selanjutnya cursor `attendance_next_id` disimpan di integration configuration. Setiap record:

1. Dipetakan ke employee melalui UUID external ID atau `external_ids.deli_ext_id`.
2. Terminal di-upsert sebagai Deli cloud device.
3. Timestamp epoch dikonversi menjadi timestamptz.
4. Raw log ditulis dengan idempotency `deli:<record_id>`.
5. Trigger database memproses record absensi dan shift.
6. Setiap halaman maksimal 500 record dimasukkan melalui satu RPC database idempoten.
7. Cursor disimpan setelah halaman berhasil; satu invocation memproses maksimal empat halaman (2.000 record) lalu membuat continuation job bila backlog masih ada.

Record tanpa mapping karyawan dilewati dan dicatat warning, sehingga cursor tetap maju dan operasi tidak berhenti total.

## 9. Auto-sync dan retry

Settings menyediakan enable dan interval. Scheduled maintenance hanya memilih job bernama `deli_*`, memprioritaskan retry yang jatuh tempo, dan menjalankan maksimal tiga child invocation secara paralel agar tetap berada dalam batas runtime Edge Function Free. Satu organisasi hanya mendapat satu invocation dalam satu batch scheduler. Job gagal kembali queued hingga `max_attempts`; `next_attempt_at` memakai exponential backoff dengan batas satu jam.

Retry mengklaim row job secara atomik melalui RPC PostgreSQL sebelum eksekusi. Dua worker yang menerima job ID sama tidak dapat menjalankan ulang pekerjaan yang sama secara bersamaan. Tombol retry pada Integration Logs menjalankan action asli dari payload job.

## 10. Webhook inbound

URL ditampilkan di halaman integrasi:

```text
https://PROJECT_REF.supabase.co/functions/v1/deli-sync/webhook/UUID_ORGANISASI
```

Webhook wajib mengirim App-Key, App-Timestamp 13 digit, dan App-Sig berdasarkan pathname webhook. Timestamp hanya diterima dalam jendela 10 menit. Event dideduplikasi melalui provider + external event ID. Header disimpan dengan allowlist; signature disimpan sebagai SHA-256 hash.

Konfirmasikan format event webhook dengan Deli sebelum mengaktifkan workflow bisnis tambahan. Implementasi saat ini menyimpan event terverifikasi dan status pemrosesan untuk audit/ekstensi.

## 11. Payroll

Dokumentasi attendance integration Deli yang menjadi dasar implementasi tidak mendefinisikan payroll endpoint. Karena itu:

- Payroll finalized diekspor maksimal 20 run per job menggunakan cursor tuple `updated_at + id`, sehingga row dengan timestamp sama tidak terlewat. Backlog menghasilkan continuation job.
- File JSON disimpan di bucket `integration-payloads` privat dengan path berbasis job ID dan `upsert`, sehingga retry job yang sama tidak membuat payload ganda.
- Bila `payroll_webhook_url` HTTPS di Settings diisi, origin-nya juga wajib dicantumkan oleh administrator deployment pada Function secret `DELI_PAYROLL_WEBHOOK_ALLOWED_ORIGINS` (daftar origin dipisahkan koma, tanpa path).
- Payload dikirim dengan `Idempotency-Key` dan retry hanya setelah exact origin allowlist cocok. Host lokal, IP literal, credential di URL, HTTP, dan origin yang tidak diizinkan ditolak.
- Ini adalah webhook perusahaan/adapter, bukan API payroll native Deli.

Jangan menyatakan payroll telah masuk ke Deli sebelum adapter tujuan mengembalikan HTTP success dan data diverifikasi.

## 12. Troubleshooting

| Masalah | Solusi |
|---|---|
| Signature error | Sinkronkan waktu server, periksa App-Key/Secret, path, lowercase MD5 |
| Credential missing | Simpan ulang secret di Settings |
| Karyawan tidak terpetakan | Jalankan sync employees dan cek `deli_ext_id` |
| Absensi duplicate | Idempotency menolak ID sama; cek vendor record ID |
| Absensi kosong | Jalankan init, cek model didukung dan izin API organisasi |
| Job queued terus | Periksa scheduler, CRON_SECRET, Function logs, `next_attempt_at` |
| Rate limit | Kurangi interval dan biarkan retry backoff |
| Payroll webhook gagal | Pastikan URL HTTPS, exact origin ada di `DELI_PAYROLL_WEBHOOK_ALLOWED_ORIGINS`, dan adapter merespons 2xx dalam 20 detik |

## 13. Referensi

Dokumentasi resmi: https://doc.delicloud.com/v3/integration/oa.html
