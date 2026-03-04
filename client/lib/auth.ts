import { CONSUMER_AUTH_STORAGE_KEY, consumerSupabase } from "@/lib/supabase";
import { clearProAuthStorage, proSupabase } from "@/lib/pro/supabase";
import { clearUserLocalData, getUserProfile, restoreAvatarFromBackup, saveUserProfile } from "@/lib/userData";
import { getMyConsumerMe } from "@/lib/consumerMeApi";

export const AUTH_STORAGE_KEY = "sam_auth";
export const AUTH_CHANGED_EVENT = "sam-auth-changed";
export const AUTH_MODAL_OPEN_EVENT = "sam-auth-modal-open";
export const ONBOARDING_NEEDED_EVENT = "sam-onboarding-needed";

export type OnboardingNeededDetail = {
  prefillFirstName?: string;
  prefillLastName?: string;
  prefillEmail?: string;
};

// Trigger the auth modal to open from anywhere in the app
export function openAuthModal(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_MODAL_OPEN_EVENT));
  }
}

let initDone = false;
let authSubscription: { unsubscribe: () => void } | null = null;
let onboardingDispatched = false;

let reactivateInFlight: Promise<void> | null = null;

async function bestEffortReactivateConsumerAccount(accessToken: string | null | undefined): Promise<void> {
  if (!accessToken) return;
  if (reactivateInFlight) return;

  reactivateInFlight = fetch("/api/consumer/account/reactivate", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      reactivateInFlight = null;
    });
}

type MaybeErrorWithMessage = { message?: unknown; name?: unknown };

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (isRecord(e) && typeof (e as MaybeErrorWithMessage).message === "string") {
    return (e as MaybeErrorWithMessage).message as string;
  }
  return String(e ?? "");
}

export function isStaleConsumerAuthError(e: unknown): boolean {
  const msg = getErrorMessage(e).toLowerCase();
  return (
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found") ||
    msg.includes("refresh_token_not_found") ||
    msg.includes("auth session missing")
  );
}

export function clearConsumerAuthStorage(): void {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (k === CONSUMER_AUTH_STORAGE_KEY || k.startsWith(`${CONSUMER_AUTH_STORAGE_KEY}-`)) {
        keysToRemove.push(k);
      }
    }

    for (const k of keysToRemove) window.localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

export async function resetConsumerAuth(): Promise<void> {
  try {
    clearConsumerAuthStorage();

    // v2 supports local scope (no network). Keep resilient if signature differs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (consumerSupabase.auth.signOut as any)({ scope: "local" });
  } catch {
    try {
      clearConsumerAuthStorage();
    } catch {
      // ignore
    }
  }
}

