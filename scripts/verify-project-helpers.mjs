/**
 * Remove only comments and whitespace that occur before the first SQL token.
 * Comments inside the transaction body are intentionally preserved.
 *
 * @param {string} sql
 * @returns {string}
 */
export function stripLeadingSqlComments(sql) {
  let remaining = sql.replace(/^\uFEFF/, '');

  while (true) {
    const before = remaining;
    remaining = remaining.replace(/^\s+/, '');

    if (remaining.startsWith('--')) {
      const newline = remaining.indexOf('\n');
      remaining = newline === -1 ? '' : remaining.slice(newline + 1);
      continue;
    }

    if (remaining.startsWith('/*')) {
      const end = remaining.indexOf('*/', 2);
      if (end === -1) return remaining;
      remaining = remaining.slice(end + 2);
      continue;
    }

    if (remaining === before) return remaining;
  }
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageNameFromSpecifier, resolveLocalModule } from './source-audit-helpers.mjs';

/**
 * Return the installable npm package represented by a bare module specifier.
 * Built-ins, URLs, aliases, and local imports intentionally return null.
 *
 * @param {string} specifier
 * @returns {string | null}
 */
export function packageRoot(specifier) {
  if (
    !specifier ||
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('@/') ||
    specifier.startsWith('node:') ||
    specifier.startsWith('http:') ||
    specifier.startsWith('https:') ||
    specifier.startsWith('npm:')
  ) return null;
  return packageNameFromSpecifier(specifier);
}

/**
 * Resolve an alias or relative import against the repository filesystem.
 *
 * @param {URL | string} rootUrl
 * @param {URL | string} importerUrl
 * @param {string} specifier
 * @returns {string | null}
 */
export function resolveLocalImport(rootUrl, importerUrl, specifier) {
  const root = rootUrl instanceof URL ? fileURLToPath(rootUrl) : path.resolve(rootUrl);
  const importer = importerUrl instanceof URL ? fileURLToPath(importerUrl) : path.resolve(importerUrl);
  return resolveLocalModule(importer, specifier, path.join(root, 'src'));
}
