function objectMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : null;
}

function containsMissingSupabaseApiKey(message: string): boolean {
  if (/no api key found in request/i.test(message)) return true;
  if (!message.trim().startsWith('{')) return false;
  try {
    const parsed = JSON.parse(message) as { message?: unknown };
    return typeof parsed.message === 'string' && /no api key found in request/i.test(parsed.message);
  } catch {
    return false;
  }
}

export function asErrorMessage(error: unknown, translate?: (key: string) => string): string {
  let message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : objectMessage(error) ?? 'error.unexpected';

  if (containsMissingSupabaseApiKey(message)) message = 'error.supabaseApiKeyMissing';
  if (translate && /^(?:error|validation)\.[A-Za-z0-9_.-]+$/.test(message)) return translate(message);
  return message;
}
