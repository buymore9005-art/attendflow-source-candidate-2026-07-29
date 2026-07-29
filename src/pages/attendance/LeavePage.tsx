import { CheckCircle2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { EntityFormDialog, type EntityFormValues } from '@/components/crud/EntityFormDialog';
import { DataPage } from '@/components/data-table/DataPage';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { getSupabase } from '@/lib/supabase';
import { asErrorMessage } from '@/lib/utils';
import { createEntity, deleteEntities, importEntities, listAllEntities, listEntities, updateEntity, type EntityRepositoryConfig } from '@/services/entity-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { LeaveRequest } from '@/types/domain';
import type { FormFieldConfig } from '@/types/forms';
import { formatDate, formatDateTime } from '@/utils/format';

const repository: EntityRepositoryConfig = { table: 'leave_requests', select: '*,employee:employees(employee_no,full_name)', searchFields: ['request_number', 'reason', 'rejection_reason'], defaultSort: { column: 'created_at', ascending: false } };
export default function LeavePage() {
  const { t, locale } = useLocale(); const { activeMembership, can } = useAuth(); const organizationId = activeMembership?.organization_id ?? '';
  const [creating, setCreating] = useState(false); const [editing, setEditing] = useState<LeaveRequest | null>(null); const [saving, setSaving] = useState(false);
  const fields: FormFieldConfig[] = [
    { name: 'employee_id', labelKey: 'employee.employeeNo', type: 'text', required: true },
    { name: 'leave_type', labelKey: 'leave.type', type: 'select', required: true, options: [{ value: 'permit', labelKey: 'attendance.permit' }, { value: 'sick', labelKey: 'attendance.sick' }, { value: 'leave', labelKey: 'attendance.leave' }, { value: 'other', labelKey: 'common.info' }] },
    { name: 'start_date', labelKey: 'leave.startDate', type: 'date', required: true }, { name: 'end_date', labelKey: 'leave.endDate', type: 'date', required: true },
    { name: 'reason', labelKey: 'leave.reason', type: 'textarea', required: true, max: 2000, gridSpan: 2 }
  ];
  const columns = useMemo<DataColumn<LeaveRequest>[]>(() => [
    { id: 'request_number', headerKey: 'common.code', accessor: 'request_number' },
    { id: 'employee_id', headerKey: 'employee.fullName', accessor: (row) => row.employee?.full_name ?? '', exportValue: (row) => row.employee?.full_name ?? '' }, { id: 'leave_type', headerKey: 'leave.type', accessor: 'leave_type', cell: (value) => t(`attendance.${String(value)}`) },
    { id: 'start_date', headerKey: 'leave.startDate', accessor: 'start_date', cell: (value) => formatDate(String(value), locale) }, { id: 'end_date', headerKey: 'leave.endDate', accessor: 'end_date', cell: (value) => formatDate(String(value), locale) },
    { id: 'total_days', headerKey: 'leave.totalDays', accessor: 'total_days' }, { id: 'reason', headerKey: 'leave.reason', accessor: 'reason', hideOnMobile: true },
    { id: 'status', headerKey: 'common.status', accessor: 'status', cell: (value) => <Badge variant={value === 'approved' ? 'success' : value === 'rejected' ? 'destructive' : 'warning'}>{t(`status.${String(value)}`)}</Badge> },
    { id: 'approved_at', headerKey: 'payroll.approval', accessor: 'approved_at', hideOnMobile: true, cell: (value) => formatDateTime(value ? String(value) : null, locale) }
  ], [locale, t]);
  const filters: FilterDefinition[] = [{ id: 'status', labelKey: 'common.status', type: 'select', options: [{ value: 'pending', labelKey: 'status.pending' }, { value: 'approved', labelKey: 'status.approved' }, { value: 'rejected', labelKey: 'status.rejected' }] }, { id: 'leave_type', labelKey: 'leave.type', type: 'select', options: [{ value: 'permit', labelKey: 'attendance.permit' }, { value: 'sick', labelKey: 'attendance.sick' }, { value: 'leave', labelKey: 'attendance.leave' }] }, { id: 'start_date', labelKey: 'leave.startDate', type: 'date-range' }];
  const submit = async (values: EntityFormValues) => { setSaving(true); try { if (editing) await updateEntity(repository, organizationId, editing.id, values); else await createEntity(repository, organizationId, { ...values, status: 'pending' }); toast.success(t('notification.saved')); setCreating(false); setEditing(null); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } finally { setSaving(false); } };
  const decide = async (row: LeaveRequest, decision: 'approved' | 'rejected') => { try { const { error } = await getSupabase().rpc('decide_leave_request', { p_request_id: row.id, p_decision: decision, p_rejection_reason: decision === 'rejected' ? 'Rejected by approver' : null }); if (error) throw error; toast.success(t('notification.updated')); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } };
  return <><DataPage<LeaveRequest> titleKey="leave.title" filename="leave-requests" queryKey={['leave', organizationId]} columns={columns} filters={filters} loader={(query) => listEntities(repository, organizationId, query)} loadAll={(query) => listAllEntities(repository, organizationId, query)} actions={{
    canCreate: can('leave.create'), canUpdate: can('leave.update'), canDelete: can('leave.delete'), onCreate: () => setCreating(true), onEdit: setEditing, onDelete: (ids) => deleteEntities(repository, organizationId, ids), onImport: (rows) => importEntities(repository, organizationId, rows),
    rowActions: can('leave.approve') ? [{ labelKey: 'leave.approve', icon: CheckCircle2, onSelect: (row) => decide(row, 'approved') }, { labelKey: 'leave.reject', icon: XCircle, destructive: true, onSelect: (row) => decide(row, 'rejected') }] : []
  }} /><EntityFormDialog open={creating || Boolean(editing)} onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); } }} titleKey={editing ? 'common.edit' : 'common.add'} fields={fields} initialValues={editing ?? undefined} saving={saving} onSubmit={submit} /></>;
}
