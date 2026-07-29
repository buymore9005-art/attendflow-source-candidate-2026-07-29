import { ShieldCheck, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { EntityFormDialog, type EntityFormValues } from '@/components/crud/EntityFormDialog';
import { DataPage } from '@/components/data-table/DataPage';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { asErrorMessage } from '@/lib/utils';
import { invokeFunction } from '@/services/edge-function-service';
import { deleteEntities, listAllEntities, listEntities, updateEntity, type EntityRepositoryConfig } from '@/services/entity-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { AppRole, MemberStatus } from '@/types/domain';
import type { FormFieldConfig } from '@/types/forms';
import { formatDateTime } from '@/utils/format';

interface MemberDirectory { id: string; organization_id: string; user_id: string; full_name: string; email: string; phone: string | null; role: AppRole; status: MemberStatus; department_name: string | null; permission_grants: string[]; permission_denials: string[]; created_at: string; updated_at: string }
const viewRepository: EntityRepositoryConfig = { table: 'organization_member_directory', searchFields: ['full_name', 'email', 'phone', 'department_name'], defaultSort: { column: 'full_name', ascending: true } };
const memberRepository: EntityRepositoryConfig = { table: 'organization_members' };
const roles: AppRole[] = ['admin', 'hr', 'supervisor', 'finance', 'manager', 'leader', 'viewer'];

export default function UsersPage() {
  const { t, locale } = useLocale(); const { activeMembership, can } = useAuth(); const organizationId = activeMembership?.organization_id ?? '';
  const [creating, setCreating] = useState(false); const [editing, setEditing] = useState<MemberDirectory | null>(null); const [saving, setSaving] = useState(false);
  const fields = useMemo<FormFieldConfig[]>(() => [
    ...(creating ? [{ name: 'email', labelKey: 'auth.email', type: 'email' as const, required: true, max: 255 }, { name: 'full_name', labelKey: 'employee.fullName', type: 'text' as const, required: true, max: 160 }] : []),
    { name: 'role', labelKey: 'user.role', type: 'select', required: true, options: roles.map((role) => ({ value: role, labelKey: `user.${role}` })) },
    { name: 'status', labelKey: 'common.status', type: 'select', required: true, options: [{ value: 'invited', labelKey: 'status.invited' }, { value: 'active', labelKey: 'status.active' }, { value: 'suspended', labelKey: 'status.suspended' }] }
  ], [creating]);
  const columns = useMemo<DataColumn<MemberDirectory>[]>(() => [
    { id: 'full_name', headerKey: 'employee.fullName', accessor: 'full_name' }, { id: 'email', headerKey: 'auth.email', accessor: 'email' }, { id: 'role', headerKey: 'user.role', accessor: 'role', cell: (value) => <Badge variant="info"><ShieldCheck className="mr-1 size-3" />{t(`user.${String(value)}`)}</Badge> },
    { id: 'status', headerKey: 'common.status', accessor: 'status', cell: (value) => <Badge variant={value === 'active' ? 'success' : value === 'suspended' ? 'destructive' : 'warning'}>{t(`status.${String(value)}`)}</Badge> },
    { id: 'department_name', headerKey: 'employee.department', accessor: 'department_name', hideOnMobile: true }, { id: 'created_at', headerKey: 'common.createdAt', accessor: 'created_at', hideOnMobile: true, cell: (value) => formatDateTime(String(value), locale) }
  ], [locale, t]);
  const filters: FilterDefinition[] = [{ id: 'role', labelKey: 'user.role', type: 'select', options: roles.map((role) => ({ value: role, labelKey: `user.${role}` })) }, { id: 'status', labelKey: 'common.status', type: 'select', options: [{ value: 'invited', labelKey: 'status.invited' }, { value: 'active', labelKey: 'status.active' }, { value: 'suspended', labelKey: 'status.suspended' }] }];
  const submit = async (values: EntityFormValues) => { setSaving(true); try { if (editing) await updateEntity(memberRepository, organizationId, editing.id, { role: values.role, status: values.status }); else await invokeFunction('admin-users', { organization_id: organizationId, action: 'invite', email: values.email, full_name: values.full_name, role: values.role }); toast.success(t('notification.saved')); setCreating(false); setEditing(null); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } finally { setSaving(false); } };
  const importUsers = async (rows: Record<string, unknown>[]) => { await invokeFunction('admin-users', { organization_id: organizationId, action: 'bulk_invite', rows }); };
  return <><DataPage<MemberDirectory> titleKey="user.title" filename="users" queryKey={['members', organizationId]} columns={columns} filters={filters} loader={(query) => listEntities(viewRepository, organizationId, query)} loadAll={(query) => listAllEntities(viewRepository, organizationId, query)} headerContent={can('users.create') ? <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><UserPlus className="size-4" />{t('user.add')}</span> : null} actions={{
    canCreate: can('users.create'), canUpdate: can('users.update'), canDelete: can('users.delete'), onCreate: () => setCreating(true), onEdit: setEditing, onDelete: (ids) => deleteEntities(memberRepository, organizationId, ids), onImport: importUsers
  }} /><EntityFormDialog open={creating || Boolean(editing)} onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); } }} titleKey={editing ? 'common.edit' : 'user.add'} fields={fields} initialValues={editing ?? { role: 'viewer', status: 'invited' }} saving={saving} onSubmit={submit} /></>;
}
