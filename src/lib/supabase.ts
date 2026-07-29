import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

export class SupabaseConfigurationError extends Error {
  constructor() {
    super('Supabase environment variables are not configured');
    this.name = 'SupabaseConfigurationError';
  }
}

export function getSupabase(): SupabaseClient {
  if (!env.configured) throw new SupabaseConfigurationError();
  client ??= createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    },
    global: {
      headers: { 'x-client-info': 'attendflow-web/1.0.0' }
    },
    realtime: {
      params: { eventsPerSecond: 10 }
    }
  });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return env.configured;
}
