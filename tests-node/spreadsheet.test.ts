import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSpreadsheetRecord,
  normalizeSpreadsheetHeaders,
  spreadsheetCellToPrimitive,
} from '../src/utils/spreadsheet.ts';

test('converts Excel cell values without evaluating formulas', () => {
  assert.equal(spreadsheetCellToPrimitive('Ayu'), 'Ayu');
  assert.equal(spreadsheetCellToPrimitive(1250), 1250);
  assert.equal(spreadsheetCellToPrimitive(true), true);
  assert.equal(spreadsheetCellToPrimitive(new Date('2026-07-29T08:00:00.000Z')), '2026-07-29T08:00:00.000Z');
  assert.equal(spreadsheetCellToPrimitive({ text: 'Portal', hyperlink: 'https://example.com' }), 'Portal');
  assert.equal(spreadsheetCellToPrimitive({ richText: [{ text: 'Nama ' }, { text: 'Lengkap' }] }), 'Nama Lengkap');
  assert.equal(spreadsheetCellToPrimitive({ formula: '1+1', result: 2 }), 2);
  assert.equal(spreadsheetCellToPrimitive({ formula: 'WEBSERVICE("https://example.com")' }), null);
  assert.equal(spreadsheetCellToPrimitive({ error: '#VALUE!' }), null);
});

test('normalizes duplicate and empty spreadsheet headers deterministically', () => {
  assert.deepEqual(
    normalizeSpreadsheetHeaders([' NIK ', 'Nama Karyawan', 'Nama Karyawan', null]),
    ['nik', 'nama_karyawan', 'nama_karyawan_2', 'column_4'],
  );
});

test('builds a record and skips entirely empty spreadsheet rows', () => {
  const headers = ['nik', 'nama'];
  assert.deepEqual(buildSpreadsheetRecord(headers, ['EMP-001', 'Ayu']), { nik: 'EMP-001', nama: 'Ayu' });
  assert.equal(buildSpreadsheetRecord(headers, [null, '   ']), null);
});
