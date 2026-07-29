import { useVirtualizer } from '@tanstack/react-virtual';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState, type SortingState, type Updater } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLocale } from '@/context/LocaleContext';
import { cn } from '@/lib/utils';
import type { DataColumn, DataPageActions } from '@/types/data-table';

function readValue<T>(row: T, accessor: DataColumn<T>['accessor']): unknown {
  return typeof accessor === 'function' ? accessor(row) : row[accessor];
}

export function DataTable<T extends { id: string }>({ data, columns, sorting, onSortingChange, selection, onSelectionChange, actions }: {
  data: T[];
  columns: DataColumn<T>[];
  sorting: SortingState;
  onSortingChange: (updater: Updater<SortingState>) => void;
  selection: RowSelectionState;
  onSelectionChange: (updater: Updater<RowSelectionState>) => void;
  actions?: DataPageActions<T>;
}) {
  const { t } = useLocale();
  const parentRef = useRef<HTMLDivElement>(null);
  const tableColumns = useMemo<ColumnDef<T>[]>(() => {
    const selectionColumn: ColumnDef<T> = {
      id: '__select', size: 48, enableSorting: false,
      header: ({ table }) => <Checkbox aria-label={t('common.selectAll')} checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false} onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))} />,
      cell: ({ row }) => <Checkbox aria-label={t('common.selectOne')} checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(Boolean(value))} />
    };
    const mapped = columns.map<ColumnDef<T>>((column) => ({
      id: column.id,
      accessorFn: (row) => readValue(row, column.accessor),
      size: 170,
      enableSorting: column.sortable ?? true,
      header: ({ column: tanstackColumn }) => <Button variant="ghost" size="sm" className="-ml-3" onClick={() => tanstackColumn.toggleSorting(tanstackColumn.getIsSorted() === 'asc')} disabled={!tanstackColumn.getCanSort()}>{t(column.headerKey)}{tanstackColumn.getIsSorted() === 'asc' ? <ArrowUp /> : tanstackColumn.getIsSorted() === 'desc' ? <ArrowDown /> : tanstackColumn.getCanSort() ? <ChevronsUpDown className="opacity-50" /> : null}</Button>,
      cell: ({ getValue, row }) => column.cell ? column.cell(getValue(), row.original) : <span className="block truncate" title={String(getValue() ?? '')}>{String(getValue() ?? '—')}</span>,
      meta: { className: cn(column.hideOnMobile && 'hidden md:flex', column.className) }
    }));
    const actionColumn: ColumnDef<T> = {
      id: '__actions', size: 64, enableSorting: false,
      header: () => <span className="sr-only">{t('common.actions')}</span>,
      cell: ({ row }) => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal /><span className="sr-only">{t('common.openMenu')}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{actions?.onView && <DropdownMenuItem onSelect={() => actions.onView?.(row.original)}><Eye />{t('common.view')}</DropdownMenuItem>}{actions?.rowActions?.filter((action) => action.isVisible?.(row.original) ?? true).map((action) => { const Icon = action.icon; return <DropdownMenuItem key={action.labelKey} className={action.destructive ? 'text-destructive' : undefined} onSelect={() => void action.onSelect(row.original)}>{Icon && <Icon />}{t(action.labelKey)}</DropdownMenuItem>; })}{actions?.onEdit && actions.canUpdate !== false && <DropdownMenuItem onSelect={() => actions.onEdit?.(row.original)}><Pencil />{t('common.edit')}</DropdownMenuItem>}{actions?.onDelete && actions.canDelete !== false && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => void actions.onDelete?.([row.original.id])}><Trash2 />{t('common.delete')}</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>
    };
    return [selectionColumn, ...mapped, actionColumn];
  }, [actions, columns, t]);
  const table = useReactTable({ data, columns: tableColumns, state: { sorting, rowSelection: selection }, onSortingChange, onRowSelectionChange: onSelectionChange, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.id, manualSorting: true, enableRowSelection: true });
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 49, overscan: 10 });
  const leafColumns = table.getVisibleLeafColumns();
  const template = leafColumns.map((column) => `${column.getSize()}px`).join(' ');
  return <div className="overflow-hidden rounded-xl border"><div className="overflow-x-auto"><div style={{ minWidth: table.getTotalSize() }} role="table" aria-rowcount={rows.length + 1}>
    <div className="grid min-h-11 border-b bg-muted/60 text-xs font-semibold text-muted-foreground" style={{ gridTemplateColumns: template }} role="row">{table.getHeaderGroups()[0]?.headers.map((header) => <div key={header.id} className={cn('flex items-center px-3', (header.column.columnDef.meta as { className?: string } | undefined)?.className)} role="columnheader">{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</div>)}</div>
    <div ref={parentRef} className="relative max-h-[62vh] min-h-24 overflow-auto" style={{ height: Math.min(Math.max(49 * rows.length, 96), window.innerHeight * 0.62) }}>
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>{virtualizer.getVirtualItems().map((virtualRow) => { const row = rows[virtualRow.index]; if (!row) return null; return <div key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined} className="absolute left-0 top-0 grid w-full border-b text-sm hover:bg-muted/40 data-[state=selected]:bg-accent/70" style={{ gridTemplateColumns: template, transform: `translateY(${virtualRow.start}px)`, height: virtualRow.size }} role="row">{row.getVisibleCells().map((cell) => <div key={cell.id} className={cn('flex min-w-0 items-center px-3', (cell.column.columnDef.meta as { className?: string } | undefined)?.className)} role="cell">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>)}</div>; })}</div>
    </div>
  </div></div></div>;
}
