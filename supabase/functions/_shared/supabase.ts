import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');

if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

export const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'X-Application-Name': 'AttendFlow Edge Functions' } }
});

export function requestClient(request: Request): SupabaseClient {
  if (!publishableKey) throw new Error('SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY is required.');
  return createClient(supabaseUrl!, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } }
  });
}

export async function requireUser(request: Request): Promise<User> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication is required.', 'unauthorized');
  const token = authorization.slice('Bearer '.length);
  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Authentication token is invalid or expired.', 'unauthorized');
  return data.user;
}

export async function requirePermission(request: Request, organizationId: string, permission: string): Promise<User> {
  const user = await requireUser(request);
  const { data, error } = await requestClient(request).rpc('has_permission', {
    p_organization_id: organizationId,
    p_permission: permission
  });
  if (error) throw error;
  if (!data) throw new HttpError(403, 'You do not have permission to perform this operation.', 'forbidden');
  return user;
}

export async function auditEvent(input: {
  organizationId: string | null;
  userId: string | null;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  action: string;
  newData?: Record<string, unknown> | null;
  request: Request;
  correlationId: string;
}): Promise<void> {
  const forwarded = input.request.headers.get('x-forwarded-for') ?? input.request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || null;
  const { error } = await adminClient.from('audit_logs').insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    event_type: input.eventType,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    action: input.action,
    old_data: null,
    new_data: input.newData ?? null,
    ip_address: ip,
    user_agent: input.request.headers.get('user-agent'),
    device_info: {},
    correlation_id: input.correlationId
  });
  if (error) throw new Error(`Audit log write failed: ${error.message}`);
}
