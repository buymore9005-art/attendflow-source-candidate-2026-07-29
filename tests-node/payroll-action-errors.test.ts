import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/pages/payroll/PayrollRunsPage.tsx', 'utf8');

test('payslip print and download handlers surface failures through localized toast handling', () => {
  assert.match(source, /const handlePrintPayslip = \(item: PayrollItem\) => \{ try \{/);
  assert.match(source, /const handleDownloadPayslip = async \(item: PayrollItem\) => \{ try \{/);
  assert.match(source, /asErrorMessage\(error, t\)/);
  assert.match(source, /onClick=\{\(\) => handlePrintPayslip\(item\)\}/);
  assert.match(source, /onClick=\{\(\) => void handleDownloadPayslip\(item\)\}/);
});
