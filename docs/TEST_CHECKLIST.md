# Checklist Pengujian dan Go-Live AttendFlow

Gunakan salinan checklist ini untuk setiap release. Isi kolom bukti di issue, pull request, atau release note perusahaan. Item perangkat/vendor yang tidak digunakan harus ditandai `N/A` beserta alasannya, bukan dibiarkan kosong.

## A. Source dan dependency

- [ ] Branch release bersih dan seluruh file yang diperlukan sudah ter-commit.
- [ ] Tidak ada `.env`, service-role key, app secret, token mesin, atau data produksi di Git.
- [ ] Node.js memenuhi `package.json#engines`.
- [ ] `package-lock.json` ada dan sesuai dengan `package.json`.
- [ ] Clone bersih berhasil menjalankan `npm ci --no-audit --no-fund`.
- [ ] `npm ls --depth=0` tidak menunjukkan missing/invalid/extraneous dependency.
- [ ] `npm audit` telah ditinjau; setiap temuan memiliki fix atau risk acceptance tertulis.
- [ ] Tidak digunakan `--force` atau `--legacy-peer-deps` untuk menyembunyikan konflik.

## B. Pemeriksaan otomatis

- [ ] `npm run test:core` lulus.
- [ ] `npm run verify:static` lulus.
- [ ] `npm run typecheck` lulus.
- [ ] `npm run lint` lulus tanpa warning.
- [ ] `npm run test` lulus.
- [ ] `npm run build` lulus dan menghasilkan `dist/`.
- [ ] `npm run preview` dapat melayani bundle production.
- [ ] `npm run dev` berjalan tanpa runtime error.
- [ ] Browser console tidak memiliki uncaught error pada login dan dashboard.

## C. Konfigurasi frontend

- [ ] `.env.example` memuat seluruh variable frontend yang digunakan.
- [ ] Hanya URL dan publishable/anon key Supabase yang memakai prefix `VITE_`.
- [ ] `VITE_APP_URL` sesuai domain deployment.
- [ ] Locale default adalah `id`, `en`, atau `zh`.
- [ ] Zona waktu default sesuai kebijakan perusahaan.
- [ ] Service-role key tidak pernah tersedia pada bundle browser.

## D. UI, bahasa, dan aksesibilitas

- [ ] Indonesia lengkap pada menu, tombol, dialog, filter, validasi, toast, dan error.
- [ ] English lengkap pada elemen yang sama.
- [ ] 中文 lengkap pada elemen yang sama.
- [ ] Pergantian bahasa berlangsung realtime tanpa reload.
- [ ] Light, dark, dan system theme berfungsi.
- [ ] Sidebar collapse/expand, mobile drawer, dan persistensi state berfungsi.
- [ ] Keyboard navigation dan focus ring dapat digunakan.
- [ ] Dialog memiliki judul/deskripsi dan focus tidak terjebak salah.
- [ ] Kontras teks/status diperiksa.
- [ ] Desktop, tablet, dan layar 360 px dapat digunakan tanpa overflow kritis.
- [ ] Loading, skeleton, empty state, dan error state tampil pada semua data page.

## E. Authentication dan organisasi

- [ ] Public signup dinonaktifkan pada production.
- [ ] User pertama dapat login dan menyelesaikan onboarding.
- [ ] Invite user melalui Edge Function berhasil.
- [ ] Logout menghapus sesi lokal dan kembali ke login.
- [ ] Redirect URL Auth hanya berisi domain resmi/local yang diperlukan.
- [ ] User tanpa membership tidak dapat membuka halaman organisasi.
- [ ] Pergantian organisasi tidak mencampur cache/data.

## F. RLS dan permission

- [ ] Admin: akses yang diharapkan lulus.
- [ ] HR: akses yang diharapkan lulus dan akses finance sensitif ditolak.
- [ ] Supervisor: akses operasional/approval sesuai matriks.
- [ ] Leader: akses tim sesuai matriks.
- [ ] Finance: payroll lulus dan administrasi non-finance dibatasi.
- [ ] Manager: read/approval sesuai matriks.
- [ ] Viewer: hanya read yang diizinkan.
- [ ] Explicit denial mengalahkan grant.
- [ ] User organisasi A tidak dapat membaca/menulis organisasi B.
- [ ] Akses langsung PostgREST/RPC tetap mengikuti permission, bukan hanya route guard UI.
- [ ] Audit log tidak dapat diubah/dihapus oleh client.

