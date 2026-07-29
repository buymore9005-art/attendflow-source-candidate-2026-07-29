import assert from 'node:assert/strict';
import test from 'node:test';

type FetchCall = { input: RequestInfo | URL; init?: RequestInit };
type TransportModule = {
  createSupabaseTransport?: (
    supabaseUrl: string,
    apiKey: string,
    fetchImpl: typeof fetch,
  ) => typeof fetch;
};

async function loadTransport(): Promise<TransportModule> {
  return import('../src/lib/supabase-transport.ts').catch(() => ({}));
}

test('Supabase transport injects the configured apikey while preserving request headers', async () => {
  const { createSupabaseTransport } = await loadTransport();
  assert.equal(typeof createSupabaseTransport, 'function');

  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const transport = createSupabaseTransport!(
    'https://project-ref.supabase.co',
    'sb_publishable_test-key',
    fetchImpl,
  );

  await transport('https://project-ref.supabase.co/rest/v1/rpc/register_employee', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-correlation-id': 'request-1' },
    body: '{}',
  });

  assert.equal(calls.length, 1);
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get('apikey'), 'sb_publishable_test-key');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('x-correlation-id'), 'request-1');
  assert.equal(calls[0]?.init?.method, 'POST');
});

test('Supabase client installs the guarded transport for every SDK request', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');

  assert.match(source, /createSupabaseTransport/);
  assert.match(source, /fetch:\s*createSupabaseTransport\(/);
});

test('Supabase transport also protects employee table reads created as Request objects', async () => {
  const { createSupabaseTransport } = await loadTransport();
  assert.equal(typeof createSupabaseTransport, 'function');

  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const transport = createSupabaseTransport!(
    'https://project-ref.supabase.co',
    'sb_publishable_test-key',
    fetchImpl,
  );
  const request = new Request(
    'https://project-ref.supabase.co/rest/v1/employees?select=*',
    { headers: { authorization: 'Bearer user-jwt', accept: 'application/json' } },
  );

  await transport(request);

  assert.equal(calls.length, 1);
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get('apikey'), 'sb_publishable_test-key');
  assert.equal(headers.get('authorization'), 'Bearer user-jwt');
  assert.equal(headers.get('accept'), 'application/json');
});

test('Supabase transport never leaks the project key to another origin', async () => {
  const { createSupabaseTransport } = await loadTransport();
  assert.equal(typeof createSupabaseTransport, 'function');

  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  const transport = createSupabaseTransport!(
    'https://project-ref.supabase.co',
    'sb_publishable_test-key',
    fetchImpl,
  );

  await transport('https://example.com/health', { headers: { accept: 'application/json' } });

  assert.equal(calls.length, 1);
  assert.equal(new Headers(calls[0]?.init?.headers).get('apikey'), null);
});
