import http from 'node:http';
import { randomUUID } from 'node:crypto';

const ALLOWED_PATHS = new Set([
  '/iclock/cdata',
  '/iclock/getrequest',
  '/iclock/devicecmd',
  '/iclock/registry',
  '/health'
]);

const DEFAULT_MAX_BODY_BYTES = 2_100_000;
const DEFAULT_TIMEOUT_MS = 20_000;

function normalizeSerial(value) {
  return String(value ?? '').replace(/[\t\r\n]/g, '').trim().slice(0, 120);
}

function writeText(response, status, body) {
  const payload = Buffer.from(body, 'utf8');
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': String(payload.byteLength),
    'cache-control': 'no-store'
  });
  response.end(payload);
}

async function readBody(request, maxBodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBodyBytes) {
      const error = new Error(`Request body exceeds ${maxBodyBytes} bytes.`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function buildUpstreamUrl(upstreamBaseUrl, requestTarget) {
  const base = new URL(upstreamBaseUrl);
  const incoming = new URL(requestTarget, 'http://adms-relay.local');
  const path = incoming.pathname.replace(/\/+$/, '') || '/';
  if (!ALLOWED_PATHS.has(path)) {
    const error = new Error('Unsupported ADMS route.');
    error.statusCode = 404;
    throw error;
  }
  base.pathname = `${base.pathname.replace(/\/+$/, '')}${path}`;
  base.search = incoming.search;
  base.hash = '';
  return base;
}

export function resolveDeviceToken(deviceTokens, requestTarget) {
  const incoming = new URL(requestTarget, 'http://adms-relay.local');
  const serial = normalizeSerial(incoming.searchParams.get('SN'));
  if (!serial) return null;
  const token = deviceTokens[serial];
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

export function createRelayServer({
  upstreamBaseUrl,
  deviceTokens,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = DEFAULT_TIMEOUT_MS,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES
}) {
  if (!upstreamBaseUrl) throw new Error('upstreamBaseUrl is required.');
  if (!deviceTokens || typeof deviceTokens !== 'object' || Array.isArray(deviceTokens)) throw new Error('deviceTokens must be an object keyed by serial number.');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl must be a function.');
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1) throw new Error('requestTimeoutMs must be a positive integer.');
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1) throw new Error('maxBodyBytes must be a positive integer.');

  return http.createServer(async (request, response) => {
    try {
      const requestTarget = request.url ?? '/';
      const incoming = new URL(requestTarget, 'http://adms-relay.local');

      if (request.method === 'GET' && incoming.pathname === '/healthz') {
        writeText(response, 200, 'OK');
        return;
      }
      if (request.method !== 'GET' && request.method !== 'POST') {
        writeText(response, 405, 'ERROR: Only GET and POST are supported.');
        return;
      }

      const upstreamUrl = buildUpstreamUrl(upstreamBaseUrl, requestTarget);
      const token = resolveDeviceToken(deviceTokens, requestTarget);
      if (!token) {
        writeText(response, 401, 'ERROR: Unknown device serial or missing relay token mapping.');
        return;
      }

      const body = request.method === 'POST' ? await readBody(request, maxBodyBytes) : undefined;
      const headers = new Headers({
        accept: request.headers.accept ?? 'text/plain',
        'content-type': request.headers['content-type'] ?? 'text/plain; charset=utf-8',
        'user-agent': request.headers['user-agent'] ?? 'attendflow-adms-relay/1.0.0',
        'x-device-token': token,
        'x-correlation-id': randomUUID(),
        'x-relay-version': 'attendflow-adms-relay/1.0.0'
      });
      const remoteAddress = request.socket.remoteAddress;
      if (remoteAddress) headers.set('x-forwarded-for', remoteAddress.replace(/^::ffff:/, ''));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      timeout.unref?.();
      let upstreamResponse;
      try {
        upstreamResponse = await fetchImpl(upstreamUrl, {
          method: request.method,
          headers,
          body,
          redirect: 'manual',
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
      response.writeHead(upstreamResponse.status, {
        'content-type': upstreamResponse.headers.get('content-type') ?? 'text/plain; charset=utf-8',
        'content-length': String(responseBody.byteLength),
        'cache-control': 'no-store'
      });
      response.end(responseBody);
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : error?.name === 'AbortError' ? 504 : 502;
      const message = status === 504 ? 'Upstream request timed out.' : status === 404 ? 'Unsupported ADMS route.' : status === 413 ? error.message : 'ADMS upstream is unavailable.';
      writeText(response, status, `ERROR: ${message}`);
    }
  });
}
