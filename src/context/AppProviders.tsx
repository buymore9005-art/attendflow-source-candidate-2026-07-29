import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { env } from '@/lib/env';
import { queryClient, queryPersister } from '@/lib/query-client';
import { useUiStore } from '@/stores/ui-store';
import { AuthProvider } from './AuthContext';
import { LocaleProvider } from './LocaleContext';

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

function ApplicationContext({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <TooltipProvider delayDuration={250}>
        <AuthProvider>
          <ThemeController />
          {children}
          <Toaster richColors position="top-right" closeButton />
        </AuthProvider>
      </TooltipProvider>
    </LocaleProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const content = <ApplicationContext>{children}</ApplicationContext>;

  if (!env.offlineCacheEnabled) {
    return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: '1.0.0',
        dehydrateOptions: { shouldDehydrateMutation: () => false }
      }}
    >
      {content}
    </PersistQueryClientProvider>
  );
}
