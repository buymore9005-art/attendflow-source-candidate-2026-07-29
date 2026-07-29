import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function PermissionRoute({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useAuth();
  const { t } = useLocale();
  if (can(permission)) return children;
  return <div className="mx-auto max-w-xl py-16"><Card><CardHeader><ShieldAlert className="size-10 text-destructive" /><CardTitle>{t('error.forbidden')}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{permission}</CardContent></Card></div>;
}
