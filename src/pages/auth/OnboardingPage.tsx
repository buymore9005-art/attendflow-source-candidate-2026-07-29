import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, LoaderCircle, LogOut } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { asErrorMessage } from '@/lib/utils';

interface Values { name: string; code: string }
export function OnboardingPage() {
  const { t } = useLocale();
  const { session, memberships, createOrganization, signOut } = useAuth();
  const navigate = useNavigate();
  const schema = useMemo(() => z.object({
    name: z.string().trim().min(2, t('validation.minLength', { field: t('auth.organizationName'), min: 2 })).max(120),
    code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/)
  }), [t]);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', code: '' } });
  if (!session) return <Navigate to="/login" replace />;
  if (memberships.length > 0) return <Navigate to="/" replace />;
  const submit = async (values: Values) => {
    try { await createOrganization(values); toast.success(t('notification.saved')); navigate('/', { replace: true }); }
    catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); }
  };
  return <main className="flex min-h-screen items-center justify-center p-6"><Card className="w-full max-w-xl"><CardHeader><div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Building2 /></div><CardTitle className="text-2xl">{t('auth.onboardingTitle')}</CardTitle><CardDescription>{t('auth.onboardingDescription')}</CardDescription></CardHeader><CardContent><form className="space-y-5" onSubmit={(event) => void handleSubmit(submit)(event)}><div className="space-y-2"><Label htmlFor="name">{t('auth.organizationName')}</Label><Input id="name" {...register('name')} /><p className="text-xs text-destructive">{errors.name?.message}</p></div><div className="space-y-2"><Label htmlFor="code">{t('auth.organizationCode')}</Label><Input id="code" className="uppercase" {...register('code')} /><p className="text-xs text-destructive">{errors.code?.message}</p></div><div className="flex justify-between gap-3"><Button type="button" variant="ghost" onClick={() => void signOut()}><LogOut />{t('auth.logout')}</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="animate-spin" />}{t('auth.createOrganization')}</Button></div></form></CardContent></Card></main>;
}
