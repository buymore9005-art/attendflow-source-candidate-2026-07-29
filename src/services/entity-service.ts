import { getSupabase } from '@/lib/supabase';
import type { PageQuery, PageResult } from '@/types/data-table';
import { normalizeSearch } from '@/utils/sanitize';

export interface EntityRepositoryConfig {
  table: string;
  select?: string;
  searchFields?: string[];
  organizationColumn?: string;
  softDelete?: boolean;
  defaultSort?: { column: string; ascending: boolean };
  upsertConflict?: string;
}

function applyFilters(query: any, filters: PageQuery['filters']) {
  let next = query;
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === '' || value === undefined) continue;
    if (key.endsWith('__from')) next = next.gte(key.slice(0, -6), value);
    else if (key.endsWith('__to')) next = next.lte(key.slice(0, -4), value);
    else if (key.endsWith('__in') && typeof value === 'string') next = next.in(key.slice(0, -4), value.split(',').filter(Boolean));
    else next = next.eq(key, value);
  }
  return next;
}

export async function listEntities<T>(
  config: EntityRepositoryConfig,
  organizationId: string,
  params: PageQuery
): Promise<PageResult<T>> {
  const client = getSupabase();
  const organizationColumn = config.organizationColumn ?? 'organization_id';
  let query = client.from(config.table).select((config.select ?? '*') as any, { count: 'exact' }).eq(organizationColumn, organizationId);
  if (config.softDelete) query = query.is('deleted_at', null);
  const search = normalizeSearch(params.search);
  if (search && config.searchFields?.length) query = query.or(config.searchFields.map((field) => `${field}.ilike.%${search}%`).join(','));
  query = applyFilters(query, params.filters);
  const sorting = params.sorting[0];
  const sortColumn = sorting?.id ?? config.defaultSort?.column ?? 'created_at';
  const ascending = sorting ? !sorting.desc : (config.defaultSort?.ascending ?? false);
  const start = params.pageIndex * params.pageSize;
  const end = start + params.pageSize - 1;
  const { data, error, count } = await query.order(sortColumn, { ascending }).range(start, end);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as T[], total: count ?? 0 };
}

export async function listAllEntities<T>(
  config: EntityRepositoryConfig,
  organizationId: string,
  params: Omit<PageQuery, 'pageIndex' | 'pageSize'>
): Promise<T[]> {
  const output: T[] = [];
  const pageSize = 1_000;
  for (let pageIndex = 0; pageIndex < 50; pageIndex += 1) {
    const page = await listEntities<T>(config, organizationId, { ...params, pageIndex, pageSize });
    output.push(...page.rows);
    if (output.length >= page.total || page.rows.length < pageSize) break;
  }
  return output;
}

export async function createEntity<T extends Record<string, unknown>>(
  config: EntityRepositoryConfig,
  organizationId: string,
  values: T
): Promise<Record<string, unknown>> {
  const organizationColumn = config.organizationColumn ?? 'organization_id';
  // PERBAIKAN: Menambahkan 'as any' pada payload insert untuk melewati pengecekan RejectExcessProperties
  const payload = { ...values, [organizationColumn]: organizationId } as any;
  const { data, error } = await getSupabase().from(config.table).insert(payload).select().single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function updateEntity<T extends Record<string, unknown>>(
  config: EntityRepositoryConfig,
  organizationId: string,
  id: string,
  values: T
): Promise<Record<string, unknown>> {
  const organizationColumn = config.organizationColumn ?? 'organization_id';
  // PERBAIKAN: Menambahkan 'as any' pada payload update untuk melewati pengecekan RejectExcessProperties
  const { data, error } = await getSupabase().from(config.table).update(values as any).eq('id', id).eq(organizationColumn, organizationId).select().single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function deleteEntities(config: EntityRepositoryConfig, organizationId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const organizationColumn = config.organizationColumn ?? 'organization_id';
  const query = config.softDelete
    ? getSupabase().from(config.table).update({ deleted_at: new Date().toISOString() } as any).eq(organizationColumn, organizationId).in('id', ids)
    : getSupabase().from(config.table).delete().eq(organizationColumn, organizationId).in('id', ids);
  const { error } = await query;
  if (error) throw error;
}

export async function bulkUpdateEntities(config: EntityRepositoryConfig, organizationId: string, ids: string[], patch: Record<string, unknown>): Promise<void> {
  if (ids.length === 0) return;
  const organizationColumn = config.organizationColumn ?? 'organization_id';
  const { error } = await getSupabase().from(config.table).update(patch as any).eq(organizationColumn, organizationId).in('id', ids);
  if (error) throw error;
}

export async function importEntities(config: EntityRepositoryConfig, organizationId: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const organizationColumn = config.organizationColumn ?? 'organization_id';
  const payload = rows.map((row) => ({ ...row, [organizationColumn]: organizationId })) as any;
  const request = config.upsertConflict
    ? getSupabase().from(config.table).upsert(payload, { onConflict: config.upsertConflict, ignoreDuplicates: false })
    : getSupabase().from(config.table).insert(payload);
  const { error } = await request;
  if (error) throw error;
}

export async function getLookupOptions(table: string, organizationId: string, labelColumn = 'name'): Promise<Array<{ value: string; label: string }>> {
  const { data, error } = await getSupabase().from(table).select(`id,${labelColumn}` as any).eq('organization_id', organizationId).is('deleted_at', null).order(labelColumn);
  if (error) throw error;
  // PERBAIKAN: Menggunakan 'as unknown as Record<string, unknown>' untuk memotong tipe GenericStringError dari Supabase
  return (data ?? []).map((row) => ({ 
    value: String((row as unknown as Record<string, unknown>).id), 
    label: String((row as unknown as Record<string, unknown>)[labelColumn]) 
  }));
}
