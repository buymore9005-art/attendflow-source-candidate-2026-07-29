export interface DeliJobCandidate {
  id: string;
  organization_id: string;
  job_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
}

export interface DeliIntegrationCandidate {
  organization_id: string;
  configuration: Record<string, unknown> | null;
  last_success_at: string | null;
}

export interface DeliInvocation {
  kind: 'retry' | 'attendance';
  organizationId: string;
  body: Record<string, unknown>;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDeliJob(job: DeliJobCandidate): boolean {
  return job.job_type.startsWith('deli_');
}

function isActive(job: DeliJobCandidate): boolean {
  return isDeliJob(job) && (
    job.status === 'running'
    || (job.status === 'queued' && job.attempts < job.max_attempts)
  );
}

function isRetryDue(job: DeliJobCandidate, nowMs: number): boolean {
  if (!isDeliJob(job) || job.status !== 'queued' || job.attempts >= job.max_attempts) return false;
  const dueAt = timestamp(job.next_attempt_at);
  return dueAt === null || dueAt <= nowMs;
}

function intervalMinutes(configuration: Record<string, unknown>): number {
  const configured = Number(configuration.attendance_sync_interval_minutes ?? 15);
  return Number.isFinite(configured) ? Math.max(5, Math.min(1_440, configured)) : 15;
}

function retryOrder(left: DeliJobCandidate, right: DeliJobCandidate): number {
  const leftDue = timestamp(left.next_attempt_at) ?? Number.NEGATIVE_INFINITY;
  const rightDue = timestamp(right.next_attempt_at) ?? Number.NEGATIVE_INFINITY;
  return leftDue - rightDue || left.id.localeCompare(right.id);
}

export function buildDeliInvocationPlan(
  jobs: readonly DeliJobCandidate[],
  integrations: readonly DeliIntegrationCandidate[],
  now: Date,
  maximumInvocations: number,
): DeliInvocation[] {
  if (!Number.isSafeInteger(maximumInvocations) || maximumInvocations < 1 || maximumInvocations > 10) {
    throw new Error('maximumInvocations must be an integer between 1 and 10.');
  }
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error('now must be a valid Date.');

  const plan: DeliInvocation[] = [];
  const activeOrganizations = new Set(jobs.filter(isActive).map((job) => job.organization_id));
  const scheduledOrganizations = new Set<string>();

  for (const job of jobs.filter((candidate) => isRetryDue(candidate, nowMs)).sort(retryOrder)) {
    if (scheduledOrganizations.has(job.organization_id)) continue;
    plan.push({
      kind: 'retry',
      organizationId: job.organization_id,
      body: { organization_id: job.organization_id, action: 'retry_job', job_id: job.id },
    });
    scheduledOrganizations.add(job.organization_id);
    if (plan.length >= maximumInvocations) return plan;
  }

  for (const integration of [...integrations].sort((left, right) => left.organization_id.localeCompare(right.organization_id))) {
    if (activeOrganizations.has(integration.organization_id) || scheduledOrganizations.has(integration.organization_id)) continue;
    const configuration = integration.configuration && typeof integration.configuration === 'object'
      ? integration.configuration
      : {};
    if (configuration.attendance_auto_sync === false) continue;
    const lastSync = timestamp(configuration.attendance_last_sync_at) ?? timestamp(integration.last_success_at) ?? 0;
    if (lastSync > nowMs - intervalMinutes(configuration) * 60_000) continue;

    plan.push({
      kind: 'attendance',
      organizationId: integration.organization_id,
      body: { organization_id: integration.organization_id, action: 'sync_attendance' },
    });
    scheduledOrganizations.add(integration.organization_id);
    if (plan.length >= maximumInvocations) break;
  }

  return plan;
}
