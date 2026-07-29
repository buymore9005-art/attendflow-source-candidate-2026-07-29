import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultActiveBulkPresets } from '../src/utils/crud-presets.ts';

test('active bulk presets are offered only to entities with an is_active field', () => {
  assert.deepEqual(defaultActiveBulkPresets([{ name: 'name', labelKey: 'common.name', type: 'text' }]), []);
  assert.deepEqual(defaultActiveBulkPresets([
    { name: 'name', labelKey: 'common.name', type: 'text' },
    { name: 'is_active', labelKey: 'common.active', type: 'switch' }
  ]), [
    { labelKey: 'common.active', patch: { is_active: true } },
    { labelKey: 'common.inactive', patch: { is_active: false } }
  ]);
});
