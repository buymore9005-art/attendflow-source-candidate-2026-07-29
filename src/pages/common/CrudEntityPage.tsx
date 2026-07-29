import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EntityFormDialog, type EntityFormValues } from '@/components/crud/EntityFormDialog';
import { DataPage } from '@/components/data-table/DataPage';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { asErrorMessage } from '@/lib/utils';
import { bulkUpdateEntities, createEntity, deleteEntities, importEntities, listAllEntities, listEntities, updateEntity, type EntityRepositoryConfig } from '@/services/entity-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { FormFieldConfig } from '@/types/forms';
import { defaultActiveBulkPresets } from '@/utils/crud-presets';

export interface CrudEntityPageProps<T extends { id: string }> {
  titleKey: string;
  descriptionKey?: string;
  filename: string;
  permissionPrefix: string;
  repository: EntityRepositoryConfig;
  columns: DataColumn<T>[];
  filters?: FilterDefinition[];
  fields: FormFieldConfig[];
  initialSorting?: Array<{ id: string; desc: boolean }>;
  normalizeValues?: (values: EntityFormValues, existing: T | null) => Record<string, unknown>;
}

export function CrudEntityPage<T extends { id: string }>(props: CrudEntityPageProps<T>) {
  const { activeMembership, can } = useAuth();
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const organizationId = activeMembership?.organization_id ?? '';
  const queryKey = useMemo(() => ['entities', props.repository.table, organizationId] as const, [organizationId, props.repository.table]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const submit = async (values: EntityFormValues) => {
    setSaving(true);
    try {
      const payload = props.normalizeValues ? props.normalizeValues(values, editing) : values;
      if (editing) await updateEntity(props.repository, organizationId, editing.id, payload);
      else await createEntity(props.repository, organizationId, payload);
      await invalidate();
      toast.success(t(editing ? 'notification.updated' : 'notification.saved'));
      setDialogOpen(false);
      setEditing(null);
    } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); }
    finally { setSaving(false); }
  };
  return <><DataPage<T>
    titleKey={props.titleKey}
    descriptionKey={props.descriptionKey}
    filename={props.filename}
    queryKey={queryKey}
    columns={props.columns}
    filters={props.filters}
    loader={(query) => listEntities<T>(props.repository, organizationId, query)}
    loadAll={(query) => listAllEntities<T>(props.repository, organizationId, query)}
    initialSorting={props.initialSorting}
    actions={{
      canCreate: can(`${props.permissionPrefix}.create`),
      canUpdate: can(`${props.permissionPrefix}.update`),
      canDelete: can(`${props.permissionPrefix}.delete`),
      onCreate: () => { setEditing(null); setDialogOpen(true); },
      onEdit: (row) => { setEditing(row); setDialogOpen(true); },
      onDelete: (ids) => deleteEntities(props.repository, organizationId, ids),
      onBulkUpdate: (ids, patch) => bulkUpdateEntities(props.repository, organizationId, ids, patch),
      onImport: (rows) => importEntities(props.repository, organizationId, rows),
      bulkUpdatePresets: defaultActiveBulkPresets(props.fields)
    }}
  /><EntityFormDialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }} titleKey={editing ? 'common.edit' : 'common.add'} fields={props.fields} initialValues={editing ?? undefined} saving={saving} onSubmit={submit} /></>;
}
