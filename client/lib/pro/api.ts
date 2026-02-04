import { clearProAuthStorage, proSupabase } from "./supabase";
import type {
  Establishment,
  EstablishmentProfileDraft,
  ProInventoryCategory,
  ProInventoryItem,
  ProMembership,
  ProCampaign,
} from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

export function apiUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

type MaybeErrorWithMessage = { message?: unknown; name?: unknown };

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (isRecord(e) && typeof (e as MaybeErrorWithMessage).message === "string")
    return (e as MaybeErrorWithMessage).message as string;
  return String(e ?? "");
}

export function isStaleProAuthError(e: unknown): boolean {
  const msg = getErrorMessage(e).toLowerCase();
  return (
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found") ||
    msg.includes("refresh_token_not_found") ||
    msg.includes("auth session missing")
  );
}

export async function resetProAuth(): Promise<void> {
  try {
    // Always clear local storage even if the network request fails.
    clearProAuthStorage();

    // v2 supports local scope (no network), but keep this resilient to older signatures.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (proSupabase.auth.signOut as any)({ scope: "local" });
  } catch {
    try {
      clearProAuthStorage();
    } catch {
      // ignore
    }
  }
}

async function requireProSession() {
  const { data, error, staleAuth } = await getProSession();
  if (error) throw error;
  if (staleAuth)
    throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
  if (!data.session) throw new Error("Not authenticated");
  return data.session;
}

export async function requireProAccessToken(): Promise<string> {
  const session = await requireProSession();
  const token = session.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

/**
 * Generic fetch wrapper for Pro API calls.
 * Handles authentication, error handling, and JSON parsing.
 */
export async function proApiFetch(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const token = await requireProAccessToken();

  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload;
}

// Synchronous token getter for partner pages that need immediate access
// Returns the cached token from localStorage (set by Supabase auth)
export function getPartnerToken(): string | null {
  try {
    // Try to get the session from localStorage (Supabase stores it there)
    const storageKey = Object.keys(localStorage).find(
      (key) => key.includes("supabase") && key.includes("auth-token")
    );
    if (!storageKey) return null;
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}

async function requireProUserId(): Promise<string> {
  const session = await requireProSession();
  const userId = session.user?.id;
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

export async function getProSession() {
  try {
    // Keep original signature but proactively reset invalid refresh tokens.
    const { data, error } = await proSupabase.auth.getSession();
    if (error && isStaleProAuthError(error)) {
      await resetProAuth();
      return { data: { session: null }, error: null, staleAuth: true } as const;
    }
    return { data, error, staleAuth: false } as const;
  } catch (e) {
    if (isStaleProAuthError(e)) {
      await resetProAuth();
      return { data: { session: null }, error: null, staleAuth: true } as const;
    }
    return { data: { session: null }, error: null, staleAuth: false } as const;
  }
}

export async function proSignInWithPassword(args: {
  email: string;
  password: string;
}) {
  return proSupabase.auth.signInWithPassword({
    email: args.email,
    password: args.password,
  });
}

export async function proSignUpWithPassword(args: {
  email: string;
  password: string;
}) {
  return proSupabase.auth.signUp({
    email: args.email,
    password: args.password,
  });
}

export async function proSignOut() {
  await resetProAuth();
}

export async function listMyEstablishments(): Promise<Establishment[]> {
  const token = await requireProAccessToken();

  const res = await fetch(apiUrl("/api/pro/my/establishments"), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  const establishments =
    isRecord(payload) && Array.isArray(payload.establishments)
      ? (payload.establishments as Establishment[])
      : [];

  return establishments;
}

export async function listMyMemberships(): Promise<ProMembership[]> {
  const token = await requireProAccessToken();

  const res = await fetch(apiUrl("/api/pro/my/memberships"), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  const memberships =
    isRecord(payload) && Array.isArray(payload.memberships)
      ? (payload.memberships as ProMembership[])
      : [];

  return memberships;
}

export async function activateOwnerMembership(args: {
  establishmentId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/activate-owner`,
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function listEstablishmentProfileDrafts(
  establishmentId: string,
): Promise<EstablishmentProfileDraft[]> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(establishmentId)}/profile-drafts`,
    ),
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  const drafts =
    isRecord(payload) && Array.isArray(payload.drafts)
      ? (payload.drafts as EstablishmentProfileDraft[])
      : [];
  return drafts;
}

export async function listEstablishmentProfileDraftChanges(args: {
  establishmentId: string;
  draftId: string;
}): Promise<unknown[]> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/profile-drafts/${encodeURIComponent(args.draftId)}/changes`,
    ),
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return isRecord(payload) && Array.isArray(payload.changes)
    ? (payload.changes as unknown[])
    : [];
}

export async function submitEstablishmentProfileUpdate(args: {
  establishmentId: string;
  data: Record<string, unknown>;
}): Promise<{ ok: true; draft_id: string; moderation_id: string }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/profile-update`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.data),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; draft_id: string; moderation_id: string };
}

export async function createManualReservation(args: {
  establishmentId: string;
  data: {
    starts_at: string;
    ends_at?: string | null;
    status?: string;
    payment_status?: string;
    party_size?: number | null;
    amount_total?: number | null;
    amount_deposit?: number | null;
    currency?: string;
    kind?: string;
    meta?: Record<string, unknown>;
  };
}): Promise<{ ok: true; reservation_id: string }> {
  const token = await requireProAccessToken();

  // payment_status is managed server-side.
  const { payment_status: _paymentStatusIgnored, ...dataSafe } = args.data;

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/reservations/manual`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(dataSafe),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; reservation_id: string };
}

export async function seedFakeReservations(args: {
  establishmentId: string;
  countPerStatus?: number;
}): Promise<{ ok: true; inserted: number; batch_id: string }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/reservations/seed`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ count_per_status: args.countPerStatus ?? 2 }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; inserted: number; batch_id: string };
}

export async function listProReservations(establishmentId: string) {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/reservations`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; reservations: unknown[] };
}

export async function listProWaitlist(args: {
  establishmentId: string;
  status?: "active" | "waiting" | "offer_sent" | "all";
}): Promise<{ ok: true; items: unknown[] }> {
  const token = await requireProAccessToken();

  const qs = new URLSearchParams();
  qs.set("status", args.status ?? "active");

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/waitlist?${qs.toString()}`,
    ),
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; items: unknown[] };
}

export async function sendProWaitlistOffer(args: {
  waitlistEntryId: string;
  slotId?: string | null;
}): Promise<{ ok: true; result: unknown }> {
  const token = await requireProAccessToken();

  const body = args.slotId ? { slot_id: args.slotId } : {};

  const res = await fetch(
    apiUrl(
      `/api/pro/waitlist/${encodeURIComponent(args.waitlistEntryId)}/send-offer`,
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; result: unknown };
}

export async function closeProWaitlistEntry(args: {
  waitlistEntryId: string;
  reason?: string | null;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/waitlist/${encodeURIComponent(args.waitlistEntryId)}/close`,
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ reason: args.reason ?? "" }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function listProReservationMessageTemplates(
  establishmentId: string,
) {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/reservation-message-templates`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; templates: unknown[] };
}

export async function createProReservationMessageTemplate(args: {
  establishmentId: string;
  code: string;
  label: string;
  body: string;
  is_active?: boolean;
}): Promise<{ ok: true; id: string | null }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/reservation-message-templates`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        code: args.code,
        label: args.label,
        body: args.body,
        is_active: args.is_active ?? true,
      }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; id: string | null };
}

export async function updateProReservationMessageTemplate(args: {
  establishmentId: string;
  templateId: string;
  patch: {
    code?: string;
    label?: string;
    body?: string;
    is_active?: boolean;
  };
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/reservation-message-templates/${encodeURIComponent(args.templateId)}/update`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.patch),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function listProOffers(establishmentId: string) {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/offers`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; slots: unknown[]; packs: unknown[] };
}

export async function upsertProSlots(args: {
  establishmentId: string;
  slots: Array<Record<string, unknown>>;
}): Promise<{ ok: true; upserted: number }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/slots/upsert`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ slots: args.slots }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; upserted: number };
}

