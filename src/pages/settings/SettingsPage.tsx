import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, DatabaseBackup, ExternalLink, KeyRound, LoaderCircle, RotateCcw, Save, UploadCloud } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { env } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';
import { asErrorMessage } from '@/lib/utils';
import { invokeFunction } from '@/services/edge-function-service';
import {
  getDeliIntegrationSettings,
  getOrganizationSettings,
  saveDeliIntegrationSettings,
  saveOrganizationSecret,
  saveOrganizationSettings
} from '@/services/settings-service';
import { uploadOrganizationFile } from '@/services/storage-service';
import { useUiStore } from '@/stores/ui-store';

const companySchema = z.object({
  name: z.string().trim().min(2, 'validation.minLength').max(160),
  code: z.string().trim().min(2).max(32),
  address: z.string().max(1000).nullable(),
  email: z.string().email('validation.email').or(z.literal('')).transform((value) => value || null),
  phone: z.string().max(40).nullable(),
  time_zone: z.string().min(1),
  locale: z.enum(['id', 'en', 'zh'])
});

type CompanyForm = z.input<typeof companySchema>;
type ValidatedCompanyForm = z.output<typeof companySchema>;
type SettingsSection = 'numbering' | 'integrations';
type SecretName = keyof typeof emptySecrets;

const emptySecrets = {
  deli_app_key: '',
  deli_app_secret: ''
};

interface RotatedDeviceToken {
  device_id: string;
  name: string;
  serial_number: string;
  token: string;
}

