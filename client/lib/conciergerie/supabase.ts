import { createClient } from "@supabase/supabase-js";

import { safeFetch } from "@/lib/safeFetch";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL is missing");
if (!supabaseAnonKey) throw new Error("VITE_SUPABASE_ANON_KEY is missing");

export const CONCIERGERIE_AUTH_STORAGE_KEY = "sam_conciergerie_auth_v1";

export function clearConciergerieAuthStorage() {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (k === CONCIERGERIE_AUTH_STORAGE_KEY || k.startsWith(`${CONCIERGERIE_AUTH_STORAGE_KEY}-`)) {
        keysToRemove.push(k);
      }
    }

    for (const k of keysToRemove) window.localStorage.removeItem(k);
  } catch {
    // ignore storage errors
  }
}

export const conciergerieSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: safeFetch as typeof fetch,
  },
  auth: {
    storageKey: CONCIERGERIE_AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    // Disable auto-detection of OAuth/PKCE codes in the URL.
    // Prevents consuming a PKCE code intended for Consumer/Pro flows.
    detectSessionInUrl: false,
  },
});