export async function deleteProSlot(args: {
  establishmentId: string;
  slotId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/slots/${encodeURIComponent(args.slotId)}/delete`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function createProPack(args: {
  establishmentId: string;
  pack: {
    title: string;
    description?: string | null;
    label?: string | null;
    price: number;
    original_price?: number | null;
    is_limited?: boolean;
    stock?: number | null;
    availability?: string;
    valid_from?: string | null;
    valid_to?: string | null;
    conditions?: string | null;
    active?: boolean;
  };
}): Promise<{ ok: true; id: string | null }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/packs`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: args.pack.title,
        description: args.pack.description ?? null,
        label: args.pack.label ?? null,
        items: [],
        price: args.pack.price,
        original_price: args.pack.original_price ?? null,
        is_limited: args.pack.is_limited ?? false,
        stock: args.pack.stock ?? null,
        availability: args.pack.availability ?? "permanent",
        max_reservations: null,
        active: args.pack.active ?? true,
        valid_from: args.pack.valid_from ?? null,
        valid_to: args.pack.valid_to ?? null,
        conditions: args.pack.conditions ?? null,
      }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; id: string | null };
}

export async function deleteProPack(args: {
  establishmentId: string;
  packId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/packs/${encodeURIComponent(args.packId)}/delete`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function updateProPack(args: {
  establishmentId: string;
  packId: string;
  patch: {
    title?: string;
    description?: string | null;
    label?: string | null;
    price?: number;
    original_price?: number | null;
    is_limited?: boolean;
    stock?: number | null;
    availability?: string;
    active?: boolean;
    valid_from?: string | null;
    valid_to?: string | null;
    conditions?: string | null;
  };
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/packs/${encodeURIComponent(args.packId)}/update`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.patch),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function getProBookingPolicy(establishmentId: string) {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/booking-policies`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; policy: Record<string, unknown> };
}

export async function updateProBookingPolicy(args: {
  establishmentId: string;
  patch: Record<string, unknown>;
}) {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/booking-policies/update`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.patch),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; policy: Record<string, unknown> };
}

export type ProConsumerPromoCode = {
  id: string;
  code: string;
  description: string | null;
  discount_bps: number;
  applies_to_pack_id: string | null;
  applies_to_establishment_ids: string[] | null;
  active: boolean;
  is_public: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_uses_total: number | null;
  max_uses_per_user: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export async function listProConsumerPromoCodes(
  establishmentId: string,
): Promise<ProConsumerPromoCode[]> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/consumer/promo-codes`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  const promoCodes =
    isRecord(payload) && Array.isArray(payload.promo_codes)
      ? (payload.promo_codes as ProConsumerPromoCode[])
      : [];
  return promoCodes;
}

export async function createProConsumerPromoCode(args: {
  establishmentId: string;
  code?: string | null;
  discount_bps: number;
  description?: string | null;
  is_public?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  max_uses_total?: number | null;
  max_uses_per_user?: number | null;
}): Promise<ProConsumerPromoCode> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/consumer/promo-codes`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        code: args.code ?? null,
        discount_bps: args.discount_bps,
        description: args.description ?? null,
        is_public: args.is_public ?? false,
        starts_at: args.starts_at ?? null,
        ends_at: args.ends_at ?? null,
        max_uses_total: args.max_uses_total ?? null,
        max_uses_per_user: args.max_uses_per_user ?? null,
      }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  const promo = isRecord(payload)
    ? (payload.promo_code as ProConsumerPromoCode | undefined)
    : undefined;
  if (!promo?.id) throw new Error("Réponse invalide");
  return promo;
}

export async function updateProConsumerPromoCode(args: {
  establishmentId: string;
  promoId: string;
  patch: {
    discount_bps?: number;
    description?: string | null;
    active?: boolean;
    is_public?: boolean;
    starts_at?: string | null;
    ends_at?: string | null;
    max_uses_total?: number | null;
    max_uses_per_user?: number | null;
  };
}): Promise<ProConsumerPromoCode> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/consumer/promo-codes/${encodeURIComponent(args.promoId)}/update`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.patch),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  const promo = isRecord(payload)
    ? (payload.promo_code as ProConsumerPromoCode | undefined)
    : undefined;
  if (!promo?.id) throw new Error("Réponse invalide");
  return promo;
}

export async function deleteProConsumerPromoCode(args: {
  establishmentId: string;
  promoId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/consumer/promo-codes/${encodeURIComponent(args.promoId)}/delete`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

// =============================================================================
// PROMO ANALYTICS
// =============================================================================

export type ProPromoAnalytic = {
  id: string;
  code: string;
  discount_bps: number;
  is_public: boolean;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_uses_total: number | null;
  max_uses_per_user: number | null;
  total_uses: number;
  total_revenue_generated: number;
  total_discount_given: number;
  created_at: string;
  usage_count: number;
  revenue_generated: number;
  discount_given: number;
  conversion_rate: number | null;
};

export type ProPromoAnalyticsResponse = {
  ok: true;
  analytics: ProPromoAnalytic[];
  summary: {
    total_codes: number;
    total_usage: number;
    total_revenue: number;
    total_discount: number;
  };
};

export async function getProPromoAnalytics(
  establishmentId: string,
): Promise<ProPromoAnalyticsResponse> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/promo-analytics`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as ProPromoAnalyticsResponse;
}

// =============================================================================
// PROMO TEMPLATES
// =============================================================================

export type ProPromoTemplate = {
  id: string;
  establishment_id: string;
  name: string;
  description: string | null;
  discount_bps: number;
  is_public: boolean;
  max_uses_total: number | null;
  max_uses_per_user: number | null;
  min_cart_amount: number | null;
  valid_days_of_week: number[] | null;
  valid_hours_start: string | null;
  valid_hours_end: string | null;
  first_purchase_only: boolean;
  new_customers_only: boolean;
  applies_to_pack_ids: string[] | null;
  applies_to_slot_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

export async function listProPromoTemplates(
  establishmentId: string,
): Promise<ProPromoTemplate[]> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/promo-templates`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return isRecord(payload) && Array.isArray(payload.templates)
    ? (payload.templates as ProPromoTemplate[])
    : [];
}

export async function createProPromoTemplate(args: {
  establishmentId: string;
  template: {
    name: string;
    description?: string | null;
    discount_bps: number;
    is_public?: boolean;
    max_uses_total?: number | null;
    max_uses_per_user?: number | null;
    min_cart_amount?: number | null;
    valid_days_of_week?: number[] | null;
    valid_hours_start?: string | null;
    valid_hours_end?: string | null;
    first_purchase_only?: boolean;
    new_customers_only?: boolean;
    applies_to_pack_ids?: string[] | null;
    applies_to_slot_ids?: string[] | null;
  };
}): Promise<ProPromoTemplate> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/promo-templates`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.template),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  const template = isRecord(payload)
    ? (payload.template as ProPromoTemplate | undefined)
    : undefined;
  if (!template?.id) throw new Error("Réponse invalide");
  return template;
}

export async function updateProPromoTemplate(args: {
  establishmentId: string;
  templateId: string;
  patch: Partial<ProPromoTemplate>;
}): Promise<ProPromoTemplate> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/promo-templates/${encodeURIComponent(args.templateId)}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.patch),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  const template = isRecord(payload)
    ? (payload.template as ProPromoTemplate | undefined)
    : undefined;
  if (!template?.id) throw new Error("Réponse invalide");
  return template;
}

export async function deleteProPromoTemplate(args: {
  establishmentId: string;
  templateId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/promo-templates/${encodeURIComponent(args.templateId)}`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function createPromoFromTemplate(args: {
  establishmentId: string;
  templateId: string;
  code?: string;
  starts_at?: string | null;
  ends_at?: string | null;
}): Promise<ProConsumerPromoCode> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/promo-templates/${encodeURIComponent(args.templateId)}/create-promo`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        code: args.code,
        starts_at: args.starts_at,
        ends_at: args.ends_at,
      }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  const promo = isRecord(payload)
    ? (payload.promo_code as ProConsumerPromoCode | undefined)
    : undefined;
  if (!promo?.id) throw new Error("Réponse invalide");
  return promo;
}

// =============================================================================
// PROMO CSV EXPORT
// =============================================================================

export function getProPromoCodesCsvUrl(establishmentId: string): string {
  return `/api/pro/establishments/${encodeURIComponent(establishmentId)}/promo-codes/export-csv`;
}

export async function getProDashboardMetrics(args: {
  establishmentId: string;
  since: string;
  until: string;
}) {
  const token = await requireProAccessToken();

  const qs = new URLSearchParams();
  qs.set("since", args.since);
  qs.set("until", args.until);

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/dashboard/metrics?${qs.toString()}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as {
    ok: true;
    reservations: unknown[];
    visits: unknown[];
    packPurchases: unknown[];
  };
}

export async function getProDashboardAlerts(establishmentId: string) {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/dashboard/alerts`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as {
    ok: true;
    invoicesDue: unknown[];
    notifications: unknown[];
    dayWindow?: { start: string; end: string };
  };
}

