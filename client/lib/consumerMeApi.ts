import { getConsumerAccessToken } from "@/lib/auth";

export type ConsumerMe = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  reliability_score?: number;
  reliability_level?: "excellent" | "good" | "medium" | "fragile";
};

export class ConsumerMeApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ConsumerMeApiError";
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
  if (!token) throw new ConsumerMeApiError("Not authenticated", 401);

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
    throw new ConsumerMeApiError("Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.", 0, e);
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
    throw new ConsumerMeApiError(msg, res.status, payload);
  }

  return payload as T;
}

export async function getMyConsumerMe(): Promise<ConsumerMe> {
  return requestAuthedJson<ConsumerMe>("/api/consumer/me", { method: "GET" });
}

export async function updateMyConsumerMe(args: {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  city?: string | null;
}): Promise<ConsumerMe> {
  const body = {
    ...(args.first_name != null ? { first_name: args.first_name } : {}),
    ...(args.last_name != null ? { last_name: args.last_name } : {}),
    ...(args.phone != null ? { phone: args.phone } : {}),
    ...(args.date_of_birth != null ? { date_of_birth: args.date_of_birth } : {}),
    ...(args.city != null ? { city: args.city } : {}),
  };

  return requestAuthedJson<ConsumerMe>("/api/consumer/me/update", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
