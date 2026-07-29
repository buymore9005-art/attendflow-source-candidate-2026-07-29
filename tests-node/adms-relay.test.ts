import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import { buildUpstreamUrl, createRelayServer, resolveDeviceToken } from '../middleware/adms-relay/relay.mjs';

test('builds an upstream ADMS URL while preserving path and query', () => {
  const url = buildUpstreamUrl(
    'https://project.supabase.co/functions/v1/adms/',
    '/iclock/cdata?SN=X105-001&table=ATTLOG'
  );
  assert.equal(url.toString(), 'https://project.supabase.co/functions/v1/adms/iclock/cdata?SN=X105-001&table=ATTLOG');
});

test('resolves a unique token from the device serial number', () => {
  assert.equal(resolveDeviceToken({ 'X105-001': 'secret-a' }, '/iclock/getrequest?SN=X105-001'), 'secret-a');
  assert.equal(resolveDeviceToken({ 'X105-001': 'secret-a' }, '/iclock/getrequest?SN=UNKNOWN'), null);
});

test('forwards ADMS requests to HTTPS upstream with the per-device token', async (t) => {
  let captured: { url?: string; token?: string; body?: string } = {};
  const upstream = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    captured = { url: request.url, token: String(request.headers['x-device-token'] ?? ''), body };
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('OK: 1');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => upstream.close());
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress !== 'string');

  const relay = createRelayServer({
    upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}/functions/v1/adms`,
    deviceTokens: { 'X105-001': 'device-secret' },
    requestTimeoutMs: 5_000
  });
  relay.listen(0, '127.0.0.1');
  await once(relay, 'listening');
  t.after(() => relay.close());
  const relayAddress = relay.address();
  assert.ok(relayAddress && typeof relayAddress !== 'string');

  const result = await fetch(`http://127.0.0.1:${relayAddress.port}/iclock/cdata?SN=X105-001&table=ATTLOG`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '1\t2026-07-29 08:00:00\t0\t1\t0\t0'
  });

  assert.equal(result.status, 200);
  assert.equal(await result.text(), 'OK: 1');
  assert.equal(captured.url, '/functions/v1/adms/iclock/cdata?SN=X105-001&table=ATTLOG');
  assert.equal(captured.token, 'device-secret');
  assert.equal(captured.body, '1\t2026-07-29 08:00:00\t0\t1\t0\t0');
});

test('rejects unknown serial numbers before contacting upstream', async (t) => {
  const relay = createRelayServer({
    upstreamBaseUrl: 'https://project.supabase.co/functions/v1/adms',
    deviceTokens: { 'X105-001': 'device-secret' },
    fetchImpl: async () => { throw new Error('must not be called'); }
  });
  relay.listen(0, '127.0.0.1');
  await once(relay, 'listening');
  t.after(() => relay.close());
  const address = relay.address();
  assert.ok(address && typeof address !== 'string');

  const response = await fetch(`http://127.0.0.1:${address.port}/iclock/getrequest?SN=UNKNOWN`);
  assert.equal(response.status, 401);
  assert.match(await response.text(), /unknown device serial/i);
});


test('rejects invalid relay timeout and request-size limits at startup', () => {
  assert.throws(() => createRelayServer({
    upstreamBaseUrl: 'https://project.supabase.co/functions/v1/adms',
    deviceTokens: { 'X105-001': 'device-secret' },
    requestTimeoutMs: 0
  }), /requestTimeoutMs/i);
  assert.throws(() => createRelayServer({
    upstreamBaseUrl: 'https://project.supabase.co/functions/v1/adms',
    deviceTokens: { 'X105-001': 'device-secret' },
    maxBodyBytes: Number.NaN
  }), /maxBodyBytes/i);
});

test('systemd hardening does not block the Node runtime JIT', () => {
  const unit = readFileSync(new URL('../middleware/adms-relay/attendflow-adms-relay.service.example', import.meta.url), 'utf8');
  const deniesExecutableMemory = /^MemoryDenyWriteExecute=true$/m.test(unit);
  const startsNodeJitless = /^ExecStart=.*\bnode\s+--jitless\b/m.test(unit);
  assert.ok(!deniesExecutableMemory || startsNodeJitless, 'MemoryDenyWriteExecute requires Node --jitless; otherwise remove the directive.');
});
