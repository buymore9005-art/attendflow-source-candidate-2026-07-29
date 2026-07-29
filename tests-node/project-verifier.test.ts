import assert from 'node:assert/strict';
import test from 'node:test';
import { stripLeadingSqlComments } from '../scripts/verify-project-helpers.mjs';

test('strips leading SQL comments before transaction validation', () => {
  const sql = `-- schema bootstrap\n/* generated safely */\n\nBEGIN;\nselect 1;\nCOMMIT;\n`;
  assert.match(stripLeadingSqlComments(sql), /^BEGIN;/i);
});

test('does not strip comments that appear after executable SQL', () => {
  const sql = `BEGIN;\n-- keep this body comment\nselect 1;\nCOMMIT;\n`;
  assert.equal(stripLeadingSqlComments(sql), sql);
});

test('browser TypeScript project excludes Deno Edge Function sources', async () => {
  const { readFile } = await import('node:fs/promises');
  const config = JSON.parse(await readFile(new URL('../tsconfig.app.json', import.meta.url), 'utf8')) as { include?: string[] };
  assert.deepEqual(config.include, ['src']);
});

test('Vite config includes Vitest config types when test options share the file', async () => {
  const { readFile } = await import('node:fs/promises');
  const config = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /^\/\/\/ <reference types="vitest\/config" \/>/m);
});

test('Vite alias uses an ESM-safe import.meta.url path', async () => {
  const { readFile } = await import('node:fs/promises');
  const config = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /\b__dirname\b/);
  assert.match(config, /fileURLToPath\(new URL\('\.\/src', import\.meta\.url\)\)/);
});

test('package exposes the dependency-free ADMS relay command', async () => {
  const { readFile } = await import('node:fs/promises');
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts?: Record<string, string> };
  assert.equal(packageJson.scripts?.['relay:adms'], 'node middleware/adms-relay/server.mjs');
});

