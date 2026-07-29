function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = '';
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function backupKey(): Promise<CryptoKey> {
  const configured = Deno.env.get('BACKUP_ENCRYPTION_KEY');
  if (!configured) throw new Error('BACKUP_ENCRYPTION_KEY is required for backup and restore.');
  const bytes = decodeBase64(configured);
  if (bytes.byteLength !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(payload: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await backupKey(), payload));
  const envelope = JSON.stringify({ version: 1, algorithm: 'AES-256-GCM', iv: encodeBase64(iv), ciphertext: encodeBase64(ciphertext) });
  return new TextEncoder().encode(envelope);
}

export async function decryptBackup(payload: Uint8Array): Promise<Uint8Array> {
  const envelope = JSON.parse(new TextDecoder().decode(payload)) as { version: number; iv: string; ciphertext: string };
  if (envelope.version !== 1 || !envelope.iv || !envelope.ciphertext) throw new Error('Unsupported backup envelope.');
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64(envelope.iv) }, await backupKey(), decodeBase64(envelope.ciphertext)));
}

export async function sha256(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', value));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
