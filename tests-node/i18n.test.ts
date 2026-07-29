import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslator } from '../src/i18n/translator.ts';

test('translator resolves Indonesian, English and Chinese values', () => {
  const dictionaries = {
    id: { greeting: 'Halo {name}' },
    en: { greeting: 'Hello {name}' },
    zh: { greeting: '你好，{name}' }
  } as const;
  assert.equal(createTranslator('id', dictionaries)('greeting', { name: 'Ayu' }), 'Halo Ayu');
  assert.equal(createTranslator('en', dictionaries)('greeting', { name: 'Ayu' }), 'Hello Ayu');
  assert.equal(createTranslator('zh', dictionaries)('greeting', { name: 'Ayu' }), '你好，Ayu');
});

test('translator falls back to Indonesian key and then key name', () => {
  const dictionaries = { id: { saved: 'Tersimpan' }, en: {}, zh: {} } as const;
  const translate = createTranslator('en', dictionaries);
  assert.equal(translate('saved'), 'Tersimpan');
  assert.equal(translate('unknown.path'), 'unknown.path');
});

import { dictionaries } from '../src/i18n/dictionaries.ts';

test('all production dictionaries contain the same non-empty keys', () => {
  const baseline = Object.keys(dictionaries.id).sort();
  for (const locale of ['en', 'zh'] as const) {
    assert.deepEqual(Object.keys(dictionaries[locale]).sort(), baseline, `${locale} keys must match Indonesian keys`);
  }
  for (const [locale, entries] of Object.entries(dictionaries)) {
    for (const [key, value] of Object.entries(entries)) {
      assert.ok(value.trim().length > 0, `${locale}.${key} must not be empty`);
    }
  }
});
