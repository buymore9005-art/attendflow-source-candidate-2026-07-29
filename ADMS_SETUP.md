# Setup Mesin Solution X105, ADMS/PUSH, dan LAN

## Kesimpulan teknis sebelum konfigurasi

Spesifikasi resmi Solution X105 menjamin komunikasi **TCP/IP (RJ45)** dan USB. Halaman SDK resmi Solution juga mencantumkan X105 sebagai perangkat yang kompatibel dengan **ZKEM SDK** untuk koneksi LAN/WAN, pengambilan log, monitoring, dan pengaturan perangkat. Namun, spesifikasi resmi X105 tersebut **tidak menyatakan ADMS/PUSH sebagai fitur standar**.

Karena firmware dapat berbeda menurut tahun, distributor, dan region, jangan menganggap seluruh unit X105 memiliki ADMS hanya berdasarkan nama model. Periksa unit aktual. Direct cloud-push hanya layak dipakai ketika menu firmware benar-benar menyediakan **ADMS / Cloud Server / PUSH** dan hasil acceptance test menunjukkan route serta command yang kompatibel.

AttendFlow menyediakan tiga jalur yang berbeda:

| Kondisi unit aktual | Jalur yang benar | Komponen tambahan |
|---|---|---|
| Firmware dapat melakukan HTTPS ke URL penuh, mengirim `SN`, dan membawa token | Direct ADMS ke Supabase Edge Function | Tidak ada |
| Firmware memiliki ADMS tetapi hanya menerima HTTP host/port dan fixed path `/iclock/*` | ADMS melalui relay yang tersedia di `middleware/adms-relay` | Node.js service kecil yang selalu aktif di LAN |
| Unit hanya menyediakan ZKEM SDK/TCP LAN dan tidak memiliki ADMS | Bridge lokal berbasis SDK vendor | Windows service/gateway lokal; **tidak disertakan** karena membutuhkan SDK/ActiveX vendor, lisensi/distribusi vendor, dan perangkat untuk acceptance test |

Browser, Vercel, dan Supabase tidak dapat membuka koneksi langsung ke alamat privat seperti `192.168.x.x:4370`. Port perangkat juga tidak boleh diekspos ke internet.

## 1. Verifikasi unit X105 aktual

Catat bukti berikut sebelum mengaktifkan fitur di AttendFlow:

1. Foto label model dan serial number.
2. Versi firmware lengkap.
3. Menu komunikasi yang tersedia.
4. Apakah ada menu **ADMS**, **Cloud Server**, atau **PUSH**.
5. Apakah server dapat diisi sebagai hostname, bukan hanya alamat IP.
6. Apakah perangkat mendukung HTTPS dan sertifikat publik modern.
7. Apakah perangkat menerima custom path, query token, atau header/token field.
8. Format request yang benar-benar dikirim, termasuk path dan parameter `SN`.
9. Dialect command yang diterima untuk log, user, finger, face, atau card.

Base X105 adalah perangkat fingerprint. Jangan mengaktifkan face capability. Card capability hanya boleh diaktifkan pada varian yang benar-benar memiliki reader, misalnya X105-ID, dan tetap harus diuji.

## 2. Capability gate di AttendFlow

Saat membuat mesin, isi model dan firmware, lalu gunakan field berikut berdasarkan hasil uji nyata:

- `capabilities_verified`
- `supports_attendance_push`
- `supports_log_pull`
- `supports_user_push`
- `supports_fingerprint_push`
- `supports_face_push`
- `supports_card_push`
- `requires_lan_bridge`
- `capability_notes`

Tombol pull/push tidak tampil dan Edge Function mengembalikan HTTP `409 device_capability_not_verified` sampai capability spesifik telah ditandai terverifikasi. Flag ini bukan pengganti acceptance test; isilah hanya setelah model dan firmware yang sama lulus uji.

Untuk relay HTTP ADMS yang disertakan, gunakan protocol `adms` dan set `requires_lan_bridge=true`. Nilai protocol `lan_bridge` disediakan untuk bridge ZKEM/proprietary eksternal dan tidak mengaktifkan command worker bawaan.

