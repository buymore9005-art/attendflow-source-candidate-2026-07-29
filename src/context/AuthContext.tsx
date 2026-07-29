import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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

  const refreshMemberships = useCallback(async () => {
    if (!configured || !session?.user) {
      setProfile(null);
      setMemberships([]);
      setRolePermissions([]);
      return;
    }
    const supabase = getSupabase();
    const [profileResult, membershipsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
      supabase.from('organization_members').select('*, organization:organizations(*)').eq('user_id', session.user.id).eq('status', 'active').order('created_at')
    ]);
    if (profileResult.error) throw profileResult.error;
    if (membershipsResult.error) throw membershipsResult.error;
    setProfile((profileResult.data as Profile | null) ?? null);
    const nextMemberships = ((membershipsResult.data ?? []) as Record<string, unknown>[]).map(normalizeMembership);
    setMemberships(nextMemberships);
    const selected = nextMemberships.find((membership) => membership.organization_id === activeOrganizationId) ?? nextMemberships[0] ?? null;
    if (selected && selected.organization_id !== activeOrganizationId) setActiveOrganizationId(selected.organization_id);
    if (!selected) {
      setRolePermissions([]);
      return;
    }
    const permissionsResult = await supabase.from('role_permissions').select('permissions').eq('organization_id', selected.organization_id).eq('role', selected.role).maybeSingle();
    if (permissionsResult.error) throw permissionsResult.error;
    const permissions = (permissionsResult.data as { permissions?: unknown } | null)?.permissions;
    setRolePermissions(Array.isArray(permissions) ? permissions.map(String) : []);
  }, [activeOrganizationId, configured, session?.user, setActiveOrganizationId]);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabase();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => subscription.subscription.unsubscribe();
  }, [configured]);

  useEffect(() => {
    setLoading(configured && Boolean(session));
    void refreshMemberships().catch(() => {
      setProfile(null);
      setMemberships([]);
      setRolePermissions([]);
    }).finally(() => setLoading(false));
  }, [configured, refreshMemberships, session]);

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
    const supabase = getSupabase();
    const { error: auditError } = await supabase.rpc('log_client_activity', {
      p_event_type: 'auth', p_action: 'logout', p_entity_type: 'session', p_entity_id: null,
      p_metadata: { user_agent: navigator.userAgent }
    });
    if (auditError) throw new Error(`Logout audit failed: ${auditError.message}`);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
    setMemberships([]);
    setRolePermissions([]);
  }, []);

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