// ---------------------------------------------------------------------------
// Phase 7: Pro partner-facing impact report (read-only)
// ---------------------------------------------------------------------------

export type ProImpactMetricBlock = {
  eligible: number;
  no_shows: number;
  honored: number;
  protected: number;
  no_show_rate: number;
  honored_rate: number;
  protected_share: number;
};

export type ProImpactSeriesRow = {
  week_start: string;
  eligible: number;
  no_shows: number;
  protected: number;
  no_show_rate: number;
  protected_share: number;
};

export type ProImpactReport = {
  ok: true;
  generated_at: string;
  periods: {
    before: { start: string; end: string };
    after: { start: string; end: string };
    series: { start: string; end: string; weeks: number };
  };
  kpi: {
    before: ProImpactMetricBlock;
    after: ProImpactMetricBlock;
    after_protected: ProImpactMetricBlock;
    after_non_protected: ProImpactMetricBlock;
    series: ProImpactSeriesRow[];
    assumptions: {
      eligible_status_excluded: string[];
      honored_definition: string;
      no_show_definition: string;
      protected_definition: string;
    };
  };
};

export async function getProImpactReport(args: {
  establishmentId: string;
  after_start?: string;
  after_end?: string;
  before_start?: string;
  before_end?: string;
  series_weeks?: number;
}): Promise<ProImpactReport> {
  const token = await requireProAccessToken();

  const qs = new URLSearchParams();
  if (args.after_start) qs.set("after_start", args.after_start);
  if (args.after_end) qs.set("after_end", args.after_end);
  if (args.before_start) qs.set("before_start", args.before_start);
  if (args.before_end) qs.set("before_end", args.before_end);
  if (
    typeof args.series_weeks === "number" &&
    Number.isFinite(args.series_weeks)
  ) {
    qs.set("series_weeks", String(Math.floor(args.series_weeks)));
  }

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/impact?${qs.toString()}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as ProImpactReport;
}

export async function listProNotifications(args: {
  establishmentId: string;
  from?: string;
  to?: string;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<{ ok: true; unreadCount: number; notifications: unknown[] }> {
  const token = await requireProAccessToken();

  const qs = new URLSearchParams();
  if (args.from) qs.set("from", args.from);
  if (args.to) qs.set("to", args.to);
  if (args.limit != null) qs.set("limit", String(args.limit));
  if (args.unreadOnly) qs.set("unread_only", "true");

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/notifications?${qs.toString()}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; unreadCount: number; notifications: unknown[] };
}

export async function markProNotificationRead(args: {
  establishmentId: string;
  notificationId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/notifications/${encodeURIComponent(args.notificationId)}/read`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function markAllProNotificationsRead(args: {
  establishmentId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/notifications/mark-all-read`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function deleteProNotification(args: {
  establishmentId: string;
  notificationId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/notifications/${encodeURIComponent(args.notificationId)}`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function listProInvoices(args: {
  establishmentId: string;
  status?: string;
  limit?: number;
}): Promise<{ ok: true; invoices: unknown[] }> {
  const token = await requireProAccessToken();

  const qs = new URLSearchParams();
  if (args.status) qs.set("status", args.status);
  if (args.limit != null) qs.set("limit", String(args.limit));

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/invoices?${qs.toString()}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; invoices: unknown[] };
}

type ProFinanceInvoiceSummary = {
  id: string;
  invoice_number: string;
  issued_at: string;
  amount_cents: number;
  currency: string;
  reference_type: string;
  reference_id: string;
};

export async function getProInvoiceFinanceInvoice(args: {
  establishmentId: string;
  invoiceId: string;
}): Promise<{ ok: true; invoice: ProFinanceInvoiceSummary }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/invoices/${encodeURIComponent(args.invoiceId)}/finance-invoice`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; invoice: ProFinanceInvoiceSummary };
}

export async function listProInventory(
  establishmentId: string,
): Promise<{
  ok: true;
  categories: ProInventoryCategory[];
  items: ProInventoryItem[];
}> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/inventory`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as {
    ok: true;
    categories: ProInventoryCategory[];
    items: ProInventoryItem[];
  };
}

export async function seedDemoProInventory(
  establishmentId: string,
): Promise<
  | {
      ok: true;
      inserted: { categories: number; items: number; variants: number };
    }
  | { ok: true; skipped: true; reason: string }
> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/inventory/demo-seed`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as
    | {
        ok: true;
        inserted: { categories: number; items: number; variants: number };
      }
    | { ok: true; skipped: true; reason: string };
}

export type ProInventoryPendingResponse = {
  ok: true;
  pending: true;
  message: string;
  pendingChange?: unknown;
};

export async function createProInventoryCategory(args: {
  establishmentId: string;
  data: {
    title: string;
    parent_id?: string | null;
    description?: string | null;
    sort_order?: number;
    is_active?: boolean;
  };
}): Promise<{ ok: true; category: ProInventoryCategory } | ProInventoryPendingResponse> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/categories`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.data),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; category: ProInventoryCategory } | ProInventoryPendingResponse;
}

export async function updateProInventoryCategory(args: {
  establishmentId: string;
  categoryId: string;
  patch: Partial<
    Pick<
      ProInventoryCategory,
      "title" | "description" | "sort_order" | "is_active"
    >
  >;
}): Promise<{ ok: true; category: ProInventoryCategory } | ProInventoryPendingResponse> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/categories/${encodeURIComponent(args.categoryId)}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.patch),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; category: ProInventoryCategory } | ProInventoryPendingResponse;
}

export async function deleteProInventoryCategory(args: {
  establishmentId: string;
  categoryId: string;
}): Promise<{ ok: true } | ProInventoryPendingResponse> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/categories/${encodeURIComponent(args.categoryId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true } | ProInventoryPendingResponse;
}

type ProInventoryVariantUpsert = {
  title?: string | null;
  quantity?: number | null;
  unit?: string | null;
  price: number;
  currency?: string;
  sort_order?: number;
  is_active?: boolean;
};

type ProInventoryItemUpsertInput = {
  category_id?: string | null;
  title: string;
  description?: string | null;
  labels?: string[];
  photos?: string[];
  base_price?: number | null;
  currency?: string;
  is_active?: boolean;
  visible_when_unavailable?: boolean;
  scheduled_reactivation_at?: string | null;
  meta?: Record<string, unknown>;
  variants?: ProInventoryVariantUpsert[];
};

export async function createProInventoryItem(args: {
  establishmentId: string;
  data: ProInventoryItemUpsertInput;
}): Promise<{ ok: true; item: ProInventoryItem } | ProInventoryPendingResponse> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/items`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.data),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; item: ProInventoryItem } | ProInventoryPendingResponse;
}

export async function updateProInventoryItem(args: {
  establishmentId: string;
  itemId: string;
  patch: Partial<ProInventoryItemUpsertInput>;
}): Promise<{ ok: true; item: ProInventoryItem } | ProInventoryPendingResponse> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/items/${encodeURIComponent(args.itemId)}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.patch),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; item: ProInventoryItem } | ProInventoryPendingResponse;
}

export async function deleteProInventoryItem(args: {
  establishmentId: string;
  itemId: string;
}): Promise<{ ok: true } | ProInventoryPendingResponse> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/items/${encodeURIComponent(args.itemId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true } | ProInventoryPendingResponse;
}

