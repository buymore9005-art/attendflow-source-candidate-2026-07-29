import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataPage } from '@/components/data-table/DataPage';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { listAllEntities, listEntities, type EntityRepositoryConfig } from '@/services/entity-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import { formatDateTime } from '@/utils/format';

interface AuditRow { id: string; organization_id: string | null; user_id: string | null; actor_name: string | null; actor_email: string | null; event_type: string; entity_type: string | null; entity_id: string | null; action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; ip_address: string | null; user_agent: string | null; device_info: Record<string, unknown>; correlation_id: string | null; created_at: string }
const repository: EntityRepositoryConfig = { table: 'audit_log_directory', searchFields: ['actor_name', 'actor_email', 'event_type', 'entity_type', 'entity_id', 'action', 'ip_address', 'user_agent'], defaultSort: { column: 'created_at', ascending: false } };
export default function AuditPage() {
  const { locale, t } = useLocale(); const { activeMembership } = useAuth(); const organizationId = activeMembership?.organization_id ?? ''; const [viewing, setViewing] = useState<AuditRow | null>(null);
  const columns = useMemo<DataColumn<AuditRow>[]>(() => [
    { id: 'created_at', headerKey: 'common.date', accessor: 'created_at', cell: (value) => formatDateTime(String(value), locale) }, { id: 'actor_name', headerKey: 'audit.user', accessor: (row) => row.actor_name ?? row.actor_email ?? t('audit.systemActor') },
    { id: 'event_type', headerKey: 'audit.event', accessor: 'event_type' }, { id: 'action', headerKey: 'audit.action', accessor: 'action' }, { id: 'entity_type', headerKey: 'audit.entity', accessor: 'entity_type' },
    { id: 'ip_address', headerKey: 'audit.ipAddress', accessor: 'ip_address', hideOnMobile: true }, { id: 'user_agent', headerKey: 'audit.browser', accessor: 'user_agent', hideOnMobile: true }, { id: 'correlation_id', headerKey: 'integration.correlationId', accessor: 'correlation_id', hideOnMobile: true }
  ], [locale, t]);
  const filters: FilterDefinition[] = [{ id: 'event_type', labelKey: 'audit.event', type: 'text' }, { id: 'action', labelKey: 'audit.action', type: 'text' }, { id: 'entity_type', labelKey: 'audit.entity', type: 'text' }, { id: 'created_at', labelKey: 'common.date', type: 'date-range' }];
  return <><DataPage<AuditRow> titleKey="audit.title" filename="audit-log" queryKey={['audit', organizationId]} columns={columns} filters={filters} loader={(query) => listEntities(repository, organizationId, query)} loadAll={(query) => listAllEntities(repository, organizationId, query)} actions={{ canCreate: false, canUpdate: false, canDelete: false, onView: setViewing }} />
  <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null); }}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{viewing?.action}</DialogTitle><DialogDescription>{viewing?.correlation_id}</DialogDescription></DialogHeader><div className="grid gap-4 md:grid-cols-2"><section><h3 className="mb-2 font-semibold">{t('audit.oldData')}</h3><pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs">{JSON.stringify(viewing?.old_data, null, 2)}</pre></section><section><h3 className="mb-2 font-semibold">{t('audit.newData')}</h3><pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs">{JSON.stringify(viewing?.new_data, null, 2)}</pre></section></div></DialogContent></Dialog></>;
}
