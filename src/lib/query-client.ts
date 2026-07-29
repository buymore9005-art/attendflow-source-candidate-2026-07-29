import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { removeOldestQuery } from '@tanstack/react-query-persist-client';
import { authBootstrapStorageKey } from './auth-bootstrap-cache';
import {
  QUERY_CACHE_BUSTER,
  QUERY_CACHE_MAX_AGE_MS,
  createUserScopedQueryStorage,
  isQueryCacheStorageAccessible,
  queryCacheStorageKey,
  revokeUserLocalCache,
  shouldPersistQuery,
  type QueryCacheStorage
} from './query-cache-policy';

export {
  QUERY_CACHE_BUSTER,
  QUERY_CACHE_MAX_AGE_MS,
  queryCacheStorageKey,
  shouldPersistQuery
} from './query-cache-policy';

const LEGACY_QUERY_CACHE_KEY = 'attendflow-query-cache';

export function getQueryCacheStorage(): QueryCacheStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const storage = window.localStorage;
    return isQueryCacheStorageAccessible(storage) ? storage : undefined;
  } catch {
    return undefined;
  }
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: QUERY_CACHE_MAX_AGE_MS,
        retry: (failureCount, error) => {
          const status = (error as { status?: number }).status;
          return status === 401 || status === 403 ? false : failureCount < 2;
        },
        refetchOnWindowFocus: true,
        networkMode: 'offlineFirst'
      },
      mutations: {
        retry: 0,
        networkMode: 'always'
      }
    }
  });
}

export function createQueryPersister(userId: string, storage: QueryCacheStorage | undefined = getQueryCacheStorage()) {
  return createSyncStoragePersister({
    storage: storage ? createUserScopedQueryStorage(userId, storage) : undefined,
    key: queryCacheStorageKey(userId),
    throttleTime: 1_000,
    retry: removeOldestQuery
  });
}

export function removePersistedUserCache(userId: string): void {
  const storage = getQueryCacheStorage();
  if (!storage) return;
  revokeUserLocalCache(userId, storage, [
    queryCacheStorageKey(userId),
    authBootstrapStorageKey(userId)
  ]);
}

export function removeLegacyQueryCache(): void {
  const storage = getQueryCacheStorage();
  if (!storage) return;
  try {
    storage.removeItem(LEGACY_QUERY_CACHE_KEY);
  } catch {
    // Legacy cleanup must not interrupt application startup.
  }
}
