import type { LocaleCode } from '@/i18n/translator';

const locales: Record<LocaleCode, string> = { id: 'id-ID', en: 'en-US', zh: 'zh-CN' };

export function formatCurrency(value: number | null | undefined, locale: LocaleCode = 'id', currency = 'IDR'): string {
  return new Intl.NumberFormat(locales[locale], {
    style: 'currency', currency, maximumFractionDigits: currency === 'IDR' ? 0 : 2
  }).format(value ?? 0);
}

export function formatNumber(value: number | null | undefined, locale: LocaleCode = 'id'): string {
  return new Intl.NumberFormat(locales[locale]).format(value ?? 0);
}

export function formatDate(value: string | null | undefined, locale: LocaleCode = 'id', options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locales[locale], options ?? { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value: string | null | undefined, locale: LocaleCode = 'id'): string {
  return formatDate(value, locale, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatMinutes(value: number | null | undefined): string {
  const minutes = Math.max(0, value ?? 0);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}
