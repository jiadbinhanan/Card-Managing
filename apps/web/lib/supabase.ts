import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mredhrvxhcdhityoouxa.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_thhGWSDaCViFfi7ym-do1g_EN4WHHb9'

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

