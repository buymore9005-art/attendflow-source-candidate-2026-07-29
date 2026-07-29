import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileCheck2, Printer, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EntityFormDialog, type EntityFormValues } from '@/components/crud/EntityFormDialog';
import { DataPage } from '@/components/data-table/DataPage';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { asErrorMessage } from '@/lib/utils';
import { deleteEntities, listAllEntities, listEntities, type EntityRepositoryConfig } from '@/services/entity-service';
import { changePayrollRunStatus, downloadPayslipPdf, generatePayrollRun, listPayrollItems, printPayslip } from '@/services/payroll-service';
import type { DataColumn, FilterDefinition } from '@/types/data-table';
import type { PayrollItem, PayrollRun } from '@/types/domain';
import type { FormFieldConfig } from '@/types/forms';
import { formatCurrency, formatDate } from '@/utils/format';

const repository: EntityRepositoryConfig = { table: 'payroll_runs', searchFields: ['run_number', 'notes'], defaultSort: { column: 'period_start', ascending: false } };
function RunStatus({ value }: { value: PayrollRun['status'] }) { const { t } = useLocale(); return <Badge variant={value === 'finalized' || value === 'approved' ? 'success' : value === 'rejected' || value === 'cancelled' ? 'destructive' : 'warning'}>{t(`status.${value}`)}</Badge>; }

