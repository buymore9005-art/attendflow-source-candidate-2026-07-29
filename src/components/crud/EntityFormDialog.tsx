import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { z, type ZodType } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '@/context/LocaleContext';
import type { FormFieldConfig } from '@/types/forms';

export type EntityFormValues = Record<string, unknown>;

function fieldSchema(field: FormFieldConfig): ZodType {
  if (field.type === 'switch') return z.boolean();
  if (field.type === 'number') {
    let schema = z.number({ error: 'validation.number' });
    if (field.min !== undefined) schema = schema.min(field.min, 'validation.positive');
    if (field.max !== undefined) schema = schema.max(field.max, 'validation.number');
    return z.preprocess((value) => value === '' || value === undefined ? (field.required ? Number.NaN : null) : Number(value), field.required ? schema : schema.nullable());
  }
  let schema = z.string();
  if (field.required) schema = schema.min(1, 'validation.required');
  if (field.min !== undefined) schema = schema.min(field.min, 'validation.minLength');
  if (field.max !== undefined) schema = schema.max(field.max, 'validation.maxLength');
  if (field.type === 'email') schema = schema.email('validation.email');
  return field.required ? schema : schema.optional().transform((value) => value || null);
}

function buildSchema(fields: FormFieldConfig[]) {
  return z.object(Object.fromEntries(fields.map((field) => [field.name, fieldSchema(field)])));
}

function defaultsFor(fields: FormFieldConfig[], initial?: object): EntityFormValues {
  const record = initial as Record<string, unknown> | undefined;
  return Object.fromEntries(fields.map((field) => {
    const current = record?.[field.name];
    if (current !== undefined && current !== null) return [field.name, current];
    if (field.defaultValue !== undefined) return [field.name, field.defaultValue];
    return [field.name, field.type === 'switch' ? false : ''];
  }));
}

export function EntityFormDialog({ open, onOpenChange, titleKey, descriptionKey, fields, initialValues, saving, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleKey: string;
  descriptionKey?: string;
  fields: FormFieldConfig[];
  initialValues?: object;
  saving?: boolean;
  onSubmit: (values: EntityFormValues) => Promise<void>;
}) {
  const { t } = useLocale();
  const schema = buildSchema(fields);
  const form = useForm<EntityFormValues>({
    resolver: zodResolver(schema) as Resolver<EntityFormValues>,
    values: defaultsFor(fields, initialValues)
  });
  const submit = form.handleSubmit(async (values) => onSubmit(values));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{t(titleKey)}</DialogTitle>{descriptionKey && <DialogDescription>{t(descriptionKey)}</DialogDescription>}</DialogHeader><form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
    {fields.map((field) => <Controller key={field.name} name={field.name} control={form.control} render={({ field: control, fieldState }) => <div className={field.gridSpan === 2 ? 'space-y-2 sm:col-span-2' : 'space-y-2'}><div className="flex items-center justify-between"><Label htmlFor={`field-${field.name}`}>{t(field.labelKey)}{field.required && <span aria-hidden className="ml-1 text-destructive">*</span>}</Label>{fieldState.error && <span className="text-xs text-destructive">{t(String(fieldState.error.message ?? 'validation.required'))}</span>}</div>
      {field.type === 'textarea' ? <Textarea id={`field-${field.name}`} value={String(control.value ?? '')} onChange={control.onChange} rows={4} /> : field.type === 'select' ? <Select value={String(control.value ?? '')} onValueChange={control.onChange}><SelectTrigger id={`field-${field.name}`}><SelectValue placeholder={field.placeholderKey ? t(field.placeholderKey) : t('common.selectOne')} /></SelectTrigger><SelectContent>{field.options?.map((option) => <SelectItem key={option.value} value={option.value}>{option.labelKey ? t(option.labelKey) : option.label}</SelectItem>)}</SelectContent></Select> : field.type === 'switch' ? <div className="flex h-10 items-center"><Switch id={`field-${field.name}`} checked={Boolean(control.value)} onCheckedChange={control.onChange} /></div> : <Input id={`field-${field.name}`} type={field.type} value={String(control.value ?? '')} onChange={control.onChange} min={field.min} max={field.max} step={field.step} />}
    </div>} />)}
    <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}
