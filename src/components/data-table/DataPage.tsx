import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { RowSelectionState, SortingState, Updater } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { useDebounce } from '@/hooks/use-debounce';
import { asErrorMessage, stableJson } from '@/lib/utils';
import { logOrganizationActivity } from '@/services/audit-service';
import { exportCsv, exportExcel, exportPdf, printRows, type ExportColumn } from '@/services/export-service';
import { parseExcel } from '@/services/import-service';
import type { DataColumn, DataPageActions, FilterDefinition, PageQuery, PageResult } from '@/types/data-table';
import { AdvancedFilters } from './AdvancedFilters';
import { DataTable } from './DataTable';
import { DataToolbar } from './DataToolbar';
import { EmptyState, ErrorState, TableSkeleton } from './DataStates';

export interface DataPageProps<T extends { id: string }> {
  titleKey: string;
  descriptionKey?: string;
  filename: string;
  queryKey: readonly unknown[];
  columns: DataColumn<T>[];
  filters?: FilterDefinition[];
  loader: (query: PageQuery) => Promise<PageResult<T>>;
  loadAll: (query: Omit<PageQuery, 'pageIndex' | 'pageSize'>) => Promise<T[]>;
  actions?: DataPageActions<T>;
  initialSorting?: SortingState;
  initialFilters?: Record<string, string | number | boolean | null>;
  headerContent?: ReactNode;
  emptyContent?: ReactNode;
}

function applyUpdater<T>(updater: Updater<T>, current: T): T {
  return typeof updater === 'function' ? (updater as (previous: T) => T)(current) : updater;
}

