const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeSpreadsheetFormula(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

export type SafeSpreadsheetValue = string | number | boolean | Date;

export function safeSpreadsheetValue(value: unknown): SafeSpreadsheetValue {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value;
  return escapeSpreadsheetFormula(value);
}

function csvCell(value: unknown, delimiter: string): string {
  const text = escapeSpreadsheetFormula(value);
  const needsQuotes = text.startsWith("'") || text.includes(delimiter) || text.includes('\"') || /[\r\n]/.test(text);
  return needsQuotes ? `"${text.replaceAll('"', '""')}"` : text;
}

export function recordsToCsv<T extends Record<string, unknown>>(
  records: readonly T[],
  columns: readonly (keyof T & string)[],
  delimiter = ','
): string {
  const header = columns.map((column) => csvCell(column, delimiter)).join(delimiter);
  const rows = records.map((record) => columns.map((column) => csvCell(record[column], delimiter)).join(delimiter));
  return [header, ...rows].join('\r\n');
}
