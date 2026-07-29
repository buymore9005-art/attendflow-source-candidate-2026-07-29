import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCES = ['sql/000_full_schema.sql', 'sql/001_seed.sql', 'sql/002_scheduler.sql'];

/**
 * Compose the initial database bootstrap from the canonical SQL source files.
 * Each source keeps its own transaction so a failure rolls back that stage.
 *
 * @param {{name: string, content: string}[]} sources
 * @returns {string}
 */
export function composeInitialBootstrap(sources) {
  const header = [
    '-- AttendFlow initial database bootstrap',
    '-- Generated file: do not edit directly.',
    '-- Run `npm run sql:bootstrap` after changing canonical files in sql/.',
    '-- This is a reproducible initial schema/seed/scheduler bootstrap, not a live data dump.',
    ''
  ].join('\n');

  const sections = sources.map(({ name, content }) => {
    const normalized = content.replace(/^\uFEFF/, '').trimEnd();
    return `-- ============================================================================\n-- SOURCE: ${name}\n-- ============================================================================\n${normalized}\n`;
  });

  return `${header}${sections.join('\n')}\n`;
}

export function generateInitialBootstrap(root = process.cwd(), output = 'sql/initial_backup.sql') {
  const sources = DEFAULT_SOURCES.map((name) => ({
    name,
    content: fs.readFileSync(path.join(root, name), 'utf8')
  }));
  const target = path.join(root, output);
  fs.writeFileSync(target, composeInitialBootstrap(sources), 'utf8');
  return target;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const target = generateInitialBootstrap();
  console.log(`Generated ${path.relative(process.cwd(), target)}`);
}