## G. Data page universal

Untuk minimal satu halaman besar dan satu halaman sederhana:

- [ ] Search dengan debounce.
- [ ] Advanced filter.
- [ ] Reset filter.
- [ ] Sort ascending/descending.
- [ ] Pagination.
- [ ] Refresh.
- [ ] Pilih satu, banyak, dan semua halaman.
- [ ] Bulk update.
- [ ] Bulk delete dengan confirm dialog.
- [ ] Import spreadsheet dengan preview/error row.
- [ ] Export spreadsheet.
- [ ] Export CSV dan formula injection protection.
- [ ] Export PDF.
- [ ] Print.
- [ ] Empty/loading/error state.
- [ ] Aksi import/export/print/bulk tercatat pada audit.

## H. Karyawan dan master data

- [ ] ID/nomor karyawan otomatis unik.
- [ ] NIK dan field wajib divalidasi.
- [ ] Foto dapat diunggah, dipreview, dan diperbesar melalui signed URL.
- [ ] Dokumen KTP/KK tersimpan pada bucket privat.
- [ ] Wizard registration mempertahankan data antarstep.
- [ ] Departemen, jabatan, shift, dan status dapat dipilih.
- [ ] Edit dan archive/nonaktif tidak merusak referensi absensi/payroll.
- [ ] Data lintas organisasi ditolak oleh FK/RLS.

## I. Shift dan attendance

- [ ] Shift tetap.
- [ ] Shift bergilir.
- [ ] Shift malam/cross-midnight.
- [ ] Shift libur.
- [ ] Grace period dan toleransi terlambat.
- [ ] Jam istirahat.
- [ ] Overtime threshold.
- [ ] Hadir normal.
- [ ] Terlambat.
- [ ] Pulang cepat.
- [ ] Alpha.
- [ ] Izin.
- [ ] Sakit.
- [ ] Cuti.
- [ ] Lembur.
- [ ] Duplicate punch tidak menggandakan hasil.
- [ ] Rekap harian/bulanan/riwayat konsisten.
- [ ] Zona waktu dan NTP menghasilkan work date yang benar.

## J. Payroll

- [ ] Profile gaji harian.
- [ ] Profile gaji mingguan.
- [ ] Profile gaji bulanan.
- [ ] Lembur per jam.
- [ ] Potongan terlambat, alpha, dan pulang cepat.
- [ ] Bonus, insentif, THR.
- [ ] BPJS dan pajak sesuai konfigurasi perusahaan.
- [ ] Kasbon, pinjaman, denda, dan adjustment.
- [ ] Generate payroll idempotent untuk periode yang sama.
- [ ] Submit dan approval mengikuti permission.
- [ ] Finalize mengunci perubahan yang dilarang.
- [ ] Slip gaji PDF dan print benar.
- [ ] Export spreadsheet/CSV benar.
- [ ] Total payroll dashboard sama dengan payroll finalized/period yang dimaksud.
- [ ] Hasil dibandingkan dengan sampel perhitungan manual Finance/HR.

## K. Dashboard dan realtime

- [ ] Seluruh KPI menampilkan nilai dengan scope organisasi.
- [ ] KPI hari ini mengikuti zona waktu organisasi.
- [ ] Enam grafik dapat dirender pada data kosong dan data nyata.
- [ ] Aktivitas terbaru terurut benar.
- [ ] Notifikasi sistem tampil dan dapat ditandai dibaca.
- [ ] Perubahan attendance/device/job memicu invalidation realtime.
- [ ] Reconnect setelah koneksi realtime terputus tidak menggandakan subscription.

## L. Mesin dan biometrik

- [ ] Serial number mesin unik per organisasi.
- [ ] Token mesin hanya tampil saat dibuat/dirotasi dan database hanya menyimpan hash.
- [ ] Status online/offline berubah berdasarkan request valid dan threshold.
- [ ] Queue command menyimpan attempts/status/result/error.
- [ ] Pull log dapat dilacak.
- [ ] Push user/card dapat dilacak.
- [ ] Fingerprint/face template tersimpan privat dengan checksum.
- [ ] Format/algoritma template kompatibel dengan unit aktual.
- [ ] Retry dan stale lease recovery berjalan.

## M. ZKTeco/Solution X105 acceptance

Catat model, serial, firmware, dan mode koneksi pada bukti release.

