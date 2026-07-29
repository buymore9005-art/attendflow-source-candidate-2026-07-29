import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/context/LocaleContext';

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return <div className="space-y-2 p-4" aria-busy="true">{Array.from({ length: rows }, (_, row) => <div key={row} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{Array.from({ length: columns }, (__, column) => <Skeleton key={column} className="h-9" />)}</div>)}</div>;
}

export function EmptyState() {
  const { t } = useLocale();
  return <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><span className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted"><Inbox className="size-7 text-muted-foreground" /></span><h3 className="font-semibold">{t('common.empty')}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{t('common.emptyDescription')}</p></div>;
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useLocale();
  return <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><span className="mb-4 flex size-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950"><AlertTriangle className="size-7 text-destructive" /></span><h3 className="font-semibold">{t('common.error')}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{message ?? t('common.errorDescription')}</p>{onRetry && <Button variant="outline" className="mt-4" onClick={onRetry}><RefreshCw />{t('common.retry')}</Button>}</div>;
}
