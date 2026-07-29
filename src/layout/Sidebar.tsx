import { ChevronLeft, ChevronRight, Fingerprint, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui-store';
import { navigationGroups } from './navigation';

function NavigationContent({ mobile = false }: { mobile?: boolean }) {
  const { t } = useLocale();
  const { can } = useAuth();
  const collapsed = useUiStore((state) => state.sidebarCollapsed) && !mobile;
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const groups = useMemo(() => navigationGroups.map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || can(item.permission)) })).filter((group) => group.items.length > 0), [can]);
  return <div className="flex h-full flex-col">
    <div className={cn('flex h-16 items-center border-b px-4', collapsed ? 'justify-center' : 'gap-3')}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Fingerprint className="size-5" /></span>
      {!collapsed && <div className="min-w-0"><div className="truncate font-semibold">AttendFlow</div><div className="truncate text-xs text-muted-foreground">{t('app.tagline')}</div></div>}
      {mobile && <Button className="ml-auto" size="icon-sm" variant="ghost" onClick={() => setMobileOpen(false)} aria-label={t('accessibility.closeSidebar')}><X /></Button>}
    </div>
    <nav className="flex-1 space-y-5 overflow-y-auto p-3" aria-label={t('accessibility.primaryNavigation')}>
      {groups.map((group, groupIndex) => <div key={group.labelKey ?? groupIndex} className="space-y-1">
        {group.labelKey && !collapsed && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(group.labelKey)}</p>}
        {group.items.map((item) => {
          const link = <NavLink key={item.path} to={item.path} onClick={() => mobile && setMobileOpen(false)} className={({ isActive }) => cn('flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors', collapsed && 'justify-center px-0', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')} end={item.path === '/'}><item.icon className="size-4 shrink-0" />{!collapsed && <span className="truncate">{t(item.labelKey)}</span>}</NavLink>;
          return collapsed ? <Tooltip key={item.path}><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{t(item.labelKey)}</TooltipContent></Tooltip> : link;
        })}
      </div>)}
    </nav>
  </div>;
}

export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileOpen = useUiStore((state) => state.mobileSidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const { t } = useLocale();
  const location = useLocation();

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)');
    const autoCollapse = () => { if (media.matches) setCollapsed(true); };
    autoCollapse();
    media.addEventListener('change', autoCollapse);
    return () => media.removeEventListener('change', autoCollapse);
  }, [setCollapsed]);
  useEffect(() => setMobileOpen(false), [location.pathname, setMobileOpen]);

  return <>
    <aside className={cn('fixed inset-y-0 left-0 z-40 hidden border-r bg-card transition-[width] duration-200 lg:block', collapsed ? 'w-20' : 'w-72')}><NavigationContent /><Button variant="outline" size="icon-sm" className="absolute -right-4 top-20 rounded-full bg-background" onClick={toggleSidebar} aria-label={collapsed ? t('accessibility.openSidebar') : t('accessibility.closeSidebar')}>{collapsed ? <ChevronRight /> : <ChevronLeft />}</Button></aside>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-slate-950/60" onClick={() => setMobileOpen(false)} aria-label={t('accessibility.closeSidebar')} /><aside className="relative h-full w-[min(86vw,20rem)] border-r bg-card shadow-xl"><NavigationContent mobile /></aside></div>}
  </>;
}
