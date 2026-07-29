import assert from 'node:assert/strict';
import test from 'node:test';
import { asErrorMessage } from '../src/utils/error-message.ts';

test('translates application error keys while preserving unknown server diagnostics', () => {
  const t = (key: string) => ({ 'error.popupBlocked': 'Popup diblokir', 'error.unexpected': 'Tidak terduga' })[key] ?? key;
  assert.equal(asErrorMessage(new Error('error.popupBlocked'), t), 'Popup diblokir');
  assert.equal(asErrorMessage(new Error('Database unavailable'), t), 'Database unavailable');
  assert.equal(asErrorMessage(null, t), 'Tidak terduga');
});


test('maps the Supabase gateway missing-apikey response to an actionable localized message', () => {
  const t = (key: string) => ({
    'error.supabaseApiKeyMissing': 'Kunci API Supabase tidak terkirim. Periksa environment lalu deploy ulang.',
  })[key] ?? key;

  assert.equal(
    asErrorMessage(new Error('No API key found in request'), t),
    'Kunci API Supabase tidak terkirim. Periksa environment lalu deploy ulang.',
  );
  assert.equal(
    asErrorMessage({ message: 'No API key found in request', hint: 'No `apikey` request header was found.' }, t),
    'Kunci API Supabase tidak terkirim. Periksa environment lalu deploy ulang.',
  );
  assert.equal(
    asErrorMessage('{"message":"No API key found in request","hint":"No `apikey` request header was found."}', t),
    'Kunci API Supabase tidak terkirim. Periksa environment lalu deploy ulang.',
  );
});

test('all locales explain how to recover from a missing Supabase apikey header', async () => {
  const { id, en, zh } = await import('../src/i18n/dictionaries.ts');
  for (const dictionary of [id, en, zh]) {
    assert.equal(typeof (dictionary as Record<string, string>)['error.supabaseApiKeyMissing'], 'string');
    assert.ok((dictionary as Record<string, string>)['error.supabaseApiKeyMissing']!.length > 20);
  }
});
