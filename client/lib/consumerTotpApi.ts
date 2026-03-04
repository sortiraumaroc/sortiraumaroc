/**
 * Consumer TOTP API Client
 * Client-side API for user personal QR codes with TOTP
 */

import { getConsumerAccessToken } from "@/lib/auth";

// ============================================================================
// Types
// ============================================================================

export interface TOTPSecretResponse {
  ok: boolean;
  userId: string;
  userName: string | null;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
  secondsRemaining: number;
}

export interface TOTPCodeResponse {
  ok: boolean;
  code: string;
  qrString: string;
  userId: string;
  userName: string | null;
  expiresIn: number;
  period: number;
}

export interface TOTPReservationInfo {
  id: string;
  bookingReference: string | null;
  status: string | null;
  paymentStatus: string | null;
  startsAt: string | null;
  partySize: number | null;
  checkedInAt: string | null;
  kind: string | null;
}

export interface TOTPPackInfo {
  id: string;
  packId: string | null;
  title: string | null;
  quantity: number;
  totalPrice: number | null;
  currency: string | null;
  status: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export interface TOTPValidationResult {
  ok: boolean;
  result: "accepted" | "rejected";
  reason: string;
  message: string;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
    memberSince: string;
    reliabilityScore: number;
    reliabilityLevel: "excellent" | "good" | "medium" | "fragile";
    reservationsCount: number;
    noShowsCount: number;
    lastActivity: string | null;
  };
  /** Today's/upcoming reservations for this user at the scanned establishment */
  reservations?: TOTPReservationInfo[];
  /** Active pack purchases for this user at the scanned establishment */
  packs?: TOTPPackInfo[];
}

export interface ConsumerUserInfo {
  ok: boolean;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    accountStatus: string;
    memberSince: string;
    reliabilityScore: number;
    reliabilityLevel: "excellent" | "good" | "medium" | "fragile";
    reservationsCount: number;
    noShowsCount: number;
    lastActivity: string | null;
  };
}

// ============================================================================
// Error Class
// ============================================================================

export class ConsumerTotpApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ConsumerTotpApiError";
    this.status = status;
    this.payload = payload;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const maybe = payload as Record<string, unknown>;
  const msg = typeof maybe.error === "string" ? maybe.error : null;
  return msg && msg.trim() ? msg : null;
}

/** Maximum number of retries on transient network errors */
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 800;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function requestAuthedJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  // ── 1. Get access token ────────────────────────────────────────────
  let token: string | null = null;
  try {
    token = await getConsumerAccessToken();
  } catch (tokenErr) {
    console.error("[consumerTotpApi] Error getting access token:", tokenErr);
    throw new ConsumerTotpApiError(
      "Impossible de récupérer votre session. Veuillez vous reconnecter.",
      401,
      tokenErr,
    );
  }

  if (!token) {
    throw new ConsumerTotpApiError("Not authenticated", 401);
  }

  // ── 2. Fetch with retry (network errors only) ─────────────────────
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Retrying request
      await wait(RETRY_DELAY_MS * attempt);
    }

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
      lastError = e;
      console.error(`[consumerTotpApi] Network error on ${path} (attempt ${attempt + 1}):`, e);
      // Retry on network errors
      continue;
    }

    // ── 3. Parse response ──────────────────────────────────────────
    let payload: unknown = null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      payload = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => "");
      payload = text;
      if (!res.ok) {
        // Non-JSON error response
      }
    }

    if (!res.ok) {
      const msg = extractErrorMessage(payload) || `Erreur serveur (${res.status})`;
      throw new ConsumerTotpApiError(msg, res.status, payload);
    }

    return payload as T;
  }

  // ── 4. All retries exhausted ───────────────────────────────────────
  // All retries exhausted
  throw new ConsumerTotpApiError(
    "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
    0,
    lastError,
  );
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get or create TOTP secret for current user
 * Call this first to initialize the user's QR code
 */
export async function fetchConsumerTOTPSecret(): Promise<TOTPSecretResponse> {
  return requestAuthedJson<TOTPSecretResponse>("/api/consumer/totp/secret", {
    method: "GET",
  });
}

/**
 * Generate current TOTP code for user
 * Returns the QR string and code that changes every 30 seconds
 */
export async function fetchConsumerTOTPCode(): Promise<TOTPCodeResponse> {
  return requestAuthedJson<TOTPCodeResponse>("/api/consumer/totp/code", {
    method: "GET",
  });
}

/**
 * Regenerate TOTP secret (if compromised)
 * This invalidates the old secret and generates a new one
 */
export async function regenerateConsumerTOTPSecret(): Promise<TOTPSecretResponse> {
  return requestAuthedJson<TOTPSecretResponse>("/api/consumer/totp/regenerate", {
    method: "POST",
  });
}

/**
 * Validate a user QR code (for Pro scanner)
 * @param qrString - The full QR string from scanning
 * @param establishmentId - Optional establishment ID for logging
 */
export async function validateConsumerTOTPCode(
  qrString: string,
  establishmentId?: string
): Promise<TOTPValidationResult> {
  return requestAuthedJson<TOTPValidationResult>("/api/consumer/totp/validate", {
    method: "POST",
    body: JSON.stringify({ qrString, establishmentId }),
  });
}

/**
 * Get user info by ID (for Pro dashboard after validation)
 * @param userId - The user ID to look up
 */
export async function getConsumerUserInfo(
  userId: string
): Promise<ConsumerUserInfo> {
  return requestAuthedJson<ConsumerUserInfo>(
    `/api/consumer/totp/user-info/${userId}`,
    { method: "GET" }
  );
}
