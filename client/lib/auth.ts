import { CONSUMER_AUTH_STORAGE_KEY, consumerSupabase } from "@/lib/supabase";

export const AUTH_STORAGE_KEY = "sam_auth";
export const AUTH_CHANGED_EVENT = "sam-auth-changed";
export const AUTH_MODAL_OPEN_EVENT = "sam-auth-modal-open";

// Trigger the auth modal to open from anywhere in the app
export function openAuthModal(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_MODAL_OPEN_EVENT));
  }
}

let initDone = false;
let authSubscription: { unsubscribe: () => void } | null = null;

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
    })
    .catch(async (e) => {
      if (isStaleConsumerAuthError(e)) await resetConsumerAuth();
      setAuthedFlag(false);
    });

  const { data } = consumerSupabase.auth.onAuthStateChange((_event, session) => {
    setAuthedFlag(Boolean(session));
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
 * Legacy helper used by some UI flows (e.g. after a successful AuthModal submit).
 * Prefer relying on initConsumerAuth + onAuthStateChange.
 */
export function markAuthed(): void {
  setAuthedFlag(true);
}

export function clearAuthed(): void {
  if (typeof window === "undefined") return;
  setAuthedFlag(false);
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
