import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

for (const relativePath of ['../src/services/export-service.ts', '../src/services/payroll-service.ts']) {
  test(`${relativePath} uses the jsPDF-AutoTable v5 named export`, async () => {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(source, /(?:const\s+\{\s*autoTable\s*\}\s*=|\{\s*autoTable\s*\}\s*\])[^;\n]*import\('jspdf-autotable'\)/);
    assert.doesNotMatch(source, /import\('jspdf-autotable'\)[\s\S]{0,30}\.default\b/);
  });
}
