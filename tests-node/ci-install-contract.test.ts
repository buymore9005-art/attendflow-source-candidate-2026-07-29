import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const projectStructure = readFileSync('docs/PROJECT_STRUCTURE.md', 'utf8');
const vercelGuide = readFileSync('VERCEL_SETUP.md', 'utf8');
const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { lockfileVersion?: number; packages?: Record<string, unknown> };

test('CI does not request npm cache before a committed lockfile exists', () => {
  assert.doesNotMatch(workflow, /^\s*cache:\s*npm\s*$/m);
});

test('CI uses npm ci when a lockfile exists and npm install otherwise', () => {
  assert.match(workflow, /if \[ -f package-lock\.json \]/);
  assert.match(workflow, /npm ci --no-audit --no-fund/);
  assert.match(workflow, /npm install --no-audit --no-fund/);
});

test('the committed lockfile is documented and deployment uses reproducible npm ci installs', () => {
  assert.equal(packageLock.lockfileVersion, 3);
  assert.ok(packageLock.packages && Object.keys(packageLock.packages).length > 1);
  assert.match(projectStructure, /package-lock\.json.*di-commit|package-lock\.json.*disertakan/i);
  assert.doesNotMatch(projectStructure, /package-lock\.json.*belum disertakan/i);
  assert.match(vercelGuide, /Install Command: `npm ci --no-audit --no-fund`/);
});
