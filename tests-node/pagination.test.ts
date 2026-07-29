import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPaginatedRows, drainCursorPages, walkPaginatedRows } from '../supabase/functions/_shared/pagination.ts';

test('collects every page using inclusive PostgREST ranges', async () => {
  const rows = Array.from({ length: 1_205 }, (_, id) => ({ id }));
  const ranges: Array<[number, number]> = [];
  const result = await collectPaginatedRows(async (from, to) => {
    ranges.push([from, to]);
    return rows.slice(from, to + 1);
  }, { pageSize: 500, maxRows: 2_000 });

  assert.equal(result.length, rows.length);
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
});

test('stops on an exact final page by requesting one empty page', async () => {
  const rows = Array.from({ length: 1_000 }, (_, id) => ({ id }));
  let calls = 0;
  const result = await collectPaginatedRows(async (from, to) => {
    calls += 1;
    return rows.slice(from, to + 1);
  }, { pageSize: 500, maxRows: 2_000 });

  assert.equal(result.length, 1_000);
  assert.equal(calls, 3);
});

test('rejects a backup that exceeds the explicit row safety ceiling', async () => {
  await assert.rejects(
    collectPaginatedRows(async (from, to) => Array.from({ length: to - from + 1 }, (_, index) => ({ id: from + index })), {
      pageSize: 500,
      maxRows: 750,
    }),
    /exceeds the configured limit of 750 rows/,
  );
});

test('walks all PostgREST pages without retaining the entire dataset', async () => {
  const rows = Array.from({ length: 1_205 }, (_, id) => ({ id }));
  const processed: number[] = [];
  const result = await walkPaginatedRows(async (from, to) => rows.slice(from, to + 1), async (page) => {
    processed.push(...page.map((row) => row.id));
  }, { pageSize: 500, maxRows: 2_000 });

  assert.deepEqual(processed, rows.map((row) => row.id));
  assert.deepEqual(result, { rows: 1_205, pages: 3 });
});

test('cursor pagination follows returned cursor until an empty page', async () => {
  const requested: number[] = [];
  const processed: number[] = [];
  const result = await drainCursorPages(0, async (cursor) => {
    requested.push(cursor);
    if (cursor === 0) return { rows: [1, 2], nextCursor: 7 };
    if (cursor === 7) return { rows: [3], nextCursor: 11 };
    return { rows: [], nextCursor: cursor };
  }, async (rows) => {
    processed.push(...rows);
  }, { maxPages: 5, maxRows: 10 });

  assert.deepEqual(requested, [0, 7, 11]);
  assert.deepEqual(processed, [1, 2, 3]);
  assert.deepEqual(result, { rows: 3, pages: 2, nextCursor: 11, complete: true });
});

test('cursor pagination reports a bounded continuation instead of silently dropping data', async () => {
  const result = await drainCursorPages(0, async (cursor) => ({ rows: [cursor + 1], nextCursor: cursor + 1 }), async () => undefined, {
    maxPages: 3,
    maxRows: 10,
  });

  assert.deepEqual(result, { rows: 3, pages: 3, nextCursor: 3, complete: false });
});

test('cursor pagination rejects a non-advancing cursor with non-empty data', async () => {
  await assert.rejects(
    drainCursorPages(5, async () => ({ rows: [1], nextCursor: 5 }), async () => undefined),
    /cursor did not advance/i,
  );
});
