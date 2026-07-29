import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataPage } from '@/components/data-table/DataPage';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { getSupabase } from '@/lib/supabase';
import { asErrorMessage } from '@/lib/utils';
import { importEntities, listAllEntities, listEntities, type EntityRepositoryConfig } from '@/services/entity-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { AppRole } from '@/types/domain';

interface RolePermissionRow { id: string; organization_id: string; role: AppRole; permissions: string[]; created_at: string; updated_at: string }
const repository: EntityRepositoryConfig = { table: 'role_permissions', searchFields: ['role'], defaultSort: { column: 'role', ascending: true }, upsertConflict: 'organization_id,role' };
const modules = ['dashboard', 'employees', 'organization', 'devices', 'attendance', 'shifts', 'leave', 'payroll', 'integrations', 'users', 'roles', 'audit', 'settings'];
const actions = ['read', 'create', 'update', 'delete', 'approve', 'finalize', 'sync', 'settings'] as const;
const actionLabelKeys: Record<(typeof actions)[number], string> = { read: 'common.view', create: 'common.add', update: 'common.edit', delete: 'common.delete', approve: 'leave.approve', finalize: 'payroll.finalize', sync: 'common.sync', settings: 'menu.settings' };

export default function RolesPage() {
  const { t } = useLocale(); const { activeMembership, can } = useAuth(); const organizationId = activeMembership?.organization_id ?? ''; const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RolePermissionRow | null>(null); const [selected, setSelected] = useState<Set<string>>(new Set()); const [saving, setSaving] = useState(false);
  const columns = useMemo<DataColumn<RolePermissionRow>[]>(() => [
    { id: 'role', headerKey: 'user.role', accessor: 'role', cell: (value) => <Badge variant="info">{t(`user.${String(value)}`)}</Badge> },
    { id: 'permissions', headerKey: 'user.permissions', accessor: (row) => row.permissions.length, cell: (value) => t('common.permissionsCount', { count: String(value) }), exportValue: (row) => row.permissions.join(', ') },
    { id: 'updated_at', headerKey: 'common.updatedAt', accessor: 'updated_at' }
  ], [t]);
  const filters: FilterDefinition[] = [{ id: 'role', labelKey: 'user.role', type: 'select', options: ['admin', 'hr', 'supervisor', 'finance', 'manager', 'leader', 'viewer'].map((role) => ({ value: role, labelKey: `user.${role}` })) }];
  const open = (row: RolePermissionRow) => { setEditing(row); setSelected(new Set(row.permissions)); };
  const toggle = (permission: string, checked: boolean) => { setSelected((current) => { const next = new Set(current); if (checked) next.add(permission); else next.delete(permission); return next; }); };
  const save = async () => { if (!editing) return; setSaving(true); try { const { error } = await getSupabase().from('role_permissions').update({ permissions: [...selected].sort() }).eq('id', editing.id).eq('organization_id', organizationId); if (error) throw error; await queryClient.invalidateQueries({ queryKey: ['roles', organizationId] }); toast.success(t('notification.updated')); setEditing(null); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } finally { setSaving(false); } };
  return <><DataPage<RolePermissionRow> titleKey="user.permissions" filename="role-permissions" queryKey={['roles', organizationId]} columns={columns} filters={filters} loader={(query) => listEntities(repository, organizationId, query)} loadAll={(query) => listAllEntities(repository, organizationId, query)} actions={{ canCreate: false, canUpdate: can('roles.update'), canDelete: false, onEdit: open, onView: open, onImport: (rows) => importEntities(repository, organizationId, rows) }} />
  <Dialog open={Boolean(editing)} onOpenChange={(openState) => { if (!openState) setEditing(null); }}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>{editing ? t(`user.${editing.role}`) : ''}</DialogTitle><DialogDescription>{t('user.permissions')}</DialogDescription></DialogHeader><div className="max-h-[62vh] overflow-auto rounded-xl border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-3 text-left">{t('common.module')}</th>{actions.map((action) => <th key={action} className="p-3 text-center">{t(actionLabelKeys[action])}</th>)}</tr></thead><tbody>{modules.map((module) => <tr key={module} className="border-t"><td className="p-3 font-medium">{t(`menu.${module}`)}</td>{actions.map((action) => { const permission = `${module}.${action}`; const checked = selected.has(permission) || selected.has(`${module}.*`) || selected.has('*'); return <td key={action} className="p-3 text-center"><Checkbox checked={checked} disabled={editing?.role === 'admin'} onCheckedChange={(value) => toggle(permission, Boolean(value))} aria-label={permission} /></td>; })}</tr>)}</tbody></table></div><DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>{t('common.cancel')}</Button><Button onClick={() => void save()} disabled={saving || editing?.role === 'admin'}>{saving ? t('common.saving') : t('common.save')}</Button></DialogFooter></DialogContent></Dialog></>;
}
