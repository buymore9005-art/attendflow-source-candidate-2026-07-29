import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { CrudEntityPage } from '@/pages/common/CrudEntityPage';
import { useAuth } from '@/context/AuthContext';
import { getLookupOptions } from '@/services/entity-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { PayrollProfile } from '@/types/domain';
import type { FormFieldConfig } from '@/types/forms';
import { useLocale } from '@/context/LocaleContext';
import { formatCurrency, formatDate } from '@/utils/format';

export default function PayrollSettingsPage() {
  const { locale, t } = useLocale(); const { activeMembership } = useAuth(); const organizationId = activeMembership?.organization_id ?? '';
  const employees = useQuery({ queryKey: ['payroll-employees', organizationId], enabled: Boolean(organizationId), queryFn: () => getLookupOptions('employees', organizationId, 'full_name') });
  const columns = useMemo<DataColumn<PayrollProfile>[]>(() => [
    { id: 'employee_id', headerKey: 'employee.fullName', accessor: (row) => row.employee?.full_name ?? row.employee_id, exportValue: (row) => row.employee?.full_name ?? row.employee_id },
    { id: 'base_type', headerKey: 'payroll.frequency', accessor: 'base_type', cell: (value) => <Badge variant="outline">{t(`payroll.${String(value)}`)}</Badge> },
    { id: 'daily_salary', headerKey: 'payroll.dailySalary', accessor: 'daily_salary', cell: (value) => formatCurrency(Number(value), locale) },
    { id: 'weekly_salary', headerKey: 'payroll.weeklySalary', accessor: 'weekly_salary', hideOnMobile: true, cell: (value) => formatCurrency(Number(value), locale) },
    { id: 'monthly_salary', headerKey: 'payroll.monthlySalary', accessor: 'monthly_salary', cell: (value) => formatCurrency(Number(value), locale) },
    { id: 'overtime_hourly_rate', headerKey: 'payroll.overtimeRate', accessor: 'overtime_hourly_rate', hideOnMobile: true, cell: (value) => formatCurrency(Number(value), locale) },
    { id: 'tax_percent', headerKey: 'payroll.tax', accessor: 'tax_percent', hideOnMobile: true, cell: (value) => `${Number(value)}%` },
    { id: 'effective_from', headerKey: 'common.from', accessor: 'effective_from', hideOnMobile: true, cell: (value) => formatDate(String(value), locale) }
  ], [locale, t]);
  const fields = useMemo<FormFieldConfig[]>(() => [
    { name: 'employee_id', labelKey: 'employee.fullName', type: 'select', required: true, options: employees.data?.map((item) => ({ value: item.value, label: item.label })) ?? [] },
    { name: 'base_type', labelKey: 'payroll.frequency', type: 'select', required: true, options: [{ value: 'daily', labelKey: 'payroll.daily' }, { value: 'weekly', labelKey: 'payroll.weekly' }, { value: 'monthly', labelKey: 'payroll.monthly' }] },
    { name: 'daily_salary', labelKey: 'payroll.dailySalary', type: 'number', min: 0, step: 1, defaultValue: 0 },
    { name: 'weekly_salary', labelKey: 'payroll.weeklySalary', type: 'number', min: 0, step: 1, defaultValue: 0 },
    { name: 'monthly_salary', labelKey: 'payroll.monthlySalary', type: 'number', min: 0, step: 1, defaultValue: 0 },
    { name: 'overtime_hourly_rate', labelKey: 'payroll.overtimeRate', type: 'number', min: 0, step: 1, defaultValue: 0 },
    { name: 'late_deduction_per_minute', labelKey: 'payroll.lateDeduction', type: 'number', min: 0, step: 1, defaultValue: 0 },
    { name: 'absence_deduction_per_day', labelKey: 'payroll.absentDeduction', type: 'number', min: 0, step: 1, defaultValue: 0 },
    { name: 'early_deduction_per_minute', labelKey: 'payroll.earlyDeduction', type: 'number', min: 0, step: 1, defaultValue: 0 },
    { name: 'default_bonus', labelKey: 'payroll.bonus', type: 'number', min: 0, step: 1, defaultValue: 0 },
    { name: 'tax_percent', labelKey: 'payroll.tax', type: 'number', min: 0, max: 100, step: 0.01, defaultValue: 0 },
    { name: 'bpjs_employee_percent', labelKey: 'payroll.bpjs', type: 'number', min: 0, max: 100, step: 0.01, defaultValue: 0 },
    { name: 'work_days_per_month', labelKey: 'payroll.workDays', type: 'number', min: 1, max: 31, defaultValue: 22 },
    { name: 'effective_from', labelKey: 'common.from', type: 'date', required: true },
    { name: 'effective_to', labelKey: 'common.to', type: 'date' }
  ], [employees.data]);
  const filters: FilterDefinition[] = [{ id: 'base_type', labelKey: 'payroll.frequency', type: 'select', options: [{ value: 'daily', labelKey: 'payroll.daily' }, { value: 'weekly', labelKey: 'payroll.weekly' }, { value: 'monthly', labelKey: 'payroll.monthly' }] }, { id: 'effective_from', labelKey: 'common.from', type: 'date-range' }];
  return <CrudEntityPage<PayrollProfile> titleKey="menu.payrollSettings" filename="payroll-profiles" permissionPrefix="payroll" repository={{ table: 'payroll_profiles', select: '*,employee:employees(employee_no,full_name)', searchFields: [], defaultSort: { column: 'effective_from', ascending: false }, upsertConflict: 'organization_id,employee_id,effective_from' }} columns={columns} filters={filters} fields={fields} />;
}
