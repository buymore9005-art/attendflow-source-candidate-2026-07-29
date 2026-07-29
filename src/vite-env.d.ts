/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_DEFAULT_LOCALE?: 'id' | 'en' | 'zh';
  readonly VITE_DEFAULT_TIME_ZONE?: string;
  readonly VITE_ENABLE_OFFLINE_CACHE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
