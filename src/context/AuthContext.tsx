import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createAuthBootstrapCache, membershipPermissionCacheKey, type AuthBootstrapSnapshot } from '@/lib/auth-bootstrap-cache';
import { planAuthIdentityTransition } from '@/lib/auth-session-policy';
import { env } from '@/lib/env';
import { getQueryCacheStorage, removePersistedUserCache } from '@/lib/query-client';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useUiStore } from '@/stores/ui-store';
import type { OrganizationMembership, Profile } from '@/types/domain';
import { can as checkPermission, mergePermissions } from '@/utils/permissions';

interface SignInInput { email: string; password: string }
interface CreateOrganizationInput { name: string; code: string }

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  memberships: OrganizationMembership[];
  activeMembership: OrganizationMembership | null;
  permissions: ReadonlySet<string>;
  loading: boolean;
  configured: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMemberships: () => Promise<void>;
  createOrganization: (input: CreateOrganizationInput) => Promise<string>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeMembership(row: Record<string, unknown>): OrganizationMembership {
  const organization = row.organization as OrganizationMembership['organization'];
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    user_id: String(row.user_id),
    role: row.role as OrganizationMembership['role'],
    status: row.status as OrganizationMembership['status'],
    permission_grants: Array.isArray(row.permission_grants) ? row.permission_grants.map(String) : [],
    permission_denials: Array.isArray(row.permission_denials) ? row.permission_denials.map(String) : [],
    department_id: row.department_id ? String(row.department_id) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    organization
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(configured);
  const activeOrganizationId = useUiStore((state) => state.activeOrganizationId);
  const setActiveOrganizationId = useUiStore((state) => state.setActiveOrganizationId);
  const activeRequestRef = useRef('');
  const sessionUserIdRef = useRef('');
  const userId = session?.user.id ?? '';
  activeRequestRef.current = `${userId}:${activeOrganizationId ?? ''}`;

  const clearBootstrapState = useCallback(() => {
    setProfile(null);
    setMemberships([]);
    setRolePermissions([]);
  }, []);

  const applyBootstrapSnapshot = useCallback((snapshot: AuthBootstrapSnapshot) => {
    setProfile(snapshot.profile);
    setMemberships(snapshot.memberships);
    const selected = snapshot.memberships.find(
      (membership) => membership.organization_id === activeOrganizationId
    ) ?? snapshot.memberships[0] ?? null;
    if (selected && selected.organization_id !== activeOrganizationId) {
      setActiveOrganizationId(selected.organization_id);
    }
    setRolePermissions(
      selected ? snapshot.rolePermissionsByMembership[membershipPermissionCacheKey(selected)] ?? [] : []
    );
  }, [activeOrganizationId, setActiveOrganizationId]);

  const refreshMemberships = useCallback(async () => {
    if (!configured || !userId) {
      clearBootstrapState();
      return;
    }

    const requestKey = `${userId}:${activeOrganizationId ?? ''}`;
    const storage = env.offlineCacheEnabled ? getQueryCacheStorage() : undefined;
    const cache = storage ? createAuthBootstrapCache(userId, storage) : null;
    const cachedSnapshot = cache?.read() ?? null;
    const supabase = getSupabase();
    const [profileResult, membershipsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('organization_members').select('*, organization:organizations(*)').eq('user_id', userId).eq('status', 'active').order('created_at')
    ]);
    if (profileResult.error) throw profileResult.error;
    if (membershipsResult.error) throw membershipsResult.error;

    const nextMemberships = ((membershipsResult.data ?? []) as Record<string, unknown>[]).map(normalizeMembership);
    const selected = nextMemberships.find(
      (membership) => membership.organization_id === activeOrganizationId
    ) ?? nextMemberships[0] ?? null;
    let nextRolePermissions: string[] = [];
    if (selected) {
      const permissionsResult = await supabase.from('role_permissions').select('permissions').eq('organization_id', selected.organization_id).eq('role', selected.role).maybeSingle();
      if (permissionsResult.error) throw permissionsResult.error;
      const permissions = (permissionsResult.data as { permissions?: unknown } | null)?.permissions;
      nextRolePermissions = Array.isArray(permissions) ? permissions.map(String) : [];
    }

    if (activeRequestRef.current !== requestKey) return;
    const rolePermissionsByMembership = { ...(cachedSnapshot?.rolePermissionsByMembership ?? {}) };
    if (selected) rolePermissionsByMembership[membershipPermissionCacheKey(selected)] = nextRolePermissions;
    const nextSnapshot: AuthBootstrapSnapshot = {
      profile: (profileResult.data as Profile | null) ?? null,
      memberships: nextMemberships,
      rolePermissionsByMembership
    };
    cache?.write(nextSnapshot);
    applyBootstrapSnapshot(nextSnapshot);
  }, [activeOrganizationId, applyBootstrapSnapshot, clearBootstrapState, configured, userId]);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabase();
    let disposed = false;
    const applySession = (nextSession: Session | null) => {
      if (disposed) return;
      const nextUserId = nextSession?.user.id ?? '';
      const transition = planAuthIdentityTransition(sessionUserIdRef.current, nextUserId);
      sessionUserIdRef.current = nextUserId;
      if (transition.userIdToClear) removePersistedUserCache(transition.userIdToClear);
      if (transition.identityChanged) setLoading(transition.shouldLoadBootstrap);
      setSession(nextSession);
    };

    void supabase.auth.getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => {
        if (!disposed) setLoading(false);
      });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });
    return () => {
      disposed = true;
      subscription.subscription.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    if (!configured || !userId) {
      clearBootstrapState();
      setLoading(false);
      return;
    }

    const storage = env.offlineCacheEnabled ? getQueryCacheStorage() : undefined;
    const cachedSnapshot = storage ? createAuthBootstrapCache(userId, storage).read() : null;
    if (cachedSnapshot) applyBootstrapSnapshot(cachedSnapshot);
    else clearBootstrapState();
    setLoading(!cachedSnapshot);

    let disposed = false;
    void refreshMemberships().catch(() => {
      if (!disposed && !cachedSnapshot) clearBootstrapState();
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => { disposed = true; };
  }, [applyBootstrapSnapshot, clearBootstrapState, configured, refreshMemberships, userId]);

  const activeMembership = useMemo(
    () => memberships.find((membership) => membership.organization_id === activeOrganizationId) ?? memberships[0] ?? null,
    [activeOrganizationId, memberships]
  );
  const permissions = useMemo(() => {
    if (!activeMembership) return new Set<string>();
    if (activeMembership.role === 'admin') return new Set<string>(['*']);
    return mergePermissions(rolePermissions, activeMembership.permission_grants, activeMembership.permission_denials);
  }, [activeMembership, rolePermissions]);

  const signIn = useCallback(async ({ email, password }: SignInInput) => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw error;
    const { error: auditError } = await supabase.rpc('log_client_activity', {
      p_event_type: 'auth', p_action: 'login', p_entity_type: 'session', p_entity_id: null,
      p_metadata: { user_agent: navigator.userAgent, language: navigator.language }
    });
    if (auditError) {
      await supabase.auth.signOut();
      throw new Error(`Login audit failed: ${auditError.message}`);
    }
  }, []);

  const signOut = useCallback(async () => {
    const currentUserId = session?.user.id;
    const supabase = getSupabase();
    const { error: auditError } = await supabase.rpc('log_client_activity', {
      p_event_type: 'auth', p_action: 'logout', p_entity_type: 'session', p_entity_id: null,
      p_metadata: { user_agent: navigator.userAgent }
    });
    if (auditError) throw new Error(`Logout audit failed: ${auditError.message}`);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    if (currentUserId) removePersistedUserCache(currentUserId);
    clearBootstrapState();
  }, [clearBootstrapState, session?.user.id]);

  const createOrganization = useCallback(async ({ name, code }: CreateOrganizationInput) => {
    const { data, error } = await getSupabase().rpc('create_organization', { p_name: name.trim(), p_code: code.trim().toUpperCase() });
    if (error) throw error;
    await refreshMemberships();
    return String(data);
  }, [refreshMemberships]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    memberships,
    activeMembership,
    permissions,
    loading,
    configured,
    signIn,
    signOut,
    refreshMemberships,
    createOrganization,
    can: (permission) => checkPermission(permissions, permission)
  }), [activeMembership, configured, createOrganization, loading, memberships, permissions, profile, refreshMemberships, session, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
