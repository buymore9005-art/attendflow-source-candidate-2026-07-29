import fs from 'node:fs';
import path from 'node:path';

const MODULE_SUFFIXES = [
  '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs', '/index.cjs'
];

function isIdentifierStart(character) {
  return /[A-Za-z_$]/.test(character ?? '');
}

function isIdentifierPart(character) {
  return /[A-Za-z0-9_$]/.test(character ?? '');
}

function readQuotedString(source, start) {
  const quote = source[start];
  let value = '';
  let index = start + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      if (index + 1 < source.length) value += source[index + 1];
      index += 2;
      continue;
    }
    if (character === quote) return { value, end: index + 1 };
    value += character;
    index += 1;
  }
  return { value, end: source.length };
}

function skipTemplateLiteral(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === '`') return index + 1;
    index += 1;
  }
  return source.length;
}


const REGEX_PREFIX_PUNCTUATION = new Set(['(', '[', '{', ',', ';', ':', '=', '!', '?', '&', '|', '+', '-', '*', '%', '^', '~', '<', '>']);
const REGEX_PREFIX_KEYWORDS = new Set(['return', 'throw', 'case', 'delete', 'void', 'typeof', 'instanceof', 'in', 'of', 'yield', 'await', 'else', 'do']);

function canStartRegularExpression(tokens) {
  const previous = tokens.at(-1);
  if (!previous) return true;
  if (previous.type === 'punctuation') return REGEX_PREFIX_PUNCTUATION.has(previous.value);
  return previous.type === 'identifier' && REGEX_PREFIX_KEYWORDS.has(previous.value);
}

function skipRegularExpression(source, start) {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '\n' || character === '\r') return start + 1;
    if (character === '[') {
      inCharacterClass = true;
      index += 1;
      continue;
    }
    if (character === ']' && inCharacterClass) {
      inCharacterClass = false;
      index += 1;
      continue;
    }
    if (character === '/' && !inCharacterClass) {
      index += 1;
      while (index < source.length && /[A-Za-z]/.test(source[index] ?? '')) index += 1;
      return index;
    }
    index += 1;
  }
  return start + 1;
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '/' && next === '/') {
      const newline = source.indexOf('\n', index + 2);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (character === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (character === '/' && canStartRegularExpression(tokens)) {
      const end = skipRegularExpression(source, index);
      if (end > index + 1) {
        index = end;
        continue;
      }
    }
    if (character === '"' || character === "'") {
      const parsed = readQuotedString(source, index);
      tokens.push({ type: 'string', value: parsed.value });
      index = parsed.end;
      continue;
    }
    if (character === '`') {
      index = skipTemplateLiteral(source, index);
      continue;
    }
    if (isIdentifierStart(character)) {
      let end = index + 1;
      while (end < source.length && isIdentifierPart(source[end])) end += 1;
      tokens.push({ type: 'identifier', value: source.slice(index, end) });
      index = end;
      continue;
    }
    tokens.push({ type: 'punctuation', value: character });
    index += 1;
  }
  return tokens;
}

/**
 * Extract module specifiers from executable import/export syntax while
 * ignoring examples embedded in comments, quoted strings, and templates.
 * Dynamic imports are included only when their first argument is a string literal.
 */
export function extractModuleSpecifiers(source) {
  const tokens = tokenize(source);
  const result = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'identifier' || (token.value !== 'import' && token.value !== 'export')) continue;
    if (tokens[index - 1]?.value === '.') continue;

    const next = tokens[index + 1];
    if (token.value === 'import' && next?.type === 'string') {
      result.push(next.value);
      continue;
    }
    if (token.value === 'import' && next?.value === '(' && tokens[index + 2]?.type === 'string') {
      result.push(tokens[index + 2].value);
      continue;
    }

    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const candidate = tokens[cursor];
      if (candidate.value === ';') break;
      if (cursor > index + 1 && candidate.type === 'identifier' && (candidate.value === 'import' || candidate.value === 'export')) break;
      if (candidate.type === 'identifier' && candidate.value === 'from' && tokens[cursor + 1]?.type === 'string') {
        result.push(tokens[cursor + 1].value);
        break;
      }
    }
  }

  return result;
}

export function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

export function resolveLocalModule(importer, specifier, sourceRoot = null) {
  let base;
  if (specifier.startsWith('@/')) {
    if (!sourceRoot) return null;
    base = path.join(sourceRoot, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(importer), specifier);
  } else {
    return null;
  }
  for (const suffix of MODULE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Traverse the executable module graph from one browser entry point and return
 * only npm packages that production code can actually reach.
 *
 * @param {string} entryFile
 * @param {string} sourceRoot
 * @returns {Set<string>}
 */
export function collectReachablePackageImports(entryFile, sourceRoot) {
  const visited = new Set();
  const packages = new Set();

  function visit(file) {
    const absolute = path.resolve(file);
    if (visited.has(absolute)) return;
    visited.add(absolute);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return;
    if (!/\.(?:[cm]?[jt]sx?)$/.test(absolute)) return;

    const source = fs.readFileSync(absolute, 'utf8');
    for (const specifier of extractModuleSpecifiers(source)) {
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        const resolved = resolveLocalModule(absolute, specifier, sourceRoot);
        if (resolved) visit(resolved);
        continue;
      }
      if (/^(?:node:|npm:|https?:)/.test(specifier)) continue;
      packages.add(packageNameFromSpecifier(specifier));
    }
  }

  visit(entryFile);
  return packages;
}
