import { Badge } from '@/components/ui/badge';
import { CrudEntityPage } from '@/pages/common/CrudEntityPage';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { Department, Holiday, Position, Shift } from '@/types/domain';
import type { FormFieldConfig } from '@/types/forms';
import { useLocale } from '@/context/LocaleContext';
import { formatDate } from '@/utils/format';

const activeFilter: FilterDefinition[] = [{ id: 'is_active', labelKey: 'common.active', type: 'boolean' }];
const activeCell = (value: unknown, t: (key: string) => string) => <Badge variant={value ? 'success' : 'secondary'}>{value ? t('common.active') : t('common.inactive')}</Badge>;

export function DepartmentsPage() {
  const { t } = useLocale();
  const columns: DataColumn<Department>[] = [
    { id: 'code', headerKey: 'common.code', accessor: 'code' },
    { id: 'name', headerKey: 'common.name', accessor: 'name' },
    { id: 'is_active', headerKey: 'common.status', accessor: 'is_active', cell: (value) => activeCell(value, t) }
  ];
  const fields: FormFieldConfig[] = [
    { name: 'code', labelKey: 'common.code', type: 'text', required: true, max: 32 },
    { name: 'name', labelKey: 'common.name', type: 'text', required: true, max: 120 },
    { name: 'is_active', labelKey: 'common.active', type: 'switch', defaultValue: true }
  ];
  return <CrudEntityPage<Department> titleKey="menu.departments" filename="departments" permissionPrefix="organization" repository={{ table: 'departments', searchFields: ['code', 'name'], softDelete: true, defaultSort: { column: 'name', ascending: true }, upsertConflict: 'organization_id,code' }} columns={columns} filters={activeFilter} fields={fields} />;
}

export function PositionsPage() {
  const { t } = useLocale();
  const columns: DataColumn<Position>[] = [
    { id: 'code', headerKey: 'common.code', accessor: 'code' },
    { id: 'name', headerKey: 'common.name', accessor: 'name' },
    { id: 'level', headerKey: 'employee.position', accessor: 'level' },
    { id: 'is_active', headerKey: 'common.status', accessor: 'is_active', cell: (value) => activeCell(value, t) }
  ];
  const fields: FormFieldConfig[] = [
    { name: 'code', labelKey: 'common.code', type: 'text', required: true, max: 32 },
    { name: 'name', labelKey: 'common.name', type: 'text', required: true, max: 120 },
    { name: 'level', labelKey: 'employee.position', type: 'number', min: 1, max: 100, defaultValue: 1 },
    { name: 'is_active', labelKey: 'common.active', type: 'switch', defaultValue: true }
  ];
  return <CrudEntityPage<Position> titleKey="menu.positions" filename="positions" permissionPrefix="organization" repository={{ table: 'positions', searchFields: ['code', 'name'], softDelete: true, defaultSort: { column: 'level', ascending: true }, upsertConflict: 'organization_id,code' }} columns={columns} filters={activeFilter} fields={fields} />;
}

