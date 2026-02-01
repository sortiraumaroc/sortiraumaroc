import { getConsumerAccessToken } from "@/lib/auth";

export type ConsumerWaitlistEntryRow = {
  id: string;
  reservation_id: string | null;
  slot_id: string | null;
  user_id: string | null;
  status: string | null;
  position: number | null;
  offer_sent_at: string | null;
  offer_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  meta: unknown;
};

export type ConsumerWaitlistReservationRow = {
  id: string;
  booking_reference: string | null;
  establishment_id: string | null;
  user_id: string | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  party_size: number | null;
  slot_id: string | null;
  meta: unknown;
  created_at: string | null;
  updated_at: string | null;
};

export type ConsumerWaitlistEstablishmentRow = {
  id: string;
  name: string | null;
  city: string | null;
  universe: string | null;
};

export type ConsumerWaitlistItem = ConsumerWaitlistEntryRow & {
  reservation: ConsumerWaitlistReservationRow | null;
  establishment: ConsumerWaitlistEstablishmentRow | null;
};

type ListConsumerWaitlistResponse = { ok: true; items: ConsumerWaitlistItem[] };

type CreateConsumerWaitlistResponse = {
  ok: true;
  reservation: ConsumerWaitlistReservationRow;
  waitlist_entry: ConsumerWaitlistEntryRow | null;
};

type OkResponse = { ok: true };

export class ConsumerWaitlistApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ConsumerWaitlistApiError";
    this.status = status;
    this.payload = payload;
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const maybe = payload as Record<string, unknown>;
  const msg = typeof maybe.error === "string" ? maybe.error : null;
  return msg && msg.trim() ? msg : null;
}

async function requestAuthedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new ConsumerWaitlistApiError("Not authenticated", 401);

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch (e) {
    throw new ConsumerWaitlistApiError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", 0, e);
  }

  let payload: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else {
    payload = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const msg = extractErrorMessage(payload) || `HTTP ${res.status}`;
    throw new ConsumerWaitlistApiError(msg, res.status, payload);
  }

  return payload as T;
}

export async function listMyConsumerWaitlist(status: "active" | "expired" | "all" = "active"): Promise<ConsumerWaitlistItem[]> {
  const qs = new URLSearchParams();
  qs.set("status", status);
  const path = `/api/consumer/waitlist?${qs.toString()}`;
  const res = await requestAuthedJson<ListConsumerWaitlistResponse>(path, { method: "GET" });
  return (res.items ?? []) as ConsumerWaitlistItem[];
}

export async function createMyConsumerWaitlist(args: {
  establishmentId: string;
  slotId: string;
  startsAt: string;
  partySize: number;
  notes?: string | null;
}): Promise<CreateConsumerWaitlistResponse> {
  const { establishmentId, slotId, startsAt, partySize, notes } = args;

  return requestAuthedJson<CreateConsumerWaitlistResponse>(
    `/api/consumer/establishments/${encodeURIComponent(establishmentId)}/waitlist`,
    {
      method: "POST",
      body: JSON.stringify({
        slot_id: slotId,
        starts_at: startsAt,
        party_size: partySize,
        notes: notes ?? undefined,
      }),
    },
  );
}

export async function cancelMyConsumerWaitlist(entryId: string): Promise<void> {
  await requestAuthedJson<OkResponse>(`/api/consumer/waitlist/${encodeURIComponent(entryId)}/cancel`, { method: "POST" });
}

export async function acceptMyConsumerWaitlistOffer(entryId: string): Promise<void> {
  await requestAuthedJson<OkResponse>(`/api/consumer/waitlist/${encodeURIComponent(entryId)}/accept-offer`, { method: "POST" });
}

export async function refuseMyConsumerWaitlistOffer(entryId: string): Promise<void> {
  await requestAuthedJson<OkResponse>(`/api/consumer/waitlist/${encodeURIComponent(entryId)}/refuse-offer`, { method: "POST" });
}
