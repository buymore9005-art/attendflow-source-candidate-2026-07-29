import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { dictionaries } from '../src/i18n/dictionaries.ts';
import { stripLeadingSqlComments } from './verify-project-helpers.mjs';
import { composeInitialBootstrap } from './generate-initial-backup.mjs';
import { collectReachablePackageImports, extractModuleSpecifiers, packageNameFromSpecifier, resolveLocalModule } from './source-audit-helpers.mjs';
import { collectFunctionPrivileges, collectSqlContract, collectSupabaseReferences } from './schema-contract.mjs';

const root = process.cwd();
const failures = [];
const requiredFiles = [
  'README.md', 'INSTALL.md', 'DEPLOY.md', 'SUPABASE_SETUP.md', 'VERCEL_SETUP.md',
  'ADMS_SETUP.md', 'DELI_E_PLUS_SETUP.md', 'PAYROLL_GUIDE.md', 'FINGERPRINT_GUIDE.md',
  'USER_MANUAL.md', '.env.example', 'sql/000_full_schema.sql', 'sql/001_seed.sql',
  'sql/002_scheduler.sql', 'sql/initial_backup.sql', 'docs/API.md', 'docs/ERD.md',
  'docs/TESTING.md', 'docs/TEST_CHECKLIST.md', 'docs/TROUBLESHOOTING.md',
  'docs/PROJECT_STRUCTURE.md', 'docs/SECURITY.md', 'docs/BACKUP_RESTORE.md'
];

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`Missing required file: ${relative}`);
}


const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const declaredPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {})
]);
const codeFiles = [];
function collectCodeFiles(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (/\.(?:[cm]?[jt]sx?)$/.test(target)) codeFiles.push(target);
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    collectCodeFiles(path.join(target, entry.name));
  }
}
for (const target of ['src', 'tests-node', 'scripts', 'middleware', 'supabase/functions', 'vite.config.ts', 'eslint.config.js']) collectCodeFiles(path.join(root, target));
for (const file of codeFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const specifier of extractModuleSpecifiers(content)) {
    if (specifier.startsWith('.') || specifier.startsWith('@/')) {
      if (!resolveLocalModule(file, specifier, path.join(root, 'src'))) failures.push(`Unresolved local import ${specifier} in ${path.relative(root, file)}`);
      continue;
    }
    if (specifier.startsWith('node:') || specifier.startsWith('https:') || specifier.startsWith('npm:')) continue;
    const packageName = packageNameFromSpecifier(specifier);
    if (!declaredPackages.has(packageName)) failures.push(`Undeclared package import ${packageName} in ${path.relative(root, file)}`);
  }
}

const reachableRuntimePackages = collectReachablePackageImports(path.join(root, 'src/main.tsx'), path.join(root, 'src'));
for (const packageName of Object.keys(packageJson.dependencies ?? {})) {
  if (!reachableRuntimePackages.has(packageName)) failures.push(`Unused runtime dependency: ${packageName}`);
}

const bootstrapSources = ['sql/000_full_schema.sql', 'sql/001_seed.sql', 'sql/002_scheduler.sql'];
if (bootstrapSources.every((relative) => fs.existsSync(path.join(root, relative))) && fs.existsSync(path.join(root, 'sql/initial_backup.sql'))) {
  const expectedBootstrap = composeInitialBootstrap(bootstrapSources.map((name) => ({ name, content: fs.readFileSync(path.join(root, name), 'utf8') })));
  const actualBootstrap = fs.readFileSync(path.join(root, 'sql/initial_backup.sql'), 'utf8');
  if (actualBootstrap !== expectedBootstrap) failures.push('sql/initial_backup.sql is stale; run npm run sql:bootstrap');
}

const keys = Object.keys(dictionaries.id).sort();
for (const locale of ['en', 'zh']) {
  const localeKeys = Object.keys(dictionaries[locale]).sort();
  if (JSON.stringify(keys) !== JSON.stringify(localeKeys)) failures.push(`Dictionary key mismatch: ${locale}`);
  for (const key of keys) if (!String(dictionaries[locale][key] ?? '').trim()) failures.push(`Empty ${locale} translation: ${key}`);
}

