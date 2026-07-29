import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, root), 'utf8').catch(() => '');
}

test('persisted query cache is scoped per authenticated user and handles storage pressure', async () => {
  const [queryClient, cachePolicy, providers] = await Promise.all([
    source('src/lib/query-client.ts'),
    source('src/lib/query-cache-policy.ts'),
    source('src/context/AppProviders.tsx')
  ]);

  assert.match(queryClient, /createQueryClient/);
  assert.match(queryClient, /createQueryPersister/);
  assert.match(`${queryClient}\n${cachePolicy}`, /queryCacheStorageKey/);
  assert.match(queryClient, /removeOldestQuery/);
  assert.doesNotMatch(queryClient, /setItem\(STORAGE_PROBE_KEY/);
  assert.match(cachePolicy, /signed-file/);
  assert.match(cachePolicy, /generation/);
  assert.doesNotMatch(queryClient, /key:\s*['"]attendflow-query-cache['"]/);
  assert.match(providers, /cacheScope/);
  assert.match(providers, /key=\{cacheScope\}/);
});

test('Supabase realtime synchronization is centralized and reconciles missed changes', async () => {
  const [controller, policy, providers, attendance, dashboard] = await Promise.all([
    source('src/context/SupabaseSyncController.tsx'),
    source('src/lib/realtime-sync.ts'),
    source('src/context/AppProviders.tsx'),
    source('src/pages/attendance/AttendancePages.tsx'),
    source('src/pages/dashboard/DashboardPage.tsx')
  ]);

  assert.match(providers, /SupabaseSyncController/);
  assert.match(policy, /integration_jobs/);
  assert.match(policy, /system_notifications/);
  assert.match(policy, /payroll_runs/);
  assert.match(controller, /SUBSCRIBED/);
  assert.match(controller, /useIsRestoring/);
  assert.match(controller, /userId/);
  assert.match(`${controller}
${policy}`, /CHANNEL_ERROR|TIMED_OUT/);
  assert.match(controller, /invalidateQueries/);
  assert.doesNotMatch(attendance, /\.channel\(/);
  assert.doesNotMatch(dashboard, /\.channel\(/);
});

test('offline auth bootstrap is restored and logout removes all authenticated local caches', async () => {
  const authContext = await source('src/context/AuthContext.tsx');
  assert.match(authContext, /createAuthBootstrapCache/);
  assert.match(authContext, /planAuthIdentityTransition/);
  assert.match(authContext, /env\.offlineCacheEnabled/);
  assert.match(authContext, /cachedSnapshot/);
  assert.match(authContext, /removePersistedUserCache/);
  assert.match(authContext, /removePersistedUserCache\(/);
});
