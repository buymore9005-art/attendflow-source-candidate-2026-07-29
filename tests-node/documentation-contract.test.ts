import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function document(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('offline cache documentation matches the localStorage implementation', async () => {
  const [readme, vercel, manual, providers] = await Promise.all([
    document('README.md'),
    document('VERCEL_SETUP.md'),
    document('USER_MANUAL.md'),
    document('src/context/AppProviders.tsx')
  ]);

  assert.match(providers, /PersistQueryClientProvider/);
  assert.match(providers, /env\.offlineCacheEnabled/);
  assert.match(readme, /localStorage/i);
  assert.match(vercel, /localStorage/i);
  assert.match(vercel, /localStorage, bukan IndexedDB/i);
  assert.doesNotMatch(manual, /mutation[^\n]*masuk antrean/i);
  assert.match(manual, /mutasi[^\n]*(harus|memerlukan)[^\n]*(online|jaringan)/i);
});

test('SMTP guidance reflects project-level Supabase Auth configuration instead of unused organization secrets', async () => {
  const [settingsPage, schema, supabaseGuide, manual] = await Promise.all([
    document('src/pages/settings/SettingsPage.tsx'),
    document('sql/000_full_schema.sql'),
    document('SUPABASE_SETUP.md'),
    document('USER_MANUAL.md')
  ]);

  assert.doesNotMatch(settingsPage, /saveSmtp|smtp_password|smtp_host|smtp_port|smtp_user/);
  assert.doesNotMatch(schema, /'smtp_password'|'smtp_user'|'smtp_host'|'smtp_port'/);
  assert.match(settingsPage, /settings\.smtpProjectManaged/);
  assert.match(supabaseGuide, /Authentication[^\n]*SMTP/i);
  assert.match(supabaseGuide, /tingkat project|project-level/i);
  assert.match(manual, /Supabase Dashboard[^\n]*SMTP/i);
});

test('X105 documentation separates HTTP ADMS relay from the proprietary ZKEM SDK bridge', async () => {
  const [readme, adms, relay] = await Promise.all([
    document('README.md'),
    document('ADMS_SETUP.md'),
    document('middleware/adms-relay/README.md')
  ]);

  for (const value of [readme, adms]) {
    assert.match(value, /X105/i);
    assert.match(value, /ZKEM SDK/i);
    assert.match(value, /firmware/i);
    assert.match(value, /tidak.*mengklaim|tidak.*diasumsikan|jangan.*menganggap/is);
  }
  assert.match(adms, /relay HTTP/i);
  assert.match(adms, /bukan.*bridge.*ZKEM/is);
  assert.match(relay, /bukan.*ZKEM/is);
});

test('Vercel guide states the current Hobby plan commercial-use limitation', async () => {
  const [readme, vercel] = await Promise.all([document('README.md'), document('VERCEL_SETUP.md')]);
  for (const value of [readme, vercel]) {
    assert.match(value, /Hobby/i);
    assert.match(value, /personal|non-commercial|nonkomersial/i);
    assert.match(value, /perusahaan|commercial|komersial/i);
  }
});