function FormRow({ label, children, description }: { label: string; children: ReactNode; description?: string }) {
  return (
    <div className="grid gap-2 md:grid-cols-[14rem_1fr]">
      <div>
        <Label>{label}</Label>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function numericValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function SettingsPage() {
  const { t, locale, setLocale } = useLocale();
  const { activeMembership, can, refreshMemberships } = useAuth();
  const organization = activeMembership?.organization;
  const organizationId = activeMembership?.organization_id ?? '';
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const queryClient = useQueryClient();
  const canUpdate = can('settings.update');

  const [saving, setSaving] = useState<string | null>(null);
  const [numbering, setNumbering] = useState<Record<string, unknown>>({});
  const [integrationSettings, setIntegrationSettings] = useState<Record<string, unknown>>({});
  const [deliConfiguration, setDeliConfiguration] = useState<Record<string, unknown>>({});
  const [deliEnabled, setDeliEnabled] = useState(true);
  const [secrets, setSecrets] = useState(emptySecrets);
  const [deviceTokenOutput, setDeviceTokenOutput] = useState('');
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');

  const settings = useQuery({
    queryKey: ['organization-settings', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => getOrganizationSettings(organizationId)
  });
  const deliSettings = useQuery({
    queryKey: ['deli-integration-settings', organizationId],
    enabled: Boolean(organizationId) && can('integrations.read'),
    queryFn: () => getDeliIntegrationSettings(organizationId)
  });

  useEffect(() => {
    if (!settings.data) return;
    setNumbering(settings.data.numbering);
    setIntegrationSettings(settings.data.integrations);
  }, [settings.data]);

  useEffect(() => {
    if (!deliSettings.data) return;
    setDeliConfiguration(deliSettings.data.configuration);
    setDeliEnabled(deliSettings.data.is_enabled);
  }, [deliSettings.data]);

  const company = useForm<CompanyForm, unknown, ValidatedCompanyForm>({
    resolver: zodResolver(companySchema),
    values: {
      name: organization?.name ?? '',
      code: organization?.code ?? '',
      address: organization?.address ?? '',
      email: organization?.email ?? '',
      phone: organization?.phone ?? '',
      time_zone: organization?.time_zone ?? 'Asia/Jakarta',
      locale: organization?.locale ?? 'id'
    }
  });

  const saveCompany = company.handleSubmit(async (values) => {
    setSaving('company');
    try {
      const { error } = await getSupabase().from('organizations').update(values).eq('id', organizationId);
      if (error) throw error;
      await refreshMemberships();
      toast.success(t('notification.saved'));
    } catch (error) {
      toast.error(t('common.error'), { description: asErrorMessage(error, t) });
    } finally {
      setSaving(null);
    }
  });

  const saveSection = async (section: SettingsSection, values: Record<string, unknown>) => {
    setSaving(section);
    try {
      await saveOrganizationSettings(organizationId, section, values);
      await queryClient.invalidateQueries({ queryKey: ['organization-settings', organizationId] });
      toast.success(t('notification.saved'));
    } catch (error) {
      toast.error(t('common.error'), { description: asErrorMessage(error, t) });
    } finally {
      setSaving(null);
    }
  };

  const saveSelectedSecrets = async (names: SecretName[]) => {
    for (const name of names) {
      const value = secrets[name].trim();
      if (value) await saveOrganizationSecret(organizationId, name, value);
    }
  };

  const saveDeli = async () => {
    setSaving('deli');
    try {
      await Promise.all([
        saveSelectedSecrets(['deli_app_key', 'deli_app_secret']),
        saveDeliIntegrationSettings(organizationId, deliConfiguration, deliEnabled)
      ]);
      setSecrets((current) => ({ ...current, deli_app_key: '', deli_app_secret: '' }));
      await queryClient.invalidateQueries({ queryKey: ['deli-integration-settings', organizationId] });
      toast.success(t('notification.saved'));
    } catch (error) {
      toast.error(t('common.error'), { description: asErrorMessage(error, t) });
    } finally {
      setSaving(null);
    }
  };

  const uploadLogo = async (file: File) => {
    setSaving('logo');
    try {
      const path = await uploadOrganizationFile('organization-assets', organizationId, 'logo', file);
      const { error } = await getSupabase().from('organizations').update({ logo_path: path }).eq('id', organizationId);
      if (error) throw error;
      await refreshMemberships();
      toast.success(t('notification.saved'));
    } catch (error) {
      toast.error(t('common.error'), { description: asErrorMessage(error, t) });
    } finally {
      setSaving(null);
    }
  };

  const runBackup = async (action: 'backup' | 'restore') => {
    setSaving(action);
    try {
      await invokeFunction('backup-restore', {
        organization_id: organizationId,
        action,
        ...(action === 'restore' ? { confirmation: restoreConfirmation } : {})
      });
      toast.success(t(action === 'backup' ? 'notification.backupCreated' : 'notification.restored'));
      if (action === 'restore') {
        setRestoreOpen(false);
        setRestoreConfirmation('');
        await queryClient.invalidateQueries();
        await refreshMemberships();
      }
    } catch (error) {
      toast.error(t('common.error'), { description: asErrorMessage(error, t) });
    } finally {
      setSaving(null);
    }
  };

  const rotateDeviceTokens = async () => {
    setSaving('device-token');
    try {
      const response = await invokeFunction<{ tokens: RotatedDeviceToken[] }>('device-command', {
        organization_id: organizationId,
        action: 'rotate_device_token'
      });
      const lines = response.tokens.flatMap((item) => [
        `${item.name} · ${item.serial_number}`,
        `SN=${item.serial_number}&token=${item.token}`,
        ''
      ]);
      setDeviceTokenOutput(lines.join('\n').trim());
      toast.success(t('notification.deviceTokensRotated'));
    } catch (error) {
      toast.error(t('common.error'), { description: asErrorMessage(error, t) });
    } finally {
      setSaving(null);
    }
  };

  const copyTokens = async () => {
    await navigator.clipboard.writeText(deviceTokenOutput);
    toast.success(t('common.copied'));
  };

  const admsEndpoint = env.supabaseUrl ? `${env.supabaseUrl}/functions/v1/adms` : t('settings.admsUrlUnavailable');
  const requiredRestoreText = `RESTORE ${organizationId}`;

  if (!can('settings.read')) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{organization?.name}</p>
      </div>

      <Tabs defaultValue="company">
        <TabsList className="flex w-full justify-start overflow-x-auto">
          <TabsTrigger value="company">{t('settings.company')}</TabsTrigger>
          <TabsTrigger value="appearance">{t('settings.appearance')}</TabsTrigger>
          <TabsTrigger value="work">{t('settings.work')}</TabsTrigger>
          <TabsTrigger value="payroll">{t('menu.payrollSettings')}</TabsTrigger>
          <TabsTrigger value="numbering">{t('settings.numbering')}</TabsTrigger>
          <TabsTrigger value="integrations">{t('menu.integrations')}</TabsTrigger>
          <TabsTrigger value="security">{t('settings.security')}</TabsTrigger>
          <TabsTrigger value="backup">{t('settings.backup')}</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.company')}</CardTitle>
              <CardDescription>{t('settings.general')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={(event) => void saveCompany(event)}>
                <FormRow label={t('settings.companyName')}><Input {...company.register('name')} /></FormRow>
                <FormRow label={t('auth.organizationCode')}><Input {...company.register('code')} /></FormRow>
                <FormRow label={t('settings.companyAddress')}><Textarea rows={4} {...company.register('address')} /></FormRow>
                <FormRow label={t('settings.companyEmail')}><Input type="email" {...company.register('email')} /></FormRow>
                <FormRow label={t('settings.companyPhone')}><Input {...company.register('phone')} /></FormRow>
                <FormRow label={t('settings.timeZone')}>
                  <Input {...company.register('time_zone')} list="time-zones" />
                  <datalist id="time-zones">
                    <option value="Asia/Jakarta" />
                    <option value="Asia/Makassar" />
                    <option value="Asia/Jayapura" />
                    <option value="Asia/Shanghai" />
                    <option value="UTC" />
                  </datalist>
                </FormRow>
                <FormRow label={t('common.language')}>
                  <Select value={company.watch('locale')} onValueChange={(value) => company.setValue('locale', value as 'id' | 'en' | 'zh')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="id">Indonesia</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="zh">简体中文</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow label={t('settings.logo')}>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm">
                    <UploadCloud className="size-4" />
                    {saving === 'logo' ? t('common.loading') : t('common.upload')}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={!canUpdate}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) void uploadLogo(file);
                      }}
                    />
                  </label>
                </FormRow>
                <div className="flex justify-end">
                  <Button type="submit" disabled={!canUpdate || saving === 'company'}>
                    {saving === 'company' ? <LoaderCircle className="animate-spin" /> : <Save />}
                    {t('common.save')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardHeader><CardTitle>{t('settings.appearance')}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <FormRow label={t('common.language')}>
                <Select value={locale} onValueChange={(value) => setLocale(value as 'id' | 'en' | 'zh')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="id">Indonesia</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="zh">简体中文</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label={t('common.theme')}>
                <Select value={theme} onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t('common.light')}</SelectItem>
                    <SelectItem value="dark">{t('common.dark')}</SelectItem>
                    <SelectItem value="system">{t('common.system')}</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="work">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.work')}</CardTitle>
              <CardDescription>{t('settings.workAuthoritativeDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild><Link to="/shifts">{t('settings.manageShifts')}</Link></Button>
              <Button asChild variant="outline"><Link to="/holidays">{t('settings.manageHolidays')}</Link></Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card>
            <CardHeader>
              <CardTitle>{t('menu.payrollSettings')}</CardTitle>
              <CardDescription>{t('settings.payrollAuthoritativeDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild><Link to="/payroll/settings">{t('settings.openPayrollSettings')}</Link></Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="numbering">
          <Card>
            <CardHeader><CardTitle>{t('settings.numbering')}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <FormRow label={t('settings.employeePrefix')}><Input maxLength={12} value={String(numbering.employee_prefix ?? 'EMP')} onChange={(event) => setNumbering({ ...numbering, employee_prefix: event.target.value.toUpperCase() })} /></FormRow>
              <FormRow label={t('settings.payrollPrefix')}><Input maxLength={12} value={String(numbering.payroll_prefix ?? 'PAY')} onChange={(event) => setNumbering({ ...numbering, payroll_prefix: event.target.value.toUpperCase() })} /></FormRow>
              <FormRow label={t('settings.payslipPrefix')}><Input maxLength={12} value={String(numbering.payslip_prefix ?? 'SLIP')} onChange={(event) => setNumbering({ ...numbering, payslip_prefix: event.target.value.toUpperCase() })} /></FormRow>
              <FormRow label={t('settings.leavePrefix')}><Input maxLength={12} value={String(numbering.leave_prefix ?? 'LV')} onChange={(event) => setNumbering({ ...numbering, leave_prefix: event.target.value.toUpperCase() })} /></FormRow>
              <div className="flex justify-end">
                <Button onClick={() => void saveSection('numbering', numbering)} disabled={!canUpdate || saving === 'numbering'}><Save />{t('common.save')}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.adms')}</CardTitle>
                <CardDescription>{t('settings.fingerprint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormRow label={t('settings.admsUrl')}><Input readOnly value={admsEndpoint} onFocus={(event) => event.currentTarget.select()} /></FormRow>
                <FormRow label={t('common.autoSync')}><Switch checked={Boolean(integrationSettings.adms_auto_sync ?? true)} onCheckedChange={(value) => setIntegrationSettings({ ...integrationSettings, adms_auto_sync: value })} /></FormRow>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void saveSection('integrations', integrationSettings)} disabled={!canUpdate || saving === 'integrations'}><Save />{t('common.save')}</Button>
                  <Button variant="outline" onClick={() => void rotateDeviceTokens()} disabled={!can('devices.update') || saving === 'device-token'}>
                    {saving === 'device-token' ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
                    {t('settings.rotateDeviceToken')}
                  </Button>
                </div>
                {deviceTokenOutput ? (
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{t('settings.deviceTokens')}</p>
                        <p className="text-xs text-muted-foreground">{t('settings.deviceTokenWarning')}</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => void copyTokens()}><Copy />{t('common.copy')}</Button>
                    </div>
                    <Textarea readOnly rows={8} value={deviceTokenOutput} className="font-mono text-xs" />
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('integration.deliTitle')}</CardTitle>
                <CardDescription>{t('settings.writeOnlySecrets')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormRow label={t('common.enabled')}><Switch checked={deliEnabled} onCheckedChange={setDeliEnabled} /></FormRow>
                <FormRow label="App-Key"><Input type="password" autoComplete="off" value={secrets.deli_app_key} onChange={(event) => setSecrets({ ...secrets, deli_app_key: event.target.value })} /></FormRow>
                <FormRow label="App-Secret"><Input type="password" autoComplete="new-password" value={secrets.deli_app_secret} onChange={(event) => setSecrets({ ...secrets, deli_app_secret: event.target.value })} /></FormRow>
                <FormRow label={t('settings.attendanceAutoSync')}><Switch checked={Boolean(deliConfiguration.attendance_auto_sync ?? true)} onCheckedChange={(value) => setDeliConfiguration({ ...deliConfiguration, attendance_auto_sync: value })} /></FormRow>
                <FormRow label={t('settings.syncInterval')}><Input type="number" min={5} max={1440} value={numericValue(deliConfiguration.attendance_sync_interval_minutes, 15)} onChange={(event) => setDeliConfiguration({ ...deliConfiguration, attendance_sync_interval_minutes: Number(event.target.value) })} /></FormRow>
                <FormRow label={t('settings.payrollWebhook')}><Input type="url" placeholder={t('settings.payrollWebhookHint')} value={String(deliConfiguration.payroll_webhook_url ?? '')} onChange={(event) => setDeliConfiguration({ ...deliConfiguration, payroll_webhook_url: event.target.value.trim() })} /></FormRow>
                <Button onClick={() => void saveDeli()} disabled={!can('integrations.update') || saving === 'deli'}>{saving === 'deli' ? <LoaderCircle className="animate-spin" /> : <Save />}{t('common.save')}</Button>
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>{t('settings.smtp')}</CardTitle>
                <CardDescription>{t('settings.smtpProjectManaged')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t('settings.smtpProjectReason')}</p>
                <p className="text-sm font-medium">{t('settings.smtpSetupPath')}</p>
                <Button asChild variant="outline">
                  <a href="https://supabase.com/dashboard/projects" target="_blank" rel="noreferrer">
                    <ExternalLink />
                    {t('settings.openSupabaseDashboard')}
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.security')}</CardTitle>
              <CardDescription>{t('settings.securityAuthoritativeDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{t('settings.mfaProjectManaged')}</p>
              <p>{t('settings.exportProtectionAlwaysOn')}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.backup')}</CardTitle>
              <CardDescription>{t('settings.backupDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button onClick={() => void runBackup('backup')} disabled={!canUpdate || saving === 'backup'}>
                {saving === 'backup' ? <LoaderCircle className="animate-spin" /> : <DatabaseBackup />}
                {t('settings.backup')}
              </Button>
              <Button variant="outline" onClick={() => setRestoreOpen(true)} disabled={!canUpdate || saving === 'restore'}><RotateCcw />{t('settings.restore')}</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={restoreOpen} onOpenChange={(open) => { setRestoreOpen(open); if (!open) setRestoreConfirmation(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.restore')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.restoreDescription')} {t('settings.restoreWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="restore-confirmation">{t('settings.restoreConfirmation', { confirmation: requiredRestoreText })}</Label>
            <Input id="restore-confirmation" autoComplete="off" value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" disabled={restoreConfirmation !== requiredRestoreText || saving === 'restore'} onClick={() => void runBackup('restore')}>
                {saving === 'restore' ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                {t('settings.restore')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
