import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Check, FileImage, LoaderCircle, UploadCloud } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm, type FieldErrors, type FieldPath } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { getSupabase } from '@/lib/supabase';
import { asErrorMessage, cn } from '@/lib/utils';
import { getLookupOptions } from '@/services/entity-service';
import { removeOrganizationFiles, uploadOrganizationFile } from '@/services/storage-service';

const optionalText = (max: number) => z.string().trim().max(max, 'validation.maxLength').optional().transform((value) => value || null);
const employeeSchema = z.object({
  nik: optionalText(32),
  full_name: z.string().trim().min(2, 'validation.minLength').max(160, 'validation.maxLength'),
  gender: z.enum(['male', 'female', 'other']).nullable(),
  birth_place: optionalText(120),
  birth_date: z.string().nullable(),
  address: optionalText(1000),
  phone: optionalText(32),
  email: z.string().trim().email('validation.email').or(z.literal('')).transform((value) => value || null),
  department_id: z.string().nullable(),
  position_id: z.string().nullable(),
  status: z.enum(['active', 'inactive', 'probation', 'resigned', 'terminated']),
  shift_id: z.string().nullable(),
  join_date: z.string().min(1, 'validation.required'),
  bpjs_status: z.boolean(),
  bpjs_number: optionalText(40),
  npwp: optionalText(40),
  bank_name: optionalText(80),
  bank_account_number: optionalText(64),
  bank_account_name: optionalText(160),
  emergency_contact_name: optionalText(160),
  emergency_contact_phone: optionalText(32),
  fingerprint_pin: optionalText(32),
  notes: optionalText(2000),
  photo: z.unknown().optional(),
  ktp: z.unknown().optional(),
  kk: z.unknown().optional()
});
type EmployeeForm = z.input<typeof employeeSchema>;
type ValidatedEmployee = z.output<typeof employeeSchema>;

const stepFields: Array<Array<FieldPath<EmployeeForm>>> = [
  ['nik', 'full_name', 'gender', 'birth_place', 'birth_date', 'address', 'phone', 'email', 'emergency_contact_name', 'emergency_contact_phone'],
  ['department_id', 'position_id', 'status', 'shift_id', 'join_date', 'fingerprint_pin'],
  ['bpjs_status', 'bpjs_number', 'npwp', 'bank_name', 'bank_account_number', 'bank_account_name'],
  ['photo', 'ktp', 'kk', 'notes'],
  []
];

function selectedFile(value: unknown): File | null {
  if (value instanceof File) return value;
  if (typeof FileList !== 'undefined' && value instanceof FileList) return value.item(0);
  return null;
}

function ErrorText({ errors, name }: { errors: FieldErrors<EmployeeForm>; name: FieldPath<EmployeeForm> }) {
  const { t } = useLocale();
  const message = errors[name]?.message;
  return message ? <p className="text-xs text-destructive">{t(String(message))}</p> : null;
}

function FieldBlock({ labelKey, error, children, required }: { labelKey: string; error?: React.ReactNode; children: React.ReactNode; required?: boolean }) {
  const { t } = useLocale();
  return <div className="space-y-2"><Label>{t(labelKey)}{required && <span className="ml-1 text-destructive">*</span>}</Label>{children}{error}</div>;
}

