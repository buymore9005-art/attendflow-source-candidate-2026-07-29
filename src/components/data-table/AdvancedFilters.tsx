import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useLocale } from '@/context/LocaleContext';
import type { FilterDefinition } from '@/types/data-table';

export function AdvancedFilters({ open, onOpenChange, definitions, values, onApply, onReset }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definitions: FilterDefinition[];
  values: Record<string, string | number | boolean | null>;
  onApply: (filters: Record<string, string | number | boolean | null>) => void;
  onReset: () => void;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(values);
  const update = (key: string, value: string | number | boolean | null) => setDraft((current) => ({ ...current, [key]: value }));
  return <Dialog open={open} onOpenChange={(next) => { if (next) setDraft(values); onOpenChange(next); }}><DialogContent><DialogHeader><DialogTitle>{t('common.advancedFilter')}</DialogTitle><DialogDescription>{t('common.filters')}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{definitions.map((definition) => <div key={definition.id} className="space-y-2"><Label htmlFor={`filter-${definition.id}`}>{t(definition.labelKey)}</Label>{definition.type === 'select' ? <Select value={String(draft[definition.id] ?? '__all__')} onValueChange={(value) => update(definition.id, value === '__all__' ? null : value)}><SelectTrigger id={`filter-${definition.id}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">{t('common.all')}</SelectItem>{definition.options?.map((option) => <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>)}</SelectContent></Select> : definition.type === 'boolean' ? <div className="flex h-10 items-center"><Switch id={`filter-${definition.id}`} checked={Boolean(draft[definition.id])} onCheckedChange={(checked) => update(definition.id, checked)} /></div> : definition.type === 'date-range' ? <div className="grid grid-cols-2 gap-2"><Input type="date" value={String(draft[`${definition.id}__from`] ?? '')} onChange={(event) => update(`${definition.id}__from`, event.target.value)} aria-label={`${t(definition.labelKey)} ${t('common.from')}`} /><Input type="date" value={String(draft[`${definition.id}__to`] ?? '')} onChange={(event) => update(`${definition.id}__to`, event.target.value)} aria-label={`${t(definition.labelKey)} ${t('common.to')}`} /></div> : <Input id={`filter-${definition.id}`} type={definition.type === 'date' ? 'date' : definition.type === 'number' ? 'number' : 'text'} value={String(draft[definition.id] ?? '')} onChange={(event) => update(definition.id, definition.type === 'number' ? Number(event.target.value) : event.target.value)} />}</div>)}</div><DialogFooter><Button type="button" variant="outline" onClick={() => { setDraft({}); onReset(); onOpenChange(false); }}>{t('common.resetFilter')}</Button><Button type="button" onClick={() => { onApply(draft); onOpenChange(false); }}>{t('common.confirm')}</Button></DialogFooter></DialogContent></Dialog>;
}
