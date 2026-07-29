function parseHttpsOrigin(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label} must use HTTPS.`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials.`);
  return url;
}

function isLocalOrIpHost(hostname: string): boolean {
  const unwrapped = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (unwrapped === 'localhost' || unwrapped.endsWith('.localhost') || unwrapped.endsWith('.local')) return true;
  if (unwrapped.includes(':')) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(unwrapped);
}

export function validateAllowedHttpsWebhook(value: unknown, allowedOriginsValue: string | undefined): string | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'string') throw new Error('Payroll webhook URL is invalid.');

  const candidate = parseHttpsOrigin(value.trim(), 'Payroll webhook URL');
  if (candidate.hash) throw new Error('Payroll webhook URL must not contain a fragment.');
  if (isLocalOrIpHost(candidate.hostname)) throw new Error('Payroll webhook URL must use a public DNS hostname; local hosts and IP literals are not allowed.');

  const rawOrigins = allowedOriginsValue?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? [];
  if (rawOrigins.length === 0) throw new Error('DELI_PAYROLL_WEBHOOK_ALLOWED_ORIGINS must list the allowed origins before payroll webhook delivery is enabled.');
  const allowedOrigins = new Set(rawOrigins.map((entry) => {
    const allowed = parseHttpsOrigin(entry, 'Allowed payroll webhook origin');
    if (allowed.pathname !== '/' || allowed.search || allowed.hash) throw new Error('Allowed payroll webhook entries must be HTTPS origins without a path, query, or fragment.');
    if (isLocalOrIpHost(allowed.hostname)) throw new Error('Allowed payroll webhook origins must use public DNS hostnames.');
    return allowed.origin;
  }));

  if (!allowedOrigins.has(candidate.origin)) throw new Error(`Payroll webhook origin ${candidate.origin} is not allowlisted.`);
  return value.trim();
}
