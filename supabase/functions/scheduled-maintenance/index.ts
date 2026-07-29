import { buildDeliInvocationPlan, type DeliIntegrationCandidate, type DeliJobCandidate } from '../_shared/deli-scheduler.ts';
import { adminClient } from '../_shared/supabase.ts';
import { correlationId, errorResponse, HttpError, jsonResponse, optionsResponse } from '../_shared/http.ts';

const MAX_DELI_INVOCATIONS = 3;
const MAX_DELI_CANDIDATES = 500;

function secureEqual(expected: string | undefined, provided: string | null): boolean {
  if (!expected || !provided || expected.length !== provided.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  return difference === 0;
}

function dateInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

async function invokeDeli(body: Record<string, unknown>): Promise<void> {
  const base = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('CRON_SECRET');
  if (!base || !secret) throw new Error('SUPABASE_URL and CRON_SECRET are required.');
  const response = await fetch(`${base}/functions/v1/deli-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(50_000),
  });
  if (!response.ok) throw new Error(`Deli scheduled request failed with HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
}

Deno.serve(async (request) => {
  const requestCorrelationId = correlationId(request);
  if (request.method === 'OPTIONS') return optionsResponse();
  try {
    if (!secureEqual(Deno.env.get('CRON_SECRET'), request.headers.get('x-cron-secret'))) throw new HttpError(401, 'Invalid scheduler secret.', 'unauthorized');
    if (!['GET', 'POST'].includes(request.method)) throw new HttpError(405, 'Only GET and POST are supported.', 'method_not_allowed');
    const now = new Date();
    const staleDeviceAt = new Date(now.getTime() - 5 * 60_000).toISOString();
    const staleWorkerAt = new Date(now.getTime() - 15 * 60_000).toISOString();
    const { count: offlineDevices, error: offlineError } = await adminClient.from('attendance_devices').update({ status: 'offline', updated_at: now.toISOString() }, { count: 'exact' }).eq('status', 'online').lt('last_seen_at', staleDeviceAt).is('deleted_at', null);
    if (offlineError) throw offlineError;
    const { count: resetCommands, error: commandError } = await adminClient.from('device_commands').update({ status: 'queued', available_at: now.toISOString(), error_message: 'Worker lease expired; command requeued.', updated_at: now.toISOString() }, { count: 'exact' }).eq('status', 'running').lt('claimed_at', staleWorkerAt);
    if (commandError) throw commandError;
    const { data: recoveredJobs, error: jobError } = await adminClient.rpc('recover_stale_integration_jobs', { p_stale_before: staleWorkerAt });
    if (jobError) throw jobError;
    const recovery = recoveredJobs && typeof recoveredJobs === 'object'
      ? recoveredJobs as { requeued?: unknown; failed?: unknown }
      : {};
    const resetJobs = Number(recovery.requeued ?? 0);
    const failedStaleJobs = Number(recovery.failed ?? 0);
    await adminClient.from('idempotency_keys').delete().lt('expires_at', now.toISOString());
    await adminClient.from('rate_limit_buckets').delete().lt('updated_at', new Date(now.getTime() - 24 * 60 * 60_000).toISOString());

    const { data: organizations, error: organizationError } = await adminClient.from('organizations').select('id,time_zone').eq('is_active', true);
    if (organizationError) throw organizationError;
    let absenceRows = 0;
    for (const organization of organizations ?? []) {
      const { data, error } = await adminClient.rpc('generate_daily_absences', { p_organization_id: organization.id, p_work_date: dateInZone(organization.time_zone) });
      if (error) throw error;
      absenceRows += Number(data ?? 0);
    }

    const [{ data: integrations, error: integrationError }, { data: deliJobs, error: jobsError }] = await Promise.all([
      adminClient.from('integrations')
        .select('organization_id,configuration,last_success_at')
        .eq('provider', 'deli')
        .eq('is_enabled', true),
      adminClient.from('integration_jobs')
        .select('id,organization_id,job_type,status,attempts,max_attempts,next_attempt_at,created_at')
        .like('job_type', 'deli_%')
        .in('status', ['queued', 'running'])
        .order('next_attempt_at', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true })
        .limit(MAX_DELI_CANDIDATES),
    ]);
    if (integrationError) throw integrationError;
    if (jobsError) throw jobsError;

    const candidates = (deliJobs ?? []) as DeliJobCandidate[];
    const candidateWindowTruncated = candidates.length >= MAX_DELI_CANDIDATES;
    if (candidateWindowTruncated) {
      console.warn(JSON.stringify({
        correlation_id: requestCorrelationId,
        warning: 'Deli scheduler candidate window reached its safety ceiling; automatic attendance jobs are deferred to avoid duplicate work.',
        candidate_count: candidates.length,
      }));
    }
    const invocationPlan = buildDeliInvocationPlan(
      candidates,
      candidateWindowTruncated ? [] : (integrations ?? []) as DeliIntegrationCandidate[],
      now,
      MAX_DELI_INVOCATIONS,
    );
    const invocationResults = await Promise.allSettled(invocationPlan.map((invocation) => invokeDeli(invocation.body)));

    let scheduledDeli = 0;
    let retriedJobs = 0;
    invocationResults.forEach((result, index) => {
      const invocation = invocationPlan[index]!;
      if (result.status === 'fulfilled') {
        if (invocation.kind === 'retry') retriedJobs += 1;
        else scheduledDeli += 1;
        return;
      }
      console.error(JSON.stringify({
        correlation_id: requestCorrelationId,
        organization_id: invocation.organizationId,
        invocation_kind: invocation.kind,
        deli_error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }));
    });

    return jsonResponse({
      ok: true,
      offline_devices: offlineDevices ?? 0,
      reset_commands: resetCommands ?? 0,
      reset_jobs: Number.isFinite(resetJobs) ? resetJobs : 0,
      failed_stale_jobs: Number.isFinite(failedStaleJobs) ? failedStaleJobs : 0,
      generated_absence_rows: absenceRows,
      scheduled_deli_syncs: scheduledDeli,
      retried_jobs: retriedJobs,
      correlation_id: requestCorrelationId,
    });
  } catch (error) {
    return errorResponse(error, requestCorrelationId);
  }
});
