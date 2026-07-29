import assert from 'node:assert/strict';
import test from 'node:test';
import { extractModuleSpecifiers, packageNameFromSpecifier, resolveLocalModule } from '../scripts/source-audit-helpers.mjs';

test('extracts static and literal dynamic imports', () => {
  const source = [
    `${'im'}port x from './x';`,
    `${'ex'}port { y } from '@/y';`,
    `const z = ${'im'}port('zod');`
  ].join('\n');
  assert.deepEqual(extractModuleSpecifiers(source), ['./x', '@/y', 'zod']);
});

test('normalizes scoped and unscoped package names', () => {
  assert.equal(packageNameFromSpecifier('@tanstack/react-query/build'), '@tanstack/react-query');
  assert.equal(packageNameFromSpecifier('react-router-dom/server'), 'react-router-dom');
});

test('resolves TypeScript and index modules without requiring extensions', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'attendflow-audit-'));
  await mkdir(join(directory, 'feature'));
  await writeFile(join(directory, 'value.ts'), 'export const value = 1;');
  await writeFile(join(directory, 'feature', 'index.tsx'), 'export default null;');
  try {
    assert.equal(resolveLocalModule(join(directory, 'entry.ts'), './value'), join(directory, 'value.ts'));
    assert.equal(resolveLocalModule(join(directory, 'entry.ts'), './feature'), join(directory, 'feature', 'index.tsx'));
    assert.equal(resolveLocalModule(join(directory, 'entry.ts'), './missing'), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('ignores import-looking text inside comments and string literals', () => {
  const source = [
    "const fixture = `import fake from './fake';`;",
    "// export { fake } from './commented';",
    "/* import('./blocked') */",
    "import real from './real';"
  ].join('\n');
  assert.deepEqual(extractModuleSpecifiers(source), ['./real']);
});

test('ignores import-looking text inside regular expression literals', () => {
  const source = [
    "assert.match(value, /import \\{ x \\} from '\\.\\.\\/fake';/s);",
    "import real from './real';"
  ].join('\n');
  assert.deepEqual(extractModuleSpecifiers(source), ['./real']);
});

test('collects packages reachable from the browser entry module only', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { collectReachablePackageImports } = await import('../scripts/source-audit-helpers.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'attendflow-graph-'));
  await mkdir(join(directory, 'src'));
  await writeFile(join(directory, 'src', 'main.ts'), "import './feature'; import 'react';");
  await writeFile(join(directory, 'src', 'feature.ts'), "export { z } from 'zod';");
  await writeFile(join(directory, 'src', 'dead.ts'), "import 'dexie';");
  try {
    const packages = collectReachablePackageImports(join(directory, 'src', 'main.ts'), join(directory, 'src'));
    assert.deepEqual([...packages].sort(), ['react', 'zod']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
