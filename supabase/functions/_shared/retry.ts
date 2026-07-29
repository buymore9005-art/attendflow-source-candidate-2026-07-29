export async function retry<T>(operation: () => Promise<T>, options: { attempts?: number; baseDelayMs?: number } = {}): Promise<T> {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 250;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(); } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const jitter = Math.floor(Math.random() * baseDelayMs);
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1) + jitter));
    }
  }
  throw lastError;
}
