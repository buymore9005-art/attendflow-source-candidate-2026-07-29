export function asErrorMessage(error: unknown, translate?: (key: string) => string): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'error.unexpected';
  if (translate && /^(?:error|validation)\.[A-Za-z0-9_.-]+$/.test(message)) return translate(message);
  return message;
}
