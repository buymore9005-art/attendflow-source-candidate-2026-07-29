import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { SortingState } from '@tanstack/react-table';

export interface PageQuery {
  pageIndex: number;
  pageSize: number;
  search: string;
  sorting: SortingState;
  filters: Record<string, string | number | boolean | null>;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
}

export type FilterType = 'text' | 'select' | 'date' | 'date-range' | 'boolean' | 'number';

export interface FilterDefinition {
  id: string;
  labelKey: string;
  type: FilterType;
  options?: Array<{ value: string; labelKey: string }>;
}

export interface DataColumn<T> {
  id: string;
  headerKey: string;
  accessor: keyof T | ((row: T) => unknown);
  sortable?: boolean;
  hideOnMobile?: boolean;
  className?: string;
  cell?: (value: unknown, row: T) => ReactNode;
  exportValue?: (row: T) => unknown;
}

export interface DataPageActions<T> {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  onCreate?: () => void;
  onEdit?: (row: T) => void;
  onView?: (row: T) => void;
  onDelete?: (ids: string[]) => Promise<void>;
  onBulkUpdate?: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onImport?: (records: Record<string, unknown>[]) => Promise<void>;
  bulkUpdatePresets?: Array<{ labelKey: string; patch: Record<string, unknown> }>;
  rowActions?: Array<{ labelKey: string; icon?: LucideIcon; destructive?: boolean; isVisible?: (row: T) => boolean; onSelect: (row: T) => void | Promise<void> }>;
}

