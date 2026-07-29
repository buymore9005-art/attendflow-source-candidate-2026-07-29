# AttendFlow ADMS LAN Relay

Relay ini diperlukan ketika firmware ADMS hanya menerima alamat server HTTP berupa host/port dan selalu memanggil `/iclock/*`, tetapi tidak dapat memakai HTTPS, custom base path Supabase, query token, atau custom header.

Relay menerima request mesin di LAN, mencari token unik berdasarkan parameter `SN`, lalu meneruskan request ke Supabase Edge Function melalui HTTPS dengan header `x-device-token`. Relay tidak menyimpan data absensi dan bukan backend bisnis; seluruh data tetap disimpan di Supabase.

Relay HTTP ini **bukan bridge ZKEM**: ia tidak memuat ActiveX/DLL vendor, tidak menghubungi TCP port 4370, dan hanya dapat digunakan bila firmware perangkat memang sudah berbicara HTTP ADMS/PUSH.

## Persyaratan

- Node.js 20.19 atau lebih baru; Node.js 22 LTS direkomendasikan.
- Komputer/Raspberry Pi/mini PC yang selalu aktif di jaringan mesin.
- Akses outbound HTTPS ke domain project Supabase.
- Mesin benar-benar memiliki menu ADMS/PUSH. Relay ini **tidak** mengimplementasikan protokol proprietary ZKEM TCP/port 4370.

## Konfigurasi

```bash
cd middleware/adms-relay
cp .env.example .env
cp device-tokens.example.json device-tokens.json
```

Isi `UPSTREAM_BASE_URL`. Dari aplikasi, rotasi token tiap mesin dan masukkan pasangan serial/token ke `device-tokens.json`. Batasi permission file:

```bash
chmod 600 .env device-tokens.json
```

Jalankan dari root repository:

```bash
npm run relay:adms
```

Health check lokal:

```bash
curl http://127.0.0.1:8080/healthz
```

Konfigurasi mesin ADMS ke IP LAN relay, port `8080`, HTTP, tanpa base path. Mesin akan memanggil `/iclock/cdata`, `/iclock/getrequest`, dan `/iclock/devicecmd`.

Sebagian firmware hanya menyediakan port server `80`. Dalam kondisi itu, jangan menjalankan proses Node sebagai `root`. Pertahankan relay pada port tinggi seperti `8080`, lalu gunakan reverse proxy LAN pada port 80 atau aturan redirect firewall/NAT yang dikelola administrator. Batasi listener port 80 hanya pada interface/subnet mesin.

## Menjalankan sebagai service Linux

Contoh unit tersedia di `attendflow-adms-relay.service.example`. Buat user service tanpa login, salin repository ke `/opt/attendflow`, lalu instal unit:

```bash
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin attendflow
sudo install -o root -g root -m 0644 \
  middleware/adms-relay/attendflow-adms-relay.service.example \
  /etc/systemd/system/attendflow-adms-relay.service
sudo chown -R root:attendflow /opt/attendflow/middleware/adms-relay
sudo chmod 640 /opt/attendflow/middleware/adms-relay/.env \
  /opt/attendflow/middleware/adms-relay/device-tokens.json
sudo systemctl daemon-reload
sudo systemctl enable --now attendflow-adms-relay
sudo systemctl status attendflow-adms-relay
```

Pastikan path executable Node pada `ExecStart` sesuai output `command -v node`. Unit contoh sengaja tidak memiliki Linux capability untuk bind ke port istimewa; terminasi port 80 dilakukan oleh reverse proxy atau firewall, bukan dengan menjalankan Node sebagai root.

## Batas keamanan

- Bind relay hanya pada interface LAN/VPN; jangan buka port relay ke internet.
- Gunakan firewall allow-list alamat IP mesin.
- Gunakan token berbeda per serial.
- Jangan commit `.env` atau `device-tokens.json`.
- Upstream produksi wajib HTTPS.
- Log relay tidak mencetak token atau payload biometrik.
