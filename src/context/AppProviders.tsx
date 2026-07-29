import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { env } from '@/lib/env';
import { QUERY_CACHE_BUSTER, QUERY_CACHE_MAX_AGE_MS, createQueryClient, createQueryPersister, removeLegacyQueryCache, shouldPersistQuery } from '@/lib/query-client';
import { useUiStore } from '@/stores/ui-store';
import { AuthProvider, useAuth } from './AuthContext';
import { LocaleProvider } from './LocaleContext';
import { SupabaseSyncController } from './SupabaseSyncController';

function ThemeController() {
  const theme = useUiStore((state) => state.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return null;
}

function QueryProviderInstance({ cacheScope, children }: { cacheScope: string; children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const persister = useMemo(() => cacheScope.startsWith('user:') ? createQueryPersister(cacheScope.slice(5)) : null, [cacheScope]);
  const content = <><SupabaseSyncController />{children}</>;

  useEffect(() => { removeLegacyQueryCache(); }, []);

  if (!env.offlineCacheEnabled || !persister) {
    return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: QUERY_CACHE_MAX_AGE_MS,
        buster: QUERY_CACHE_BUSTER,
        dehydrateOptions: {
          shouldDehydrateMutation: () => false,
          shouldDehydrateQuery: shouldPersistQuery
        }
      }}
    >
      {content}
    </PersistQueryClientProvider>
  );
}

function ScopedQueryProvider({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const cacheScope = loading ? 'loading' : user ? `user:${user.id}` : 'anonymous';
  return <QueryProviderInstance key={cacheScope} cacheScope={cacheScope}>{children}</QueryProviderInstance>;
}

function ApplicationContext({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <TooltipProvider delayDuration={250}>
        <AuthProvider>
          <ScopedQueryProvider>
            <ThemeController />
            {children}
            <Toaster richColors position="top-right" closeButton />
          </ScopedQueryProvider>
        </AuthProvider>
      </TooltipProvider>
    </LocaleProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return <ApplicationContext>{children}</ApplicationContext>;
}
