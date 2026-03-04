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

/**
 * Request a password reset email (regenerate password).
 * A new temporary password will be sent to the user's email.
 */
export async function requestPasswordReset(): Promise<{ ok: true }> {
  return requestAuthedJson<{ ok: true }>("/api/consumer/account/password/reset", {
    method: "POST",
  });
}

/**
 * Change the user's password.
 * Requires the current password and the new password.
 */
export async function changePassword(args: {
  current_password: string;
  new_password: string;
}): Promise<{ ok: true }> {
  return requestAuthedJson<{ ok: true }>("/api/consumer/account/password/change", {
    method: "POST",
    body: JSON.stringify({
      current_password: args.current_password,
      new_password: args.new_password,
    }),
  });
}

/**
 * Request a password reset link (sent via email).
 * Better UX than temporary password - user creates their own new password.
 */
export async function requestPasswordResetLink(): Promise<{ ok: true }> {
  return requestAuthedJson<{ ok: true }>("/api/consumer/account/password/reset-link", {
    method: "POST",
  });
}

/**
 * Validate a password reset token (public endpoint, no auth required).
 */
export async function validatePasswordResetToken(token: string): Promise<{ ok: true; email: string }> {
  const res = await fetch(`/api/consumer/account/password/validate-token?token=${encodeURIComponent(token)}`);
  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = payload?.error || `HTTP ${res.status}`;
    throw new ConsumerAccountApiError(errorMsg, res.status, payload);
  }

  return payload;
}

/**
 * Complete password reset - set new password using the reset token.
 */
export async function completePasswordReset(args: {
  token: string;
  new_password: string;
}): Promise<{ ok: true }> {
  const res = await fetch("/api/consumer/account/password/complete-reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: args.token,
      new_password: args.new_password,
    }),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = payload?.error || `HTTP ${res.status}`;
    throw new ConsumerAccountApiError(errorMsg, res.status, payload);
  }

  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trusted Devices
// ─────────────────────────────────────────────────────────────────────────────

export interface TrustedDevice {
  id: string;
  device_name: string;
  ip_address: string;
  created_at: string;
  last_used_at: string;
  is_current: boolean;
}

/**
 * List all trusted devices for the current user.
 */
export async function listMyTrustedDevices(): Promise<{ devices: TrustedDevice[] }> {
  return requestAuthedJson<{ devices: TrustedDevice[] }>("/api/consumer/account/trusted-devices");
}

/**
 * Revoke a specific trusted device by ID.
 */
export async function revokeMyTrustedDevice(deviceId: string): Promise<{ ok: true }> {
  return requestAuthedJson<{ ok: true }>(`/api/consumer/account/trusted-devices/${deviceId}/revoke`, {
    method: "POST",
  });
}

/**
 * Revoke ALL trusted devices (disconnect everywhere).
 */
export async function revokeAllMyTrustedDevices(): Promise<{ ok: true; revoked: number }> {
  return requestAuthedJson<{ ok: true; revoked: number }>("/api/consumer/account/trusted-devices/revoke-all", {
    method: "POST",
  });
}
