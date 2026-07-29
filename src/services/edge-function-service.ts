import { getSupabase } from '@/lib/supabase';
import { createCorrelationId } from '@/lib/utils';

export async function invokeFunction<TResponse>(name: string, body: Record<string, unknown>): Promise<TResponse> {
  const { data, error } = await getSupabase().functions.invoke(name, {
    body: { ...body, correlation_id: createCorrelationId() },
    headers: { 'x-client-time-zone': Intl.DateTimeFormat().resolvedOptions().timeZone }
  });
  if (error) throw error;
  return data as TResponse;
}
