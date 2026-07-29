import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Fingerprint, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { asErrorMessage } from '@/lib/utils';

interface LoginValues { email: string; password: string }

export function LoginPage() {
  const { t, locale, setLocale } = useLocale();
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const schema = useMemo(() => z.object({
    email: z.string().trim().min(1, t('validation.required', { field: t('auth.email') })).email(t('validation.email')),
    password: z.string().min(8, t('validation.minLength', { field: t('auth.password'), min: 8 }))
  }), [t]);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  useEffect(() => { document.title = `${t('auth.login')} · AttendFlow`; }, [t]);
  if (session) return <Navigate to="/" replace />;

  const submit = async (values: LoginValues) => {
    try {
      await signIn(values);
      toast.success(t('notification.loginSuccess'));
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';
      navigate(destination, { replace: true });
    } catch (error) {
      toast.error(t('auth.invalidCredentials'), { description: asErrorMessage(error, t) });
    }
  };

  return <main className="grid min-h-screen lg:grid-cols-2">
    <section className="hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="flex items-center gap-3 text-xl font-semibold"><span className="flex size-10 items-center justify-center rounded-xl bg-teal-400 text-slate-950"><Fingerprint /></span>AttendFlow</div>
      <div className="max-w-lg space-y-5"><p className="text-4xl font-semibold leading-tight">{t('app.tagline')}</p><p className="text-slate-300">{t('app.platformDescription')}</p></div>
      <p className="text-sm text-slate-400">React · Supabase · Vercel</p>
    </section>
    <section className="flex items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-end"><Select value={locale} onValueChange={(value) => setLocale(value as 'id' | 'en' | 'zh')}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="id">Indonesia</SelectItem><SelectItem value="en">English</SelectItem><SelectItem value="zh">简体中文</SelectItem></SelectContent></Select></div>
        <Card>
          <CardHeader><CardTitle className="text-2xl">{t('auth.loginTitle')}</CardTitle><CardDescription>{t('auth.loginDescription')}</CardDescription></CardHeader>
          <CardContent><form className="space-y-5" onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
            <div className="space-y-2"><Label htmlFor="email">{t('auth.email')}</Label><Input id="email" type="email" autoComplete="email" {...register('email')} aria-invalid={Boolean(errors.email)} /><p className="min-h-5 text-xs text-destructive">{errors.email?.message}</p></div>
            <div className="space-y-2"><Label htmlFor="password">{t('auth.password')}</Label><div className="relative"><Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="pr-10" {...register('password')} aria-invalid={Boolean(errors.password)} /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><p className="min-h-5 text-xs text-destructive">{errors.password?.message}</p></div>
            <Button className="w-full" type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="animate-spin" />}{t('auth.login')}</Button>
          </form></CardContent>
        </Card>
      </div>
    </section>
  </main>;
}
