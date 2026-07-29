import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface State { error: Error | null }
interface ErrorBoundaryProps { children: ReactNode; title: string; reloadLabel: string }

class ErrorBoundaryCore extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Application error', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <main className="flex min-h-screen items-center justify-center p-6"><Card className="max-w-lg"><CardHeader><AlertTriangle className="size-10 text-destructive" /><CardTitle>{this.props.title}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{this.state.error.message}</p><Button onClick={() => window.location.reload()}>{this.props.reloadLabel}</Button></CardContent></Card></main>;
  }
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return <ErrorBoundaryCore title={t('common.error')} reloadLabel={t('common.reload')}>{children}</ErrorBoundaryCore>;
}
