import assert from 'node:assert/strict';
import test from 'node:test';
import { composeInitialBootstrap } from '../scripts/generate-initial-backup.mjs';

test('composes schema, seed and scheduler SQL in deterministic order', () => {
  const output = composeInitialBootstrap([
    { name: 'schema.sql', content: 'begin;\nselect 1;\ncommit;\n' },
    { name: 'seed.sql', content: 'begin;\nselect 2;\ncommit;\n' }
  ]);
  assert.match(output, /schema\.sql[\s\S]*select 1;[\s\S]*seed\.sql[\s\S]*select 2;/);
  assert.equal((output.match(/begin;/gi) ?? []).length, 2);
  assert.match(output, /Generated file: do not edit directly/);
});