function setAuthedFlag(value: boolean) {
  if (typeof window === "undefined") return;

  try {
    if (value) window.localStorage.setItem(AUTH_STORAGE_KEY, "1");
    else window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }

  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

function cleanupConsumerAuthSubscription() {
  const w = window as unknown as {
    __sam_consumer_auth_subscription?: { unsubscribe: () => void } | null;
  };

  try {
    w.__sam_consumer_auth_subscription?.unsubscribe?.();
  } catch {
    // ignore
  }

  try {
    authSubscription?.unsubscribe();
  } catch {
    // ignore
  }

  authSubscription = null;
  w.__sam_consumer_auth_subscription = null;
}

/**
 * Fetch profile from the server and merge into localStorage.
 * Called after login / session restore so that profile data survives logout cycles.
 *
 * When `opts.checkOnboarding` is true (fresh SIGNED_IN event, typically after OAuth),
 * we check whether the profile is incomplete and dispatch ONBOARDING_NEEDED_EVENT
 * so the Header can open the onboarding wizard.
 */
let syncProfileInFlight: Promise<void> | null = null;

interface SyncProfileOpts {
  checkOnboarding?: boolean;
  userMetadata?: Record<string, unknown>;
}

function splitFullName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function syncProfileFromServer(opts?: SyncProfileOpts): Promise<void> {
  if (syncProfileInFlight) return syncProfileInFlight;

  syncProfileInFlight = (async () => {
    try {
      const me = await getMyConsumerMe();
      // Read current local profile to preserve local-only fields (avatar, preferences, etc.)
      const local = getUserProfile();

      saveUserProfile({
        firstName: me.first_name ?? local.firstName ?? undefined,
        lastName: me.last_name ?? local.lastName ?? undefined,
        contact: me.phone ?? local.contact ?? undefined,
        email: me.email ?? local.email ?? undefined,
        date_of_birth: me.date_of_birth ?? local.date_of_birth ?? undefined,
        city: me.city ?? local.city ?? undefined,
        country: me.country ?? local.country ?? undefined,
        socio_professional_status: (me.socio_professional_status ?? local.socio_professional_status ?? undefined) as any,
        preferences: local.preferences,
      });
      // Restore avatar from backup if it was lost during logout
      restoreAvatarFromBackup();

      // ── Check if onboarding is needed (OAuth first sign-in) ──
      if (opts?.checkOnboarding && !onboardingDispatched) {
        const isIncomplete =
          !me.first_name?.trim() ||
          !me.last_name?.trim() ||
          !me.date_of_birth?.trim() ||
          !me.city?.trim();

        if (isIncomplete) {
          onboardingDispatched = true;

          // Extract prefill data from OAuth user_metadata
          const meta = opts.userMetadata ?? {};
          let prefillFirstName = (meta.first_name as string) || undefined;
          let prefillLastName = (meta.last_name as string) || undefined;

          // If no split name, try full_name or name
          if (!prefillFirstName) {
            const fullName = (meta.full_name as string) || (meta.name as string) || "";
            if (fullName.trim()) {
              const { first, last } = splitFullName(fullName);
              prefillFirstName = first || undefined;
              prefillLastName = prefillLastName || last || undefined;
            }
          }

          const detail: OnboardingNeededDetail = {
            prefillFirstName: me.first_name?.trim() || prefillFirstName,
            prefillLastName: me.last_name?.trim() || prefillLastName,
            prefillEmail: me.email || (meta.email as string) || undefined,
          };

          window.dispatchEvent(new CustomEvent(ONBOARDING_NEEDED_EVENT, { detail }));
        }
      }
    } catch (e) {
      // Failed to sync profile from server
    }
  })().finally(() => {
    syncProfileInFlight = null;
  });

  return syncProfileInFlight;
}

export function initConsumerAuth(): void {
  if (typeof window === "undefined") return;
  if (initDone) return;
  initDone = true;

  // In dev (HMR), modules can be re-evaluated. Ensure we don't keep dangling subscriptions.
  cleanupConsumerAuthSubscription();

  void consumerSupabase.auth
    .getSession()
    .then(async ({ data, error }) => {
      if (error) {
        if (isStaleConsumerAuthError(error)) await resetConsumerAuth();
        setAuthedFlag(false);
        return;
      }

      setAuthedFlag(Boolean(data.session));
      void bestEffortReactivateConsumerAccount(data.session?.access_token);
      if (data.session) syncProfileFromServer();
    })
    .catch(async (e) => {
      if (isStaleConsumerAuthError(e)) await resetConsumerAuth();
      setAuthedFlag(false);
    });

  const { data } = consumerSupabase.auth.onAuthStateChange((event, session) => {
    setAuthedFlag(Boolean(session));
    if (session) {
      // [FIX-AUTH] Only clear other sessions on a FRESH sign-in, NOT on
      // token refresh / initial session restore. This prevents wiping
      // Pro/Admin sessions every time the consumer token auto-refreshes.
      const isNewSignIn = event === "SIGNED_IN";
      if (isNewSignIn) {
        clearOtherSessionsForConsumer();
      }
      syncProfileFromServer(
        isNewSignIn
          ? {
              checkOnboarding: true,
              userMetadata: (session.user?.user_metadata as Record<string, unknown>) ?? undefined,
            }
          : undefined
      );
    }
    void bestEffortReactivateConsumerAccount(session?.access_token);
  });

  authSubscription = data.subscription;
  (window as unknown as { __sam_consumer_auth_subscription?: { unsubscribe: () => void } | null }).__sam_consumer_auth_subscription =
    data.subscription;

  // Cleanup on full page unload.
  window.addEventListener("beforeunload", cleanupConsumerAuthSubscription, { once: true });

  // Cleanup on hot reload dispose.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cleanupConsumerAuthSubscription();
      initDone = false;
    });
  }
}

export function isAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTH_STORAGE_KEY) === "1";
}

/**
 * Clear any leftover Pro / Admin sessions.
 * Called when a Consumer successfully authenticates so that only one
 * account type is active at a time.
 */
function clearOtherSessionsForConsumer(): void {
  // Clear Pro tokens
  clearProAuthStorage();
  try {
    void proSupabase.auth.signOut({ scope: "local" });
  } catch {
    // ignore
  }

  // Clear Admin tokens
  try {
    sessionStorage.removeItem("sam_admin_session_token");
    sessionStorage.removeItem("sam_admin_api_key");
  } catch {
    // ignore
  }
}

