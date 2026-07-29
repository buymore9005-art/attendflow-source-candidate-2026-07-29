export const QUERY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const QUERY_CACHE_BUSTER = 'attendflow-query-cache-v2';

const QUERY_CACHE_PREFIX = 'attendflow-query-cache:v2';
const USER_CACHE_GENERATION_PREFIX = 'attendflow-user-cache:generation:v1';
const STORAGE_ACCESS_PROBE_KEY = 'attendflow-cache:access-probe';
const NON_PERSISTED_QUERY_ROOTS = new Set(['signed-file']);
const volatileGenerations = new Map<string, string>();

export interface QueryCacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PersistableQuery {
  queryKey: readonly unknown[];
  state: {
    status: string;
    data: unknown;
  };
}

export function queryCacheStorageKey(userId: string): string {
  return `${QUERY_CACHE_PREFIX}:${encodeURIComponent(userId)}`;
}

export function isQueryCacheStorageAccessible(storage: QueryCacheStorage): boolean {
  try {
    storage.getItem(STORAGE_ACCESS_PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

function userCacheGenerationKey(userId: string): string {
  return `${USER_CACHE_GENERATION_PREFIX}:${encodeURIComponent(userId)}`;
}

function readPersistedGeneration(userId: string, storage: QueryCacheStorage): string {
  try {
    return storage.getItem(userCacheGenerationKey(userId)) ?? '';
  } catch {
    return '';
  }
}

function readGeneration(userId: string, storage: QueryCacheStorage): string {
  return `${volatileGenerations.get(userId) ?? ''}\u0000${readPersistedGeneration(userId, storage)}`;
}

function safelyRemove(storage: QueryCacheStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Cache cleanup must never block logout or application startup.
  }
}

export function createUserScopedQueryStorage(userId: string, storage: QueryCacheStorage): QueryCacheStorage {
  const generation = readGeneration(userId, storage);
  const isCurrentGeneration = () => readGeneration(userId, storage) === generation;

  return {
    getItem: (key) => isCurrentGeneration() ? storage.getItem(key) : null,
    setItem: (key, value) => {
      if (isCurrentGeneration()) storage.setItem(key, value);
    },
    removeItem: (key) => {
      if (isCurrentGeneration()) storage.removeItem(key);
    }
  };
}

export function revokeUserLocalCache(userId: string, storage: QueryCacheStorage, keys: readonly string[]): void {
  const generation = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  volatileGenerations.set(userId, generation);

  let persisted = false;
  try {
    storage.setItem(userCacheGenerationKey(userId), generation);
    persisted = true;
  } catch {
    // A full localStorage can reject the generation token. Remove our large
    // cache entries first, then retry so delayed writes remain revoked.
  }

  if (!persisted) {
    for (const key of keys) safelyRemove(storage, key);
    try {
      storage.setItem(userCacheGenerationKey(userId), generation);
    } catch {
      // The in-memory generation still protects this tab. A storage that
      // rejects the token also cannot reliably accept cache writes.
    }
  }

  for (const key of keys) safelyRemove(storage, key);
}

export function revokeUserQueryCache(userId: string, storage: QueryCacheStorage): void {
  revokeUserLocalCache(userId, storage, [queryCacheStorageKey(userId)]);
}

export function shouldPersistQuery(query: PersistableQuery): boolean {
  const root = query.queryKey[0];
  return query.state.status === 'success'
    && query.state.data !== undefined
    && !(typeof root === 'string' && NON_PERSISTED_QUERY_ROOTS.has(root));
}
