import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeSpreadsheetFormula, recordsToCsv } from '../src/utils/export-safety.ts';

test('escapes spreadsheet formula injection prefixes', () => {
  for (const value of ['=1+1', '+SUM(A1:A2)', '-2+3', '@cmd', '\tformula', '\rformula']) {
    assert.equal(escapeSpreadsheetFormula(value).startsWith("'"), true);
  }
  assert.equal(escapeSpreadsheetFormula('normal'), 'normal');
});

test('serializes CSV with escaped quotes, delimiters and formulas', () => {
  const csv = recordsToCsv([{ name: 'Ayu, "HR"', code: '=2+2' }], ['name', 'code']);
  assert.equal(csv, 'name,code\r\n"Ayu, ""HR""","\'=2+2"');
});

test('preserves primitive spreadsheet types while escaping only dangerous text', async () => {
  const { safeSpreadsheetValue } = await import('../src/utils/export-safety.ts');
  assert.equal(safeSpreadsheetValue(1250), 1250);
  assert.equal(safeSpreadsheetValue(true), true);
  assert.equal(safeSpreadsheetValue('=1+1'), "'=1+1");
  assert.equal(safeSpreadsheetValue(null), '');
});
