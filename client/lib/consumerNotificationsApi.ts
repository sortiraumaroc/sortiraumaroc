import { getConsumerAccessToken } from "@/lib/auth";

export type ConsumerNotificationRow = {
  id: string;
  event_type: string;
  occurred_at: string;
  metadata: unknown;
  read_at?: string | null;
};

type ListConsumerNotificationsResponse = { ok: true; items: ConsumerNotificationRow[] };

export class ConsumerNotificationsApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ConsumerNotificationsApiError";
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
  if (!token) throw new ConsumerNotificationsApiError("Not authenticated", 401);

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
    throw new ConsumerNotificationsApiError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", 0, e);
  }

  let payload: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else {
    payload = await res.text().catch(() => null);
  }

  if (!res.ok) {
    if (res.status === 503 || res.status === 504) {
      throw new ConsumerNotificationsApiError("Service temporairement indisponible. Réessayez dans un instant.", res.status, payload);
    }

    const msg = extractErrorMessage(payload) || `HTTP ${res.status}`;
    throw new ConsumerNotificationsApiError(msg, res.status, payload);
  }

  return payload as T;
}

export async function listMyConsumerNotifications(limit = 200): Promise<ConsumerNotificationRow[]> {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const url = `/api/consumer/notifications?limit=${encodeURIComponent(String(safeLimit))}`;
  const res = await requestAuthedJson<ListConsumerNotificationsResponse>(url, { method: "GET" });
  return (res.items ?? []) as ConsumerNotificationRow[];
}

export async function getMyConsumerNotificationsUnreadCount(): Promise<number> {
  const res = await requestAuthedJson<{ ok: true; unread: number }>("/api/consumer/notifications/unread-count", { method: "GET" });
  const n = (res as any)?.unread;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export async function markMyConsumerNotificationRead(id: string): Promise<void> {
  const trimmed = String(id ?? "").trim();
  if (!trimmed) return;
  await requestAuthedJson<{ ok: true }>(`/api/consumer/notifications/${encodeURIComponent(trimmed)}/read`, { method: "POST" });
}

export async function markAllMyConsumerNotificationsRead(ids?: string[]): Promise<number> {
  const list = (ids ?? []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 500);
  const res = await requestAuthedJson<{ ok: true; updated: number }>("/api/consumer/notifications/mark-all-read", {
    method: "POST",
    body: JSON.stringify(list.length ? { ids: list } : {}),
  });
  const n = (res as any)?.updated;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
