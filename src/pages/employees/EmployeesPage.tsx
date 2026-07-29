import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProtectedImage } from '@/components/ProtectedImage';
import { EntityFormDialog, type EntityFormValues } from '@/components/crud/EntityFormDialog';
import { DataPage } from '@/components/data-table/DataPage';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { asErrorMessage } from '@/lib/utils';
import { bulkUpdateEntities, deleteEntities, getLookupOptions, importEntities, listAllEntities, listEntities, updateEntity, type EntityRepositoryConfig } from '@/services/entity-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { Employee } from '@/types/domain';
import type { FormFieldConfig, FormOption } from '@/types/forms';
import { formatDate } from '@/utils/format';

const repository: EntityRepositoryConfig = {
  table: 'employees',
  select: '*,department:departments!employees_department_fk(id,name),position:positions!employees_position_fk(id,name),shift:shifts!employees_shift_fk(id,name)',
  searchFields: ['employee_no', 'nik', 'full_name', 'email', 'phone'],
  softDelete: true,
  defaultSort: { column: 'full_name', ascending: true },
  upsertConflict: 'organization_id,employee_no'
};

function optionRows(rows: Array<{ value: string; label: string }>): FormOption[] { return rows.map((row) => ({ value: row.value, label: row.label })); }
function statusVariant(status: Employee['status']): 'success' | 'warning' | 'secondary' | 'destructive' { return status === 'active' ? 'success' : status === 'probation' ? 'warning' : status === 'inactive' || status === 'resigned' ? 'secondary' : 'destructive'; }