## 3. Deploy Edge Functions

```bash
supabase functions deploy adms --no-verify-jwt
supabase functions deploy device-command
```

Endpoint upstream:

```text
https://PROJECT_REF.supabase.co/functions/v1/adms
```

Route yang diimplementasikan:

| Route | Method | Fungsi |
|---|---|---|
| `/iclock/cdata` | GET | Mengirim option response |
| `/iclock/cdata?table=ATTLOG` | POST | Menerima log absensi |
| `/iclock/cdata?table=OPERLOG` | POST | Menerima operation log yang kompatibel |
| `/iclock/getrequest` | GET | Mengambil command yang sudah di-queue |
| `/iclock/devicecmd` | POST | Mengirim hasil command |
| `/iclock/registry` | GET/POST | Option/registration response yang kompatibel |
| `/health` | GET | Health endpoint setelah autentikasi perangkat |

`--no-verify-jwt` diperlukan karena firmware tidak memiliki Supabase user JWT. Keamanan endpoint tetap menggunakan token unik per perangkat, rate limit, batas payload, dan serial number.

## 4. Registrasi mesin dan token

1. Login sebagai Admin/HR dengan permission `devices.create`.
2. Buka **Mesin Absensi → Tambah Mesin**.
3. Isi vendor, model, firmware, protocol, serial number, lokasi, dan IP/port hanya sebagai inventaris.
4. Simpan record.
5. Jalankan **Rotasi Token Mesin**.
6. Simpan token yang hanya ditampilkan sekali.

Database menyimpan hash token. Token berbeda wajib digunakan untuk setiap serial number.

## 5. Mode A — direct ADMS ke Supabase

Gunakan mode ini hanya apabila firmware aktual dapat memenuhi semuanya:

- outbound HTTPS port 443;
- hostname DNS publik;
- custom base path `/functions/v1/adms` atau full URL;
- parameter serial `SN`;
- token melalui query `token` atau field yang benar-benar diteruskan menjadi header `x-device-token`.

Contoh konseptual request:

```text
POST https://PROJECT_REF.supabase.co/functions/v1/adms/iclock/cdata?SN=X105-001&table=ATTLOG&token=TOKEN_UNIK
```

Banyak firmware lama hanya menerima host dan port serta selalu memanggil `/iclock/*`. Firmware seperti itu tidak dapat diarahkan langsung ke path Supabase; gunakan Mode B.

## 6. Mode B — ADMS melalui relay HTTP LAN

Relay dependency-free tersedia di:

```text
middleware/adms-relay/
```

Relay menerima `/iclock/*` di LAN, memilih token berdasarkan `SN`, lalu meneruskan request ke Supabase melalui HTTPS dengan header `x-device-token`. Relay tidak menyimpan data bisnis.

### Menyiapkan relay

```bash
cd middleware/adms-relay
cp .env.example .env
cp device-tokens.example.json device-tokens.json
chmod 600 .env device-tokens.json
cd ../..
npm run relay:adms
```

Konfigurasi mesin:

```text
Server = IP LAN komputer relay
Port   = 8080
HTTPS  = off pada hop LAN
Path   = default /iclock/*
```

Hop relay ke Supabase tetap wajib HTTPS. Bind relay hanya pada LAN/VPN, allow-list IP perangkat pada firewall, dan jangan membuka port relay ke internet.

Baca panduan operasional di `middleware/adms-relay/README.md`.

## 7. Mode C — X105 hanya ZKEM SDK/TCP

Mode ini membutuhkan bridge lokal karena cloud tidak dapat menarik log dari socket LAN. SDK resmi Solution untuk X105 didistribusikan sebagai ActiveX/DLL beserta contoh bahasa pemrograman. Implementasi produksi yang realistis umumnya berupa Windows Service pada komputer yang selalu aktif dan memiliki SDK vendor terinstal.

Bridge tersebut harus:

