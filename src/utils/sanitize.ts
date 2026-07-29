import DOMPurify from 'dompurify';

export function sanitizeText(value: string, maxLength = 5_000): string {
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim().slice(0, maxLength);
}

export function normalizeSearch(value: string): string {
  return sanitizeText(value, 200).replace(/[,%()]/g, ' ').replace(/\s+/g, ' ');
}

export function safeFileName(value: string): string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}
