import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000,
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

export const queryPersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'attendflow-query-cache',
  throttleTime: 1_000
});
