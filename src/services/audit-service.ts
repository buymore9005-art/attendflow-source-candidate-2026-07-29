import { getSupabase } from '@/lib/supabase';

export async function logOrganizationActivity(
  organizationId: string,
  eventType: string,
  action: string,
  entityType: string | null = null,
  entityId: string | null = null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await getSupabase().rpc('log_organization_activity', {
    p_organization_id: organizationId,
    p_event_type: eventType,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_metadata: { ...metadata, user_agent: navigator.userAgent }
  });
  if (error) throw error;
}