export async function greenThumbProInventoryItem(args: {
  establishmentId: string;
  itemId: string;
}): Promise<{ ok: true; popularity: number }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/items/${encodeURIComponent(args.itemId)}/green-thumb`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; popularity: number };
}

export async function updateProReservation(args: {
  establishmentId: string;
  reservationId: string;
  patch: {
    status?: string;
    payment_status?: string;
    checked_in_at?: string | null;
    starts_at?: string;
    party_size?: number;
    slot_id?: string | null;
    refusal_reason_code?: string | null;
    refusal_reason_custom?: string | null;
    is_from_waitlist?: boolean;
    pro_message?: string;
    template_code?: string | null;
    meta_patch?: Record<string, unknown>;
    meta_delete_keys?: string[];
  };
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  // Payment status is managed server-side (webhook/admin), not by Pro UI.
  // Keep backward compatibility if callers still pass payment_status.
  const { payment_status: _paymentStatusIgnored, ...patchSafe } = args.patch;

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/reservations/${encodeURIComponent(args.reservationId)}/update`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(patchSafe),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function createInitialEstablishment(args: {
  name: string;
  city: string;
  universe: Establishment["universe"];
  contactName: string;
  contactPhone: string | null;
}): Promise<Establishment> {
  const token = await requireProAccessToken();

  const res = await fetch(apiUrl("/api/pro/establishments"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: args.name,
      city: args.city,
      universe: args.universe,
      contact_name: args.contactName,
      contact_phone: args.contactPhone,
    }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  const establishment = isRecord(payload)
    ? (payload.establishment as Establishment | undefined)
    : undefined;
  if (!establishment) throw new Error("Impossible de créer l’établissement");

  return establishment;
}

export async function submitProOnboardingRequest(args: {
  establishmentName?: string | null;
  city?: string | null;
  universe?: string | null;
  contactName?: string;
  phone?: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(apiUrl("/api/pro/onboarding-request"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      establishment_name:
        typeof args.establishmentName === "string" &&
        args.establishmentName.trim()
          ? args.establishmentName.trim()
          : null,
      city:
        typeof args.city === "string" && args.city.trim()
          ? args.city.trim()
          : null,
      universe:
        typeof args.universe === "string" && args.universe.trim()
          ? args.universe.trim()
          : null,
      contact_name: args.contactName ?? null,
      phone: args.phone ?? null,
    }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function createProTeamMember(args: {
  establishmentId: string;
  email: string;
  password: string;
  role: ProMembership["role"];
}): Promise<{ ok: true; user_id: string }> {
  const { data: sessionData, error: sessionError } = await getProSession();
  if (sessionError) throw sessionError;

  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/team/create-user`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: args.email,
        password: args.password,
        role: args.role,
      }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; user_id: string };
}

export async function listProTeamMembers(
  establishmentId: string,
): Promise<ProMembership[]> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(establishmentId)}/team`,
    ),
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return isRecord(payload) && Array.isArray(payload.members)
    ? (payload.members as ProMembership[])
    : [];
}

export async function updateProTeamMemberRole(args: {
  establishmentId: string;
  membershipId: string;
  role: ProMembership["role"];
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/team/${encodeURIComponent(args.membershipId)}/update`,
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ role: args.role }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function deleteProTeamMember(args: {
  establishmentId: string;
  membershipId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/team/${encodeURIComponent(args.membershipId)}`,
    ),
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function updateProTeamMemberEmail(args: {
  establishmentId: string;
  membershipId: string;
  email: string;
}): Promise<{ ok: true; email: string }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/team/${encodeURIComponent(args.membershipId)}/email`,
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: args.email }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; email: string };
}

export async function toggleProTeamMemberActive(args: {
  establishmentId: string;
  membershipId: string;
  active: boolean;
}): Promise<{ ok: true; active: boolean }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/team/${encodeURIComponent(args.membershipId)}/toggle-active`,
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ active: args.active }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; active: boolean };
}

export async function resetProTeamMemberPassword(args: {
  establishmentId: string;
  membershipId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/team/${encodeURIComponent(args.membershipId)}/reset-password`,
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function listProCampaigns(
  establishmentId: string,
): Promise<ProCampaign[]> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(establishmentId)}/campaigns`,
    ),
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return isRecord(payload) && Array.isArray(payload.campaigns)
    ? (payload.campaigns as ProCampaign[])
    : [];
}

export async function createProCampaign(args: {
  establishmentId: string;
  data: {
    type: string;
    title: string;
    billing_model?: string;
    budget: number;
    starts_at?: string | null;
    ends_at?: string | null;
  };
}): Promise<{ ok: true; campaign: ProCampaign }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/campaigns`,
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.data),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; campaign: ProCampaign };
}

export async function deleteProCampaign(args: {
  establishmentId: string;
  campaignId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/campaigns/${encodeURIComponent(args.campaignId)}/delete`,
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function updateProCampaign(args: {
  establishmentId: string;
  campaignId: string;
  data: {
    type?: string;
    title?: string;
    billing_model?: "cpc" | "cpm";
    budget?: number;
    status?: string;
    starts_at?: string | null;
    ends_at?: string | null;
  };
}): Promise<{ ok: true; campaign: ProCampaign }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/campaigns/${encodeURIComponent(args.campaignId)}/update`,
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args.data),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; campaign: ProCampaign };
}

export async function listProQrScanLogs(
  establishmentId: string,
): Promise<{ ok: true; logs: unknown[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(establishmentId)}/qr/logs`,
    ),
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; logs: unknown[] };
}

export async function scanProQrCode(args: {
  establishmentId: string;
  code: string;
  holder_name?: string | null;
}): Promise<unknown> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/qr/scan`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        code: args.code,
        holder_name: args.holder_name ?? null,
      }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as unknown;
}

export async function listProPackBilling(
  establishmentId: string,
): Promise<{ ok: true; purchases: unknown[]; redemptions: unknown[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/billing/packs`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; purchases: unknown[]; redemptions: unknown[] };
}

export async function listProConversations(
  establishmentId: string,
): Promise<{ ok: true; conversations: unknown[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/conversations`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; conversations: unknown[] };
}

export async function listProConversationMessages(args: {
  establishmentId: string;
  conversationId: string;
}): Promise<{ ok: true; messages: unknown[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/conversations/${encodeURIComponent(args.conversationId)}/messages`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; messages: unknown[] };
}

export async function sendProConversationMessage(args: {
  establishmentId: string;
  conversationId: string;
  body: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/conversations/${encodeURIComponent(args.conversationId)}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ body: args.body }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export async function getOrCreateProConversationForReservation(args: {
  establishmentId: string;
  reservationId: string;
  subject?: string;
}): Promise<{ ok: true; conversation: unknown }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/conversations/for-reservation`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reservation_id: args.reservationId,
        subject: args.subject ?? null,
      }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; conversation: unknown };
}

// ---------------------------------------------------------------------------
// Client History & Read Status
// ---------------------------------------------------------------------------

export type ProClientHistory = {
  ok: true;
  client: {
    user_id: string;
    name: string | null;
    email: string | null;
    total_reservations: number;
  } | null;
  reservations: Array<{
    id: string;
    booking_reference: string;
    starts_at: string;
    party_size: number;
    status: string;
    customer_name?: string;
    customer_email?: string;
  }>;
  conversations: Array<{
    id: string;
    subject: string;
    status: string;
    created_at: string;
    updated_at: string;
    reservation_id: string | null;
  }>;
  messages: Array<{
    id: string;
    conversation_id: string;
    from_role: string;
    body: string;
    created_at: string;
    read_by_pro_at?: string | null;
    read_by_client_at?: string | null;
  }>;
};

export async function listProClientHistory(
  establishmentId: string,
  clientUserId: string,
): Promise<ProClientHistory> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/clients/${encodeURIComponent(clientUserId)}/history`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as ProClientHistory;
}

export async function markProMessagesRead(args: {
  establishmentId: string;
  conversationId: string;
}): Promise<{ ok: true; marked_at: string }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/conversations/${encodeURIComponent(args.conversationId)}/mark-read`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; marked_at: string };
}

export type ProMessageReadReceipt = {
  id: string;
  from_role: string;
  read_by_pro_at: string | null;
  read_by_client_at: string | null;
  created_at: string;
};

export async function getProMessageReadReceipts(args: {
  establishmentId: string;
  conversationId: string;
}): Promise<{ ok: true; messages: ProMessageReadReceipt[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/conversations/${encodeURIComponent(args.conversationId)}/read-receipts`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; messages: ProMessageReadReceipt[] };
}

