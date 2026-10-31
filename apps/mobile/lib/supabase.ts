import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mredhrvxhcdhityoouxa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_thhGWSDaCViFfi7ym-do1g_EN4WHHb9';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
