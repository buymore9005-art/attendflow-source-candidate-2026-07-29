export interface AdmsAttLogRow {
  deviceUserId: string;
  punchedAt: string;
  statusCode: number;
  verificationMode: number;
  workCode: string;
  reserved: string;
}

export function parseAdmsAttLog(body: string): AdmsAttLogRow[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      if (parts.length < 2) throw new Error(`Invalid ATTLOG row: ${line}`);
      return {
        deviceUserId: parts[0] ?? '',
        punchedAt: parts[1] ?? '',
        statusCode: Number.parseInt(parts[2] ?? '0', 10) || 0,
        verificationMode: Number.parseInt(parts[3] ?? '0', 10) || 0,
        workCode: parts[4] ?? '0',
        reserved: parts[5] ?? '0'
      };
    });
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createAdmsIdempotencyKey(
  serialNumber: string,
  deviceUserId: string,
  punchedAt: string,
  statusCode: string | number
): Promise<string> {
  return sha256Hex([serialNumber, deviceUserId, punchedAt, statusCode].join('|'));
}
