import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError, readJsonObject } from '../supabase/functions/_shared/http.ts';

test('readJsonObject parses a JSON object within the configured byte limit', async () => {
  const request = new Request('https://example.test/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'sync' }),
  });

  assert.deepEqual(await readJsonObject(request, 1_024), { action: 'sync' });
});

test('readJsonObject rejects a declared payload length before reading the body', async () => {
  const request = new Request('https://example.test/action', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '2048',
    },
    body: JSON.stringify({ action: 'sync' }),
  });

  await assert.rejects(
    readJsonObject(request, 1_024),
    (error: unknown) => error instanceof HttpError && error.status === 413 && error.code === 'payload_too_large',
  );
});

test('readJsonObject rejects the actual payload when Content-Length is absent or incorrect', async () => {
  const request = new Request('https://example.test/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: 'x'.repeat(2_048) }),
  });

  await assert.rejects(
    readJsonObject(request, 1_024),
    (error: unknown) => error instanceof HttpError && error.status === 413 && error.code === 'payload_too_large',
  );
});

test('readTextBody returns text within the configured byte limit', async () => {
  const readTextBody = (await import('../supabase/functions/_shared/http.ts') as {
    readTextBody?: (request: Request, maxBytes?: number) => Promise<string>;
  }).readTextBody;
  assert.equal(typeof readTextBody, 'function');

  const request = new Request('https://example.test/adms', {
    method: 'POST',
    body: 'ATTLOG payload',
  });
  assert.equal(await readTextBody!(request, 1_024), 'ATTLOG payload');
});

test('readTextBody stops an oversized streamed payload', async () => {
  const readTextBody = (await import('../supabase/functions/_shared/http.ts') as {
    readTextBody?: (request: Request, maxBytes?: number) => Promise<string>;
  }).readTextBody;
  assert.equal(typeof readTextBody, 'function');

  const request = new Request('https://example.test/adms', {
    method: 'POST',
    body: 'x'.repeat(2_048),
  });
  await assert.rejects(
    readTextBody!(request, 1_024),
    (error: unknown) => error instanceof HttpError && error.status === 413 && error.code === 'payload_too_large',
  );
});

test('ADMS Edge Function reads every untrusted request body through the bounded helper', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../supabase/functions/adms/index.ts', import.meta.url), 'utf8');

  assert.match(source, /readTextBody/);
  assert.doesNotMatch(source, /request\.text\(\)/);
});