export function DataPage<T extends { id: string }>({ titleKey, descriptionKey, filename, queryKey, columns, filters = [], loader, loadAll, actions, initialSorting = [], initialFilters = {}, headerContent, emptyContent }: DataPageProps<T>) {
  const { t } = useLocale();
  const { activeMembership } = useAuth();
  const organizationId = activeMembership?.organization_id ?? '';
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [filterValues, setFilterValues] = useState<Record<string, string | number | boolean | null>>(initialFilters);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const params = useMemo<PageQuery>(() => ({ pageIndex, pageSize, search: debouncedSearch, sorting, filters: filterValues }), [debouncedSearch, filterValues, pageIndex, pageSize, sorting]);
  const query = useQuery({ queryKey: [...queryKey, pageIndex, pageSize, debouncedSearch, stableJson(sorting), stableJson(filterValues)], queryFn: () => loader(params), placeholderData: keepPreviousData });
  const selectedIds = Object.entries(selection).filter(([, selected]) => selected).map(([id]) => id);
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const exportColumns = useMemo<ExportColumn<T>[]>(() => columns.map((column) => ({ key: column.id, label: t(column.headerKey), value: (row) => column.exportValue ? column.exportValue(row) : typeof column.accessor === 'function' ? column.accessor(row) : row[column.accessor] })), [columns, t]);
  const loadExportRows = () => loadAll({ search: debouncedSearch, sorting, filters: filterValues });
  const runExport = async (kind: 'csv' | 'excel' | 'pdf' | 'print') => {
    setBusy(true);
    try {
      const rows = await loadExportRows();
      if (organizationId) await logOrganizationActivity(organizationId, 'export', kind, filename, null, { row_count: rows.length });
      if (kind === 'csv') exportCsv(rows, exportColumns, filename);
      else if (kind === 'excel') await exportExcel(rows, exportColumns, filename);
      else if (kind === 'pdf') await exportPdf(rows, exportColumns, filename, t(titleKey));
      else printRows(rows, exportColumns, t(titleKey));
      toast.success(t('notification.exported'));
    } catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); }
    finally { setBusy(false); }
  };
  const reset = () => { setSearch(''); setFilterValues(initialFilters); setSorting(initialSorting); setPageIndex(0); setSelection({}); };
  const executeDelete = async () => {
    if (!actions?.onDelete || deleteIds.length === 0) return;
    setBusy(true);
    try { await actions.onDelete(deleteIds); if (organizationId) await logOrganizationActivity(organizationId, 'bulk_action', 'delete', filename, null, { record_count: deleteIds.length }); setSelection({}); setDeleteIds([]); await query.refetch(); toast.success(t('notification.deleted')); }
    catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); }
    finally { setBusy(false); }
  };
  const executeBulkUpdate = async (patch: Record<string, unknown>) => {
    if (!actions?.onBulkUpdate || selectedIds.length === 0) return;
    setBusy(true);
    try { await actions.onBulkUpdate(selectedIds, patch); if (organizationId) await logOrganizationActivity(organizationId, 'bulk_action', 'update', filename, null, { record_count: selectedIds.length, fields: Object.keys(patch) }); setSelection({}); await query.refetch(); toast.success(t('notification.updated')); }
    catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); }
    finally { setBusy(false); }
  };
  const executeImport = async (file: File) => {
    if (!actions?.onImport) return;
    setBusy(true);
    try { const rows = await parseExcel(file); await actions.onImport(rows); if (organizationId) await logOrganizationActivity(organizationId, 'import', 'excel', filename, null, { row_count: rows.length, file_name: file.name, file_size: file.size }); await query.refetch(); toast.success(t('notification.imported', { count: rows.length })); }
    catch (error) { toast.error(t('common.error'), { description: asErrorMessage(error, t) }); }
    finally { setBusy(false); }
  };
  const tableActions: DataPageActions<T> = { ...actions, onDelete: actions?.onDelete ? async (ids) => { setDeleteIds(ids); } : undefined };
  const updateSorting = (updater: Updater<SortingState>) => { setSorting((current) => applyUpdater(updater, current)); setPageIndex(0); };
  const updateSelection = (updater: Updater<RowSelectionState>) => setSelection((current) => applyUpdater(updater, current));

  return <div className="space-y-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t(titleKey)}</h1>{descriptionKey && <p className="mt-1 text-sm text-muted-foreground">{t(descriptionKey)}</p>}</div>{headerContent}</div><Card><CardHeader className="pb-4"><DataToolbar search={search} onSearchChange={(value) => { setSearch(value); setPageIndex(0); }} selectedCount={selectedIds.length} hasFilters={Object.values(filterValues).some((value) => value !== null && value !== '')} onFilter={() => setFilterOpen(true)} onReset={reset} onRefresh={() => void query.refetch()} onImport={actions?.onImport ? (file) => void executeImport(file) : undefined} onExportCsv={() => void runExport('csv')} onExportExcel={() => void runExport('excel')} onExportPdf={() => void runExport('pdf')} onPrint={() => void runExport('print')} onCreate={actions?.canCreate !== false ? actions?.onCreate : undefined} onBulkDelete={actions?.onDelete && actions.canDelete !== false ? () => setDeleteIds(selectedIds) : undefined} bulkUpdatePresets={actions?.bulkUpdatePresets} onBulkUpdate={(patch) => void executeBulkUpdate(patch)} refreshing={query.isFetching} busy={busy} /></CardHeader><CardContent className="space-y-4 px-0 pb-4 sm:px-5">
    {query.isPending ? <TableSkeleton columns={Math.min(columns.length + 2, 8)} /> : query.isError ? <ErrorState message={asErrorMessage(query.error, t)} onRetry={() => void query.refetch()} /> : (query.data?.rows.length ?? 0) === 0 ? (emptyContent ?? <EmptyState />) : <div className="relative">{query.isFetching && <div className="absolute right-3 top-3 z-10 rounded-full bg-background p-1 shadow"><LoaderCircle className="size-4 animate-spin" /></div>}<DataTable data={query.data?.rows ?? []} columns={columns} sorting={sorting} onSortingChange={updateSorting} selection={selection} onSelectionChange={updateSelection} actions={tableActions} /></div>}
    <div className="flex flex-col gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-0"><span>{t('common.total')}: {total.toLocaleString()}</span><div className="flex items-center gap-2"><Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPageIndex(0); }}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{[10, 20, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent></Select><span className="hidden sm:inline">{t('common.pageOf', { page: pageIndex + 1, pages: pageCount })}</span><Button variant="outline" size="icon-sm" disabled={pageIndex === 0} onClick={() => setPageIndex((value) => Math.max(0, value - 1))}><ChevronLeft /></Button><Button variant="outline" size="icon-sm" disabled={pageIndex + 1 >= pageCount} onClick={() => setPageIndex((value) => value + 1)}><ChevronRight /></Button></div></div>
  </CardContent></Card><AdvancedFilters open={filterOpen} onOpenChange={setFilterOpen} definitions={filters} values={filterValues} onApply={(values) => { setFilterValues(values); setPageIndex(0); }} onReset={reset} />
  <AlertDialog open={deleteIds.length > 0} onOpenChange={(open) => { if (!open) setDeleteIds([]); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{deleteIds.length > 1 ? t('confirm.bulkDeleteTitle', { count: deleteIds.length }) : t('confirm.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{t('confirm.deleteDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => void executeDelete()}>{t('common.delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}
