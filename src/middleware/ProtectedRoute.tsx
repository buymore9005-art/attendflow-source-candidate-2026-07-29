import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';

export function ProtectedRoute() {
  const { session, memberships, loading } = useAuth();
  const { t } = useLocale();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />{t('common.loading')}</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (memberships.length === 0) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
