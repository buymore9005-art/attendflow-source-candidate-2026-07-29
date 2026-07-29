import { ArrowLeft, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/context/LocaleContext';

export default function NotFoundPage() {
  const { t } = useLocale();
  return <div className="mx-auto flex min-h-[70vh] max-w-xl items-center"><Card className="w-full"><CardHeader><SearchX className="size-10 text-muted-foreground" /><CardTitle>{t('error.notFound')}</CardTitle></CardHeader><CardContent><Button asChild><Link to="/"><ArrowLeft />{t('common.back')}</Link></Button></CardContent></Card></div>;
}