- [ ] Menu ADMS/Cloud tersedia pada firmware unit.
- [ ] Kemampuan HTTP/HTTPS, port, path, dan token telah diverifikasi pada unit—bukan diasumsikan.
- [ ] Bila direct HTTPS didukung, koneksi langsung ke Edge Function lulus.
- [ ] Bila hanya HTTP port 80, relay lokal aktif dan health check lulus.
- [ ] Bila tidak ada ADMS, bridge SDK vendor ditetapkan sebagai komponen terpisah.
- [ ] Heartbeat dan ATTLOG realtime lulus.
- [ ] Offline log lalu sync lulus.
- [ ] Command polling/result lulus.
- [ ] Pull log lulus.
- [ ] Push user/card lulus jika didukung.
- [ ] Satu finger/face round-trip lulus jika digunakan.
- [ ] Batch minimal 1.000 log tidak hilang atau mengganda.
- [ ] Token rotation dan unknown serial rejection lulus.
- [ ] Mesin tidak diekspos langsung ke internet.

## N. Deli E+

- [ ] Credential disimpan di Vault/secret, bukan frontend.
- [ ] Validation endpoint lulus.
- [ ] Department sync lulus.
- [ ] Employee sync lulus.
- [ ] Device sync lulus.
- [ ] Attendance incremental sync lulus tanpa duplikasi.
- [ ] 429/5xx memicu retry yang dibatasi.
- [ ] Webhook signature dan idempotency lulus.
- [ ] Secret tidak muncul di log/audit.
- [ ] Payroll diperlakukan sebagai export/webhook perusahaan, bukan API native Deli.

## O. Audit dan keamanan

- [ ] Login/logout dicatat sesuai mekanisme yang diterapkan.
- [ ] Create/update/delete/import/export/payroll/attendance/sync/settings tercatat.
- [ ] Audit menyertakan actor, waktu, IP/user-agent/device context yang tersedia, correlation ID, dan entity.
- [ ] Password, token, secret, template biometrik, dan field sensitif tidak masuk audit payload.
- [ ] CSP, HSTS, nosniff, frame denial, referrer policy, dan permission policy aktif pada Vercel.
- [ ] XSS payload dirender sebagai teks atau disanitasi.
- [ ] CSV/spreadsheet formula injection dinetralisasi.
- [ ] Rate limit ADMS/webhook diuji.
- [ ] Service-role hanya berada di Edge Function secret.
- [ ] Storage bucket sensitif tetap private.

## P. Backup dan restore

- [ ] `BACKUP_ENCRYPTION_KEY` valid 32 byte dan tersimpan sebagai Function secret.
- [ ] Backup menghasilkan `.afbackup`, checksum, record count, dan job succeeded.
- [ ] File berada di path organisasi pada bucket privat.
- [ ] Restore dengan confirmation salah ditolak.
- [ ] Restore latest backup lulus pada staging.
- [ ] Restore path organisasi lain ditolak.
- [ ] Merge/upsert semantics dipahami dan diterima.
- [ ] Auth users, Vault secrets, dan Storage binaries diuji/ditangani terpisah sesuai dokumentasi.
- [ ] Recovery drill dan bukti perbandingan data tersimpan.

## Q. GitHub, Supabase, dan Vercel

- [ ] GitHub Actions menjalankan clean install dan `npm run check`.
- [ ] SQL berhasil pada project staging baru.
- [ ] Semua Edge Functions ter-deploy dengan setting JWT yang benar.
- [ ] Function secrets lengkap.
- [ ] Scheduler dikonfigurasi dengan secret yang sama.
- [ ] Vercel build command `npm run build` dan output `dist`.
- [ ] SPA rewrite membuat nested route tidak 404.
- [ ] Environment Preview dan Production dipisahkan bila diperlukan.
- [ ] Supabase Site URL/Redirect URLs sesuai domain Vercel.
- [ ] Production smoke test lulus.
- [ ] Rollback frontend, Function, dan database telah didokumentasikan.

## R. Persetujuan akhir

- [ ] Engineering menyetujui hasil otomatis dan review source.
- [ ] HR menyetujui workflow attendance/cuti.
- [ ] Finance menyetujui rumus dan sampel payroll.
- [ ] IT menyetujui network/relay/perangkat dan monitoring.
- [ ] Security/owner menerima residual risk dan quota free tier.
- [ ] Backup/restore drill lulus.
- [ ] Release tag dan checksum artefak ZIP dicatat.
