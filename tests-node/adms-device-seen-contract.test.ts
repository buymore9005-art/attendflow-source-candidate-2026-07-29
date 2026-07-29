import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('ADMS authentication fails when device heartbeat persistence fails', async () => {
  const source = await readFile(new URL('../supabase/functions/adms/index.ts', import.meta.url), 'utf8');
  const start = source.indexOf('async function authenticateDevice');
  const end = source.indexOf('async function formatCommand');
  assert.ok(start >= 0 && end > start);
  const authenticateDevice = source.slice(start, end);

  assert.match(authenticateDevice, /const \{ error: seenError \} = await adminClient\.rpc\('mark_device_seen'/);
  assert.match(authenticateDevice, /if \(seenError\) throw seenError/);
});
