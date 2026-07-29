import { getSupabase } from '@/lib/supabase';

export interface OrganizationSettings {
  organization_id: string;
  work: Record<string, unknown>;
  payroll: Record<string, unknown>;
  numbering: Record<string, unknown>;
  integrations: Record<string, unknown>;
  security: Record<string, unknown>;
  updated_at: string;
}

export async function getOrganizationSettings(organizationId: string): Promise<OrganizationSettings> {
  const { data, error } = await getSupabase().from('organization_settings').select('*').eq('organization_id', organizationId).maybeSingle();
  if (error) throw error;
  return (data ?? { organization_id: organizationId, work: {}, payroll: {}, numbering: {}, integrations: {}, security: {}, updated_at: new Date(0).toISOString() }) as OrganizationSettings;
}
export async function saveOrganizationSettings(organizationId: string, section: keyof Pick<OrganizationSettings, 'work' | 'payroll' | 'numbering' | 'integrations' | 'security'>, values: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabase().from('organization_settings').upsert({ organization_id: organizationId, [section]: values }, { onConflict: 'organization_id' });
  if (error) throw error;
}
export async function saveOrganizationSecret(organizationId: string, secretName: string, secretValue: string): Promise<void> {
  const { error } = await getSupabase().rpc('set_organization_secret', { p_organization_id: organizationId, p_secret_name: secretName, p_secret_value: secretValue });
  if (error) throw error;
}


export interface DeliIntegrationSettings {
  id: string | null;
  is_enabled: boolean;
  configuration: Record<string, unknown>;
}

export async function getDeliIntegrationSettings(organizationId: string): Promise<DeliIntegrationSettings> {
  const { data, error } = await getSupabase()
    .from('integrations')
    .select('id,is_enabled,configuration')
    .eq('organization_id', organizationId)
    .eq('provider', 'deli')
    .eq('name', 'Deli E+')
    .maybeSingle();
  if (error) throw error;
  return {
    id: data?.id ?? null,
    is_enabled: data?.is_enabled ?? true,
    configuration: data?.configuration && typeof data.configuration === 'object' ? data.configuration as Record<string, unknown> : {}
  };
}

export async function saveDeliIntegrationSettings(organizationId: string, patch: Record<string, unknown>, enabled = true): Promise<void> {
  const current = await getDeliIntegrationSettings(organizationId);
  const configuration = { ...current.configuration, ...patch };
  const payload = { organization_id: organizationId, provider: 'deli', name: 'Deli E+', is_enabled: enabled, configuration };
  const { error } = current.id
    ? await getSupabase().from('integrations').update(payload).eq('id', current.id).eq('organization_id', organizationId)
    : await getSupabase().from('integrations').insert(payload);
  if (error) throw error;
}
