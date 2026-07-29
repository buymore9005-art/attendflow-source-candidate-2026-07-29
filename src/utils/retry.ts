export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  jitter: boolean;
}

export interface RetryOptions {
  maxAttempts: number;
  backoff?: BackoffOptions;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  delay?: (milliseconds: number) => Promise<void>;
}

const defaultDelay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function computeBackoffMs(attempt: number, options: BackoffOptions): number {
  const exponent = Math.max(0, attempt - 1);
  const raw = Math.min(options.maxMs, options.baseMs * 2 ** exponent);
  if (!options.jitter) return raw;
  return Math.max(0, Math.round(raw * (0.5 + Math.random() * 0.5)));
}

export async function retryOperation<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  if (options.maxAttempts < 1) throw new Error('maxAttempts must be at least 1');
  const backoff = options.backoff ?? { baseMs: 500, maxMs: 30_000, jitter: true };
  const delay = options.delay ?? defaultDelay;
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryAllowed = options.shouldRetry?.(error, attempt) ?? true;
      if (!retryAllowed || attempt >= options.maxAttempts) throw error;
      await delay(computeBackoffMs(attempt, backoff));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Retry operation failed');
}
