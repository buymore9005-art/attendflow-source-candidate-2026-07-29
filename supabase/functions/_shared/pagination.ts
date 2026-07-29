export interface PaginationOptions {
  pageSize?: number;
  maxRows?: number;
}

export interface PaginationWalkResult {
  rows: number;
  pages: number;
}

export interface CursorPage<T, Cursor> {
  rows: readonly T[];
  nextCursor: Cursor;
}

export interface CursorPaginationOptions {
  maxPages?: number;
  maxRows?: number;
}

export interface CursorPaginationResult<Cursor> extends PaginationWalkResult {
  nextCursor: Cursor;
  complete: boolean;
}

function positiveInteger(value: number, name: string, maximum?: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || (maximum !== undefined && value > maximum)) {
    const range = maximum === undefined ? 'a positive safe integer' : `an integer between 1 and ${maximum}`;
    throw new Error(`${name} must be ${range}.`);
  }
  return value;
}

function paginationLimits(options: PaginationOptions): Required<PaginationOptions> {
  return {
    pageSize: positiveInteger(options.pageSize ?? 500, 'pageSize', 10_000),
    maxRows: positiveInteger(options.maxRows ?? 100_000, 'maxRows'),
  };
}

export async function collectPaginatedRows<T>(
  fetchPage: (from: number, to: number) => Promise<readonly T[]>,
  options: PaginationOptions = {},
): Promise<T[]> {
  const result: T[] = [];
  await walkPaginatedRows(fetchPage, async (page) => {
    result.push(...page);
  }, options);
  return result;
}

export async function walkPaginatedRows<T>(
  fetchPage: (from: number, to: number) => Promise<readonly T[]>,
  processPage: (page: readonly T[]) => Promise<void> | void,
  options: PaginationOptions = {},
): Promise<PaginationWalkResult> {
  const { pageSize, maxRows } = paginationLimits(options);
  let rows = 0;
  let pages = 0;

  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (page.length > pageSize) throw new Error(`Page fetch returned ${page.length} rows for a page size of ${pageSize}.`);
    if (rows + page.length > maxRows) throw new Error(`Data exceeds the configured limit of ${maxRows} rows.`);
    if (page.length > 0) {
      await processPage(page);
      rows += page.length;
      pages += 1;
    }
    if (page.length < pageSize) return { rows, pages };
  }
}

export async function drainCursorPages<T, Cursor>(
  initialCursor: Cursor,
  fetchPage: (cursor: Cursor) => Promise<CursorPage<T, Cursor>>,
  processPage: (rows: readonly T[], nextCursor: Cursor) => Promise<void> | void,
  options: CursorPaginationOptions = {},
): Promise<CursorPaginationResult<Cursor>> {
  const maxPages = positiveInteger(options.maxPages ?? 4, 'maxPages', 1_000);
  const maxRows = positiveInteger(options.maxRows ?? 2_000, 'maxRows');
  let cursor = initialCursor;
  let rows = 0;
  let pages = 0;

  while (pages < maxPages) {
    const page = await fetchPage(cursor);
    if (rows + page.rows.length > maxRows) throw new Error(`Data exceeds the configured limit of ${maxRows} rows.`);
    if (page.rows.length === 0) return { rows, pages, nextCursor: cursor, complete: true };
    if (Object.is(page.nextCursor, cursor)) throw new Error('Cursor did not advance for a non-empty page.');

    await processPage(page.rows, page.nextCursor);
    rows += page.rows.length;
    pages += 1;
    cursor = page.nextCursor;
  }

  return { rows, pages, nextCursor: cursor, complete: false };
}
