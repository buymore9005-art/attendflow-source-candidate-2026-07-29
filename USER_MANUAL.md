# Manual Pengguna AttendFlow

## 1. Masuk dan bahasa

Buka halaman login, pilih Indonesia, English, atau 简体中文, lalu masukkan email/password. Bahasa berubah realtime dan disimpan pada browser. Tema light/dark/system, sidebar collapse, dan ukuran halaman juga disimpan lokal.

Shortcut `Ctrl+K` membuka command palette. Navigasi keyboard dan tombol skip-to-content tersedia.

## 2. Dashboard

Dashboard menampilkan 18 KPI: total/aktif/nonaktif, biometrik terhubung/belum, hadir, terlambat, pulang cepat, alpha, izin, sakit, cuti, lembur, jam kerja, payroll harian/bulanan, serta mesin online/offline. Grafik mencakup attendance harian/bulanan, keterlambatan, lembur, payroll, dan status. Aktivitas/audit serta notifikasi diperbarui realtime.

## 3. Pola halaman data

Setiap halaman DataPage memiliki:

- pencarian debounce;
- advanced filter dan reset;
- klik header untuk sorting;
- pilihan row dan pilih semua halaman;
- page size/pagination;
- import XLSX bila modul mengizinkan;
- export XLSX/CSV/PDF dan print;
- refresh;
- bulk update/delete sesuai permission;
- menu tindakan per row;
- loading skeleton, empty state, dan retry error.

Ekspor mengikuti kolom dan filter aktif. CSV/XLSX menetralkan formula injection.

## 4. Karyawan

### Daftar

Buka **Karyawan → Data Karyawan**. Foto memakai signed URL; klik untuk preview. Gunakan filter status, gender, departemen, shift, atau tanggal masuk.

### Registrasi wizard

1. Identitas: NIK, nama, gender, lahir, alamat, kontak.
2. Pekerjaan: departemen, jabatan, status, shift, tanggal masuk, PIN.
3. Bank/administrasi: BPJS, NPWP, bank, rekening, kontak darurat.
4. Dokumen: foto, KTP, KK; JPG/PNG/WebP/PDF maksimum 8 MB.
5. Review lalu simpan.

Employee ID dibuat server-side memakai sequence dan prefix organisasi; submit idempotent mencegah double registration.

## 5. Departemen, jabatan, dan shift

Master data dapat dibuat/diedit/dihapus sesuai permission. Shift mendukung fixed, rotating, night, off; start/end, break, grace, tolerance late/early, overtime threshold, dan cross-midnight. Assign shift pada karyawan berlaku melalui employee dan history assignment.

## 6. Mesin dan biometrik

Tambah mesin dengan serial unik. Rotasi token di Settings. Action mesin membuat queue, bukan koneksi browser langsung. Sinkronisasi Biometrik menampilkan enrollment dan status template. Detail operasional ada di ADMS/Fingerprint guide.

## 7. Absensi

- Harian: record per work date.
- Bulanan: agregat present/late/absent/permit/sick/leave, overtime dan work minutes.
- Riwayat: seluruh event/record lintas tanggal.
- Rekap: filter dan ekspor summary.

Field utama: clock in/out, break, overtime, late, early leave, status, location, machine, shift, notes. Edit manual memerlukan permission; action recalculate menjalankan formula authoritative database. Shift cross-midnight mengaitkan punch dini hari ke work date sebelumnya.

## 8. Izin dan cuti

Buat request berisi employee, type, start/end, total days, dan reason. Supervisor/role berizin dapat approve/reject. Approval membuat/menyesuaikan attendance record pada rentang tanggal. Nomor request dibuat otomatis.

## 9. Payroll

1. Isi profile payroll per karyawan.
2. Lengkapi attendance dan adjustment.
3. Generate run.
4. Review item.
5. Submit → Approve → Finalize.
6. Print/download slip atau export.

Finalized terkunci. Koreksi dilakukan melalui adjustment periode berikut atau workflow reversal perusahaan.

## 10. Deli E+

Isi credential di Settings, lalu dari Integrasi lakukan validation, sync employees, devices, attendance, atau payroll export. Monitor status, attempts, next attempt, error, dan correlation ID. Retry hanya untuk job yang dapat diulang.

## 11. Pengguna dan role

Admin dapat invite satu/banyak user, memilih role dan departemen. Role matrix dapat diubah. Membership juga memiliki grants/denials detail. Pengguna tidak boleh menghapus membership dirinya sendiri melalui policy.

## 12. Audit

Audit Log menampilkan actor, event, entity, action, IP, browser/user agent, device metadata, old/new data tereduksi, correlation ID, tanggal/jam. Audit table tidak memiliki policy insert/update/delete untuk client; record dibuat oleh trigger/RPC/Edge Function.

## 13. Settings

- General/company: nama, alamat, email, telepon, logo, timezone, language.
- Work/holiday: jam default, hari kerja, tanggal libur.
- Numbering: prefix employee/payroll/payslip/leave.
- Payroll/integration: default deduction, Deli auto-sync, webhook payroll.
- Fingerprint/ADMS: endpoint, interval, token rotation.
- Security: session policy metadata, MFA flag, export watermark.
- Backup/restore: archive encrypted organization.
- Secret integrasi Deli bersifat write-only. SMTP autentikasi dikonfigurasi oleh administrator project melalui **Supabase Dashboard → Authentication → Emails → SMTP Settings**; credential SMTP tidak disimpan oleh aplikasi.

## 14. Backup dan restore

Buat backup sebelum perubahan besar. File terenkripsi disimpan privat. Restore meminta kata konfirmasi dan memakai mode merge. Auth user, Vault secret, dan audit log tidak ditimpa dari archive. Lihat `docs/BACKUP_RESTORE.md`.

## 15. Offline

Query cache yang pernah berhasil dimuat dapat dibaca dari `localStorage` saat offline selama belum kedaluwarsa. Mutasi memerlukan jaringan aktif dan tidak dipersist atau dianggap berhasil ketika offline. Operasi sensitif seperti approval dan finalisasi payroll harus dilakukan online.

## 16. Error umum

- Forbidden: minta role/permission yang benar.
- Network: cek internet/Supabase status lalu retry.
- Validation: perbaiki field sesuai pesan bahasa aktif.
- Conflict/duplicate: periksa NIK/email/serial/period unik.
- Storage: cek ukuran/MIME/path/permission.
- Integration: buka Integration Logs dan correlation ID.

Daftar lengkap ada di `docs/TROUBLESHOOTING.md`.
