import { CheckCheck } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { DataPage } from '@/components/data-table/DataPage';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { asErrorMessage } from '@/lib/utils';
import { bulkUpdateEntities, deleteEntities, listAllEntities, listEntities, type EntityRepositoryConfig } from '@/services/entity-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { SystemNotification } from '@/types/domain';
import { formatDateTime } from '@/utils/format';

const repository: EntityRepositoryConfig = { table: 'system_notifications', searchFields: ['title_key', 'message_key', 'notification_type'], defaultSort: { column: 'created_at', ascending: false } };
export default function NotificationsPage() {
  const { t, locale } = useLocale(); const { activeMembership, can } = useAuth(); const organizationId = activeMembership?.organization_id ?? '';
  const columns = useMemo<DataColumn<SystemNotification>[]>(() => [
    { id: 'title_key', headerKey: 'common.name', accessor: (row) => t(row.title_key, row.params), exportValue: (row) => t(row.title_key, row.params) },
    { id: 'message_key', headerKey: 'common.description', accessor: (row) => t(row.message_key, row.params), exportValue: (row) => t(row.message_key, row.params) },
    { id: 'severity', headerKey: 'common.status', accessor: 'severity', cell: (value) => <Badge variant={value === 'error' ? 'destructive' : value === 'warning' ? 'warning' : value === 'success' ? 'success' : 'info'}>{t(`common.${String(value)}`)}</Badge> },
    { id: 'notification_type', headerKey: 'common.info', accessor: 'notification_type', hideOnMobile: true },
    { id: 'read_at', headerKey: 'common.status', accessor: 'read_at', cell: (value) => <Badge variant={value ? 'outline' : 'default'}>{value ? t('common.read') : t('common.unread')}</Badge> },
    { id: 'created_at', headerKey: 'common.createdAt', accessor: 'created_at', cell: (value) => formatDateTime(String(value), locale) }
  ], [locale, t]);
  const filters: FilterDefinition[] = [{ id: 'severity', labelKey: 'common.status', type: 'select', options: [{ value: 'info', labelKey: 'common.info' }, { value: 'success', labelKey: 'common.success' }, { value: 'warning', labelKey: 'common.warning' }, { value: 'error', labelKey: 'common.error' }] }, { id: 'read_at', labelKey: 'common.status', type: 'boolean' }, { id: 'created_at', labelKey: 'common.date', type: 'date-range' }];
  const markRead = async (row: SystemNotification) => { try { await bulkUpdateEntities(repository, organizationId, [row.id], { read_at: new Date().toISOString() }); toast.success(t('notification.updated')); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } };
  return <DataPage<SystemNotification> titleKey="dashboard.systemNotifications" filename="notifications" queryKey={['notifications', organizationId]} columns={columns} filters={filters} loader={(query) => listEntities(repository, organizationId, query)} loadAll={(query) => listAllEntities(repository, organizationId, query)} actions={{
    canCreate: false, canUpdate: true, canDelete: can('settings.update'), onDelete: (ids) => deleteEntities(repository, organizationId, ids), onBulkUpdate: (ids, patch) => bulkUpdateEntities(repository, organizationId, ids, patch), bulkUpdatePresets: [{ labelKey: 'common.success', patch: { read_at: new Date().toISOString() } }], rowActions: [{ labelKey: 'common.success', icon: CheckCheck, onSelect: markRead }]
  }} />;
}