export function ShiftsPage() {
  const { t } = useLocale();
  const columns: DataColumn<Shift>[] = [
    { id: 'code', headerKey: 'common.code', accessor: 'code' },
    { id: 'name', headerKey: 'common.name', accessor: 'name' },
    { id: 'shift_type', headerKey: 'shift.type', accessor: 'shift_type' },
    { id: 'start_time', headerKey: 'shift.startTime', accessor: 'start_time' },
    { id: 'end_time', headerKey: 'shift.endTime', accessor: 'end_time' },
    { id: 'grace_minutes', headerKey: 'shift.gracePeriod', accessor: 'grace_minutes', hideOnMobile: true },
    { id: 'cross_midnight', headerKey: 'shift.crossMidnight', accessor: 'cross_midnight', cell: (value) => activeCell(value, t) },
    { id: 'is_active', headerKey: 'common.status', accessor: 'is_active', cell: (value) => activeCell(value, t) }
  ];
  const fields: FormFieldConfig[] = [
    { name: 'code', labelKey: 'common.code', type: 'text', required: true, max: 32 },
    { name: 'name', labelKey: 'common.name', type: 'text', required: true, max: 120 },
    { name: 'shift_type', labelKey: 'shift.type', type: 'select', required: true, options: [
      { value: 'fixed', labelKey: 'shift.fixed' }, { value: 'rotating', labelKey: 'shift.rotating' }, { value: 'night', labelKey: 'shift.night' }, { value: 'off', labelKey: 'shift.off' }
    ] },
    { name: 'start_time', labelKey: 'shift.startTime', type: 'time', required: true },
    { name: 'end_time', labelKey: 'shift.endTime', type: 'time', required: true },
    { name: 'break_minutes', labelKey: 'shift.breakMinutes', type: 'number', min: 0, max: 720, defaultValue: 60 },
    { name: 'grace_minutes', labelKey: 'shift.gracePeriod', type: 'number', min: 0, max: 240, defaultValue: 0 },
    { name: 'late_tolerance_minutes', labelKey: 'shift.lateTolerance', type: 'number', min: 0, max: 240, defaultValue: 0 },
    { name: 'early_leave_tolerance_minutes', labelKey: 'shift.earlyTolerance', type: 'number', min: 0, max: 240, defaultValue: 0 },
    { name: 'overtime_after_minutes', labelKey: 'shift.overtimeAfter', type: 'number', min: 0, max: 720, defaultValue: 0 },
    { name: 'cross_midnight', labelKey: 'shift.crossMidnight', type: 'switch' },
    { name: 'is_active', labelKey: 'common.active', type: 'switch', defaultValue: true }
  ];
  const filters: FilterDefinition[] = [
    { id: 'shift_type', labelKey: 'shift.type', type: 'select', options: [{ value: 'fixed', labelKey: 'shift.fixed' }, { value: 'rotating', labelKey: 'shift.rotating' }, { value: 'night', labelKey: 'shift.night' }, { value: 'off', labelKey: 'shift.off' }] },
    ...activeFilter
  ];
  return <CrudEntityPage<Shift> titleKey="shift.title" filename="shifts" permissionPrefix="shifts" repository={{ table: 'shifts', searchFields: ['code', 'name'], softDelete: true, defaultSort: { column: 'name', ascending: true }, upsertConflict: 'organization_id,code' }} columns={columns} filters={filters} fields={fields} />;
}


export function HolidaysPage() {
  const { locale, t } = useLocale();
  const columns: DataColumn<Holiday>[] = [
    { id: 'holiday_date', headerKey: 'common.date', accessor: 'holiday_date', cell: (value) => formatDate(String(value), locale) },
    { id: 'name', headerKey: 'common.name', accessor: 'name' },
    { id: 'is_paid', headerKey: 'holiday.paid', accessor: 'is_paid', cell: (value) => <Badge variant={value ? 'success' : 'secondary'}>{value ? t('common.yes') : t('common.no')}</Badge> }
  ];
  const fields: FormFieldConfig[] = [
    { name: 'holiday_date', labelKey: 'common.date', type: 'date', required: true },
    { name: 'name', labelKey: 'common.name', type: 'text', required: true, max: 160 },
    { name: 'is_paid', labelKey: 'holiday.paid', type: 'switch', defaultValue: true }
  ];
  const filters: FilterDefinition[] = [
    { id: 'holiday_date', labelKey: 'common.date', type: 'date-range' },
    { id: 'is_paid', labelKey: 'holiday.paid', type: 'boolean' }
  ];
  return <CrudEntityPage<Holiday>
    titleKey="menu.holidays"
    descriptionKey="settings.holidaysDescription"
    filename="holidays"
    permissionPrefix="settings"
    repository={{ table: 'holidays', searchFields: ['name'], defaultSort: { column: 'holiday_date', ascending: false }, upsertConflict: 'organization_id,holiday_date' }}
    columns={columns}
    filters={filters}
    fields={fields}
    initialSorting={[{ id: 'holiday_date', desc: true }]}
  />;
}
