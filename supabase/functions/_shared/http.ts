export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id, x-device-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

export function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }
  });
}

export function textResponse(body: string, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }
  });
}

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function getClientIp(request: Request): string | null {
  const raw = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? request.headers.get('cf-connecting-ip');
  return raw?.split(',')[0]?.trim() || null;
}

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, message: string, code = 'request_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorResponse(error: unknown, correlationId: string): Response {
  if (error instanceof HttpError) return jsonResponse({ error: error.code, message: error.message, correlation_id: correlationId }, error.status);
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error(JSON.stringify({ correlation_id: correlationId, message, stack: error instanceof Error ? error.stack : undefined }));
  return jsonResponse({ error: 'internal_error', message: 'The request could not be completed.', correlation_id: correlationId }, 500);
}

export function correlationId(request: Request): string {
  const incoming = request.headers.get('x-correlation-id');
  return incoming && /^[0-9a-f-]{36}$/i.test(incoming) ? incoming : crypto.randomUUID();
}

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 1_048_576;

async function readRequestBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('maxBytes must be a positive safe integer.');

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new HttpError(400, 'Content-Length must be a non-negative integer.', 'invalid_content_length');
    if (Number(contentLength) > maxBytes) throw new HttpError(413, `Request body exceeds the ${maxBytes}-byte limit.`, 'payload_too_large');
  }

  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError(413, `Request body exceeds the ${maxBytes}-byte limit.`, 'payload_too_large');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'The request body could not be read.', 'invalid_body');
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readTextBody(
  request: Request,
  maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<string> {
  return new TextDecoder().decode(await readRequestBytes(request, maxBytes));
}

export async function readJsonObject(
  request: Request,
  maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<Record<string, unknown>> {
  const bytes = await readRequestBytes(request, maxBytes);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Request body must be a JSON object.', 'invalid_body');
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, name: string, max = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new HttpError(400, `${name} is required.`, 'validation_error');
  const normalized = value.trim();
  if (normalized.length > max) throw new HttpError(400, `${name} exceeds ${max} characters.`, 'validation_error');
  return normalized;
}
