import { Outlet } from 'react-router-dom';
import { useLocale } from '@/context/LocaleContext';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui-store';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const { t } = useLocale();
  return <div className="min-h-screen bg-background"><a href="#main-content" className="sr-only z-[100] rounded bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">{t('accessibility.skipToContent')}</a><Sidebar /><div className={cn('transition-[padding] duration-200 lg:pl-72', collapsed && 'lg:pl-20')}><Header /><main id="main-content" className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8"><Outlet /></main></div></div>;
}