const sourceFiles = [];
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else sourceFiles.push(full);
  }
}
walk(path.join(root, 'src'));
const referenced = new Map();
const translationPatterns = [
  /\bt\(\s*['"]([^'"]+)['"]/g,
  /(?:headerKey|labelKey|titleKey|subtitleKey|placeholderKey)\s*[:=]\s*['"]([^'"]+)['"]/g
];
for (const file of sourceFiles.filter((file) => /\.(ts|tsx)$/.test(file))) {
  const value = fs.readFileSync(file, 'utf8');
  for (const pattern of translationPatterns) {
    for (const match of value.matchAll(pattern)) referenced.set(match[1], file);
  }
}
for (const [key, file] of referenced) {
  if (!(key in dictionaries.id)) failures.push(`Missing translation key ${key} referenced by ${path.relative(root, file)}`);
}

for (const sqlFile of ['sql/000_full_schema.sql', 'sql/001_seed.sql', 'sql/002_scheduler.sql']) {
  const full = path.join(root, sqlFile);
  if (!fs.existsSync(full)) continue;
  const sql = fs.readFileSync(full, 'utf8');
  if (!/^begin;/i.test(stripLeadingSqlComments(sql))) failures.push(`${sqlFile} must start with BEGIN after leading comments`);
  if (!/commit;\s*$/i.test(sql)) failures.push(`${sqlFile} must end with COMMIT`);
  const tags = sql.match(/\$[A-Za-z_0-9]*\$/g) ?? [];
  const counts = new Map();
  for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  for (const [tag, count] of counts) if (count % 2 !== 0) failures.push(`${sqlFile} has an unmatched dollar quote ${tag}`);
}

const schema = fs.existsSync(path.join(root, 'sql/000_full_schema.sql')) ? fs.readFileSync(path.join(root, 'sql/000_full_schema.sql'), 'utf8') : '';
const tableCount = (schema.match(/^create table if not exists public\./gim) ?? []).length;
const functionCount = (schema.match(/^create or replace function public\./gim) ?? []).length;
if (tableCount < 30) failures.push(`Expected at least 30 public tables, found ${tableCount}`);
if (functionCount < 25) failures.push(`Expected at least 25 public functions, found ${functionCount}`);

const canonicalSql = bootstrapSources
  .filter((relative) => fs.existsSync(path.join(root, relative)))
  .map((relative) => fs.readFileSync(path.join(root, relative), 'utf8'))
  .join('\n');
const sqlContract = collectSqlContract(canonicalSql);
const functionPrivileges = collectFunctionPrivileges(canonicalSql);
for (const functionName of functionPrivileges.securityDefiners) {
  const revoked = functionPrivileges.revokedFrom.get(functionName) ?? new Set();
  const missingRoles = ['public', 'anon', 'authenticated'].filter((role) => !revoked.has(role));
  if (missingRoles.length) failures.push(`SECURITY DEFINER function ${functionName} lacks explicit EXECUTE revocation from ${missingRoles.join(', ')}`);
}
const edgeFunctionRoot = path.join(root, 'supabase/functions');
const edgeFunctionNames = new Set(
  fs.existsSync(edgeFunctionRoot)
    ? fs.readdirSync(edgeFunctionRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== '_shared' && fs.existsSync(path.join(edgeFunctionRoot, entry.name, 'index.ts')))
      .map((entry) => entry.name)
    : []
);
const backendContractFiles = codeFiles.filter((file) => {
  const relative = path.relative(root, file).split(path.sep).join('/');
  return (relative.startsWith('src/') || relative.startsWith('supabase/functions/')) && !/\.test\.[cm]?[jt]sx?$/.test(relative);
});

for (const file of backendContractFiles) {
  const relative = path.relative(root, file);
  const references = collectSupabaseReferences(fs.readFileSync(file, 'utf8'));
  for (const relation of references.relations) {
    if (!sqlContract.tables.has(relation) && !sqlContract.views.has(relation)) {
      failures.push(`Unknown Supabase relation ${relation} referenced by ${relative}`);
    }
  }
  for (const rpc of references.rpcs) {
    if (!sqlContract.functions.has(rpc)) failures.push(`Unknown Supabase RPC ${rpc} referenced by ${relative}`);
  }
  for (const bucket of references.buckets) {
    if (!sqlContract.buckets.has(bucket)) failures.push(`Unknown Supabase Storage bucket ${bucket} referenced by ${relative}`);
  }
  for (const edgeFunction of references.edgeFunctions) {
    if (!edgeFunctionNames.has(edgeFunction)) failures.push(`Unknown Supabase Edge Function ${edgeFunction} referenced by ${relative}`);
  }
}

for (const functionName of ['adms', 'device-command', 'deli-sync', 'admin-users', 'backup-restore', 'scheduled-maintenance']) {
  if (!fs.existsSync(path.join(root, 'supabase/functions', functionName, 'index.ts'))) failures.push(`Missing Edge Function: ${functionName}`);
}

if (failures.length) {
  console.error(`Static verification failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Static verification passed: ${keys.length} i18n keys, ${referenced.size} literal references, ${tableCount} tables, ${functionCount} functions.`);