export default function EmployeesPage() {
  const { t, locale } = useLocale();
  const { activeMembership, can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const organizationId = activeMembership?.organization_id ?? '';
  const [editing, setEditing] = useState<Employee | null>(null);
  const [viewing, setViewing] = useState<Employee | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lookups = useQuery({
    queryKey: ['employee-lookups', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const [departments, positions, shifts] = await Promise.all([
        getLookupOptions('departments', organizationId), getLookupOptions('positions', organizationId), getLookupOptions('shifts', organizationId)
      ]);
      return { departments, positions, shifts };
    }
  });
  const fields = useMemo<FormFieldConfig[]>(() => [
    { name: 'nik', labelKey: 'employee.nik', type: 'text', max: 32 },
    { name: 'full_name', labelKey: 'employee.fullName', type: 'text', required: true, max: 160 },
    { name: 'gender', labelKey: 'employee.gender', type: 'select', options: [{ value: 'male', labelKey: 'employee.male' }, { value: 'female', labelKey: 'employee.female' }, { value: 'other', labelKey: 'employee.otherGender' }] },
    { name: 'birth_place', labelKey: 'employee.birthPlace', type: 'text', max: 120 },
    { name: 'birth_date', labelKey: 'employee.birthDate', type: 'date' },
    { name: 'join_date', labelKey: 'employee.joinDate', type: 'date', required: true },
    { name: 'phone', labelKey: 'employee.phone', type: 'tel', max: 32 },
    { name: 'email', labelKey: 'employee.email', type: 'email', max: 255 },
    { name: 'department_id', labelKey: 'employee.department', type: 'select', options: optionRows(lookups.data?.departments ?? []) },
    { name: 'position_id', labelKey: 'employee.position', type: 'select', options: optionRows(lookups.data?.positions ?? []) },
    { name: 'shift_id', labelKey: 'employee.shift', type: 'select', options: optionRows(lookups.data?.shifts ?? []) },
    { name: 'status', labelKey: 'employee.status', type: 'select', required: true, options: [
      { value: 'active', labelKey: 'employee.active' }, { value: 'inactive', labelKey: 'employee.inactive' }, { value: 'probation', labelKey: 'employee.probation' }, { value: 'resigned', labelKey: 'employee.resigned' }, { value: 'terminated', labelKey: 'employee.terminated' }
    ] },
    { name: 'bpjs_status', labelKey: 'employee.bpjsStatus', type: 'switch' },
    { name: 'bpjs_number', labelKey: 'employee.bpjsNumber', type: 'text', max: 40 },
    { name: 'npwp', labelKey: 'employee.npwp', type: 'text', max: 40 },
    { name: 'bank_name', labelKey: 'employee.bank', type: 'text', max: 80 },
    { name: 'bank_account_number', labelKey: 'employee.bankAccount', type: 'text', max: 64 },
    { name: 'bank_account_name', labelKey: 'employee.bankAccountName', type: 'text', max: 160 },
    { name: 'emergency_contact_name', labelKey: 'employee.emergencyContact', type: 'text', max: 160 },
    { name: 'emergency_contact_phone', labelKey: 'employee.emergencyPhone', type: 'tel', max: 32 },
    { name: 'fingerprint_pin', labelKey: 'employee.fingerprintPin', type: 'text', max: 32 },
    { name: 'address', labelKey: 'employee.address', type: 'textarea', max: 1000, gridSpan: 2 },
    { name: 'notes', labelKey: 'employee.notes', type: 'textarea', max: 2000, gridSpan: 2 },
    { name: 'is_active', labelKey: 'common.active', type: 'switch', defaultValue: true }
  ], [lookups.data]);
  const columns = useMemo<DataColumn<Employee>[]>(() => [
    { id: 'photo_path', headerKey: 'employee.photo', accessor: 'photo_path', sortable: false, cell: (_value, row) => <ProtectedImage bucket="employee-documents" path={row.photo_path} alt={row.full_name} className="size-9 rounded-full" onClick={setPreview} /> },
    { id: 'employee_no', headerKey: 'employee.employeeNo', accessor: 'employee_no' },
    { id: 'full_name', headerKey: 'employee.fullName', accessor: 'full_name' },
    { id: 'nik', headerKey: 'employee.nik', accessor: 'nik', hideOnMobile: true },
    { id: 'department_id', headerKey: 'employee.department', accessor: (row) => row.department?.name ?? '', exportValue: (row) => row.department?.name ?? '' },
    { id: 'position_id', headerKey: 'employee.position', accessor: (row) => row.position?.name ?? '', hideOnMobile: true, exportValue: (row) => row.position?.name ?? '' },
    { id: 'shift_id', headerKey: 'employee.shift', accessor: (row) => row.shift?.name ?? '', hideOnMobile: true, exportValue: (row) => row.shift?.name ?? '' },
    { id: 'status', headerKey: 'employee.status', accessor: 'status', cell: (value) => <Badge variant={statusVariant(value as Employee['status'])}>{t(`employee.${String(value)}`)}</Badge> },
    { id: 'join_date', headerKey: 'employee.joinDate', accessor: 'join_date', hideOnMobile: true, cell: (value) => formatDate(String(value), locale) }
  ], [locale, t]);
  const filters: FilterDefinition[] = [
    { id: 'status', labelKey: 'employee.status', type: 'select', options: [
      { value: 'active', labelKey: 'employee.active' }, { value: 'inactive', labelKey: 'employee.inactive' }, { value: 'probation', labelKey: 'employee.probation' }, { value: 'resigned', labelKey: 'employee.resigned' }, { value: 'terminated', labelKey: 'employee.terminated' }
    ] },
    { id: 'gender', labelKey: 'employee.gender', type: 'select', options: [{ value: 'male', labelKey: 'employee.male' }, { value: 'female', labelKey: 'employee.female' }, { value: 'other', labelKey: 'employee.otherGender' }] },
    { id: 'join_date', labelKey: 'employee.joinDate', type: 'date-range' },
    { id: 'is_active', labelKey: 'common.active', type: 'boolean' }
  ];
  const saveEdit = async (values: EntityFormValues) => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateEntity(repository, organizationId, editing.id, values);
      await queryClient.invalidateQueries({ queryKey: ['employees', organizationId] });
      toast.success(t('notification.updated'));
      setEditing(null);
    } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); }
    finally { setSaving(false); }
  };
  return <><DataPage<Employee>
    titleKey="employee.title"
    filename="employees"
    queryKey={['employees', organizationId]}
    columns={columns}
    filters={filters}
    loader={(query) => listEntities<Employee>(repository, organizationId, query)}
    loadAll={(query) => listAllEntities<Employee>(repository, organizationId, query)}
    initialSorting={[{ id: 'full_name', desc: false }]}
    headerContent={can('employees.create') ? <Button onClick={() => navigate('/employees/register')}>{t('employee.register')}</Button> : null}
    actions={{
      canCreate: false,
      canUpdate: can('employees.update'), canDelete: can('employees.delete'),
      onView: setViewing, onEdit: setEditing,
      onDelete: (ids) => deleteEntities(repository, organizationId, ids),
      onBulkUpdate: (ids, patch) => bulkUpdateEntities(repository, organizationId, ids, patch),
      onImport: (rows) => importEntities(repository, organizationId, rows),
      bulkUpdatePresets: [{ labelKey: 'employee.active', patch: { status: 'active', is_active: true } }, { labelKey: 'employee.inactive', patch: { status: 'inactive', is_active: false } }]
    }}
  />
  <EntityFormDialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }} titleKey="common.edit" fields={fields} initialValues={editing ?? undefined} saving={saving} onSubmit={saveEdit} />
  <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{viewing?.full_name}</DialogTitle><DialogDescription>{viewing?.employee_no}</DialogDescription></DialogHeader>{viewing && <div className="grid gap-4 text-sm sm:grid-cols-[10rem_1fr]"><ProtectedImage bucket="employee-documents" path={viewing.photo_path} alt={viewing.full_name} className="aspect-square w-40 rounded-xl" onClick={setPreview} /><dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2">{[
    ['employee.nik', viewing.nik], ['employee.gender', viewing.gender ? t(`employee.${viewing.gender === 'male' ? 'male' : viewing.gender === 'female' ? 'female' : 'otherGender'}`) : null], ['employee.birthPlace', viewing.birth_place], ['employee.birthDate', formatDate(viewing.birth_date, locale)], ['employee.department', viewing.department?.name], ['employee.position', viewing.position?.name], ['employee.shift', viewing.shift?.name], ['employee.phone', viewing.phone], ['employee.email', viewing.email], ['employee.bank', viewing.bank_name], ['employee.bankAccount', viewing.bank_account_number]
  ].map(([label, value]) => <div className="contents" key={String(label)}><dt className="text-muted-foreground">{t(String(label))}</dt><dd className="font-medium">{String(value ?? '—')}</dd></div>)}</dl><div className="sm:col-span-2"><p className="text-muted-foreground">{t('employee.address')}</p><p>{viewing.address ?? '—'}</p></div></div>}</DialogContent></Dialog>
  <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}><DialogContent className="max-w-4xl p-2">{preview && <img src={preview} alt={t('common.preview')} className="max-h-[85vh] w-full rounded-lg object-contain" />}</DialogContent></Dialog>
  </>;
}
