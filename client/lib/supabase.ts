import { createClient } from "@supabase/supabase-js";

import { safeFetch } from "@/lib/safeFetch";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL is missing");
if (!supabaseAnonKey) throw new Error("VITE_SUPABASE_ANON_KEY is missing");

export const CONSUMER_AUTH_STORAGE_KEY = "sam_consumer_auth_v1";

export const consumerSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: safeFetch as typeof fetch,
  },
  auth: {
    storageKey: CONSUMER_AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
  },
});
