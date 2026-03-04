import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminSupabase = SupabaseClient;

let cached: AdminSupabase | null = null;

export function getAdminSupabase(): AdminSupabase {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("SUPABASE_URL is missing");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  cached = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cached;
}

export function assertAdminApiEnabled(): { ok: true } | { ok: false; message: string } {
  const adminKey = process.env.ADMIN_API_KEY;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!adminKey) return { ok: false, message: "ADMIN_API_KEY is missing" };
  if (!url) return { ok: false, message: "SUPABASE_URL is missing" };
  if (!serviceRoleKey) return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY is missing" };

  return { ok: true };
}

export function checkAdminKey(requestHeaderValue: string | undefined): boolean {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return false;
  if (!requestHeaderValue) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(requestHeaderValue),
      Buffer.from(expected)
    );
  } catch { /* intentional: timingSafeEqual throws on length mismatch */
    return false;
  }
}
