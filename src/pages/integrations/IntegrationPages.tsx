import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CircleDot, KeyRound, RefreshCw, Users, WalletCards, Webhook } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataPage } from '@/components/data-table/DataPage';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { env } from '@/lib/env';
import { asErrorMessage } from '@/lib/utils';
import { invokeFunction } from '@/services/edge-function-service';
import { bulkUpdateEntities, deleteEntities, importEntities, listAllEntities, listEntities, type EntityRepositoryConfig } from '@/services/entity-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { IntegrationJob } from '@/types/domain';
import { formatDateTime } from '@/utils/format';

const repository: EntityRepositoryConfig = { table: 'integration_jobs', searchFields: ['job_type', 'error_message', 'correlation_id'], defaultSort: { column: 'created_at', ascending: false } };
function JobStatus({ value }: { value: IntegrationJob['status'] }) { const { t } = useLocale(); return <Badge variant={value === 'succeeded' ? 'success' : value === 'failed' || value === 'cancelled' ? 'destructive' : value === 'running' ? 'info' : 'warning'}>{t(`integration.status.${value}`)}</Badge>; }

function JobsTable({ deliOnly = false }: { deliOnly?: boolean }) {
  const { t, locale } = useLocale(); const { activeMembership, can } = useAuth(); const organizationId = activeMembership?.organization_id ?? ''; const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['integration-jobs', deliOnly, organizationId] as const, [deliOnly, organizationId]);
  const scoped = useMemo<EntityRepositoryConfig>(() => ({ ...repository, select: '*' }), []);
  const columns = useMemo<DataColumn<IntegrationJob>[]>(() => [
    { id: 'job_type', headerKey: 'integration.jobType', accessor: 'job_type' }, { id: 'direction', headerKey: 'integration.direction', accessor: 'direction', cell: (value) => t(`integration.direction.${String(value)}`) }, { id: 'status', headerKey: 'common.status', accessor: 'status', cell: (value) => <JobStatus value={value as IntegrationJob['status']} /> },
    { id: 'attempts', headerKey: 'integration.attempts', accessor: (row) => `${row.attempts}/${row.max_attempts}` }, { id: 'next_attempt_at', headerKey: 'integration.nextAttempt', accessor: 'next_attempt_at', hideOnMobile: true, cell: (value) => formatDateTime(value ? String(value) : null, locale) },
    { id: 'error_message', headerKey: 'common.error', accessor: 'error_message', hideOnMobile: true }, { id: 'correlation_id', headerKey: 'integration.correlationId', accessor: 'correlation_id', hideOnMobile: true }, { id: 'created_at', headerKey: 'common.createdAt', accessor: 'created_at', cell: (value) => formatDateTime(String(value), locale) }
  ], [locale, t]);
  const filters: FilterDefinition[] = [{ id: 'status', labelKey: 'common.status', type: 'select', options: ['queued', 'running', 'succeeded', 'failed', 'cancelled'].map((value) => ({ value, labelKey: `integration.status.${value}` })) }, { id: 'direction', labelKey: 'integration.direction', type: 'select', options: ['inbound', 'outbound'].map((value) => ({ value, labelKey: `integration.direction.${value}` })) }, { id: 'created_at', labelKey: 'common.createdAt', type: 'date-range' }];
  const retry = async (row: IntegrationJob) => { try { await invokeFunction('deli-sync', { organization_id: organizationId, action: 'retry_job', job_id: row.id }); await queryClient.invalidateQueries({ queryKey }); toast.success(t('notification.syncQueued')); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } };
  const baseLoader = (query: Parameters<typeof listEntities<IntegrationJob>>[2]) => listEntities<IntegrationJob>(scoped, organizationId, deliOnly ? { ...query, filters: { ...query.filters, job_type__in: 'deli_employees,deli_devices,deli_attendance,deli_payroll,deli_webhook' } } : query);
  const allLoader = (query: Parameters<typeof listAllEntities<IntegrationJob>>[2]) => listAllEntities<IntegrationJob>(scoped, organizationId, deliOnly ? { ...query, filters: { ...query.filters, job_type__in: 'deli_employees,deli_devices,deli_attendance,deli_payroll,deli_webhook' } } : query);
  return <DataPage<IntegrationJob> titleKey={deliOnly ? 'integration.deliTitle' : 'integration.title'} filename={deliOnly ? 'deli-integration-jobs' : 'integration-jobs'} queryKey={queryKey} columns={columns} filters={filters} loader={baseLoader} loadAll={allLoader} actions={{
    canCreate: false, canUpdate: can('integrations.update'), canDelete: can('integrations.delete'), onDelete: (ids) => deleteEntities(scoped, organizationId, ids), onBulkUpdate: (ids, patch) => bulkUpdateEntities(scoped, organizationId, ids, patch), onImport: (rows) => importEntities(scoped, organizationId, rows),
    bulkUpdatePresets: [{ labelKey: 'common.retry', patch: { status: 'queued', next_attempt_at: new Date().toISOString(), error_message: null } }], rowActions: can('integrations.update') ? [{ labelKey: 'common.retry', icon: RefreshCw, onSelect: retry }] : []
  }} />;
}

export function IntegrationLogsPage() { return <JobsTable />; }

export function DeliIntegrationPage() {
  const { t } = useLocale(); const { activeMembership, can } = useAuth(); const organizationId = activeMembership?.organization_id ?? ''; const [running, setRunning] = useState<string | null>(null);
  const endpointAvailable = Boolean(env.supabaseUrl);
  const endpoint = env.supabaseUrl ? `${env.supabaseUrl}/functions/v1/deli-sync/webhook/${organizationId}` : t('integration.endpointUnavailable');
  const run = async (action: string) => { setRunning(action); try { await invokeFunction('deli-sync', { organization_id: organizationId, action }); toast.success(t('notification.syncQueued')); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } finally { setRunning(null); } };
  const actions = [
    { action: 'validate_credentials', key: 'integration.loginApi', icon: KeyRound }, { action: 'sync_employees', key: 'integration.syncEmployees', icon: Users }, { action: 'sync_attendance', key: 'integration.syncAttendance', icon: CalendarCheck }, { action: 'sync_payroll', key: 'integration.syncPayroll', icon: WalletCards }
  ];
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('integration.deliTitle')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('integration.monitoring')}</p></div><div className="grid gap-4 lg:grid-cols-3"><Card className="lg:col-span-2"><CardHeader><CardTitle>{t('common.actions')}</CardTitle><CardDescription>{t('integration.openApiDescription')}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{actions.map(({ action, key, icon: Icon }) => <Button key={action} variant="outline" className="h-20 justify-start" disabled={!can('integrations.sync') || Boolean(running)} onClick={() => void run(action)}><span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon /></span><span>{t(key)}</span>{running === action && <RefreshCw className="ml-auto animate-spin" />}</Button>)}</CardContent></Card><Card><CardHeader><CardTitle>{t('integration.webhook')}</CardTitle><CardDescription>{t('integration.signedPost')}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-2"><CircleDot className="size-4 text-emerald-500" /><span className="text-sm">{t('common.enabled')}</span></div><Label htmlFor="deli-webhook">{t('common.url')}</Label><Input id="deli-webhook" readOnly value={endpoint} onFocus={(event) => event.currentTarget.select()} /><Button variant="outline" className="w-full" disabled={!endpointAvailable} onClick={() => void navigator.clipboard.writeText(endpoint)}><Webhook />{t('common.copy')}</Button><p className="text-xs text-muted-foreground">{t('integration.secretsProtected')}</p></CardContent></Card></div><JobsTable deliOnly /></div>;
}