// ---------------------------------------------------------------------------
// Auto-Reply Settings
// ---------------------------------------------------------------------------

export type ProAutoReplySettings = {
  id: string | null;
  establishment_id: string;
  enabled: boolean;
  message: string;
  start_time: string | null; // HH:MM format
  end_time: string | null; // HH:MM format
  days_of_week: number[]; // 0=Sunday, 6=Saturday
  is_on_vacation: boolean;
  vacation_start: string | null; // ISO date
  vacation_end: string | null; // ISO date
  vacation_message: string;
  created_at: string | null;
  updated_at: string | null;
};

export async function getProAutoReplySettings(
  establishmentId: string,
): Promise<{ ok: true; settings: ProAutoReplySettings }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/auto-reply`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; settings: ProAutoReplySettings };
}

export async function updateProAutoReplySettings(
  establishmentId: string,
  settings: Partial<Omit<ProAutoReplySettings, "id" | "establishment_id" | "created_at" | "updated_at">>,
): Promise<{ ok: true; settings: ProAutoReplySettings }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/auto-reply`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(settings),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; settings: ProAutoReplySettings };
}

// ---------------------------------------------------------------------------
// Finance Dashboard & Payout Workflow
// ---------------------------------------------------------------------------

export type ProFinanceDashboard = {
  establishment_id: string;
  currency: string;
  total_payable_cents: number;
  eligible_at: string | null;
  window_start: string | null;
  window_end: string | null;
  payout_requests_count: number;
  next_eligible_payout: {
    date: string;
    amount_cents: number;
  } | null;
};

export async function getProFinanceDashboard(
  establishmentId: string,
): Promise<{ ok: true; dashboard: ProFinanceDashboard }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/finance/dashboard`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; dashboard: ProFinanceDashboard };
}

export async function acceptProTerms(
  establishmentId: string,
  termsVersion: string,
): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/finance/terms/accept`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ terms_version: termsVersion }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

export type PayoutWindow = {
  window_start: string;
  window_end: string;
  eligible_at: string;
  payout_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  has_request: boolean;
};

export async function listProPayoutWindows(
  establishmentId: string,
): Promise<{ ok: true; windows: PayoutWindow[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/finance/windows`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; windows: PayoutWindow[] };
}

export type PayoutRequestCreated = {
  id: string;
  payout_id: string;
  establishment_id: string;
  status: string;
  pro_comment: string | null;
  created_at: string;
};

export async function createProPayoutRequest(
  establishmentId: string,
  args: { payout_id: string; pro_comment?: string | null },
): Promise<{ ok: true; item: PayoutRequestCreated }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/finance/payout-request`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; item: PayoutRequestCreated };
}

export type PayoutRequestWithPayout = {
  id: string;
  payout_id: string;
  status: string;
  pro_comment: string | null;
  created_at: string;
  payout: {
    window_start: string;
    window_end: string;
    eligible_at: string;
    amount_cents: number;
    currency: string;
    status: string;
  } | null;
};

export async function listProPayoutRequests(
  establishmentId: string,
): Promise<{ ok: true; requests: PayoutRequestWithPayout[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/finance/payout-requests`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; requests: PayoutRequestWithPayout[] };
}

// ---------------------------------------------------------------------------
// Bank details (read-only)
// ---------------------------------------------------------------------------

export type ProBankDetails = {
  id: string;
  establishment_id: string;
  bank_code: string;
  bank_name: string;
  bank_address: string | null;
  holder_name: string;
  holder_address: string | null;
  rib_24: string;
  is_validated: boolean;
  validated_at: string | null;
  validated_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getProBankDetails(
  establishmentId: string,
): Promise<{ ok: true; item: ProBankDetails | null }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/bank-details`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; item: ProBankDetails | null };
}

// ---------------------------------------------------------------------------
// Visibility / Offers & Orders
// ---------------------------------------------------------------------------

export type VisibilityOffer = {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  deliverables?: string[];
  duration_days?: number | null;
  price_cents: number;
  currency: string;
  allow_quantity: boolean;
  is_active: boolean;
  tax_rate_bps?: number | null;
  tax_label?: string | null;
};

export type VisibilityCartItem = {
  offer_id: string;
  quantity: number;
};

export type VisibilityCheckoutResponse = {
  ok: true;
  order: {
    id: string;
    status: string;
    total_cents: number;
    currency: string;
    created_at: string;
  };
  payment: {
    provider: string;
    confirm_endpoint?: string;
    payment_url?: string;
  };
};

export type VisibilityOrder = {
  id: string;
  establishment_id: string;
  status: string;
  payment_status: string;
  total_cents: number;
  subtotal_cents: number;
  tax_cents: number;
  currency: string;
  items: Array<{
    offer_id: string;
    title: string | null;
    description: string | null;
    type: string;
    quantity: number;
    unit_price_cents: number;
    total_price_cents: number;
  }>;
  created_at: string;
  paid_at: string | null;
  invoice_number: string | null;
  invoice_issued_at: string | null;
};

export type VisibilityOrderInvoice = {
  ok: true;
  invoice: {
    id: string;
    invoice_number: string;
    issued_at: string;
    amount_cents: number;
    currency: string;
    reference_type: string;
    reference_id: string;
  };
};

export async function listProVisibilityOffers(
  establishmentId: string,
  type?: string,
): Promise<{ ok: true; offers: VisibilityOffer[] }> {
  const token = await requireProAccessToken();

  const qs = new URLSearchParams();
  if (type) qs.set("type", type);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/visibility/offers${suffix}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; offers: VisibilityOffer[] };
}

export async function checkoutProVisibilityCart(
  establishmentId: string,
  items: VisibilityCartItem[],
  promoCode?: string,
): Promise<VisibilityCheckoutResponse> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/visibility/cart/checkout`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ items, promo_code: promoCode || undefined }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as VisibilityCheckoutResponse;
}

export type VisibilityPromoValidationResponse = {
  ok: true;
  promo: {
    code: string;
    description: string | null;
    discount_bps: number;
    applies_to_type: string | null;
    applies_to_offer_id: string | null;
    applies_to_establishment_ids: string[] | null;
  };
  eligible_subtotal_cents: number;
  discount_cents: number;
  currency: string;
  total_cents: number;
};

export async function validateProVisibilityPromoCode(
  establishmentId: string,
  items: VisibilityCartItem[],
  promoCode: string,
): Promise<VisibilityPromoValidationResponse> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/visibility/promo/validate`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ items, promo_code: promoCode }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as VisibilityPromoValidationResponse;
}

export async function listProVisibilityOrders(
  establishmentId: string,
  limit?: number,
): Promise<{ ok: true; orders: VisibilityOrder[] }> {
  const token = await requireProAccessToken();

  const qs = new URLSearchParams();
  if (typeof limit === "number" && Number.isFinite(limit))
    qs.set("limit", String(Math.floor(limit)));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/visibility/orders${suffix}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; orders: VisibilityOrder[] };
}

export async function getProVisibilityOrderInvoice(
  establishmentId: string,
  orderId: string,
): Promise<VisibilityOrderInvoice> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/visibility/orders/${encodeURIComponent(orderId)}/invoice`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as VisibilityOrderInvoice;
}

/**
 * Download the invoice PDF for a visibility order.
 * Opens a new tab/triggers download with the PDF.
 */
export async function downloadProVisibilityOrderInvoicePdf(
  establishmentId: string,
  orderId: string,
): Promise<void> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/visibility/orders/${encodeURIComponent(orderId)}/invoice/pdf`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  // Get the filename from Content-Disposition header if available
  const contentDisposition = res.headers.get("Content-Disposition");
  let filename = `facture-${orderId}.pdf`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
    if (match) filename = match[1];
  }

  // Create blob and trigger download
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function confirmProVisibilityOrder(
  establishmentId: string,
  orderId: string,
): Promise<{ ok: true; order: VisibilityOrder }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/visibility/orders/${encodeURIComponent(orderId)}/confirm`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; order: VisibilityOrder };
}

// ---------------------------------------------------------------------------
// MEDIA FACTORY (Pro)
// ---------------------------------------------------------------------------

export type ProMediaJobListItem = {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  order_item_id: string | null;
};

export type ProMediaJobDetails = {
  ok: true;
  job: any;
  brief: any | null;
  schedule_slots: any[];
  appointment: any | null;
  deliverables: any[];
  thread: any | null;
  messages: any[];
};

export async function listProMediaJobs(args: {
  establishmentId: string;
}): Promise<{ ok: true; items: ProMediaJobListItem[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/media/jobs`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; items: ProMediaJobListItem[] };
}

