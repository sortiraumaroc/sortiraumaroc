import { getConsumerAccessToken } from "@/lib/auth";

export type ConsumerConversation = {
  id: string;
  establishment_id: string;
  reservation_id: string | null;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ConsumerConversationMessage = {
  id: string;
  conversation_id: string;
  establishment_id: string;
  from_role: string;
  body: string;
  created_at: string;
  sender_user_id: string | null;
};

type ListResponse = { ok: true; conversation: ConsumerConversation | null; messages: ConsumerConversationMessage[] };

type SendResponse = { ok: true; conversation_id: string; message: ConsumerConversationMessage };

export class ConsumerMessagesApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ConsumerMessagesApiError";
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
  if (!token) throw new ConsumerMessagesApiError("Not authenticated", 401);

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
    throw new ConsumerMessagesApiError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", 0, e);
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
    throw new ConsumerMessagesApiError(msg, res.status, payload);
  }

  return payload as T;
}

export async function listMyReservationMessages(reservationId: string, limit = 200): Promise<ListResponse> {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const url = `/api/consumer/reservations/${encodeURIComponent(reservationId)}/messages?limit=${encodeURIComponent(String(safeLimit))}`;
  return requestAuthedJson<ListResponse>(url, { method: "GET" });
}

export async function sendMyReservationMessage(reservationId: string, body: string): Promise<SendResponse> {
  const url = `/api/consumer/reservations/${encodeURIComponent(reservationId)}/messages`;
  return requestAuthedJson<SendResponse>(url, { method: "POST", body: JSON.stringify({ body }) });
}
