import assert from 'node:assert/strict';
import test from 'node:test';
import { asErrorMessage } from '../src/utils/error-message.ts';

test('translates application error keys while preserving unknown server diagnostics', () => {
  const t = (key: string) => ({ 'error.popupBlocked': 'Popup diblokir', 'error.unexpected': 'Tidak terduga' })[key] ?? key;
  assert.equal(asErrorMessage(new Error('error.popupBlocked'), t), 'Popup diblokir');
  assert.equal(asErrorMessage(new Error('Database unavailable'), t), 'Database unavailable');
  assert.equal(asErrorMessage(null, t), 'Tidak terduga');
});