export async function getProMediaJob(args: {
  establishmentId: string;
  jobId: string;
}): Promise<ProMediaJobDetails> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/media/jobs/${encodeURIComponent(args.jobId)}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as ProMediaJobDetails;
}

export async function saveProMediaBriefDraft(args: {
  establishmentId: string;
  jobId: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: true; brief: any }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/media/jobs/${encodeURIComponent(args.jobId)}/brief/save`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: args.payload }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; brief: any };
}

export async function submitProMediaBrief(args: {
  establishmentId: string;
  jobId: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: true; brief: any }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/media/jobs/${encodeURIComponent(args.jobId)}/brief/submit`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: args.payload }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; brief: any };
}

export async function selectProMediaScheduleSlot(args: {
  establishmentId: string;
  jobId: string;
  slotId: string;
}): Promise<{ ok: true; appointment: any }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/media/jobs/${encodeURIComponent(args.jobId)}/schedule/select`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ slot_id: args.slotId }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; appointment: any };
}

// ---------------------------------------------------------------------------
// MEDIA FACTORY (Partners)
// ---------------------------------------------------------------------------

export type PartnerMissionListItem = {
  id: string;
  job_id: string;
  role: string;
  deliverable_type: string;
  status: string;
  current_version: number | null;
  review_comment: string | null;
  created_at: string;
  updated_at: string;
  media_jobs?: {
    id: string;
    title: string | null;
    status: string;
    establishment_id: string;
  } | null;
};

export type PartnerMissionDetails = {
  ok: true;
  job: any;
  deliverables: any[];
  files: any[];
  billing_profile: any | null;
  invoice_requests: any[];
};

export async function getPartnerMe(): Promise<{
  ok: true;
  profile: any | null;
}> {
  const token = await requireProAccessToken();

  const res = await fetch("/api/partners/me", {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; profile: any | null };
}

export async function listPartnerMissions(): Promise<{
  ok: true;
  items: PartnerMissionListItem[];
}> {
  const token = await requireProAccessToken();

  const res = await fetch("/api/partners/missions", {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; items: PartnerMissionListItem[] };
}

export async function getPartnerMission(args: {
  jobId: string;
}): Promise<PartnerMissionDetails> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/partners/missions/${encodeURIComponent(args.jobId)}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as PartnerMissionDetails;
}

export async function uploadPartnerDeliverableFile(args: {
  deliverableId: string;
  file: File;
}): Promise<{ ok: true; file: any }> {
  const token = await requireProAccessToken();

  const body = await args.file.arrayBuffer();
  const res = await fetch(
    `/api/partners/deliverables/${encodeURIComponent(args.deliverableId)}/upload`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": args.file.type || "application/octet-stream",
        "x-file-name": args.file.name,
      },
      body,
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; file: any };
}

export async function requestPartnerInvoice(args: {
  jobId: string;
  role: string;
}): Promise<{ ok: true; request: any }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/partners/missions/${encodeURIComponent(args.jobId)}/invoice-request`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ role: args.role }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; request: any };
}

// ---------------------------------------------------------------------------
// PRESTATAIRES
// ---------------------------------------------------------------------------

export type PrestataireDemande = {
  id: string;
  demandeur_user_id: string;
  establishment_id: string | null;
  nom: string;
  contact_email: string | null;
  contact_telephone: string | null;
  type_prestation: string | null;
  ville: string | null;
  notes: string | null;
  documents_paths: string[] | null;
  statut: "NOUVELLE" | "EN_COURS" | "CONVERTIE" | "REFUSEE" | "ANNULEE";
  prestataire_id: string | null;
  traite_par: string | null;
  traite_at: string | null;
  motif_refus: string | null;
  created_at: string;
  updated_at: string;
  prestataires?: PrestataireLinked | null;
};

export type PrestataireLinked = {
  id: string;
  nom_legal: string;
  statut: string;
};

export type PrestataireListItem = {
  id: string;
  nom_legal: string;
  type_prestataire: string | null;
  categorie_prestation: string | null;
  ville: string | null;
  statut: string;
  email: string | null;
  telephone: string | null;
};

export async function createProPrestataireDemande(args: {
  nom: string;
  contact_email?: string | null;
  contact_telephone?: string | null;
  type_prestation?: string | null;
  ville?: string | null;
  notes?: string | null;
  establishment_id?: string | null;
}): Promise<{ ok: true; demande: PrestataireDemande }> {
  const token = await requireProAccessToken();

  const res = await fetch("/api/pro/prestataires/demandes", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; demande: PrestataireDemande };
}

export async function listProPrestataireDemandes(): Promise<{
  ok: true;
  items: PrestataireDemande[];
}> {
  const token = await requireProAccessToken();

  const res = await fetch("/api/pro/prestataires/demandes", {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; items: PrestataireDemande[] };
}

export async function listProPrestataires(
  establishmentId: string,
): Promise<{ ok: true; items: PrestataireListItem[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/establishments/${encodeURIComponent(establishmentId)}/prestataires`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; items: PrestataireListItem[] };
}

// ---------------------------------------------------------------------------
// PRESTATAIRES - Gestion complète Pro
// ---------------------------------------------------------------------------

export type PrestataireType =
  | "auto_entrepreneur"
  | "entreprise_individuelle"
  | "sarl"
  | "sa"
  | "sas"
  | "association"
  | "autre";

export type PrestataireStatut =
  | "BROUILLON"
  | "EN_VALIDATION"
  | "VALIDE"
  | "BLOQUE"
  | "REFUSE"
  | "ARCHIVE";

export type PrestataireCategorie =
  | "camera"
  | "editor"
  | "voice"
  | "blogger"
  | "photographer"
  | "designer"
  | "developer"
  | "consultant"
  | "autre";

export type PrestataireDetail = {
  id: string;
  nom_legal: string;
  type_prestataire: PrestataireType | null;
  categorie_prestation: PrestataireCategorie | null;
  statut: PrestataireStatut;
  ice: string | null;
  identifiant_fiscal: string | null;
  registre_commerce: string | null;
  adresse: string | null;
  ville: string | null;
  pays: string | null;
  email: string | null;
  telephone: string | null;
  banque_nom: string | null;
  titulaire_compte: string | null;
  tva_applicable: boolean;
  tva_taux: number | null;
  zone_intervention: string | null;
  raison_blocage: string | null;
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
};

export type PrestataireDocument = {
  id: string;
  prestataire_id: string;
  type_document: "CARTE_AE_OU_RC" | "ATTESTATION_ICE_IF" | "RIB_SCAN" | "AUTRE";
  file_name: string;
  file_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  statut: "MANQUANT" | "UPLOADED" | "VALIDE" | "REFUSE";
  review_note: string | null;
  uploaded_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ConformityScore = {
  score: number;
  checklist: { key: string; label: string; ok: boolean }[];
};

export async function createProPrestataire(args: {
  nom_legal: string;
  type_prestataire?: PrestataireType;
  categorie_prestation?: PrestataireCategorie;
  establishment_id?: string;
  ice?: string;
  identifiant_fiscal?: string;
  registre_commerce?: string;
  adresse?: string;
  ville?: string;
  pays?: string;
  email?: string;
  telephone?: string;
  banque_nom?: string;
  titulaire_compte?: string;
  tva_applicable?: boolean;
  tva_taux?: number;
  zone_intervention?: string;
}): Promise<{ ok: true; prestataire: PrestataireDetail }> {
  const token = await requireProAccessToken();

  const res = await fetch("/api/pro/prestataires", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; prestataire: PrestataireDetail };
}

export async function getProPrestataire(prestataireId: string): Promise<{
  ok: true;
  prestataire: PrestataireDetail;
  documents: PrestataireDocument[];
  conformity_score: ConformityScore;
}> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/prestataires/${encodeURIComponent(prestataireId)}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as {
    ok: true;
    prestataire: PrestataireDetail;
    documents: PrestataireDocument[];
    conformity_score: ConformityScore;
  };
}

export async function updateProPrestataire(
  prestataireId: string,
  args: Partial<
    Omit<
      PrestataireDetail,
      "id" | "statut" | "created_at" | "updated_at" | "created_by_user_id"
    >
  >,
): Promise<{ ok: true; prestataire: PrestataireDetail }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/prestataires/${encodeURIComponent(prestataireId)}/update`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; prestataire: PrestataireDetail };
}

export async function submitProPrestataireForValidation(
  prestataireId: string,
): Promise<{ ok: true; prestataire: PrestataireDetail }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/prestataires/${encodeURIComponent(prestataireId)}/submit`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; prestataire: PrestataireDetail };
}

export async function listProPrestataireDocuments(
  prestataireId: string,
): Promise<{ ok: true; items: PrestataireDocument[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/prestataires/${encodeURIComponent(prestataireId)}/documents`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; items: PrestataireDocument[] };
}

