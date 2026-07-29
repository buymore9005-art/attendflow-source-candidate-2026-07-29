# Panduan Payroll

## Prinsip

Payroll dibuat dari attendance record yang sudah dihitung, payroll profile efektif, dan financial adjustment yang belum diselesaikan. Semua perhitungan authoritative dilakukan oleh stored procedure Supabase; kalkulator TypeScript memakai formula sepadan untuk pengujian dan UI.

## 1. Payroll profile

Setiap karyawan dapat memiliki profile bertanggal efektif:

- base type: daily, weekly, monthly;
- daily/weekly/monthly salary;
- overtime hourly rate;
- late deduction per minute;
- absence deduction per day;
- early-leave deduction per minute;
- default bonus;
- tax percent;
- employee BPJS percent;
- work days per month;
- effective from/to.

Hanya profile paling baru yang overlap dengan periode payroll yang digunakan.

## 2. Data attendance

Untuk periode dan karyawan, sistem menghitung:

- attended days: status present atau late;
- absent days: status absent;
- overtime minutes;
- late minutes;
- early leave minutes.

Izin, sakit, cuti, hari libur, dan shift off tidak dihitung sebagai absent oleh query payroll. Kebijakan pembayaran status tersebut harus tercermin dalam base salary/profile/adjustment perusahaan.

## 3. Base pay

```text
Monthly = monthly_salary
Daily   = daily_salary × attended_days
Weekly  = weekly_salary × ceil(attended_days / 7)
```

Weekly mengikuti formula implementasi saat ini. Bila kebijakan perusahaan memakai jumlah minggu kalender atau prorata berbeda, ubah procedure dan test sebelum go-live.

## 4. Additions

```text
Overtime pay = overtime_minutes / 60 × overtime_hourly_rate
Gross pay    = base pay + overtime pay + bonus + incentive + THR + other addition
```

Bonus default profile ditambah bonus adjustment pada periode. Financial adjustment mendukung bonus, incentive, THR, loan, cash advance, fine, other addition, dan other deduction.

## 5. Deductions

```text
Late deduction       = late_minutes × late_deduction_per_minute
Absence deduction    = absent_days × absence_deduction_per_day
Early leave deduction= early_leave_minutes × early_deduction_per_minute
Tax                   = gross_pay × tax_percent / 100
BPJS                  = gross_pay × bpjs_employee_percent / 100
Total deductions      = tax + BPJS + loan + cash advance + fine
                        + late + absence + early leave + other deduction
Net pay               = gross_pay - total deductions
```

Nilai database menggunakan `numeric(18,2)`. UI IDR menampilkan mata uang sesuai locale.

## 6. Generate payroll

1. Pastikan absensi periode lengkap dan sudah direcalculate.
2. Pastikan payroll profile setiap karyawan aktif tersedia.
3. Masukkan adjustment yang berlaku.
4. Buka **Payroll → Proses Payroll → Generate**.
5. Pilih period start/end dan frequency.
6. Review total gross, deduction, net, dan item per karyawan.

Generate ulang run draft menghapus item lama, melepaskan settlement adjustment, menghitung ulang, lalu mengikat adjustment ke item baru. Run finalized tidak dapat diregenerate.

## 7. Approval workflow

```text
draft → pending → approved → finalized
                 ↘ rejected
```

- Submit memindahkan draft ke pending.
- Approve/reject memerlukan `payroll.approve`.
- Finalize memerlukan `payroll.finalize`.
- Finalized mengunci run/item melalui trigger; perubahan langsung ditolak.

Gunakan separation of duties: operator Finance membuat run, Manager/Finance approver menyetujui, pejabat finalizer mengunci.

## 8. Slip gaji

Dari detail run:

- print slip;
- download PDF;
- ekspor tabel ke XLSX/CSV/PDF;
- nomor slip dibuat otomatis dari prefix settings dan periode.

Slip menampilkan base, overtime, additions, deduction, gross, dan net. Logo/nama organisasi berasal dari settings.

## 9. Adjustment

Adjustment hanya ikut satu payroll item melalui `settled_payroll_item_id`. Untuk koreksi setelah finalized, jangan mengubah item lama; buat adjustment koreksi pada periode berikutnya atau prosedur reversal yang disetujui perusahaan.

## 10. Kontrol sebelum finalisasi

- Rekonsiliasi employee count dengan karyawan aktif.
- Cek karyawan tanpa profile payroll.
- Cek absent/late/overtime outlier.
- Rekonsiliasi adjustment terhadap dokumen sumber.
- Validasi pajak/BPJS dengan aturan yang berlaku.
- Cek net negatif atau tidak wajar.
- Ekspor draft untuk review Finance/HR.
- Pastikan approval audit tersedia.

## 11. Perubahan formula

Peraturan pajak, BPJS, THR, dan ketenagakerjaan berbeda menurut yurisdiksi dan dapat berubah. Repository menyediakan engine configurable dasar, bukan opini hukum/pajak. Perubahan formula harus:

1. ditulis sebagai test baru;
2. diterapkan di `generate_payroll_run` dan kalkulator TypeScript;
3. diuji terhadap contoh yang disetujui Finance;
4. dijalankan di staging;
5. didokumentasikan dan di-audit.
