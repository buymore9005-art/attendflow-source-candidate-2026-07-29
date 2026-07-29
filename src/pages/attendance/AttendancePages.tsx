import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { EntityFormDialog, type EntityFormValues } from '@/components/crud/EntityFormDialog';
import { DataPage } from '@/components/data-table/DataPage';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { getSupabase } from '@/lib/supabase';
import { asErrorMessage } from '@/lib/utils';
import { bulkUpdateEntities, createEntity, deleteEntities, getLookupOptions, importEntities, listAllEntities, listEntities, updateEntity, type EntityRepositoryConfig } from '@/services/entity-service';
import type { DataColumn, FilterDefinition, PageQuery, PageResult } from '@/types/data-table';
import type { AttendanceRecord } from '@/types/domain';
import type { FormFieldConfig } from '@/types/forms';
import { formatDate, formatDateTime, formatMinutes } from '@/utils/format';

const attendanceRepository: EntityRepositoryConfig = {
  table: 'attendance_records',
  select: '*,employee:employees(employee_no,full_name),shift:shifts(name),device:attendance_devices(name)',
  searchFields: ['notes', 'location'],
  defaultSort: { column: 'work_date', ascending: false },
  upsertConflict: 'organization_id,employee_id,work_date'
};

const statusOptions = [
  { value: 'present', labelKey: 'attendance.present' }, { value: 'late', labelKey: 'attendance.late' }, { value: 'absent', labelKey: 'attendance.absent' },
  { value: 'permit', labelKey: 'attendance.permit' }, { value: 'sick', labelKey: 'attendance.sick' }, { value: 'leave', labelKey: 'attendance.leave' },
  { value: 'holiday', labelKey: 'attendance.holiday' }, { value: 'off', labelKey: 'attendance.off' }, { value: 'incomplete', labelKey: 'attendance.incomplete' }
];

function StatusBadge({ status }: { status: AttendanceRecord['status'] }) {
  const { t } = useLocale();
  const variant = status === 'present' ? 'success' : status === 'late' || status === 'incomplete' ? 'warning' : status === 'absent' ? 'destructive' : 'info';
  return <Badge variant={variant}>{t(`attendance.${status}`)}</Badge>;
}

