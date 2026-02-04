import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseProxyFetch } from "./supabase-proxy-fetch";

const env = import.meta.env as any;
const supabaseUrl = env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_KEY) as
  | string
  | undefined;

let cached: SupabaseClient | null = null;

export function getSuperadminSupabaseClient(): SupabaseClient {
  if (cached) return cached;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Supabase is not configured. Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  cached = createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      fetch: createSupabaseProxyFetch(supabaseUrl),
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "sam_superadmin_auth",
    },
  });

  return cached;
}

export const SUPERADMIN_BOOTSTRAP_EMAIL = (env.VITE_SUPERADMIN_BOOTSTRAP_EMAIL as string | undefined) ?? "";
export const SUPERADMIN_BOOTSTRAP_PASSWORD = (env.VITE_SUPERADMIN_BOOTSTRAP_PASSWORD as string | undefined) ?? "";