export default function EmployeeRegistrationPage() {
  const { t } = useLocale();
  const { activeMembership } = useAuth();
  const navigate = useNavigate();
  const organizationId = activeMembership?.organization_id ?? '';
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const form = useForm<EmployeeForm, unknown, ValidatedEmployee>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      nik: '', full_name: '', gender: null, birth_place: '', birth_date: '', address: '', phone: '', email: '',
      department_id: null, position_id: null, status: 'active', shift_id: null, join_date: new Date().toISOString().slice(0, 10),
      bpjs_status: false, bpjs_number: '', npwp: '', bank_name: '', bank_account_number: '', bank_account_name: '',
      emergency_contact_name: '', emergency_contact_phone: '', fingerprint_pin: '', notes: ''
    }
  });
  const lookups = useQuery({ queryKey: ['employee-lookups', organizationId], enabled: Boolean(organizationId), queryFn: async () => {
    const [departments, positions, shifts] = await Promise.all([getLookupOptions('departments', organizationId), getLookupOptions('positions', organizationId), getLookupOptions('shifts', organizationId)]);
    return { departments, positions, shifts };
  }});
  const watched = form.watch();
  const photo = selectedFile(watched.photo);
  const photoUrl = useMemo(() => photo ? URL.createObjectURL(photo) : null, [photo]);
  const steps = ['employee.stepIdentity', 'employee.stepEmployment', 'employee.stepPayroll', 'employee.stepDocuments', 'employee.stepReview'];
  const next = async () => {
    const valid = await form.trigger(stepFields[step] ?? [], { shouldFocus: true });
    if (valid) setStep((current) => Math.min(steps.length - 1, current + 1));
  };
  const submit = form.handleSubmit(async (raw) => {
    setSaving(true);
    const uploaded: string[] = [];
    try {
      const parsed = employeeSchema.parse(raw) as ValidatedEmployee;
      const files = { photo: selectedFile(parsed.photo), ktp: selectedFile(parsed.ktp), kk: selectedFile(parsed.kk) };
      const payload = { ...parsed, photo: undefined, ktp: undefined, kk: undefined };
      const { data, error } = await getSupabase().rpc('register_employee', { p_organization_id: organizationId, p_payload: payload });
      if (error) throw error;
      const result = data as { id: string; employee_no: string };
      const paths: Record<string, string> = {};
      for (const [kind, file] of Object.entries(files)) {
        if (!file) continue;
        const path = await uploadOrganizationFile('employee-documents', organizationId, `employees/${result.id}/${kind}`, file);
        uploaded.push(path);
        paths[`${kind === 'photo' ? 'photo' : kind}_path`] = path;
      }
      if (Object.keys(paths).length > 0) {
        const { error: updateError } = await getSupabase().from('employees').update(paths).eq('id', result.id).eq('organization_id', organizationId);
        if (updateError) throw updateError;
      }
      toast.success(t('notification.saved'), { description: `${result.employee_no} · ${parsed.full_name}` });
      navigate('/employees', { replace: true });
    } catch (error) {
      if (uploaded.length > 0) void removeOrganizationFiles('employee-documents', uploaded).catch(() => undefined);
      toast.error(t('common.error'), { description: asErrorMessage(error, t) });
    } finally { setSaving(false); }
  });
  return <div className="mx-auto max-w-5xl space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('employee.register')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('employee.generatedId')}</p></div>
    <Card><CardHeader><div className="flex flex-wrap justify-between gap-2">{steps.map((key, index) => <button type="button" key={key} onClick={() => index < step && setStep(index)} className={cn('flex items-center gap-2 text-xs sm:text-sm', index === step ? 'font-semibold text-primary' : index < step ? 'text-foreground' : 'text-muted-foreground')}><span className={cn('flex size-7 items-center justify-center rounded-full border', index <= step && 'border-primary bg-primary text-primary-foreground')}>{index < step ? <Check className="size-4" /> : index + 1}</span><span className="hidden lg:inline">{t(key)}</span></button>)}</div><Progress value={((step + 1) / steps.length) * 100} /></CardHeader><CardContent><form onSubmit={(event) => void submit(event)}>
      {step === 0 && <div className="grid gap-4 sm:grid-cols-2"><FieldBlock labelKey="employee.nik" error={<ErrorText errors={form.formState.errors} name="nik" />}><Input {...form.register('nik')} /></FieldBlock><FieldBlock required labelKey="employee.fullName" error={<ErrorText errors={form.formState.errors} name="full_name" />}><Input autoFocus {...form.register('full_name')} /></FieldBlock><FieldBlock labelKey="employee.gender" error={<ErrorText errors={form.formState.errors} name="gender" />}><Select value={form.watch('gender') ?? ''} onValueChange={(value) => form.setValue('gender', value as 'male' | 'female' | 'other', { shouldValidate: true })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="male">{t('employee.male')}</SelectItem><SelectItem value="female">{t('employee.female')}</SelectItem><SelectItem value="other">{t('employee.otherGender')}</SelectItem></SelectContent></Select></FieldBlock><FieldBlock labelKey="employee.birthPlace"><Input {...form.register('birth_place')} /></FieldBlock><FieldBlock labelKey="employee.birthDate"><Input type="date" {...form.register('birth_date')} /></FieldBlock><FieldBlock labelKey="employee.phone"><Input type="tel" {...form.register('phone')} /></FieldBlock><FieldBlock labelKey="employee.email" error={<ErrorText errors={form.formState.errors} name="email" />}><Input type="email" {...form.register('email')} /></FieldBlock><FieldBlock labelKey="employee.emergencyContact"><Input {...form.register('emergency_contact_name')} /></FieldBlock><FieldBlock labelKey="employee.emergencyPhone"><Input type="tel" {...form.register('emergency_contact_phone')} /></FieldBlock><div className="sm:col-span-2"><FieldBlock labelKey="employee.address"><Textarea rows={4} {...form.register('address')} /></FieldBlock></div></div>}
      {step === 1 && <div className="grid gap-4 sm:grid-cols-2"><FieldBlock labelKey="employee.department"><Select value={form.watch('department_id') ?? ''} onValueChange={(value) => form.setValue('department_id', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{lookups.data?.departments.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></FieldBlock><FieldBlock labelKey="employee.position"><Select value={form.watch('position_id') ?? ''} onValueChange={(value) => form.setValue('position_id', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{lookups.data?.positions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></FieldBlock><FieldBlock labelKey="employee.shift"><Select value={form.watch('shift_id') ?? ''} onValueChange={(value) => form.setValue('shift_id', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{lookups.data?.shifts.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></FieldBlock><FieldBlock labelKey="employee.status"><Select value={form.watch('status')} onValueChange={(value) => form.setValue('status', value as EmployeeForm['status'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['active', 'inactive', 'probation', 'resigned', 'terminated'].map((value) => <SelectItem key={value} value={value}>{t(`employee.${value}`)}</SelectItem>)}</SelectContent></Select></FieldBlock><FieldBlock required labelKey="employee.joinDate" error={<ErrorText errors={form.formState.errors} name="join_date" />}><Input type="date" {...form.register('join_date')} /></FieldBlock><FieldBlock labelKey="employee.fingerprintPin"><Input {...form.register('fingerprint_pin')} /></FieldBlock></div>}
      {step === 2 && <div className="grid gap-4 sm:grid-cols-2"><FieldBlock labelKey="employee.bpjsStatus"><div className="flex h-10 items-center"><Switch checked={form.watch('bpjs_status')} onCheckedChange={(value) => form.setValue('bpjs_status', value)} /></div></FieldBlock><FieldBlock labelKey="employee.bpjsNumber"><Input {...form.register('bpjs_number')} /></FieldBlock><FieldBlock labelKey="employee.npwp"><Input {...form.register('npwp')} /></FieldBlock><FieldBlock labelKey="employee.bank"><Input {...form.register('bank_name')} /></FieldBlock><FieldBlock labelKey="employee.bankAccount"><Input {...form.register('bank_account_number')} /></FieldBlock><FieldBlock labelKey="employee.bankAccountName"><Input {...form.register('bank_account_name')} /></FieldBlock></div>}
      {step === 3 && <div className="grid gap-4 sm:grid-cols-3">{([['photo', 'employee.photo'], ['ktp', 'employee.ktpPhoto'], ['kk', 'employee.kkPhoto']] as const).map(([name, label]) => <FieldBlock key={name} labelKey={label}><label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 p-4 text-center hover:bg-muted/60">{name === 'photo' && photoUrl ? <img src={photoUrl} alt={t(label)} className="h-28 w-28 rounded-xl object-cover" /> : <><UploadCloud className="size-8 text-muted-foreground" /><span className="text-sm text-muted-foreground">{t('employee.uploadHint')}</span></>}<input className="sr-only" type="file" accept={name === 'photo' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} {...form.register(name)} /></label></FieldBlock>)}<div className="sm:col-span-3"><FieldBlock labelKey="employee.notes"><Textarea rows={5} {...form.register('notes')} /></FieldBlock></div></div>}
      {step === 4 && <div className="grid gap-6 lg:grid-cols-[13rem_1fr]"><div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border bg-muted">{photoUrl ? <img src={photoUrl} alt={watched.full_name} className="h-full w-full object-cover" /> : <FileImage className="size-12 text-muted-foreground" />}</div><div><h2 className="text-xl font-semibold">{watched.full_name || '—'}</h2><p className="text-muted-foreground">{watched.nik || t('employee.generatedId')}</p><dl className="mt-5 grid gap-3 sm:grid-cols-2">{[
        ['employee.gender', watched.gender ? t(`employee.${watched.gender === 'male' ? 'male' : watched.gender === 'female' ? 'female' : 'otherGender'}`) : '—'],
        ['employee.joinDate', watched.join_date], ['employee.status', t(`employee.${watched.status}`)], ['employee.email', watched.email || '—'], ['employee.phone', watched.phone || '—'], ['employee.bank', watched.bank_name || '—'], ['employee.bankAccount', watched.bank_account_number || '—'], ['employee.bpjsStatus', watched.bpjs_status ? t('common.yes') : t('common.no')]
      ].map(([key, value]) => <div key={String(key)} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{t(String(key))}</dt><dd className="mt-1 font-medium">{String(value)}</dd></div>)}</dl></div></div>}
      <div className="mt-8 flex justify-between"><Button type="button" variant="outline" onClick={() => step === 0 ? navigate('/employees') : setStep((current) => current - 1)}>{t(step === 0 ? 'common.cancel' : 'common.back')}</Button>{step < steps.length - 1 ? <Button type="button" onClick={() => void next()}>{t('common.next')}</Button> : <Button type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" />}{saving ? t('common.saving') : t('common.finish')}</Button>}</div>
    </form></CardContent></Card>
  </div>;
}
