export interface AppEnvironment {
  supabaseUrl: string;
  supabasePublishableKey: string;
  appUrl: string;
  defaultTimeZone: string;
  offlineCacheEnabled: boolean;
  configured: boolean;
}

const normalize = (value: string | undefined): string => value?.trim() ?? '';
const supabaseUrl = normalize(import.meta.env.VITE_SUPABASE_URL);
const supabasePublishableKey = normalize(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const env: AppEnvironment = {
  supabaseUrl,
  supabasePublishableKey,
  appUrl: normalize(import.meta.env.VITE_APP_URL) || window.location.origin,
  defaultTimeZone: normalize(import.meta.env.VITE_DEFAULT_TIME_ZONE) || 'Asia/Jakarta',
  offlineCacheEnabled: normalize(import.meta.env.VITE_ENABLE_OFFLINE_CACHE).toLowerCase() !== 'false',
  configured: /^https:\/\/.+\.supabase\.co$/.test(supabaseUrl) && supabasePublishableKey.length > 20
};
