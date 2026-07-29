import { Bell, Check, ChevronsUpDown, Languages, LogOut, Menu, Moon, Search, Settings, Sun, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { asErrorMessage } from '@/lib/utils';
import { useUiStore } from '@/stores/ui-store';
import { CommandPalette } from './CommandPalette';

function initials(value: string): string { return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U'; }

export function Header() {
  const { t, locale, setLocale } = useLocale();
  const { profile, user, memberships, activeMembership, signOut } = useAuth();
  const setActiveOrganizationId = useUiStore((state) => state.setActiveOrganizationId);
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const online = useOnlineStatus();
  const [commandOpen, setCommandOpen] = useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen((open) => !open); } };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);
  const logout = async () => { try { await signOut(); toast.success(t('notification.logoutSuccess')); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } };
  const displayName = profile?.full_name ?? user?.email ?? t('common.user');
  return <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
    <Button size="icon-sm" variant="ghost" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t('accessibility.openSidebar')}><Menu /></Button>
    <Button variant="outline" className="hidden w-full max-w-sm justify-start text-muted-foreground sm:flex" onClick={() => setCommandOpen(true)}><Search />{t('common.search')}<kbd className="ml-auto rounded border px-1.5 text-[10px]">Ctrl K</kbd></Button>
    <div className="ml-auto flex items-center gap-1 sm:gap-2">
      <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">{online ? <Wifi className="size-4 text-emerald-500" /> : <WifiOff className="size-4 text-destructive" />}{online ? t('common.online') : t('common.offline')}</span>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="hidden max-w-56 justify-between md:flex"><span className="truncate">{activeMembership?.organization?.name ?? t('menu.organization')}</span><ChevronsUpDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64"><DropdownMenuLabel>{t('menu.organization')}</DropdownMenuLabel><DropdownMenuSeparator />{memberships.map((membership) => <DropdownMenuItem key={membership.id} onSelect={() => setActiveOrganizationId(membership.organization_id)}>{membership.organization_id === activeMembership?.organization_id && <Check />}{membership.organization?.name ?? membership.organization_id}<span className="ml-auto text-xs uppercase text-muted-foreground">{membership.role}</span></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={t('common.language')}><Languages /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={locale} onValueChange={(value) => setLocale(value as 'id' | 'en' | 'zh')}><DropdownMenuRadioItem value="id">Indonesia</DropdownMenuRadioItem><DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem><DropdownMenuRadioItem value="zh">简体中文</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={t('accessibility.toggleTheme')}>{theme === 'dark' ? <Moon /> : <Sun />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}><DropdownMenuRadioItem value="light">{t('common.light')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark">{t('common.dark')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="system">{t('common.system')}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
      <Button asChild size="icon-sm" variant="ghost" aria-label={t('dashboard.systemNotifications')}><Link to="/notifications"><Bell /></Link></Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-10 gap-2 px-1 sm:px-2"><Avatar className="size-8"><AvatarImage src={profile?.avatar_path ?? undefined} alt={displayName} /><AvatarFallback>{initials(displayName)}</AvatarFallback></Avatar><span className="hidden max-w-32 truncate text-sm sm:block">{displayName}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel><div className="truncate">{displayName}</div><div className="truncate text-xs font-normal text-muted-foreground">{user?.email}</div></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link to="/settings"><Settings />{t('menu.settings')}</Link></DropdownMenuItem><DropdownMenuItem onSelect={() => void logout()}><LogOut />{t('auth.logout')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </div><CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
  </header>;
}
