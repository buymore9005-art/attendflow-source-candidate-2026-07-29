import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { navigationGroups } from './navigation';

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [search, setSearch] = useState('');
  const { t } = useLocale();
  const { can } = useAuth();
  const navigate = useNavigate();
  const items = useMemo(() => navigationGroups.flatMap((group) => group.items).filter((item) => (!item.permission || can(item.permission)) && t(item.labelKey).toLowerCase().includes(search.toLowerCase())), [can, search, t]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl p-0"><DialogHeader className="sr-only"><DialogTitle>{t('common.search')}</DialogTitle><DialogDescription>{t('common.searchPlaceholder')}</DialogDescription></DialogHeader><div className="flex items-center gap-2 border-b px-4"><Search className="size-4 text-muted-foreground" /><Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('common.searchPlaceholder')} className="border-0 shadow-none focus-visible:outline-none" /></div><div className="max-h-80 overflow-y-auto p-2">{items.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">{t('common.noResults')}</p> : items.map((item) => <button key={item.path} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { navigate(item.path); onOpenChange(false); setSearch(''); }}><item.icon className="size-4" />{t(item.labelKey)}</button>)}</div></DialogContent></Dialog>;
}
