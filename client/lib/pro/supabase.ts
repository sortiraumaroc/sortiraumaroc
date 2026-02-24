import { createClient } from "@supabase/supabase-js";

import { safeFetch } from "@/lib/safeFetch";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL is missing");
if (!supabaseAnonKey) throw new Error("VITE_SUPABASE_ANON_KEY is missing");

export const PRO_AUTH_STORAGE_KEY = "sam_pro_auth_v1";

export function clearProAuthStorage() {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (k === PRO_AUTH_STORAGE_KEY || k.startsWith(`${PRO_AUTH_STORAGE_KEY}-`)) {
        keysToRemove.push(k);
      }
    }

    for (const k of keysToRemove) window.localStorage.removeItem(k);
  } catch {
    // ignore storage errors
  }
}

export const proSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: safeFetch as typeof fetch,
  },
  auth: {
    storageKey: PRO_AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
