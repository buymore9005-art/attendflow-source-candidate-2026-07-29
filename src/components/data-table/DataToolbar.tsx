import { Download, FileDown, FileSpreadsheet, FileText, Filter, Plus, Printer, RefreshCw, RotateCcw, Search, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/context/LocaleContext';

export function DataToolbar({
  search, onSearchChange, selectedCount, hasFilters, onFilter, onReset, onRefresh, onImport, onExportCsv, onExportExcel,
  onExportPdf, onPrint, onCreate, onBulkDelete, bulkUpdatePresets, onBulkUpdate, refreshing, busy
}: {
  search: string;
  onSearchChange: (value: string) => void;
  selectedCount: number;
  hasFilters: boolean;
  onFilter: () => void;
  onReset: () => void;
  onRefresh: () => void;
  onImport?: (file: File) => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onPrint: () => void;
  onCreate?: () => void;
  onBulkDelete?: () => void;
  bulkUpdatePresets?: Array<{ labelKey: string; patch: Record<string, unknown> }>;
  onBulkUpdate?: (patch: Record<string, unknown>) => void;
  refreshing?: boolean;
  busy?: boolean;
}) {
  const { t } = useLocale();
  const fileInput = useRef<HTMLInputElement>(null);
  return <div className="space-y-3">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
      <div className="relative w-full xl:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="global-search" value={search} onChange={(event) => onSearchChange(event.target.value)} className="pl-9" placeholder={t('common.searchPlaceholder')} /></div>
      <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
        <Button variant={hasFilters ? 'secondary' : 'outline'} size="sm" onClick={onFilter}><Filter />{t('common.advancedFilter')}</Button>
        <Button variant="outline" size="sm" onClick={onReset} disabled={!search && !hasFilters}><RotateCcw />{t('common.resetFilter')}</Button>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}><RefreshCw className={refreshing ? 'animate-spin' : ''} />{t('common.refresh')}</Button>
        {onImport && <><input ref={fileInput} className="hidden" type="file" accept=".xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = ''; }} /><Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={busy}><Upload />{t('common.importExcel')}</Button></>}
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={busy}><Download />{t('common.download')}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={onExportExcel}><FileSpreadsheet />{t('common.exportExcel')}</DropdownMenuItem><DropdownMenuItem onSelect={onExportCsv}><FileDown />{t('common.exportCsv')}</DropdownMenuItem><DropdownMenuItem onSelect={onExportPdf}><FileText />{t('common.exportPdf')}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={onPrint}><Printer />{t('common.print')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        {onCreate && <Button size="sm" onClick={onCreate}><Plus />{t('common.add')}</Button>}
      </div>
    </div>
    {selectedCount > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent/50 p-2 text-sm"><span className="px-2 font-medium">{t('common.selected', { count: selectedCount })}</span>{bulkUpdatePresets && bulkUpdatePresets.length > 0 && onBulkUpdate && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><FileSpreadsheet />{t('common.bulkUpdate')}</Button></DropdownMenuTrigger><DropdownMenuContent>{bulkUpdatePresets.map((preset) => <DropdownMenuItem key={preset.labelKey} onSelect={() => onBulkUpdate(preset.patch)}>{t(preset.labelKey)}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}{onBulkDelete && <Button variant="destructive" size="sm" onClick={onBulkDelete}><Trash2 />{t('common.bulkDelete')}</Button>}</div>}
  </div>;
}