test('all runtime environment names are documented in example files', async () => {
  const { readFile } = await import('node:fs/promises');
  const { readdir } = await import('node:fs/promises');
  const root = new URL('../', import.meta.url);
  const frontend = await readFile(new URL('../src/lib/env.ts', import.meta.url), 'utf8');
  const shared = await readFile(new URL('../supabase/functions/_shared/supabase.ts', import.meta.url), 'utf8');
  const crypto = await readFile(new URL('../supabase/functions/_shared/crypto.ts', import.meta.url), 'utf8');
  const admin = await readFile(new URL('../supabase/functions/admin-users/index.ts', import.meta.url), 'utf8');
  const scheduler = await readFile(new URL('../supabase/functions/scheduled-maintenance/index.ts', import.meta.url), 'utf8');
  const deli = await readFile(new URL('../supabase/functions/deli-sync/index.ts', import.meta.url), 'utf8');
  void readdir; void root;
  const source = [frontend, shared, crypto, admin, scheduler, deli].join('\n');
  const names = new Set<string>();
  for (const match of source.matchAll(/(?:import\.meta\.env\.|Deno\.env\.get\(['"])([A-Z][A-Z0-9_]+)/g)) names.add(match[1]!);
  const examples = [
    await readFile(new URL('../.env.example', import.meta.url), 'utf8'),
    await readFile(new URL('../supabase/functions/.env.example', import.meta.url), 'utf8')
  ].join('\n');
  const documented = new Set(examples.split(/\r?\n/).map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]).filter(Boolean));
  assert.deepEqual([...names].filter((name) => !documented.has(name)).sort(), []);
});

test('the full check command includes static project verification', async () => {
  const { readFile } = await import('node:fs/promises');
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { scripts?: Record<string, string> };
  assert.match(packageJson.scripts?.check ?? '', /npm run verify:static/);
});

test('extracts npm package roots from scoped and unscoped imports', async () => {
  const { packageRoot } = await import('../scripts/verify-project-helpers.mjs');
  assert.equal(packageRoot('@tanstack/react-query/build'), '@tanstack/react-query');
  assert.equal(packageRoot('react/jsx-runtime'), 'react');
  assert.equal(packageRoot('node:path'), null);
  assert.equal(packageRoot('@/lib/utils'), null);
});

test('resolves alias and relative TypeScript imports to real files', async () => {
  const { resolveLocalImport } = await import('../scripts/verify-project-helpers.mjs');
  const root = new URL('../', import.meta.url);
  const importer = new URL('../src/app/App.tsx', import.meta.url);
  assert.match(resolveLocalImport(root, importer, '@/lib/env') ?? '', /src\/lib\/env\.ts$/);
  assert.match(resolveLocalImport(root, importer, './App') ?? '', /src\/app\/App\.tsx$/);
  assert.equal(resolveLocalImport(root, importer, './DoesNotExist'), null);
});

test('declares the DOM peer dependency required by React Testing Library 16', async () => {
  const { readFile } = await import('node:fs/promises');
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    devDependencies?: Record<string, string>;
  };
  assert.match(packageJson.devDependencies?.['@testing-library/react'] ?? '', /^\^16\./);
  assert.match(packageJson.devDependencies?.['@testing-library/dom'] ?? '', /^\^10\./);
});

test('static verifier rejects runtime dependencies that are unreachable from src/main.tsx', async () => {
  const { readFile } = await import('node:fs/promises');
  const verifier = await readFile(new URL('../scripts/verify-project.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /collectReachablePackageImports/);
  assert.match(verifier, /Unused runtime dependency/);
});

test('offline cache setting controls persisted query storage without a fake mutation queue', async () => {
  const { readFile, stat } = await import('node:fs/promises');
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> };
  const providers = await readFile(new URL('../src/context/AppProviders.tsx', import.meta.url), 'utf8');
  const queryClient = await readFile(new URL('../src/lib/query-client.ts', import.meta.url), 'utf8');
  assert.equal(packageJson.dependencies?.dexie, undefined);
  assert.match(providers, /env\.offlineCacheEnabled/);
  assert.match(providers, /shouldDehydrateMutation:\s*\(\)\s*=>\s*false/);
  assert.match(queryClient, /mutations:\s*\{[\s\S]*?retry:\s*0[\s\S]*?networkMode:\s*'always'/);
  await assert.rejects(stat(new URL('../src/lib/offline-db.ts', import.meta.url)));
});

test('frontend ESLint excludes every Deno Edge Function source from the browser TypeScript project', async () => {
  const { readFile } = await import('node:fs/promises');
  const config = await readFile(new URL('../eslint.config.js', import.meta.url), 'utf8');
  assert.match(config, /supabase\/functions\/\*\*/);
  assert.doesNotMatch(config, /supabase\/functions\/\*\*\/index\.ts/);
});

test('deployment documentation states the real free-tier and X105 protocol boundaries', async () => {
  const { readFile } = await import('node:fs/promises');
  const adms = await readFile(new URL('../ADMS_SETUP.md', import.meta.url), 'utf8');
  const vercel = await readFile(new URL('../VERCEL_SETUP.md', import.meta.url), 'utf8');
  const fingerprint = await readFile(new URL('../FINGERPRINT_GUIDE.md', import.meta.url), 'utf8');
  assert.match(adms, /spesifikasi resmi.*X105.*tidak.*ADMS/is);
  assert.match(adms, /ZKEM SDK.*bridge lokal/is);
  assert.match(adms, /protocol `adms`.*requires_lan_bridge/is);
  assert.match(vercel, /Hobby.*non-komersial/is);
  assert.match(vercel, /Supabase Free.*pause/is);
  assert.doesNotMatch(fingerprint, /`not_synced`/);
  assert.match(fingerprint, /`not_linked`/);
});

test('relay operations documentation includes a non-root systemd service and port-80 guidance', async () => {
  const { readFile } = await import('node:fs/promises');
  const service = await readFile(new URL('../middleware/adms-relay/attendflow-adms-relay.service.example', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../middleware/adms-relay/README.md', import.meta.url), 'utf8');
  assert.match(service, /^User=attendflow$/m);
  assert.match(service, /^ExecStart=\/usr\/bin\/node .*server\.mjs$/m);
  assert.match(service, /^Restart=on-failure$/m);
  assert.match(readme, /port 80.*reverse proxy|reverse proxy.*port 80/is);
  assert.match(readme, /jangan.*root/is);
});

test('backup guide discloses the enforced per-table ceiling and full-project alternative', async () => {
  const { readFile } = await import('node:fs/promises');
  const backup = await readFile(new URL('../docs/BACKUP_RESTORE.md', import.meta.url), 'utf8');
  assert.match(backup, /100\.000 row per table/i);
  assert.match(backup, /pg_dump|Supabase CLI/i);
  assert.match(backup, /Supabase Auth.*tidak.*dipulihkan/is);
});

test('Tailwind v4 theme registers semantic color and radius tokens for generated variants', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /@theme\s+inline\s*\{/);
  for (const token of [
    'background',
    'foreground',
    'card',
    'card-foreground',
    'popover',
    'popover-foreground',
    'primary',
    'primary-foreground',
    'secondary',
    'secondary-foreground',
    'muted',
    'muted-foreground',
    'accent',
    'accent-foreground',
    'destructive',
    'destructive-foreground',
    'border',
    'input',
    'ring'
  ]) {
    assert.match(css, new RegExp(`--color-${token}:\\s*rgb\\(var\\(--${token}\\)\\)`));
  }
  for (const radius of ['sm', 'md', 'lg', 'xl']) {
    assert.match(css, new RegExp(`--radius-${radius}:`));
  }
});

test('static verifier enforces literal Supabase relation, RPC, bucket and Edge Function contracts', async () => {
  const { readFile } = await import('node:fs/promises');
  const verifier = await readFile(new URL('../scripts/verify-project.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /collectSqlContract/);
  assert.match(verifier, /collectSupabaseReferences/);
  assert.match(verifier, /Unknown Supabase relation/);
  assert.match(verifier, /Unknown Supabase RPC/);
  assert.match(verifier, /Unknown Supabase Storage bucket/);
  assert.match(verifier, /Unknown Supabase Edge Function/);
});

test('Supabase project URL validation and browser CSP use the same official hosted domain', async () => {
  const { readFile } = await import('node:fs/promises');
  const environment = await readFile(new URL('../src/lib/env.ts', import.meta.url), 'utf8');
  const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
  assert.match(environment, /\\\.supabase\\\.co/);
  assert.doesNotMatch(environment, /supabase\\\.\\\(co\\\|in\\\)|supabase\.\(co\|in\)/);
  assert.match(vercel, /https:\/\/\*\.supabase\.co/);
  assert.doesNotMatch(vercel, /supabase\.in/);
});

test('Node and npm runtime metadata match the Vite 7 support floor', async () => {
  const { readFile } = await import('node:fs/promises');
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    engines?: { node?: string; npm?: string };
    packageManager?: string;
  };
  const nvmrc = (await readFile(new URL('../.nvmrc', import.meta.url), 'utf8')).trim();
  assert.equal(packageJson.engines?.node, '22.x');
  assert.equal(packageJson.engines?.npm, '>=10');
  assert.match(packageJson.packageManager ?? '', /^npm@\d+\.\d+\.\d+$/);
  assert.equal(nvmrc, '22.16.0');
});

test('public ADMS ingestion bounds the request stream before decoding text', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../supabase/functions/adms/index.ts', import.meta.url), 'utf8');
  assert.match(source, /readTextBody/);
  assert.doesNotMatch(source, /request\.text\(\)/);
  assert.match(source, /readTextBody\(request,\s*64_000\)/);
  assert.match(source, /readTextBody\(request,\s*2_000_000\)/);
});

test('static verifier rejects SECURITY DEFINER functions left executable by API roles', async () => {
  const { readFile } = await import('node:fs/promises');
  const verifier = await readFile(new URL('../scripts/verify-project.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /collectFunctionPrivileges/);
  assert.match(verifier, /SECURITY DEFINER function/);
});

test('typed ESLint only targets files covered by its TypeScript projects', async () => {
  const { readFile } = await import('node:fs/promises');
  const config = await readFile(new URL('../eslint.config.js', import.meta.url), 'utf8');
  assert.match(config, /files:\s*\['src\/\*\*\/\*\.\{ts,tsx\}',\s*'vite\.config\.ts'\]/);
  assert.match(config, /files:\s*\['tests-node\/\*\*\/\*\.ts'\]/);
  assert.doesNotMatch(config, /files:\s*\['\*\*\/\*\.\{ts,tsx\}'\]/);
});

test('React Refresh lint treats known non-component TSX exports explicitly and emits no warnings', async () => {
  const { readFile } = await import('node:fs/promises');
  const config = await readFile(new URL('../eslint.config.js', import.meta.url), 'utf8');
  assert.match(config, /'react-refresh\/only-export-components':\s*\[\s*'error'/);
  for (const exportName of ['useAuth', 'useLocale', 'buttonVariants']) {
    assert.match(config, new RegExp(`allowExportNames:[\\s\\S]*?['\"]${exportName}['\"]`));
  }
  assert.doesNotMatch(config, /'react-refresh\/only-export-components':\s*\[\s*'warn'/);
});

test('Zod transform forms declare distinct React Hook Form input and output types', async () => {
  const { readFile } = await import('node:fs/promises');
  const registration = await readFile(new URL('../src/pages/employees/EmployeeRegistrationPage.tsx', import.meta.url), 'utf8');
  const settings = await readFile(new URL('../src/pages/settings/SettingsPage.tsx', import.meta.url), 'utf8');
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> };
  assert.equal(packageJson.dependencies?.['@hookform/resolvers'], '5.2.2');
  assert.match(registration, /useForm<EmployeeForm,\s*unknown,\s*ValidatedEmployee>/);
  assert.match(settings, /useForm<CompanyForm,\s*unknown,\s*ValidatedCompanyForm>/);
});
