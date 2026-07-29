type FetchLike = typeof fetch;

function mergedHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  return headers;
}

/**
 * Adds the configured public API key at the final network boundary.
 * Supabase JS also adds this header, but enforcing it here prevents an
 * interceptor or sub-client request from reaching the API gateway without it.
 */
export function createSupabaseTransport(
  supabaseUrl: string,
  apiKey: string,
  fetchImpl: FetchLike = (...args) => fetch(...args),
): FetchLike {
  const supabaseOrigin = new URL(supabaseUrl).origin;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      supabaseOrigin,
    );

    if (requestUrl.origin !== supabaseOrigin) return fetchImpl(input, init);

    const headers = mergedHeaders(input, init);
    headers.set('apikey', apiKey);
    return fetchImpl(input, { ...init, headers });
  }) as FetchLike;
}