function toLocalInput(value: unknown): unknown {
  if (typeof value !== 'string' || value.length < 16) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function toIso(value: unknown): unknown { return typeof value === 'string' && value ? new Date(value).toISOString() : null; }

function AttendanceRecordsPage({ mode }: { mode: 'daily' | 'history' }) {
  const { t, locale } = useLocale();
  const { activeMembership, can } = useAuth();
  const organizationId = activeMembership?.organization_id ?? '';
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const queryKey = useMemo(() => ['attendance', mode, organizationId] as const, [mode, organizationId]);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const lookups = useQuery({ queryKey: ['attendance-lookups', organizationId], enabled: Boolean(organizationId), queryFn: async () => {
    const [employees, shifts, devices] = await Promise.all([getLookupOptions('employees', organizationId, 'full_name'), getLookupOptions('shifts', organizationId), getLookupOptions('attendance_devices', organizationId)]);
    return { employees, shifts, devices };
  }});
  useEffect(() => {
    if (!organizationId) return;
    const client = getSupabase();
    const channel = client.channel(`attendance-list:${organizationId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records', filter: `organization_id=eq.${organizationId}` }, () => void queryClient.invalidateQueries({ queryKey })).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [organizationId, queryClient, queryKey]);
  const fields = useMemo<FormFieldConfig[]>(() => [
    { name: 'employee_id', labelKey: 'employee.fullName', type: 'select', required: true, options: lookups.data?.employees.map((item) => ({ value: item.value, label: item.label })) ?? [] },
    { name: 'work_date', labelKey: 'attendance.workDate', type: 'date', required: true },
    { name: 'shift_id', labelKey: 'attendance.shift', type: 'select', options: lookups.data?.shifts.map((item) => ({ value: item.value, label: item.label })) ?? [] },
    { name: 'device_id', labelKey: 'attendance.device', type: 'select', options: lookups.data?.devices.map((item) => ({ value: item.value, label: item.label })) ?? [] },
    { name: 'clock_in', labelKey: 'attendance.clockIn', type: 'datetime-local' },
    { name: 'clock_out', labelKey: 'attendance.clockOut', type: 'datetime-local' },
    { name: 'break_start', labelKey: 'attendance.breakStart', type: 'datetime-local' },
    { name: 'break_end', labelKey: 'attendance.breakEnd', type: 'datetime-local' },
    { name: 'status', labelKey: 'common.status', type: 'select', required: true, options: statusOptions },
    { name: 'location', labelKey: 'attendance.location', type: 'text', max: 255 },
    { name: 'notes', labelKey: 'common.notes', type: 'textarea', max: 2000, gridSpan: 2 }
  ], [lookups.data]);
  const initialValues = editing ? { ...editing, clock_in: toLocalInput(editing.clock_in), clock_out: toLocalInput(editing.clock_out), break_start: toLocalInput(editing.break_start), break_end: toLocalInput(editing.break_end) } : undefined;
  const columns = useMemo<DataColumn<AttendanceRecord>[]>(() => [
    { id: 'work_date', headerKey: 'attendance.workDate', accessor: 'work_date', cell: (value) => formatDate(String(value), locale) },
    { id: 'employee_id', headerKey: 'employee.fullName', accessor: (row) => row.employee?.full_name ?? '', exportValue: (row) => row.employee?.full_name ?? '' },
    { id: 'employee_no', headerKey: 'employee.employeeNo', accessor: (row) => row.employee?.employee_no ?? '', hideOnMobile: true, exportValue: (row) => row.employee?.employee_no ?? '' },
    { id: 'clock_in', headerKey: 'attendance.clockIn', accessor: 'clock_in', cell: (value) => formatDateTime(value ? String(value) : null, locale) },
    { id: 'clock_out', headerKey: 'attendance.clockOut', accessor: 'clock_out', cell: (value) => formatDateTime(value ? String(value) : null, locale) },
    { id: 'work_minutes', headerKey: 'attendance.workHours', accessor: 'work_minutes', cell: (value) => formatMinutes(Number(value)) },
    { id: 'late_minutes', headerKey: 'attendance.late', accessor: 'late_minutes', hideOnMobile: true, cell: (value) => formatMinutes(Number(value)) },
    { id: 'early_leave_minutes', headerKey: 'attendance.earlyLeave', accessor: 'early_leave_minutes', hideOnMobile: true, cell: (value) => formatMinutes(Number(value)) },
    { id: 'overtime_minutes', headerKey: 'attendance.overtime', accessor: 'overtime_minutes', hideOnMobile: true, cell: (value) => formatMinutes(Number(value)) },
    { id: 'status', headerKey: 'common.status', accessor: 'status', cell: (value) => <StatusBadge status={value as AttendanceRecord['status']} /> },
    { id: 'shift_id', headerKey: 'attendance.shift', accessor: (row) => row.shift?.name ?? '', hideOnMobile: true, exportValue: (row) => row.shift?.name ?? '' },
    { id: 'device_id', headerKey: 'attendance.device', accessor: (row) => row.device?.name ?? '', hideOnMobile: true, exportValue: (row) => row.device?.name ?? '' },
    { id: 'location', headerKey: 'attendance.location', accessor: 'location', hideOnMobile: true }
  ], [locale]);
  const filters: FilterDefinition[] = [{ id: 'work_date', labelKey: 'attendance.workDate', type: 'date-range' }, { id: 'status', labelKey: 'common.status', type: 'select', options: statusOptions }, { id: 'employee_id', labelKey: 'employee.fullName', type: 'text' }, { id: 'device_id', labelKey: 'attendance.device', type: 'text' }];
  const submit = async (values: EntityFormValues) => {
    setSaving(true);
    try {
      const payload = { ...values, clock_in: toIso(values.clock_in), clock_out: toIso(values.clock_out), break_start: toIso(values.break_start), break_end: toIso(values.break_end) };
      if (editing) await updateEntity(attendanceRepository, organizationId, editing.id, payload);
      else await createEntity(attendanceRepository, organizationId, payload);
      await getSupabase().rpc('recalculate_attendance_record', { p_attendance_id: editing?.id ?? null, p_organization_id: organizationId, p_employee_id: String(values.employee_id), p_work_date: String(values.work_date) });
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t(editing ? 'notification.updated' : 'notification.saved'));
      setEditing(null); setCreating(false);
    } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); }
    finally { setSaving(false); }
  };
  const recalculate = async (row: AttendanceRecord) => {
    try { const { error } = await getSupabase().rpc('recalculate_attendance_record', { p_attendance_id: row.id, p_organization_id: organizationId, p_employee_id: row.employee_id, p_work_date: row.work_date }); if (error) throw error; await queryClient.invalidateQueries({ queryKey }); toast.success(t('notification.updated')); }
    catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); }
  };
  return <><DataPage<AttendanceRecord> titleKey={mode === 'daily' ? 'menu.attendanceDaily' : 'menu.attendanceHistory'} filename={`attendance-${mode}`} queryKey={queryKey} columns={columns} filters={filters} initialFilters={mode === 'daily' ? { work_date__from: today, work_date__to: today } : {}} loader={(query) => listEntities(attendanceRepository, organizationId, query)} loadAll={(query) => listAllEntities(attendanceRepository, organizationId, query)} actions={{
    canCreate: can('attendance.create'), canUpdate: can('attendance.update'), canDelete: can('attendance.delete'),
    onCreate: () => setCreating(true), onEdit: setEditing,
    onDelete: (ids) => deleteEntities(attendanceRepository, organizationId, ids), onBulkUpdate: (ids, patch) => bulkUpdateEntities(attendanceRepository, organizationId, ids, patch),
    onImport: (rows) => importEntities(attendanceRepository, organizationId, rows),
    bulkUpdatePresets: statusOptions.map((option) => ({ labelKey: option.labelKey, patch: { status: option.value } })),
    rowActions: can('attendance.update') ? [{ labelKey: 'attendance.recalculate', icon: Calculator, onSelect: recalculate }] : []
  }} /><EntityFormDialog open={creating || Boolean(editing)} onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); } }} titleKey={editing ? 'common.edit' : 'common.add'} fields={fields} initialValues={initialValues} saving={saving} onSubmit={submit} /></>;
}

export function AttendanceDailyPage() { return <AttendanceRecordsPage mode="daily" />; }
export function AttendanceHistoryPage() { return <AttendanceRecordsPage mode="history" />; }

interface MonthlySummary extends Record<string, unknown> { id: string; organization_id: string; employee_id: string; month: string; employee_no: string; full_name: string; present_days: number; late_days: number; absent_days: number; permit_days: number; sick_days: number; leave_days: number; overtime_minutes: number; work_minutes: number }
const monthlyRepository: EntityRepositoryConfig = { table: 'attendance_monthly_summary', searchFields: ['employee_no', 'full_name'], defaultSort: { column: 'month', ascending: false } };
function summaryColumns(locale: 'id' | 'en' | 'zh'): DataColumn<MonthlySummary>[] { return [
  { id: 'month', headerKey: 'common.date', accessor: 'month' }, { id: 'employee_no', headerKey: 'employee.employeeNo', accessor: 'employee_no' }, { id: 'full_name', headerKey: 'employee.fullName', accessor: 'full_name' },
  { id: 'present_days', headerKey: 'attendance.present', accessor: 'present_days' }, { id: 'late_days', headerKey: 'attendance.late', accessor: 'late_days' }, { id: 'absent_days', headerKey: 'attendance.absent', accessor: 'absent_days' },
  { id: 'permit_days', headerKey: 'attendance.permit', accessor: 'permit_days', hideOnMobile: true }, { id: 'sick_days', headerKey: 'attendance.sick', accessor: 'sick_days', hideOnMobile: true }, { id: 'leave_days', headerKey: 'attendance.leave', accessor: 'leave_days', hideOnMobile: true },
  { id: 'work_minutes', headerKey: 'attendance.workHours', accessor: 'work_minutes', cell: (value) => formatMinutes(Number(value)) }, { id: 'overtime_minutes', headerKey: 'attendance.overtime', accessor: 'overtime_minutes', cell: (value) => formatMinutes(Number(value)) },
  { id: 'month_label', headerKey: 'common.updatedAt', accessor: (row) => formatDate(`${row.month}-01`, locale), sortable: false, hideOnMobile: true }
]; }

function SummaryPage({ recap }: { recap: boolean }) {
  const { locale } = useLocale(); const { activeMembership } = useAuth(); const organizationId = activeMembership?.organization_id ?? '';
  const currentMonth = new Date().toISOString().slice(0, 7);
  const loader = (query: PageQuery): Promise<PageResult<MonthlySummary>> => listEntities(monthlyRepository, organizationId, query);
  return <DataPage<MonthlySummary> titleKey={recap ? 'menu.attendanceRecap' : 'menu.attendanceMonthly'} filename={recap ? 'attendance-recap' : 'attendance-monthly'} queryKey={['attendance-summary', recap, organizationId]} columns={summaryColumns(locale)} filters={[{ id: 'month', labelKey: 'common.date', type: 'text' }]} initialFilters={recap ? {} : { month: currentMonth }} loader={loader} loadAll={(query) => listAllEntities(monthlyRepository, organizationId, query)} actions={{ canCreate: false, canUpdate: false, canDelete: false, onImport: (rows) => importEntities(attendanceRepository, organizationId, rows) }} />;
}
export function AttendanceMonthlyPage() { return <SummaryPage recap={false} />; }
export function AttendanceRecapPage() { return <SummaryPage recap />; }
