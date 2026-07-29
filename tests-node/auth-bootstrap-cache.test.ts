import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authBootstrapStorageKey,
  createAuthBootstrapCache,
  membershipPermissionCacheKey,
  type AuthBootstrapSnapshot
} from '../src/lib/auth-bootstrap-cache.ts';
import {
  QUERY_CACHE_MAX_AGE_MS,
  queryCacheStorageKey,
  revokeUserLocalCache,
  type QueryCacheStorage
} from '../src/lib/query-cache-policy.ts';

class MemoryStorage implements QueryCacheStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const membership = {
  id: 'membership-1',
  organization_id: 'organization-1',
  user_id: 'user-a',
  role: 'hr' as const,
  status: 'active' as const,
  permission_grants: [],
  permission_denials: [],
  department_id: null,
  created_at: '2026-07-29T00:00:00.000Z',
  updated_at: '2026-07-29T00:00:00.000Z',
  organization: {
    id: 'organization-1',
    name: 'Offline Organization',
    code: 'OFFLINE',
    time_zone: 'Asia/Jakarta',
    locale: 'id' as const,
    logo_path: null,
    address: null,
    email: null,
    phone: null,
    is_active: true,
    created_at: '2026-07-29T00:00:00.000Z',
    updated_at: '2026-07-29T00:00:00.000Z'
  }
};

const snapshot: AuthBootstrapSnapshot = {
  profile: null,
  memberships: [membership],
  rolePermissionsByMembership: {
    [membershipPermissionCacheKey(membership)]: ['dashboard.read', 'attendance.read']
  }
};

test('auth bootstrap cache restores only the matching user within the cache lifetime', () => {
  const storage = new MemoryStorage();
  const now = 10_000;
  const userACache = createAuthBootstrapCache('user-a', storage, () => now);

  userACache.write(snapshot);

  assert.deepEqual(userACache.read(), snapshot);
  assert.equal(createAuthBootstrapCache('user-b', storage, () => now).read(), null);
  assert.equal(createAuthBootstrapCache('user-a', storage, () => now + QUERY_CACHE_MAX_AGE_MS + 1).read(), null);
  assert.equal(storage.getItem(authBootstrapStorageKey('user-a')), null);
});

test('logout revocation removes query and auth caches and blocks late bootstrap writes', () => {
  const storage = new MemoryStorage();
  const queryKey = queryCacheStorageKey('user-a');
  const authKey = authBootstrapStorageKey('user-a');
  const oldAuthCache = createAuthBootstrapCache('user-a', storage, () => 20_000);

  storage.setItem(queryKey, 'query-cache');
  oldAuthCache.write(snapshot);
  revokeUserLocalCache('user-a', storage, [queryKey, authKey]);

  assert.equal(storage.getItem(queryKey), null);
  assert.equal(storage.getItem(authKey), null);

  oldAuthCache.write(snapshot);
  assert.equal(storage.getItem(authKey), null);
});

test('corrupt auth bootstrap data is discarded instead of breaking application startup', () => {
  const storage = new MemoryStorage();
  const key = authBootstrapStorageKey('user-a');
  storage.setItem(key, '{broken json');

  assert.equal(createAuthBootstrapCache('user-a', storage).read(), null);
  assert.equal(storage.getItem(key), null);
});

test('structurally invalid auth bootstrap snapshots are rejected', () => {
  const storage = new MemoryStorage();
  const key = authBootstrapStorageKey('user-a');
  const cache = createAuthBootstrapCache('user-a', storage, () => 30_000);
  cache.write(snapshot);
  const persisted = JSON.parse(storage.getItem(key) ?? '{}') as { snapshot?: { memberships?: unknown } };
  if (persisted.snapshot) persisted.snapshot.memberships = [null];
  storage.setItem(key, JSON.stringify(persisted));

  assert.equal(cache.read(), null);
  assert.equal(storage.getItem(key), null);
});
