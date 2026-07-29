# Panduan Fingerprint, Face, Card, dan PIN

## Model data

- `biometric_enrollments`: hubungan employee–device, PIN, card, jumlah template, has face/card, status, last sync.
- `biometric_assets`: file template per finger/face slot, format, path Storage, checksum, byte size, status.
- `device_commands`: queue push/pull dan hasil.
- Bucket `biometrics`: file privat dengan path organisasi/karyawan/device.

## Batas model X105

Base Solution X105 adalah perangkat fingerprint. Jangan mengaktifkan face capability. Card hanya relevan pada varian yang benar-benar memiliki reader, misalnya X105-ID. Dukungan push/pull template tetap harus diverifikasi pada firmware aktual; kompatibilitas ZKEM LAN tidak otomatis berarti ADMS command template tersedia.

## Pendaftaran

1. Karyawan harus memiliki `employee_no`; isi `fingerprint_pin` bila PIN mesin berbeda.
2. Tambahkan mesin dan token.
3. Daftarkan user pada mesin atau push user dari AttendFlow.
4. Enroll finger/face/card pada mesin.
5. Pastikan OPERLOG/FINGERTMP/FACE dikirim ke ADMS untuk membuat enrollment/asset.
6. Halaman Sinkronisasi Biometrik menampilkan status, jumlah template, face, card, PIN, dan last sync.

## Status

- `pending`: belum diproses.
- `synced`: metadata/template berhasil tersimpan atau dikirim.
- `failed`: proses terakhir gagal; lihat error message.
- `not_linked`: belum ada hubungan sinkronisasi valid dengan mesin.

## Push user

Push user harus dilakukan sebelum finger/face/card agar PIN tersedia pada mesin. Sistem membersihkan nama dan membatasi panjang field sesuai command protocol.

## Pull template

Template yang diterima melalui operation log:

1. dipetakan ke employee berdasarkan PIN;
2. disimpan di Storage privat;
3. diberi checksum SHA-256;
4. direkam format/slot/device;
5. enrollment diperbarui.

Jangan mengubah file template manual. Checksum mismatch membuat push gagal.

## Push template

1. Pilih employee/device atau bulk.
2. Queue push finger/face.
3. Mesin polling command.
4. Edge Function membaca asset dan memverifikasi checksum.
5. Command result memperbarui status.

Format template harus cocok dengan firmware target. `zk-text-v1` adalah format text yang dipertahankan dari operation log; format binary dikirim base64. Tidak ada konversi algoritma biometrik di browser/serverless.

## Card

Nomor card berada pada enrollment. Push card menggunakan user command dengan card number. Validasi panjang dilakukan, tetapi encoding/desimal/hex harus mengikuti firmware.

## Privasi

Template biometrik merupakan data sangat sensitif. Terapkan:

- dasar hukum dan persetujuan yang sesuai;
- role minimum untuk `devices.read/update/delete`;
- retensi dan penghapusan saat employee keluar;
- bucket privat dan backup terenkripsi;
- larangan ekspor template tanpa kebutuhan bisnis;
- incident response dan token rotation;
- audit akses serta perubahan.

## Penghapusan

Soft-delete employee tidak otomatis menghapus template agar audit/retensi dapat diterapkan. Prosedur offboarding harus mencakup command delete vendor bila didukung, penghapusan enrollment/asset sesuai kebijakan, dan penghapusan object Storage. Repository tidak mengirim command delete biometric generik karena dialect dan dampaknya berbeda antar firmware.

## Checklist kompatibilitas

- Algoritma/template version sama.
- Slot numbering sesuai.
- Maksimum finger/face per user.
- Panjang PIN/card/name.
- Face image versus face template.
- Dukungan HTTPS dan command polling.
- Return code command terdokumentasi.
- Time zone/NTP benar.
