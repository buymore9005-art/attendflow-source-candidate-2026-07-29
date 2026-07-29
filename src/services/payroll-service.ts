import { getSupabase } from '@/lib/supabase';
import type { PayrollItem } from '@/types/domain';
import { safeFileName } from '@/utils/sanitize';
import { openPrintWindow } from '@/utils/print-window';

export interface PayrollRunGenerationInput { organizationId: string; periodStart: string; periodEnd: string; frequency: 'daily' | 'weekly' | 'monthly'; notes: string | null }
export interface PayslipLabels {
  payslip: string;
  additions: string;
  deductions: string;
  base: string;
  overtime: string;
  bonus: string;
  incentive: string;
  thr: string;
  otherAddition: string;
  tax: string;
  bpjs: string;
  loan: string;
  cashAdvance: string;
  fine: string;
  late: string;
  absent: string;
  early: string;
  otherDeduction: string;
  gross: string;
  net: string;
}

export async function generatePayrollRun(input: PayrollRunGenerationInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('generate_payroll_run', { p_organization_id: input.organizationId, p_period_start: input.periodStart, p_period_end: input.periodEnd, p_frequency: input.frequency, p_notes: input.notes });
  if (error) throw error;
  return String(data);
}
export async function changePayrollRunStatus(runId: string, action: 'submit' | 'approve' | 'reject' | 'finalize'): Promise<void> {
  const { error } = await getSupabase().rpc('transition_payroll_run', { p_run_id: runId, p_action: action });
  if (error) throw error;
}
export async function listPayrollItems(runId: string): Promise<PayrollItem[]> {
  const { data, error } = await getSupabase().from('payroll_items').select('*,employee:employees(employee_no,full_name,bank_name,bank_account_number)').eq('payroll_run_id', runId).order('payslip_number');
  if (error) throw error;
  return (data ?? []) as PayrollItem[];
}

function htmlEscape(value: unknown): string { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character); }
export function printPayslip(item: PayrollItem, organizationName: string, labels: PayslipLabels, formatter: (value: number) => string): void {
  const popup = openPrintWindow('width=900,height=800');
  const additions: Array<[string, number]> = [
    [labels.base, item.base_pay], [labels.overtime, item.overtime_pay], [labels.bonus, item.bonus], [labels.incentive, item.incentive], [labels.thr, item.thr], [labels.otherAddition, item.other_addition]
  ];
  const deductions: Array<[string, number]> = [
    [labels.tax, item.tax], [labels.bpjs, item.bpjs], [labels.loan, item.loan], [labels.cashAdvance, item.cash_advance], [labels.fine, item.fine], [labels.late, item.late_deduction], [labels.absent, item.absence_deduction], [labels.early, item.early_leave_deduction], [labels.otherDeduction, item.other_deduction]
  ];
  const rows = (values: Array<[string, number]>) => values.map(([label, value]) => `<tr><td>${htmlEscape(label)}</td><td class="number">${htmlEscape(formatter(value))}</td></tr>`).join('');
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(item.payslip_number)}</title><style>body{font:13px Arial;color:#111;padding:32px}header{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:20px}h1{font-size:24px;margin:0}h2{font-size:15px;margin:0 0 8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}table{width:100%;border-collapse:collapse}td,th{padding:7px;border-bottom:1px solid #ddd}.number{text-align:right;font-variant-numeric:tabular-nums}.total{margin-top:24px;padding:16px;background:#eee;font-size:20px;display:flex;justify-content:space-between}button{margin-bottom:20px}@media print{button{display:none}body{padding:0}}</style></head><body><button onclick="window.print()">Print</button><header><div><h1>${htmlEscape(organizationName)}</h1><p>${htmlEscape(labels.payslip)}</p></div><div><strong>${htmlEscape(item.payslip_number)}</strong><p>${htmlEscape(item.employee?.employee_no)} · ${htmlEscape(item.employee?.full_name)}</p></div></header><div class="grid"><section><h2>${htmlEscape(labels.additions)}</h2><table>${rows(additions)}<tr><th>${htmlEscape(labels.gross)}</th><th class="number">${htmlEscape(formatter(item.gross_pay))}</th></tr></table></section><section><h2>${htmlEscape(labels.deductions)}</h2><table>${rows(deductions)}<tr><th>${htmlEscape(labels.deductions)}</th><th class="number">${htmlEscape(formatter(item.total_deductions))}</th></tr></table></section></div><div class="total"><strong>${htmlEscape(labels.net)}</strong><strong>${htmlEscape(formatter(item.net_pay))}</strong></div></body></html>`);
  popup.document.close(); popup.focus();
}

export async function downloadPayslipPdf(item: PayrollItem, organizationName: string, labels: PayslipLabels, formatter: (value: number) => string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(18); doc.text(organizationName, 14, 16);
  doc.setFontSize(11); doc.text(`${labels.payslip} ${item.payslip_number}`, 14, 24);
  doc.text(`${item.employee?.employee_no ?? ''} · ${item.employee?.full_name ?? ''}`, 14, 31);
  const rows = [
    [labels.base, formatter(item.base_pay), labels.tax, formatter(item.tax)],
    [labels.overtime, formatter(item.overtime_pay), labels.bpjs, formatter(item.bpjs)],
    [labels.bonus, formatter(item.bonus), labels.loan, formatter(item.loan)],
    [labels.incentive, formatter(item.incentive), labels.cashAdvance, formatter(item.cash_advance)],
    [labels.thr, formatter(item.thr), labels.fine, formatter(item.fine)],
    [labels.gross, formatter(item.gross_pay), labels.deductions, formatter(item.total_deductions)]
  ];
  autoTable(doc, { startY: 38, head: [[labels.additions, '', labels.deductions, '']], body: rows });
  doc.setFontSize(14); doc.text(`${labels.net}: ${formatter(item.net_pay)}`, 14, 105);
  doc.save(`${safeFileName(item.payslip_number)}.pdf`);
}