1. Terhubung ke IP perangkat melalui SDK vendor.
2. Mengambil log menggunakan cursor/checkpoint lokal.
3. Mengubah event menjadi payload canonical dengan idempotency key.
4. Mengirim event melalui HTTPS ke endpoint ingestion yang diautentikasi.
5. Menyimpan retry queue lokal secara durable.
6. Menyediakan health/last-sync monitoring.
7. Tidak mengunggah template biometrik kecuali format dan dasar hukumnya telah diverifikasi.

Repository ini tidak menyertakan bridge ZKEM palsu. Tanpa DLL/SDK resmi, hak distribusi, unit X105, dan acceptance test hardware, kode tersebut tidak dapat dinyatakan production-ready. Gunakan gateway resmi Solution atau bangun service internal menggunakan SDK yang diperoleh langsung dari Solution.

## 8. Format ATTLOG yang diterima

Parser menerima format tab-separated umum:

```text
PIN<TAB>YYYY-MM-DD HH:mm:ss<TAB>status<TAB>verify<TAB>workcode<TAB>reserved
```

Setiap event mendapat idempotency key dari serial, PIN, waktu, dan status. Duplikat diabaikan. PIN dipetakan melalui enrollment, `fingerprint_pin`, atau `employee_no`. Trigger database kemudian menentukan hari kerja dan shift, termasuk cross-midnight.

Format timestamp dan timezone harus diuji pada firmware aktual. Sinkronkan NTP perangkat dan zona waktu organisasi sebelum acceptance test.

## 9. Command polling dan test connection

Tombol **Uji Koneksi** tidak melakukan ping ke IP LAN. Tombol membuat command `check`; perangkat harus mengambilnya melalui `/iclock/getrequest` lalu mengirim hasil ke `/iclock/devicecmd`.

Status online berarti server baru menerima request perangkat yang lolos autentikasi. Status tersebut bukan bukti bahwa seluruh command dialect didukung.

## 10. Pull log dan push data

Command yang tersedia di source adalah dialect PUSH generik:

- query attendance log;
- push user;
- push card;
- push fingerprint template;
- push face template.

Tidak ada jaminan seluruh command didukung X105. Aktifkan satu capability pada satu waktu, uji satu karyawan, periksa return code, lalu catat hasil di `capability_notes`.

Template fingerprint bersifat algorithm/firmware-specific. Server tidak mengonversi algoritma template. Push fingerprint hanya boleh diaktifkan setelah satu template berhasil round-trip pada model dan firmware target. Face harus tetap nonaktif untuk base X105.

## 11. Retry dan observability

`device_commands` menyimpan attempt, lease, `available_at`, result, dan error. Scheduled maintenance mengembalikan lease basi ke queue dengan capped exponential backoff. Periksa:

- Edge Function logs;
- `device_commands`;
- `raw_attendance_logs`;
- audit log;
- `last_seen_at`, `last_sync_at`, dan `capability_notes`.

## 12. Keamanan minimum

- Token unik per serial; database hanya menyimpan hash.
- Jangan menggunakan satu token global.
- Jangan membuka port 4370/perangkat ke internet.
- Relay hanya pada LAN/VPN dengan firewall allow-list.
- Payload maksimal 2 MB dan request dikenai rate limit.
- Bucket biometrik privat; checksum diverifikasi sebelum push.
- Service-role hanya berada di Edge Function.
- Perlakukan template biometrik sebagai data sangat sensitif dan terapkan dasar hukum, retensi, serta pembatasan role.

## 13. Acceptance test wajib per model dan firmware

Luluskan hanya capability yang berhasil diuji:

1. Heartbeat dan autentikasi token.
2. ATTLOG realtime.
3. Log saat internet putus lalu sync kembali.
4. Timestamp, timezone, dan cross-midnight.
5. Duplicate event/idempotensi.
6. Command poll dan return code.
7. Pull log pada rentang kecil.
8. Push satu user.
9. Push card hanya pada model ber-reader.
10. Fingerprint round-trip satu user.
11. Retry, token rotation, dan offline detection.
12. Batch minimal 1.000 log tanpa kehilangan data.

Hasil harus dicatat di `docs/TEST_CHECKLIST.md`. Source code tidak dapat menggantikan pengujian pada perangkat fisik.
