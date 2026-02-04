import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Cached = { client: SupabaseClient };

let cached: Cached | null = null;

export function getServerSupabaseClient(): SupabaseClient {
  if (cached) return cached.client;

  const url = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const key = serviceRoleKey || publishableKey;

  if (!url || !key) {
    throw new Error(
      "Missing VITE_SUPABASE_URL and/or Supabase key on server. Provide VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  cached = { client };
  return client;
}

export function hasServerSupabaseServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Verify a Supabase access token and return user data
 * Used for SSO authentication with SAM
 */
export async function verifySupabaseToken(token: string): Promise<{
  userId: string;
  email: string;
} | null> {
  try {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      console.error("Supabase token verification failed:", error?.message);
      return null;
    }

    return {
      userId: data.user.id,
      email: data.user.email || "",
    };
  } catch (error) {
    console.error("Supabase token verification error:", error);
    return null;
  }
}

/**
 * Get user from Supabase by ID (requires service role key)
 */
export async function getSupabaseUserById(userId: string) {
  try {
    if (!hasServerSupabaseServiceRole()) {
      console.warn("getSupabaseUserById requires SUPABASE_SERVICE_ROLE_KEY");
      return null;
    }

    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase.auth.admin.getUserById(userId);

    if (error || !data.user) {
      return null;
    }

    return data.user;
  } catch (error) {
    console.error("Get Supabase user error:", error);
    return null;
  }
}
