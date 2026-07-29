import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createUserScopedQueryStorage,
  isQueryCacheStorageAccessible,
  queryCacheStorageKey,
  revokeUserQueryCache,
  shouldPersistQuery
} from '../src/lib/query-cache-policy.ts';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

test('cache keys are isolated between authenticated users', () => {
  assert.notEqual(queryCacheStorageKey('user-a'), queryCacheStorageKey('user-b'));
  assert.match(queryCacheStorageKey('user@example.com'), /user%40example\.com$/);
});

test('only successful reusable query data is persisted', () => {
  assert.equal(shouldPersistQuery({ queryKey: ['attendance', 'org-1'], state: { status: 'success', data: [] } }), true);
  assert.equal(shouldPersistQuery({ queryKey: ['signed-file', 'bucket', 'path'], state: { status: 'success', data: 'temporary-url' } }), false);
  assert.equal(shouldPersistQuery({ queryKey: ['attendance', 'org-1'], state: { status: 'pending', data: undefined } }), false);
  assert.equal(shouldPersistQuery({ queryKey: ['attendance', 'org-1'], state: { status: 'success', data: undefined } }), false);
});

test('revoking a user cache blocks delayed writes from the old persister generation', () => {
  const storage = new MemoryStorage();
  const cacheKey = queryCacheStorageKey('user-a');
  const oldSessionStorage = createUserScopedQueryStorage('user-a', storage);

  oldSessionStorage.setItem(cacheKey, 'old-cache');
  assert.equal(storage.getItem(cacheKey), 'old-cache');

  revokeUserQueryCache('user-a', storage);
  assert.equal(storage.getItem(cacheKey), null);

  oldSessionStorage.setItem(cacheKey, 'late-old-write');
  assert.equal(storage.getItem(cacheKey), null);

  const newSessionStorage = createUserScopedQueryStorage('user-a', storage);
  newSessionStorage.setItem(cacheKey, 'new-cache');
  assert.equal(storage.getItem(cacheKey), 'new-cache');

  oldSessionStorage.removeItem(cacheKey);
  assert.equal(storage.getItem(cacheKey), 'new-cache');
});


test('a full but readable storage remains accessible for eviction and logout cleanup', () => {
  const fullStorage = {
    getItem: (_key: string) => null,
    setItem: (_key: string, _value: string) => { throw new Error('QuotaExceededError'); },
    removeItem: (_key: string) => undefined
  };

  assert.equal(isQueryCacheStorageAccessible(fullStorage), true);
});

test('storage access failures are treated as unavailable', () => {
  const blockedStorage = {
    getItem: (_key: string): string | null => { throw new Error('SecurityError'); },
    setItem: (_key: string, _value: string) => undefined,
    removeItem: (_key: string) => undefined
  };

  assert.equal(isQueryCacheStorageAccessible(blockedStorage), false);
});