export async function uploadProPrestataireDocument(args: {
  prestataireId: string;
  type_document: "CARTE_AE_OU_RC" | "ATTESTATION_ICE_IF" | "RIB_SCAN" | "AUTRE";
  file_name: string;
  file_base64: string;
  mime_type?: string;
}): Promise<{ ok: true; document: PrestataireDocument }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/prestataires/${encodeURIComponent(args.prestataireId)}/documents`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type_document: args.type_document,
        file_name: args.file_name,
        file_base64: args.file_base64,
        mime_type: args.mime_type,
      }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; document: PrestataireDocument };
}

export async function deleteProPrestataireDocument(
  prestataireId: string,
  docId: string,
): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/prestataires/${encodeURIComponent(prestataireId)}/documents/${encodeURIComponent(docId)}/delete`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true };
}

// ---------------------------------------------------------------------------
// PRESTATAIRES - Messages
// ---------------------------------------------------------------------------

export type PrestataireMessageTopic =
  | "general"
  | "validation"
  | "documents"
  | "paiement";

export type PrestataireMessage = {
  id: string;
  prestataire_id: string;
  sender_type: "pro" | "admin" | "system";
  sender_user_id: string | null;
  sender_admin_id: string | null;
  body: string;
  topic: PrestataireMessageTopic;
  is_internal: boolean;
  created_at: string;
};

export async function listProPrestataireMessages(
  prestataireId: string,
): Promise<{ ok: true; items: PrestataireMessage[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/prestataires/${encodeURIComponent(prestataireId)}/messages`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; items: PrestataireMessage[] };
}

export async function sendProPrestataireMessage(args: {
  prestataireId: string;
  body: string;
  topic?: PrestataireMessageTopic;
}): Promise<{ ok: true; message: PrestataireMessage }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    `/api/pro/prestataires/${encodeURIComponent(args.prestataireId)}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        body: args.body,
        topic: args.topic ?? "general",
      }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; message: PrestataireMessage };
}

// ---------------------------------------------------------------------------
// Password Management
// ---------------------------------------------------------------------------

/**
 * Check if the current Pro user must change their password.
 * Returns true if the must_change_password flag is set.
 */
export async function checkMustChangePassword(): Promise<{ mustChange: boolean }> {
  const token = await requireProAccessToken();

  const res = await fetch(apiUrl("/api/pro/me/check-password-status"), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    // On error, assume no password change needed to not block the user
    return { mustChange: false };
  }

  return {
    mustChange: isRecord(payload) && payload.mustChange === true,
  };
}

/**
 * Request a password reset email for the currently authenticated Pro user.
 * Sends an email to the user's registered email address.
 */
export async function requestProPasswordReset(): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(apiUrl("/api/pro/me/request-password-reset"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return { ok: true };
}

/**
 * Change the password for the currently authenticated Pro user.
 * Requires the current password for verification.
 */
export async function changeProPassword(args: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(apiUrl("/api/pro/me/change-password"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      currentPassword: args.currentPassword,
      newPassword: args.newPassword,
    }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Pro Reviews Management
// ---------------------------------------------------------------------------

export interface ProPendingReview {
  id: string;
  establishment_id: string;
  establishment_name: string | null;
  user_id: string;
  user_name: string | null;
  reservation_id: string | null;
  overall_rating: number;
  criteria_ratings: Record<string, number>;
  title: string | null;
  comment: string | null;
  anonymous: boolean;
  status: string;
  sent_to_pro_at: string | null;
  pro_response_deadline: string | null;
  created_at: string;
}

export interface ProPublishedReview {
  id: string;
  establishment_id: string;
  establishment_name: string | null;
  user_name: string | null;
  overall_rating: number;
  criteria_ratings: Record<string, number>;
  title: string | null;
  comment: string | null;
  anonymous: boolean;
  pro_public_response: string | null;
  published_at: string | null;
  created_at: string;
}

export async function listProPendingReviews(): Promise<{
  ok: true;
  reviews: ProPendingReview[];
}> {
  const token = await requireProAccessToken();

  const res = await fetch(apiUrl("/api/pro/reviews/pending"), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; reviews: ProPendingReview[] };
}

export async function listProPublishedReviews(): Promise<{
  ok: true;
  reviews: ProPublishedReview[];
}> {
  const token = await requireProAccessToken();

  const res = await fetch(apiUrl("/api/pro/reviews/published"), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; reviews: ProPublishedReview[] };
}

export async function respondToProReview(args: {
  reviewId: string;
  responseType: "promo" | "publish";
  promoCodeId?: string;
  publish?: boolean;
}): Promise<{ ok: true; message: string }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/reviews/${encodeURIComponent(args.reviewId)}/respond`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        response_type: args.responseType,
        promo_code_id: args.promoCodeId,
        publish: args.publish,
      }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; message: string };
}

export async function addProPublicResponse(args: {
  reviewId: string;
  response: string;
}): Promise<{ ok: true; message: string }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/reviews/${encodeURIComponent(args.reviewId)}/public-response`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        response: args.response,
      }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; message: string };
}

// =============================================================================
// INVENTORY IMAGE UPLOAD
// =============================================================================

export type UploadInventoryImageResult = {
  ok: true;
  url: string;
  filename: string;
  size: number;
  mimeType: string;
};

export async function uploadProInventoryImage(args: {
  establishmentId: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<UploadInventoryImageResult> {
  const token = await requireProAccessToken();

  const formData = new FormData();
  formData.append("image", args.file);

  // Use XMLHttpRequest for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && args.onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        args.onProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const payload = JSON.parse(xhr.responseText);
          resolve(payload as UploadInventoryImageResult);
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      } else {
        try {
          const payload = JSON.parse(xhr.responseText);
          const msg = typeof payload.error === "string" ? payload.error : `HTTP ${xhr.status}`;
          if (typeof payload.message === "string") {
            reject(new Error(payload.message));
          } else {
            reject(new Error(msg));
          }
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during upload"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled"));
    });

    xhr.open(
      "POST",
      apiUrl(`/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/images/upload`)
    );
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.send(formData);
  });
}

export async function deleteProInventoryImage(args: {
  establishmentId: string;
  url: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/images`),
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: args.url }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return { ok: true };
}

// =============================================================================
// CUSTOM INVENTORY LABELS
// =============================================================================

export type CustomLabel = {
  id: string;
  establishment_id: string;
  label_id: string;
  emoji: string;
  title: string;
  title_ar: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listProCustomLabels(args: {
  establishmentId: string;
}): Promise<{ ok: true; labels: CustomLabel[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/labels`),
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; labels: CustomLabel[] };
}

