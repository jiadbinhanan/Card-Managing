import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseClientOptions {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  storage?: any;
}

export const DEFAULT_SUPABASE_URL = 'https://mredhrvxhcdhityoouxa.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_thhGWSDaCViFfi7ym-do1g_EN4WHHb9';

let clientInstance: SupabaseClient | null = null;

export function getOrCreateSupabaseClient(options?: SupabaseClientOptions): SupabaseClient {
  if (clientInstance) {
    return clientInstance;
  }

  const url = options?.supabaseUrl || DEFAULT_SUPABASE_URL;
  const anonKey = options?.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY;

  clientInstance = createClient(url, anonKey, {
    auth: {
      storage: options?.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return clientInstance;
}

export { SupabaseClient };
