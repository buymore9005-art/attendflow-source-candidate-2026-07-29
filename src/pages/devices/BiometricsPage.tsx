import { RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { DataPage } from '@/components/data-table/DataPage';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { asErrorMessage } from '@/lib/utils';
import { invokeFunction } from '@/services/edge-function-service';
import { bulkUpdateEntities, deleteEntities, importEntities, listAllEntities, listEntities, type EntityRepositoryConfig } from '@/services/entity-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { BiometricEnrollment } from '@/types/domain';
import { formatDateTime } from '@/utils/format';

const repository: EntityRepositoryConfig = { table: 'biometric_enrollments', select: '*,employee:employees(employee_no,full_name,photo_path),device:attendance_devices(name,serial_number)', searchFields: ['device_user_id', 'pin', 'card_number'], defaultSort: { column: 'updated_at', ascending: false }, upsertConflict: 'organization_id,employee_id,device_id' };

export default function BiometricsPage() {
  const { t, locale } = useLocale();
  const { activeMembership, can } = useAuth();
  const organizationId = activeMembership?.organization_id ?? '';
  const columns = useMemo<DataColumn<BiometricEnrollment>[]>(() => [
    { id: 'employee_id', headerKey: 'employee.fullName', accessor: (row) => row.employee?.full_name ?? '', exportValue: (row) => row.employee?.full_name ?? '' },
    { id: 'employee_no', headerKey: 'employee.employeeNo', accessor: (row) => row.employee?.employee_no ?? '', exportValue: (row) => row.employee?.employee_no ?? '' },
    { id: 'device_id', headerKey: 'attendance.device', accessor: (row) => row.device?.name ?? '', hideOnMobile: true, exportValue: (row) => row.device?.name ?? '' },
    { id: 'status', headerKey: 'common.status', accessor: 'status', cell: (value) => <Badge variant={value === 'synced' ? 'success' : value === 'failed' ? 'destructive' : value === 'pending' ? 'warning' : 'secondary'}>{t(value === 'synced' ? 'biometric.synced' : 'biometric.notSynced')}</Badge> },
    { id: 'fingerprint_templates', headerKey: 'biometric.templates', accessor: 'fingerprint_templates' },
    { id: 'has_face', headerKey: 'biometric.face', accessor: 'has_face', cell: (value) => <Badge variant={value ? 'success' : 'outline'}>{value ? t('common.yes') : t('common.no')}</Badge> },
    { id: 'has_card', headerKey: 'biometric.card', accessor: 'has_card', cell: (value) => <Badge variant={value ? 'success' : 'outline'}>{value ? t('common.yes') : t('common.no')}</Badge> },
    { id: 'pin', headerKey: 'biometric.pin', accessor: 'pin', hideOnMobile: true },
    { id: 'last_synced_at', headerKey: 'biometric.lastSynced', accessor: 'last_synced_at', hideOnMobile: true, cell: (value) => formatDateTime(value ? String(value) : null, locale) }
  ], [locale, t]);
  const filters: FilterDefinition[] = [{ id: 'status', labelKey: 'common.status', type: 'select', options: [{ value: 'synced', labelKey: 'biometric.synced' }, { value: 'pending', labelKey: 'common.loading' }, { value: 'failed', labelKey: 'common.error' }, { value: 'not_linked', labelKey: 'biometric.notSynced' }] }, { id: 'has_face', labelKey: 'biometric.face', type: 'boolean' }, { id: 'has_card', labelKey: 'biometric.card', type: 'boolean' }];
  const sync = async (row: BiometricEnrollment) => {
    try { await invokeFunction('device-command', { organization_id: organizationId, device_id: row.device_id, employee_id: row.employee_id, action: 'sync_biometrics' }); toast.success(t('notification.syncQueued')); }
    catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); }
  };
  return <DataPage<BiometricEnrollment> titleKey="biometric.title" filename="biometric-enrollments" queryKey={['biometrics', organizationId]} columns={columns} filters={filters} loader={(query) => listEntities(repository, organizationId, query)} loadAll={(query) => listAllEntities(repository, organizationId, query)} actions={{
    canCreate: false, canUpdate: can('devices.sync'), canDelete: can('devices.delete'),
    onDelete: (ids) => deleteEntities(repository, organizationId, ids),
    onBulkUpdate: (ids, patch) => bulkUpdateEntities(repository, organizationId, ids, patch),
    onImport: (rows) => importEntities(repository, organizationId, rows),
    bulkUpdatePresets: [{ labelKey: 'common.sync', patch: { status: 'pending', error_message: null } }],
    rowActions: can('devices.sync') ? [{ labelKey: 'common.sync', icon: RefreshCw, onSelect: sync }] : []
  }} />;
}