export async function createProCustomLabel(args: {
  establishmentId: string;
  data: {
    label_id: string;
    emoji?: string;
    title: string;
    title_ar?: string;
    color?: string;
    sort_order?: number;
  };
}): Promise<{ ok: true; label: CustomLabel }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/labels`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(args.data),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; label: CustomLabel };
}

export async function updateProCustomLabel(args: {
  establishmentId: string;
  labelId: string;
  patch: {
    emoji?: string;
    title?: string;
    title_ar?: string;
    color?: string;
    sort_order?: number;
    is_active?: boolean;
  };
}): Promise<{ ok: true; label: CustomLabel }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/labels/${encodeURIComponent(args.labelId)}`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(args.patch),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return payload as { ok: true; label: CustomLabel };
}

export async function deleteProCustomLabel(args: {
  establishmentId: string;
  labelId: string;
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/labels/${encodeURIComponent(args.labelId)}`),
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return { ok: true };
}

// =============================================================================
// INVENTORY ITEMS REORDER
// =============================================================================

export async function reorderProInventoryItems(args: {
  establishmentId: string;
  itemIds: string[];
}): Promise<{ ok: true }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/inventory/items/reorder`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ item_ids: args.itemIds }),
    },
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return { ok: true };
}

// =============================================================================
// RESERVATION HISTORY / TIMELINE
// =============================================================================

export type ReservationHistoryEntry = {
  id: string;
  reservation_id: string;
  establishment_id: string;
  actor_type: "system" | "pro" | "consumer";
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  action_label: string;
  previous_status: string | null;
  new_status: string | null;
  previous_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  message: string | null;
  created_at: string;
};

export type ReservationHistoryWithReservation = ReservationHistoryEntry & {
  reservations: {
    booking_reference: string | null;
    starts_at: string;
    party_size: number | null;
  };
};

export async function getReservationHistory(args: {
  establishmentId: string;
  reservationId: string;
}): Promise<{ history: ReservationHistoryEntry[] }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/reservations/${encodeURIComponent(args.reservationId)}/history`
    ),
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
    }
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return { history: payload.history ?? [] };
}

export async function logReservationAction(args: {
  establishmentId: string;
  reservationId: string;
  action: string;
  actionLabel: string;
  message?: string;
  previousStatus?: string;
  newStatus?: string;
  previousData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}): Promise<{ ok: true; entry: ReservationHistoryEntry }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(
      `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/reservations/${encodeURIComponent(args.reservationId)}/history`
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: args.action,
        action_label: args.actionLabel,
        message: args.message,
        previous_status: args.previousStatus,
        new_status: args.newStatus,
        previous_data: args.previousData,
        new_data: args.newData,
      }),
    }
  );

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return { ok: true, entry: payload.entry };
}

export async function listEstablishmentReservationHistory(args: {
  establishmentId: string;
  limit?: number;
  offset?: number;
  action?: string;
}): Promise<{ history: ReservationHistoryWithReservation[]; limit: number; offset: number }> {
  const token = await requireProAccessToken();

  const params = new URLSearchParams();
  if (args.limit) params.set("limit", String(args.limit));
  if (args.offset) params.set("offset", String(args.offset));
  if (args.action) params.set("action", args.action);

  const qs = params.toString();
  const url = `/api/pro/establishments/${encodeURIComponent(args.establishmentId)}/reservation-history${qs ? `?${qs}` : ""}`;

  const res = await fetch(apiUrl(url), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return {
    history: payload.history ?? [],
    limit: payload.limit ?? 50,
    offset: payload.offset ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Username management (Custom short URLs like @username)
// ---------------------------------------------------------------------------

export type UsernameRequest = {
  id: string;
  requested_username: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  rejection_reason?: string | null;
};

export type UsernameSubscriptionStatus =
  | "trial"
  | "pending"
  | "active"
  | "grace_period"
  | "expired"
  | "cancelled";

export type UsernameSubscription = {
  id: string;
  status: UsernameSubscriptionStatus;
  is_trial: boolean;
  trial_ends_at: string | null;
  starts_at: string | null;
  expires_at: string | null;
  grace_period_ends_at: string | null;
  cancelled_at: string | null;
  price_cents?: number;
  currency?: string;
  days_remaining?: number;
  can_use_username: boolean;
};

export type UsernameInfo = {
  username: string | null;
  usernameChangedAt: string | null;
  pendingRequest: UsernameRequest | null;
  canChange: boolean;
  nextChangeDate: string | null;
  cooldownDays: number;
  subscription: UsernameSubscription | null;
  canUseUsername: boolean;
};

export type UsernameSubscriptionInfo = {
  subscription: UsernameSubscription | null;
  can_start_trial: boolean;
  has_used_trial: boolean;
};

export async function checkUsernameAvailability(
  username: string
): Promise<{ available: boolean; error?: string }> {
  const token = await requireProAccessToken();

  const url = new URL(apiUrl("/api/pro/username/check"));
  url.searchParams.set("username", username);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok && res.status === 401) {
    const msg = isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : `HTTP ${res.status}`;
    if (isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return {
    available: payload.available === true,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

export async function getEstablishmentUsername(
  establishmentId: string
): Promise<UsernameInfo> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${establishmentId}/username`),
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return {
    username: payload.username ?? null,
    usernameChangedAt: payload.usernameChangedAt ?? null,
    pendingRequest: payload.pendingRequest ?? null,
    canChange: payload.canChange === true,
    nextChangeDate: payload.nextChangeDate ?? null,
    cooldownDays: payload.cooldownDays ?? 180,
    subscription: payload.subscription ?? null,
    canUseUsername: payload.canUseUsername === true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu Digital Status
// ─────────────────────────────────────────────────────────────────────────────

export type MenuDigitalStatus = {
  enabled: boolean;
  plan: "silver" | "premium" | null;
  expiresAt: string | null;
  isExpired: boolean;
  lastSync: string | null;
  slug: string | null;
  username: string | null;
  menuUrl: string | null;
  stats: {
    categories: number;
    items: number;
  };
};

export async function getMenuDigitalStatus(
  establishmentId: string
): Promise<MenuDigitalStatus> {
  const res = await proApiFetch(
    `/api/pro/establishments/${establishmentId}/menu-digital/status`
  );
  if (!res || !res.ok) throw new Error("Impossible de charger le statut");
  return res.status;
}

export async function submitUsernameRequest(args: {
  establishmentId: string;
  username: string;
}): Promise<{ ok: boolean; message: string; request?: UsernameRequest }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${args.establishmentId}/username`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: args.username }),
    }
  );

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return {
    ok: payload.ok === true,
    message: payload.message ?? "Demande envoyée",
    request: payload.request,
  };
}

export async function cancelUsernameRequest(args: {
  establishmentId: string;
  requestId: string;
}): Promise<{ ok: boolean; message: string }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${args.establishmentId}/username/request/${args.requestId}`),
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return {
    ok: payload.ok === true,
    message: payload.message ?? "Demande annulée",
  };
}

// ---------------------------------------------------------------------------
// Username Subscription Management
// ---------------------------------------------------------------------------

export async function getUsernameSubscription(
  establishmentId: string
): Promise<UsernameSubscriptionInfo> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${establishmentId}/username-subscription`),
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return {
    subscription: payload.subscription ?? null,
    can_start_trial: payload.can_start_trial === true,
    has_used_trial: payload.has_used_trial === true,
  };
}

export async function startUsernameTrial(
  establishmentId: string
): Promise<{ ok: boolean; message: string; subscription?: UsernameSubscription }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${establishmentId}/username-subscription/start-trial`),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return {
    ok: payload.ok === true,
    message: payload.message ?? "Essai gratuit active",
    subscription: payload.subscription,
  };
}

export async function cancelUsernameSubscription(
  establishmentId: string
): Promise<{ ok: boolean; message: string; subscription?: UsernameSubscription }> {
  const token = await requireProAccessToken();

  const res = await fetch(
    apiUrl(`/api/pro/establishments/${establishmentId}/username-subscription/cancel`),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    if (res.status === 401 && isStaleProAuthError(msg)) {
      await resetProAuth();
      throw new Error("Session Pro expirée. Veuillez vous reconnecter.");
    }
    throw new Error(msg);
  }

  return {
    ok: payload.ok === true,
    message: payload.message ?? "Abonnement annule",
    subscription: payload.subscription,
  };
}
