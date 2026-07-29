import { escapeSpreadsheetFormula, recordsToCsv, safeSpreadsheetValue } from '@/utils/export-safety';
import { safeFileName } from '@/utils/sanitize';
import { openPrintWindow } from '@/utils/print-window';

export interface ExportColumn<T> { key: string; label: string; value: (row: T) => unknown }

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(filename) || 'export';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function materialize<T>(rows: readonly T[], columns: readonly ExportColumn<T>[]): Record<string, unknown>[] {
  return rows.map((row) => Object.fromEntries(columns.map((column) => [column.label, safeSpreadsheetValue(column.value(row))])));
}

export function exportCsv<T>(rows: readonly T[], columns: readonly ExportColumn<T>[], filename: string): void {
  const keys = columns.map((column) => column.label);
  const csv = `\uFEFF${recordsToCsv(materialize(rows, columns), keys)}`;
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

export async function exportExcel<T>(rows: readonly T[], columns: readonly ExportColumn<T>[], filename: string): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AttendFlow';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({ width: Math.max(12, Math.min(40, column.label.length + 6)) }));
  sheet.addRow(columns.map((column) => column.label));
  sheet.addRows(rows.map((row) => columns.map((column) => safeSpreadsheetValue(column.value(row)))));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle' };
  if (columns.length > 0) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  const bytes = await workbook.xlsx.writeBuffer({ zip: { compression: 'DEFLATE', compressionOptions: { level: 6 } } });
  download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
}

export async function exportPdf<T>(rows: readonly T[], columns: readonly ExportColumn<T>[], filename: string, title: string): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: columns.length > 7 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(15); doc.text(title, 14, 14);
  autoTable(doc, {
    startY: 20,
    head: [columns.map((column) => column.label)],
    body: rows.map((row) => columns.map((column) => String(escapeSpreadsheetFormula(column.value(row))))),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 118, 110] },
    didDrawPage: (data) => { doc.setFontSize(8); doc.text(`${data.pageNumber}`, doc.internal.pageSize.getWidth() - 15, doc.internal.pageSize.getHeight() - 8); }
  });
  doc.save(`${safeFileName(filename)}.pdf`);
}

export function printRows<T>(rows: readonly T[], columns: readonly ExportColumn<T>[], title: string): void {
  const popup = openPrintWindow('width=1100,height=800');
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:12px Arial;padding:24px;color:#111}h1{font-size:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><h1>${escapeHtml(title)}</h1><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(column.value(row))}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
  popup.document.close();
  popup.focus();
}