/**
 * Legacy helper used by some UI flows (e.g. after a successful AuthModal submit).
 * Prefer relying on initConsumerAuth + onAuthStateChange.
 */
export function markAuthed(): void {
  clearOtherSessionsForConsumer();
  setAuthedFlag(true);
}

export function clearAuthed(): void {
  if (typeof window === "undefined") return;
  onboardingDispatched = false;
  setAuthedFlag(false);
  clearUserLocalData(); // Clear profile/bookings/favorites from localStorage so next user starts fresh
  void resetConsumerAuth();
}

export async function getConsumerAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await consumerSupabase.auth.getSession();
    if (error) {
      if (isStaleConsumerAuthError(error)) await resetConsumerAuth();
      return null;
    }

    return data.session?.access_token ?? null;
  } catch (e) {
    if (isStaleConsumerAuthError(e)) await resetConsumerAuth();
    return null;
  }
}

export async function getConsumerUserId(): Promise<string | null> {
  try {
    const { data, error } = await consumerSupabase.auth.getSession();
    if (error) {
      if (isStaleConsumerAuthError(error)) await resetConsumerAuth();
      return null;
    }

    return data.session?.user?.id ?? null;
  } catch (e) {
    if (isStaleConsumerAuthError(e)) await resetConsumerAuth();
    return null;
  }
}

/**
 * Get the consumer's email from the current auth session.
 * Returns null if not authenticated or if using phone auth without email.
 */
export async function getConsumerEmail(): Promise<string | null> {
  try {
    const { data, error } = await consumerSupabase.auth.getSession();
    if (error) {
      if (isStaleConsumerAuthError(error)) await resetConsumerAuth();
      return null;
    }

    const email = data.session?.user?.email ?? null;
    // Filter out synthetic phone emails (e.g., +212xxx@phone.sortiraumaroc.ma)
    if (email && email.endsWith("@phone.sortiraumaroc.ma")) {
      return null;
    }
    return email;
  } catch (e) {
    if (isStaleConsumerAuthError(e)) await resetConsumerAuth();
    return null;
  }
}

/**
 * Get the consumer's phone from user metadata (if authenticated via phone).
 * Returns null if not authenticated or if using email auth.
 */
export async function getConsumerPhone(): Promise<string | null> {
  try {
    const { data, error } = await consumerSupabase.auth.getSession();
    if (error) {
      if (isStaleConsumerAuthError(error)) await resetConsumerAuth();
      return null;
    }

    const user = data.session?.user;
    if (!user) return null;

    // Phone can be in user.phone or in user_metadata.phone
    const phone = user.phone || (user.user_metadata?.phone as string | undefined);
    return phone ?? null;
  } catch (e) {
    if (isStaleConsumerAuthError(e)) await resetConsumerAuth();
    return null;
  }
}

export type ConsumerAuthInfo = {
  userId: string | null;
  email: string | null;
  phone: string | null;
  authMethod: "email" | "phone" | null;
};

/**
 * Get comprehensive auth info for the current consumer.
 * Useful for determining which auth method was used and which identifier to display.
 */
export async function getConsumerAuthInfo(): Promise<ConsumerAuthInfo> {
  try {
    const { data, error } = await consumerSupabase.auth.getSession();
    if (error) {
      if (isStaleConsumerAuthError(error)) await resetConsumerAuth();
      return { userId: null, email: null, phone: null, authMethod: null };
    }

    const user = data.session?.user;
    if (!user) {
      return { userId: null, email: null, phone: null, authMethod: null };
    }

    const rawEmail = user.email ?? null;
    const isPhoneEmail = rawEmail?.endsWith("@phone.sortiraumaroc.ma") ?? false;
    const email = rawEmail && !isPhoneEmail ? rawEmail : null;

    const phone = user.phone || (user.user_metadata?.phone as string | undefined) || null;

    // Determine auth method
    let authMethod: "email" | "phone" | null = null;
    if (isPhoneEmail || phone) {
      authMethod = "phone";
    } else if (email) {
      authMethod = "email";
    }

    return {
      userId: user.id,
      email,
      phone,
      authMethod,
    };
  } catch (e) {
    if (isStaleConsumerAuthError(e)) await resetConsumerAuth();
    return { userId: null, email: null, phone: null, authMethod: null };
  }
}