export default function PayrollRunsPage() {
  const { t, locale } = useLocale(); const { activeMembership, can } = useAuth(); const organizationId = activeMembership?.organization_id ?? ''; const organizationName = activeMembership?.organization?.name ?? 'AttendFlow';
  const queryClient = useQueryClient(); const queryKey = useMemo(() => ['payroll-runs', organizationId] as const, [organizationId]);
  const [generateOpen, setGenerateOpen] = useState(false); const [viewing, setViewing] = useState<PayrollRun | null>(null); const [saving, setSaving] = useState(false);
  const items = useQuery({ queryKey: ['payroll-items', viewing?.id], queryFn: () => listPayrollItems(String(viewing?.id)), enabled: Boolean(viewing?.id) });
  const columns = useMemo<DataColumn<PayrollRun>[]>(() => [
    { id: 'run_number', headerKey: 'payroll.runNumber', accessor: 'run_number' }, { id: 'period_start', headerKey: 'payroll.periodStart', accessor: 'period_start', cell: (value) => formatDate(String(value), locale) }, { id: 'period_end', headerKey: 'payroll.periodEnd', accessor: 'period_end', cell: (value) => formatDate(String(value), locale) },
    { id: 'frequency', headerKey: 'payroll.frequency', accessor: 'frequency', cell: (value) => t(`payroll.${String(value)}`) }, { id: 'status', headerKey: 'common.status', accessor: 'status', cell: (value) => <RunStatus value={value as PayrollRun['status']} /> },
    { id: 'total_gross', headerKey: 'payroll.gross', accessor: 'total_gross', cell: (value) => formatCurrency(Number(value), locale) }, { id: 'total_deductions', headerKey: 'payroll.deductions', accessor: 'total_deductions', hideOnMobile: true, cell: (value) => formatCurrency(Number(value), locale) }, { id: 'total_net', headerKey: 'payroll.net', accessor: 'total_net', cell: (value) => <strong>{formatCurrency(Number(value), locale)}</strong> }
  ], [locale, t]);
  const filters: FilterDefinition[] = [{ id: 'status', labelKey: 'common.status', type: 'select', options: [{ value: 'draft', labelKey: 'status.draft' }, { value: 'pending', labelKey: 'status.pending' }, { value: 'approved', labelKey: 'status.approved' }, { value: 'finalized', labelKey: 'status.finalized' }, { value: 'rejected', labelKey: 'status.rejected' }] }, { id: 'frequency', labelKey: 'payroll.frequency', type: 'select', options: [{ value: 'daily', labelKey: 'payroll.daily' }, { value: 'weekly', labelKey: 'payroll.weekly' }, { value: 'monthly', labelKey: 'payroll.monthly' }] }, { id: 'period_start', labelKey: 'payroll.periodStart', type: 'date-range' }];
  const fields: FormFieldConfig[] = [{ name: 'period_start', labelKey: 'payroll.periodStart', type: 'date', required: true }, { name: 'period_end', labelKey: 'payroll.periodEnd', type: 'date', required: true }, { name: 'frequency', labelKey: 'payroll.frequency', type: 'select', required: true, options: [{ value: 'daily', labelKey: 'payroll.daily' }, { value: 'weekly', labelKey: 'payroll.weekly' }, { value: 'monthly', labelKey: 'payroll.monthly' }] }, { name: 'notes', labelKey: 'common.notes', type: 'textarea', max: 2000, gridSpan: 2 }];
  const generate = async (values: EntityFormValues) => { setSaving(true); try { await generatePayrollRun({ organizationId, periodStart: String(values.period_start), periodEnd: String(values.period_end), frequency: values.frequency as 'daily' | 'weekly' | 'monthly', notes: values.notes ? String(values.notes) : null }); await queryClient.invalidateQueries({ queryKey }); setGenerateOpen(false); toast.success(t('notification.saved')); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } finally { setSaving(false); } };
  const transition = async (run: PayrollRun, action: 'submit' | 'approve' | 'finalize') => { try { await changePayrollRunStatus(run.id, action); await queryClient.invalidateQueries({ queryKey }); toast.success(t('notification.updated')); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } };
  const labels = { payslip: t('payroll.payslip'), additions: t('payroll.gross'), deductions: t('payroll.deductions'), base: t('payroll.baseSalary'), overtime: t('attendance.overtime'), bonus: t('payroll.bonus'), incentive: t('payroll.incentive'), thr: t('payroll.thr'), otherAddition: t('common.info'), tax: t('payroll.tax'), bpjs: t('payroll.bpjs'), loan: t('payroll.loan'), cashAdvance: t('payroll.cashAdvance'), fine: t('payroll.fine'), late: t('payroll.lateDeduction'), absent: t('payroll.absentDeduction'), early: t('payroll.earlyDeduction'), otherDeduction: t('common.info'), gross: t('payroll.gross'), net: t('payroll.net') };
  const handlePrintPayslip = (item: PayrollItem) => { try { printPayslip(item, organizationName, labels, (value) => formatCurrency(value, locale)); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } };
  const handleDownloadPayslip = async (item: PayrollItem) => { try { await downloadPayslipPdf(item, organizationName, labels, (value) => formatCurrency(value, locale)); } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); } };
  return <><DataPage<PayrollRun> titleKey="payroll.title" filename="payroll-runs" queryKey={queryKey} columns={columns} filters={filters} loader={(query) => listEntities(repository, organizationId, query)} loadAll={(query) => listAllEntities(repository, organizationId, query)} actions={{
    canCreate: can('payroll.create'), canUpdate: can('payroll.approve'), canDelete: can('payroll.delete'), onCreate: () => setGenerateOpen(true), onView: setViewing, onDelete: (ids) => deleteEntities(repository, organizationId, ids),
    rowActions: [
      ...(can('payroll.approve') ? [{ labelKey: 'payroll.approval', icon: Send, onSelect: (row: PayrollRun) => transition(row, 'submit') }, { labelKey: 'payroll.approve', icon: CheckCircle2, onSelect: (row: PayrollRun) => transition(row, 'approve') }] : []),
      ...(can('payroll.finalize') ? [{ labelKey: 'payroll.finalize', icon: FileCheck2, onSelect: (row: PayrollRun) => transition(row, 'finalize') }] : [])
    ]
  }} /><EntityFormDialog open={generateOpen} onOpenChange={setGenerateOpen} titleKey="payroll.generate" fields={fields} saving={saving} onSubmit={generate} />
  <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null); }}><DialogContent className="max-w-6xl"><DialogHeader><DialogTitle>{viewing?.run_number}</DialogTitle><DialogDescription>{viewing ? `${formatDate(viewing.period_start, locale)} – ${formatDate(viewing.period_end, locale)}` : ''}</DialogDescription></DialogHeader><div className="max-h-[65vh] overflow-auto rounded-xl border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr>{['employee.employeeNo', 'employee.fullName', 'payroll.gross', 'payroll.deductions', 'payroll.net', 'common.actions'].map((key) => <th key={key} className="p-3 text-left">{t(key)}</th>)}</tr></thead><tbody>{items.isPending ? <tr><td colSpan={6} className="p-8 text-center">{t('common.loading')}</td></tr> : items.data?.map((item: PayrollItem) => <tr key={item.id} className="border-t"><td className="p-3">{item.employee?.employee_no}</td><td className="p-3">{item.employee?.full_name}</td><td className="p-3">{formatCurrency(item.gross_pay, locale)}</td><td className="p-3">{formatCurrency(item.total_deductions, locale)}</td><td className="p-3 font-semibold">{formatCurrency(item.net_pay, locale)}</td><td className="p-3"><div className="flex gap-1"><Button size="icon-sm" variant="ghost" onClick={() => handlePrintPayslip(item)}><Printer /><span className="sr-only">{t('common.print')}</span></Button><Button size="icon-sm" variant="ghost" onClick={() => void handleDownloadPayslip(item)}><Download /><span className="sr-only">{t('common.download')}</span></Button></div></td></tr>)}</tbody></table></div></DialogContent></Dialog>
  </>;
}
