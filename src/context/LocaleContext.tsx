import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { dictionaries } from '@/i18n/dictionaries';
import { createTranslator, type LocaleCode, type TranslationParams } from '@/i18n/translator';
import { useUiStore } from '@/stores/ui-store';

interface LocaleContextValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: (key: string, params?: TranslationParams) => string;
  dateLocale: string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const browserLocales: Record<LocaleCode, string> = {
  id: 'id-ID',
  en: 'en-US',
  zh: 'zh-CN'
};

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);
  useEffect(() => {
    document.documentElement.lang = browserLocales[locale];
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    t: createTranslator(locale, dictionaries),
    dateLocale: browserLocales[locale]
  }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used within LocaleProvider');
  return value;
}
