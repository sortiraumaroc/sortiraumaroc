import { getConsumerAccessToken } from "@/lib/auth";

export class ConsumerAccountApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ConsumerAccountApiError";
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
  if (!token) throw new ConsumerAccountApiError("Not authenticated", 401);

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
    throw new ConsumerAccountApiError(
      "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
      0,
      e,
    );
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
    throw new ConsumerAccountApiError(msg, res.status, payload);
  }

  return payload as T;
}

export async function deactivateMyConsumerAccount(args: {
  reason_code?: string | null;
  reason_text?: string | null;
}): Promise<{ ok: true }> {
  return requestAuthedJson<{ ok: true }>("/api/consumer/account/deactivate", {
    method: "POST",
    body: JSON.stringify({
      ...(args.reason_code != null ? { reason_code: args.reason_code } : {}),
      ...(args.reason_text != null ? { reason_text: args.reason_text } : {}),
    }),
  });
}

export async function reactivateMyConsumerAccount(): Promise<{ ok: true }> {
  return requestAuthedJson<{ ok: true }>("/api/consumer/account/reactivate", { method: "POST" });
}

export async function deleteMyConsumerAccount(args: {
  reason_code?: string | null;
  reason_text?: string | null;
}): Promise<{ ok: true }> {
  return requestAuthedJson<{ ok: true }>("/api/consumer/account/delete", {
    method: "POST",
    body: JSON.stringify({
      ...(args.reason_code != null ? { reason_code: args.reason_code } : {}),
      ...(args.reason_text != null ? { reason_text: args.reason_text } : {}),
    }),
  });
}

export async function requestMyConsumerDataExport(args: { format: "json" | "csv" }): Promise<{ ok: true }> {
  return requestAuthedJson<{ ok: true }>("/api/consumer/account/export/request", {
    method: "POST",
    body: JSON.stringify({ format: args.format }),
  });
}
