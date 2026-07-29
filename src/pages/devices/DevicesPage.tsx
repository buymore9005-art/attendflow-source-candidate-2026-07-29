import { useQueryClient } from '@tanstack/react-query';
import { CloudDownload, Contact, CreditCard, Fingerprint, ScanFace, Send, Wifi } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EntityFormDialog, type EntityFormValues } from '@/components/crud/EntityFormDialog';
import { DataPage } from '@/components/data-table/DataPage';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { asErrorMessage } from '@/lib/utils';
import { invokeFunction } from '@/services/edge-function-service';
import {
  bulkUpdateEntities,
  createEntity,
  deleteEntities,
  importEntities,
  listAllEntities,
  listEntities,
  updateEntity,
  type EntityRepositoryConfig
} from '@/services/entity-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { AttendanceDevice } from '@/types/domain';
import type { FormFieldConfig } from '@/types/forms';
import { isDeviceActionSupported, type DeviceCommandAction } from '@/utils/device-capabilities';
import { formatDateTime } from '@/utils/format';

const repository: EntityRepositoryConfig = {
  table: 'attendance_devices',
  searchFields: ['name', 'model', 'serial_number', 'firmware', 'location', 'ip_address'],
  softDelete: true,
  defaultSort: { column: 'name', ascending: true },
  upsertConflict: 'organization_id,serial_number'
};

const capabilityFields: Array<keyof AttendanceDevice> = [
  'capabilities_verified',
  'supports_attendance_push',
  'supports_log_pull',
  'supports_user_push',
  'supports_fingerprint_push',
  'supports_face_push',
  'supports_card_push',
  'requires_lan_bridge',
  'capability_notes'
];

function DeviceStatus({ status }: { status: AttendanceDevice['status'] }) {
  const { t } = useLocale();
  return (
    <Badge variant={status === 'online' ? 'success' : status === 'warning' ? 'warning' : status === 'maintenance' ? 'info' : 'secondary'}>
      {t(`status.${status}`)}
    </Badge>
  );
}

