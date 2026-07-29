import { sanitizeText } from '@/utils/sanitize';
import { buildSpreadsheetRecord, normalizeSpreadsheetHeaders } from '@/utils/spreadsheet';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 200;

export async function parseExcel(file: File): Promise<Record<string, unknown>[]> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Unsupported file format');
  if (file.size > MAX_FILE_SIZE) throw new Error('File exceeds 10 MB');

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer(), {
    ignoreNodes: ['dataValidations', 'extLst', 'hyperlinks', 'pageMargins', 'pageSetup', 'printOptions', 'drawing'],
  });

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0 || sheet.columnCount === 0) return [];
  if (sheet.rowCount - 1 > MAX_ROWS) throw new Error(`Import is limited to ${MAX_ROWS} rows`);
  if (sheet.columnCount > MAX_COLUMNS) throw new Error(`Import is limited to ${MAX_COLUMNS} columns`);

  const headerValues = Array.from({ length: sheet.columnCount }, (_, index) => sheet.getRow(1).getCell(index + 1).value);
  const headers = normalizeSpreadsheetHeaders(headerValues);
  const records: Record<string, unknown>[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = headers.map((_, index) => row.getCell(index + 1).value);
    const record = buildSpreadsheetRecord(headers, values);
    if (!record) continue;
    records.push(Object.fromEntries(Object.entries(record).map(([key, value]) => [
      key,
      typeof value === 'string' ? sanitizeText(value) : value,
    ])));
  }

  return records;
}
