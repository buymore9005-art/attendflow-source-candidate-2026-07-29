import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const projectStructure = readFileSync('docs/PROJECT_STRUCTURE.md', 'utf8');
const vercelGuide = readFileSync('VERCEL_SETUP.md', 'utf8');

test('CI does not request npm cache before a committed lockfile exists', () => {
  assert.doesNotMatch(workflow, /^\s*cache:\s*npm\s*$/m);
});

test('CI uses npm ci when a lockfile exists and npm install otherwise', () => {
  assert.match(workflow, /if \[ -f package-lock\.json \]/);
  assert.match(workflow, /npm ci --no-audit --no-fund/);
  assert.match(workflow, /npm install --no-audit --no-fund/);
});

test('documentation does not list an absent package-lock as a repository file or require npm ci on first install', () => {
  assert.match(projectStructure, /package-lock\.json.*belum disertakan|package-lock\.json.*setelah instalasi berhasil/i);
  assert.match(vercelGuide, /Install Command: `npm install --no-audit --no-fund`/);
});
