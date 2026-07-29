export type SpreadsheetPrimitive = string | number | boolean | null;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

export function spreadsheetCellToPrimitive(value: unknown): SpreadsheetPrimitive {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (!isRecord(value)) return null;

  if ('formula' in value || 'sharedFormula' in value) {
    return spreadsheetCellToPrimitive(value.result);
  }

  if (Array.isArray(value.richText)) {
    return value.richText
      .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }

  if (typeof value.text === 'string') return value.text;
  if ('error' in value) return null;
  return null;
}

function normalizeHeaderBase(value: unknown, index: number): string {
  const primitive = spreadsheetCellToPrimitive(value);
  const normalized = String(primitive ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return normalized || `column_${index + 1}`;
}

export function normalizeSpreadsheetHeaders(values: readonly unknown[]): string[] {
  const counts = new Map<string, number>();
  return values.map((value, index) => {
    const base = normalizeHeaderBase(value, index);
    const nextCount = (counts.get(base) ?? 0) + 1;
    counts.set(base, nextCount);
    return nextCount === 1 ? base : `${base}_${nextCount}`;
  });
}

export function buildSpreadsheetRecord(
  headers: readonly string[],
  values: readonly unknown[],
): Record<string, SpreadsheetPrimitive> | null {
  const record: Record<string, SpreadsheetPrimitive> = {};
  let hasValue = false;

  headers.forEach((header, index) => {
    const value = spreadsheetCellToPrimitive(values[index]);
    record[header] = value;
    if (value !== null && (typeof value !== 'string' || value.trim() !== '')) hasValue = true;
  });

  return hasValue ? record : null;
}
