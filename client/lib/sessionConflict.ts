/**
 * Session Conflict Management
 *
 * Ensures only one account type (Consumer, Pro, Admin) is active at a time.
 * When attempting to login to a different account type, prompts the user to:
 * - Stay on their current session
 * - Logout and switch to the new account type
 */

import { consumerSupabase } from "@/lib/supabase";
import { proSupabase, clearProAuthStorage } from "@/lib/pro/supabase";
import { clearAuthed, clearConsumerAuthStorage } from "@/lib/auth";

export type AccountType = "consumer" | "pro" | "admin";

export type ActiveSession = {
  type: AccountType;
  email?: string;
  name?: string;
};

/**
 * Check if a Supabase session token is still valid (not expired)
 */
function isSessionValid(session: { expires_at?: number } | null): boolean {
  if (!session) return false;
  if (!session.expires_at) return true;
  // Add 60s buffer — treat as expired if less than 60s remaining
  return session.expires_at * 1000 > Date.now() + 60_000;
}

/**
 * Check if consumer session is active
 */
async function checkConsumerSession(): Promise<ActiveSession | null> {
  try {
    const { data } = await consumerSupabase.auth.getSession();
    if (data.session?.user && isSessionValid(data.session)) {
      return {
        type: "consumer",
        email: data.session.user.email || undefined,
      };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Check if pro session is active
 */
async function checkProSession(): Promise<ActiveSession | null> {
  try {
    const { data } = await proSupabase.auth.getSession();
    if (data.session?.user && isSessionValid(data.session)) {
      return {
        type: "pro",
        email: data.session.user.email || undefined,
      };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Check if admin session is active
 */
function checkAdminSession(): ActiveSession | null {
  try {
    const token = sessionStorage.getItem("sam_admin_session_token");
    if (!token) return null;

    // Decode the token to get user info
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const payload = JSON.parse(atob(parts[parts.length === 3 ? 1 : 0]));

    // Check if expired
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }

    return {
      type: "admin",
      email: payload.sub || undefined,
      name: payload.name || undefined,
    };
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Get all active sessions
 */
export async function getActiveSessions(): Promise<ActiveSession[]> {
  const sessions: ActiveSession[] = [];

  const [consumer, pro] = await Promise.all([
    checkConsumerSession(),
    checkProSession(),
  ]);

  if (consumer) sessions.push(consumer);
  if (pro) sessions.push(pro);

  const admin = checkAdminSession();
  if (admin) sessions.push(admin);

  return sessions;
}

/**
 * Check if there's a conflicting session when trying to login to a specific account type.
 * Only reports a conflict if the user is NOT already logged into the target type.
 * If both consumer & pro tokens exist but the user is trying to access consumer,
 * we don't show a conflict — the consumer session is already active.
 */
export async function checkSessionConflict(
  targetType: AccountType
): Promise<ActiveSession | null> {
  const sessions = await getActiveSessions();

  // If the user already has an active session of the target type, no conflict
  const hasTargetSession = sessions.some((s) => s.type === targetType);
  if (hasTargetSession) return null;

  // Find a session that is NOT the target type
  const conflicting = sessions.find((s) => s.type !== targetType);

  return conflicting || null;
}

/**
 * Clear a specific session type
 */
export async function clearSession(type: AccountType): Promise<void> {
  switch (type) {
    case "consumer":
      clearAuthed();
      clearConsumerAuthStorage();
      try {
        await consumerSupabase.auth.signOut({ scope: "local" });
      } catch {
        // Ignore
      }
      break;

    case "pro":
      clearProAuthStorage();
      try {
        await proSupabase.auth.signOut({ scope: "local" });
      } catch {
        // Ignore
      }
      break;

    case "admin":
      sessionStorage.removeItem("sam_admin_session_token");
      sessionStorage.removeItem("sam_admin_api_key");
      break;
  }
}

/**
 * Clear all sessions except the specified type
 */
export async function clearOtherSessions(keepType: AccountType): Promise<void> {
  const types: AccountType[] = ["consumer", "pro", "admin"];

  for (const type of types) {
    if (type !== keepType) {
      await clearSession(type);
    }
  }
}

/**
 * Clear all sessions
 */
export async function clearAllSessions(): Promise<void> {
  await clearSession("consumer");
  await clearSession("pro");
  await clearSession("admin");
}

/**
 * Get display name for account type
 */
export function getAccountTypeLabel(type: AccountType): string {
  switch (type) {
    case "consumer":
      return "Compte Utilisateur";
    case "pro":
      return "Espace Pro";
    case "admin":
      return "Administration";
  }
}

/**
 * Get redirect path for account type
 */
export function getAccountTypeRedirect(type: AccountType): string {
  switch (type) {
    case "consumer":
      return "/";
    case "pro":
      return "/pro";
    case "admin":
      return "/admin";
  }
}