export default function DevicesPage() {
  const { t, locale } = useLocale();
  const { activeMembership, can } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeMembership?.organization_id ?? '';
  const [editing, setEditing] = useState<AttendanceDevice | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryKey = useMemo(() => ['devices', organizationId] as const, [organizationId]);

  const fields: FormFieldConfig[] = [
    { name: 'name', labelKey: 'device.machineName', type: 'text', required: true, max: 120 },
    { name: 'location', labelKey: 'device.location', type: 'text', max: 180 },
    {
      name: 'vendor',
      labelKey: 'device.vendor',
      type: 'select',
      required: true,
      options: [
        { value: 'zkteco', label: 'ZKTeco' },
        { value: 'solution_time', label: 'Solution Time' },
        { value: 'deli', label: 'Deli' },
        { value: 'other', label: 'Other' }
      ]
    },
    { name: 'model', labelKey: 'device.model', type: 'text', max: 120 },
    {
      name: 'protocol',
      labelKey: 'device.protocol',
      type: 'select',
      required: true,
      options: [
        { value: 'adms', label: 'ADMS' },
        { value: 'push', label: 'Push' },
        { value: 'deli_cloud', label: 'Deli Cloud' },
        { value: 'lan_bridge', label: 'LAN Bridge' },
        { value: 'manual', label: 'Manual' }
      ]
    },
    { name: 'ip_address', labelKey: 'device.ipAddress', type: 'text', max: 64 },
    { name: 'port', labelKey: 'device.port', type: 'number', min: 1, max: 65535 },
    { name: 'serial_number', labelKey: 'device.serialNumber', type: 'text', required: true, max: 120 },
    { name: 'firmware', labelKey: 'device.firmware', type: 'text', max: 120 },
    { name: 'capabilities_verified', labelKey: 'device.capabilitiesVerified', type: 'switch', defaultValue: false },
    { name: 'supports_attendance_push', labelKey: 'device.supportsAttendancePush', type: 'switch', defaultValue: false },
    { name: 'supports_log_pull', labelKey: 'device.supportsLogPull', type: 'switch', defaultValue: false },
    { name: 'supports_user_push', labelKey: 'device.supportsUserPush', type: 'switch', defaultValue: false },
    { name: 'supports_fingerprint_push', labelKey: 'device.supportsFingerPush', type: 'switch', defaultValue: false },
    { name: 'supports_face_push', labelKey: 'device.supportsFacePush', type: 'switch', defaultValue: false },
    { name: 'supports_card_push', labelKey: 'device.supportsCardPush', type: 'switch', defaultValue: false },
    { name: 'requires_lan_bridge', labelKey: 'device.requiresLanBridge', type: 'switch', defaultValue: false },
    { name: 'capability_notes', labelKey: 'device.capabilityNotes', type: 'textarea', max: 2000, gridSpan: 2 },
    { name: 'auto_sync', labelKey: 'common.autoSync', type: 'switch', defaultValue: true }
  ];

  const columns = useMemo<DataColumn<AttendanceDevice>[]>(() => [
    { id: 'name', headerKey: 'device.machineName', accessor: 'name' },
    { id: 'status', headerKey: 'common.status', accessor: 'status', cell: (value) => <DeviceStatus status={value as AttendanceDevice['status']} /> },
    { id: 'vendor', headerKey: 'device.vendor', accessor: 'vendor' },
    { id: 'model', headerKey: 'device.model', accessor: 'model', hideOnMobile: true },
    { id: 'protocol', headerKey: 'device.protocol', accessor: 'protocol' },
    {
      id: 'capabilities_verified',
      headerKey: 'device.capabilities',
      accessor: 'capabilities_verified',
      cell: (value) => <Badge variant={value ? 'success' : 'warning'}>{t(value ? 'device.capabilitiesVerified' : 'device.capabilitiesUnverified')}</Badge>
    },
    { id: 'serial_number', headerKey: 'device.serialNumber', accessor: 'serial_number' },
    {
      id: 'ip_address',
      headerKey: 'device.ipAddress',
      accessor: (row) => row.ip_address && row.port ? `${row.ip_address}:${row.port}` : row.ip_address ?? '—',
      hideOnMobile: true
    },
    { id: 'location', headerKey: 'device.location', accessor: 'location', hideOnMobile: true },
    {
      id: 'last_seen_at',
      headerKey: 'device.lastSeen',
      accessor: 'last_seen_at',
      hideOnMobile: true,
      cell: (value) => formatDateTime(value ? String(value) : null, locale)
    },
    {
      id: 'last_sync_at',
      headerKey: 'device.lastSync',
      accessor: 'last_sync_at',
      hideOnMobile: true,
      cell: (value) => formatDateTime(value ? String(value) : null, locale)
    }
  ], [locale, t]);

  const filters: FilterDefinition[] = [
    {
      id: 'status',
      labelKey: 'common.status',
      type: 'select',
      options: [
        { value: 'online', labelKey: 'common.online' },
        { value: 'offline', labelKey: 'common.offline' },
        { value: 'warning', labelKey: 'common.warning' },
        { value: 'maintenance', labelKey: 'common.info' }
      ]
    },
    {
      id: 'protocol',
      labelKey: 'device.protocol',
      type: 'select',
      options: [
        { value: 'adms', labelKey: 'device.protocolAdms' },
        { value: 'push', labelKey: 'device.protocolPush' },
        { value: 'deli_cloud', labelKey: 'device.protocolDeliCloud' },
        { value: 'lan_bridge', labelKey: 'device.protocolLanBridge' },
        { value: 'manual', labelKey: 'device.protocolManual' }
      ]
    },
    { id: 'capabilities_verified', labelKey: 'device.capabilitiesVerified', type: 'boolean' },
    { id: 'auto_sync', labelKey: 'common.autoSync', type: 'boolean' }
  ];

  const queue = async (device: AttendanceDevice, action: DeviceCommandAction) => {
    try {
      await invokeFunction('device-command', { organization_id: organizationId, device_id: device.id, action });
      toast.success(t('notification.syncQueued'));
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(t('common.error'), { description: asErrorMessage(error, t) });
    }
  };

  const submit = async (values: EntityFormValues) => {
    setSaving(true);
    try {
      const capabilitiesChanged = !editing || capabilityFields.some((key) => values[key] !== editing[key]);
      const verified = Boolean(values.capabilities_verified);
      const payload: EntityFormValues = {
        ...values,
        capability_verified_at: verified
          ? capabilitiesChanged || !editing?.capability_verified_at
            ? new Date().toISOString()
            : editing.capability_verified_at
          : null
      };
      if (editing) await updateEntity(repository, organizationId, editing.id, payload);
      else await createEntity(repository, organizationId, payload);
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t(editing ? 'notification.updated' : 'notification.saved'));
      setEditing(null);
      setCreating(false);
    } catch (error) {
      toast.error(t('common.error'), { description: asErrorMessage(error, t) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DataPage<AttendanceDevice>
        titleKey="device.title"
        filename="attendance-devices"
        queryKey={queryKey}
        columns={columns}
        filters={filters}
        loader={(query) => listEntities(repository, organizationId, query)}
        loadAll={(query) => listAllEntities(repository, organizationId, query)}
        actions={{
          canCreate: can('devices.create'),
          canUpdate: can('devices.update'),
          canDelete: can('devices.delete'),
          onCreate: () => setCreating(true),
          onEdit: setEditing,
          onDelete: (ids) => deleteEntities(repository, organizationId, ids),
          onBulkUpdate: (ids, patch) => bulkUpdateEntities(repository, organizationId, ids, patch),
          onImport: (rows) => importEntities(repository, organizationId, rows),
          bulkUpdatePresets: [
            { labelKey: 'common.autoSync', patch: { auto_sync: true } },
            { labelKey: 'common.disabled', patch: { auto_sync: false } }
          ],
          rowActions: can('devices.sync') ? [
            {
              labelKey: 'common.testConnection',
              icon: Wifi,
              isVisible: (row) => isDeviceActionSupported(row, 'test_connection'),
              onSelect: (row) => queue(row, 'test_connection')
            },
            {
              labelKey: 'common.manualSync',
              icon: Send,
              isVisible: (row) => isDeviceActionSupported(row, 'sync'),
              onSelect: (row) => queue(row, 'sync')
            },
            {
              labelKey: 'device.pullLog',
              icon: CloudDownload,
              isVisible: (row) => isDeviceActionSupported(row, 'pull_logs'),
              onSelect: (row) => queue(row, 'pull_logs')
            },
            {
              labelKey: 'device.pushUser',
              icon: Contact,
              isVisible: (row) => isDeviceActionSupported(row, 'push_users'),
              onSelect: (row) => queue(row, 'push_users')
            },
            {
              labelKey: 'device.pushFinger',
              icon: Fingerprint,
              isVisible: (row) => isDeviceActionSupported(row, 'push_fingers'),
              onSelect: (row) => queue(row, 'push_fingers')
            },
            {
              labelKey: 'device.pushFace',
              icon: ScanFace,
              isVisible: (row) => isDeviceActionSupported(row, 'push_faces'),
              onSelect: (row) => queue(row, 'push_faces')
            },
            {
              labelKey: 'device.pushCard',
              icon: CreditCard,
              isVisible: (row) => isDeviceActionSupported(row, 'push_cards'),
              onSelect: (row) => queue(row, 'push_cards')
            }
          ] : []
        }}
      />
      <EntityFormDialog
        open={creating || Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        titleKey={editing ? 'common.edit' : 'device.add'}
        descriptionKey="device.capabilityWarning"
        fields={fields}
        initialValues={editing ?? undefined}
        saving={saving}
        onSubmit={submit}
      />
    </>
  );
}
