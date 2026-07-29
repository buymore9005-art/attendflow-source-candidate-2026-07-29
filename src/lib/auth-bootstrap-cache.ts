import type { OrganizationMembership, Profile } from '@/types/domain';
import {
  QUERY_CACHE_MAX_AGE_MS,
  createUserScopedQueryStorage,
  type QueryCacheStorage
} from './query-cache-policy.ts';

const AUTH_BOOTSTRAP_PREFIX = 'attendflow-auth-bootstrap:v1';
const AUTH_BOOTSTRAP_BUSTER = 'attendflow-auth-bootstrap-v1';

export interface AuthBootstrapSnapshot {
  profile: Profile | null;
  memberships: OrganizationMembership[];
  rolePermissionsByMembership: Record<string, string[]>;
}

interface PersistedAuthBootstrap {
  buster: string;
  timestamp: number;
  snapshot: AuthBootstrapSnapshot;
}

interface AuthBootstrapCache {
  read(): AuthBootstrapSnapshot | null;
  write(snapshot: AuthBootstrapSnapshot): void;
  remove(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isMembership(value: unknown): value is OrganizationMembership {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.organization_id === 'string'
    && typeof value.user_id === 'string'
    && typeof value.role === 'string'
    && typeof value.status === 'string'
    && isStringArray(value.permission_grants)
    && isStringArray(value.permission_denials)
    && (value.department_id === null || typeof value.department_id === 'string')
    && typeof value.created_at === 'string'
    && typeof value.updated_at === 'string'
    && (value.organization === undefined || isRecord(value.organization));
}

function isSnapshot(value: unknown): value is AuthBootstrapSnapshot {
  if (!isRecord(value)) return false;
  if (value.profile !== null && !isRecord(value.profile)) return false;
  if (!Array.isArray(value.memberships)
    || !value.memberships.every(isMembership)
    || !isRecord(value.rolePermissionsByMembership)) return false;
  return Object.values(value.rolePermissionsByMembership).every(isStringArray);
}

export function authBootstrapStorageKey(userId: string): string {
  return `${AUTH_BOOTSTRAP_PREFIX}:${encodeURIComponent(userId)}`;
}

export function membershipPermissionCacheKey(
  membership: Pick<OrganizationMembership, 'id' | 'role'>
): string {
  return `${membership.id}:${membership.role}`;
}

export function createAuthBootstrapCache(
  userId: string,
  storage: QueryCacheStorage,
  now: () => number = Date.now
): AuthBootstrapCache {
  const key = authBootstrapStorageKey(userId);
  const scopedStorage = createUserScopedQueryStorage(userId, storage);
  const remove = () => {
    try {
      scopedStorage.removeItem(key);
    } catch {
      // Invalid cache data should not interrupt authentication bootstrap.
    }
  };

  return {
    read: () => {
      let raw: string | null;
      try {
        raw = scopedStorage.getItem(key);
      } catch {
        return null;
      }
      if (!raw) return null;

      try {
        const persisted = JSON.parse(raw) as Partial<PersistedAuthBootstrap>;
        const expired = typeof persisted.timestamp !== 'number'
          || now() - persisted.timestamp > QUERY_CACHE_MAX_AGE_MS;
        if (persisted.buster !== AUTH_BOOTSTRAP_BUSTER || expired || !isSnapshot(persisted.snapshot)) {
          remove();
          return null;
        }
        return persisted.snapshot;
      } catch {
        remove();
        return null;
      }
    },
    write: (snapshot) => {
      const persisted: PersistedAuthBootstrap = {
        buster: AUTH_BOOTSTRAP_BUSTER,
        timestamp: now(),
        snapshot
      };
      try {
        scopedStorage.setItem(key, JSON.stringify(persisted));
      } catch {
        // The application remains usable online when browser storage is full
        // or unavailable; query persistence has its own quota retry strategy.
      }
    },
    remove
  };
}
