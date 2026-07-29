import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createRelayServer } from './relay.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(name in process.env)) process.env[name] = value;
  }
}

function readTokens(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Device token file must contain a JSON object keyed by serial number.');
  const result = {};
  for (const [serial, token] of Object.entries(parsed)) {
    if (typeof token !== 'string' || !serial.trim() || !token.trim()) throw new Error('Every device token mapping must contain a non-empty serial and token.');
    result[serial.trim()] = token.trim();
  }
  if (Object.keys(result).length === 0) throw new Error('At least one device token mapping is required.');
  return result;
}

loadEnvFile(path.join(directory, '.env'));
const upstreamBaseUrl = process.env.UPSTREAM_BASE_URL?.trim();
if (!upstreamBaseUrl) throw new Error('UPSTREAM_BASE_URL is required.');
const upstreamProtocol = new URL(upstreamBaseUrl).protocol;
if (upstreamProtocol !== 'https:' && process.env.ALLOW_INSECURE_UPSTREAM !== 'true') throw new Error('UPSTREAM_BASE_URL must use HTTPS. Set ALLOW_INSECURE_UPSTREAM=true only for local tests.');

const tokenFile = path.resolve(directory, process.env.DEVICE_TOKENS_FILE?.trim() || 'device-tokens.json');
const deviceTokens = readTokens(tokenFile);
const host = process.env.LISTEN_HOST?.trim() || '0.0.0.0';
const port = Number.parseInt(process.env.LISTEN_PORT || '8080', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('LISTEN_PORT must be between 1 and 65535.');
const requestTimeoutMs = Number.parseInt(process.env.REQUEST_TIMEOUT_MS || '20000', 10);
const maxBodyBytes = Number.parseInt(process.env.MAX_BODY_BYTES || '2100000', 10);

const server = createRelayServer({ upstreamBaseUrl, deviceTokens, requestTimeoutMs, maxBodyBytes });
server.listen(port, host, () => {
  console.log(`AttendFlow ADMS relay listening on http://${host}:${port}`);
  console.log(`Forwarding ADMS routes to ${new URL(upstreamBaseUrl).origin}${new URL(upstreamBaseUrl).pathname}`);
  console.log(`Loaded ${Object.keys(deviceTokens).length} device token mapping(s) from ${tokenFile}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; closing relay.`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
