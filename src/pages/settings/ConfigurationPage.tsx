import { Copy, Database } from 'lucide-react';
import { toast } from 'sonner';
import { useLocale } from '@/context/LocaleContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const environmentTemplate = 'VITE_SUPABASE_URL=\nVITE_SUPABASE_PUBLISHABLE_KEY=';

export function ConfigurationPage() {
  const { t } = useLocale();
  const copyTemplate = async () => {
    await navigator.clipboard.writeText(environmentTemplate);
    toast.success(t('common.copied'));
  };
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><Card className="w-full max-w-xl"><CardHeader className="space-y-4"><div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Database /></div><div><CardTitle className="text-2xl">AttendFlow</CardTitle><CardDescription>{t('app.tagline')}</CardDescription></div></CardHeader><CardContent className="space-y-5"><div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"><strong>{t('error.configurationMissing')}</strong><p className="mt-1">{t('error.configurationHelp')}</p></div><pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{environmentTemplate}</pre><Button type="button" variant="outline" onClick={() => void copyTemplate()}><Copy />{t('settings.copyEnvironment')}</Button><p className="text-sm text-muted-foreground">{t('settings.setupGuideHint')}</p></CardContent></Card></main>;
}
