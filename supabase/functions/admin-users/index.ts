import { auditEvent, adminClient, requirePermission } from '../_shared/supabase.ts';
import { correlationId, errorResponse, HttpError, jsonResponse, optionsResponse, readJsonObject, requiredString } from '../_shared/http.ts';

const roles = new Set(['admin', 'hr', 'supervisor', 'finance', 'manager', 'leader', 'viewer']);

interface InviteInput { email: string; full_name: string; role: string; department_id?: string | null }

function normalizeInvite(value: Record<string, unknown>): InviteInput {
  const email = requiredString(value.email, 'email', 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, `Invalid email: ${email}`, 'validation_error');
  const fullName = requiredString(value.full_name ?? value.name ?? email.split('@')[0], 'full_name', 160);
  const role = String(value.role ?? 'viewer').toLowerCase();
  if (!roles.has(role)) throw new HttpError(400, `Invalid role for ${email}.`, 'validation_error');
  const departmentId = typeof value.department_id === 'string' && value.department_id ? value.department_id : null;
  return { email, full_name: fullName, role, department_id: departmentId };
}

async function findExistingUser(email: string): Promise<string | null> {
  const { data, error } = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function inviteOne(organizationId: string, input: InviteInput): Promise<{ user_id: string; email: string; invited: boolean }> {
  let userId = await findExistingUser(input.email);
  let invited = false;
  if (!userId) {
    const appUrl = Deno.env.get('APP_URL') ?? Deno.env.get('SITE_URL');
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(input.email, {
      data: { full_name: input.full_name },
      redirectTo: appUrl ? `${appUrl.replace(/\/$/, '')}/login` : undefined
    });
    if (error) throw error;
    if (!data.user) throw new Error(`Supabase did not return an invited user for ${input.email}.`);
    userId = data.user.id;
    invited = true;
  }
  const { error: profileError } = await adminClient.from('profiles').upsert({ id: userId, email: input.email, full_name: input.full_name }, { onConflict: 'id' });
  if (profileError) throw profileError;
  const { error: membershipError } = await adminClient.from('organization_members').upsert({ organization_id: organizationId, user_id: userId, role: input.role, status: 'active', department_id: input.department_id ?? null }, { onConflict: 'organization_id,user_id' });
  if (membershipError) throw membershipError;
  return { user_id: userId, email: input.email, invited };
}

Deno.serve(async (request) => {
  const requestCorrelationId = correlationId(request);
  if (request.method === 'OPTIONS') return optionsResponse();
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Only POST is supported.', 'method_not_allowed');
    const body = await readJsonObject(request);
    const organizationId = requiredString(body.organization_id, 'organization_id', 36);
    const action = requiredString(body.action, 'action', 64);
    const actor = await requirePermission(request, organizationId, 'users.create');

    if (action === 'invite') {
      const input = normalizeInvite(body);
      const result = await inviteOne(organizationId, input);
      await auditEvent({ organizationId, userId: actor.id, eventType: 'user', entityType: 'organization_members', entityId: result.user_id, action: 'invite', newData: { email: result.email, role: input.role }, request, correlationId: requestCorrelationId });
      return jsonResponse({ ...result, correlation_id: requestCorrelationId }, 201);
    }

    if (action === 'bulk_invite') {
      if (!Array.isArray(body.rows) || body.rows.length === 0) throw new HttpError(400, 'rows must be a non-empty array.', 'validation_error');
      if (body.rows.length > 200) throw new HttpError(413, 'A bulk invitation is limited to 200 users.', 'batch_too_large');
      const successes: Array<{ user_id: string; email: string; invited: boolean }> = [];
      const failures: Array<{ row: number; email: string; error: string }> = [];
      for (let index = 0; index < body.rows.length; index += 1) {
        try {
          const row = body.rows[index];
          if (!row || typeof row !== 'object' || Array.isArray(row)) throw new HttpError(400, 'Row must be an object.', 'validation_error');
          const input = normalizeInvite(row as Record<string, unknown>);
          successes.push(await inviteOne(organizationId, input));
        } catch (error) {
          const row = body.rows[index] as Record<string, unknown> | undefined;
          failures.push({ row: index + 1, email: String(row?.email ?? ''), error: error instanceof Error ? error.message : 'Invitation failed' });
        }
      }
      await auditEvent({ organizationId, userId: actor.id, eventType: 'user', entityType: 'organization_members', action: 'bulk_invite', newData: { successes: successes.length, failures: failures.length }, request, correlationId: requestCorrelationId });
      return jsonResponse({ successes, failures, correlation_id: requestCorrelationId }, failures.length ? 207 : 201);
    }

    throw new HttpError(400, 'Unsupported admin user action.', 'unsupported_action');
  } catch (error) {
    return errorResponse(error, requestCorrelationId);
  }
});
