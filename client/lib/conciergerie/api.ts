import { conciergerieSupabase } from "./supabase";
import type {
  ConciergeProfile,
  JourneyListItem,
  JourneyWithSteps,
  CreateJourneyPayload,
  SendStepRequestsPayload,
  AcceptRequestPayload,
  RefuseRequestPayload,
} from "@shared/conciergerieTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string> {
  const { data } = await conciergerieSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

async function apiFetch<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`/api/conciergerie${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth / Profile
// ---------------------------------------------------------------------------

export function getMyProfile(): Promise<ConciergeProfile> {
  return apiFetch<ConciergeProfile>("/me");
}

// ---------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------

export function listJourneys(params?: {
  status?: string;
  page?: number;
  per_page?: number;
}): Promise<{ journeys: JourneyListItem[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.page) q.set("page", String(params.page));
  if (params?.per_page) q.set("per_page", String(params.per_page));
  const qs = q.toString();
  return apiFetch(`/journeys${qs ? `?${qs}` : ""}`);
}

export function getJourney(id: string): Promise<JourneyWithSteps> {
  return apiFetch(`/journeys/${id}`);
}

export function createJourney(
  payload: CreateJourneyPayload,
): Promise<JourneyWithSteps> {
  return apiFetch("/journeys", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateJourney(
  id: string,
  payload: Partial<CreateJourneyPayload>,
): Promise<JourneyWithSteps> {
  return apiFetch(`/journeys/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteJourney(id: string): Promise<{ ok: true }> {
  return apiFetch(`/journeys/${id}`, { method: "DELETE" });
}

export function sendJourneyRequests(
  journeyId: string,
): Promise<JourneyWithSteps> {
  return apiFetch(`/journeys/${journeyId}/send`, { method: "POST" });
}

export function sendStepRequests(
  stepId: string,
  payload: SendStepRequestsPayload,
): Promise<{ ok: true }> {
  return apiFetch(`/steps/${stepId}/requests`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Search establishments (for journey builder)
// ---------------------------------------------------------------------------

export type EstablishmentSearchResult = {
  id: string;
  name: string;
  slug: string;
  cover_url: string | null;
  city: string | null;
  universe: string | null;
  category: string | null;
  rating: number | null;
};

export function searchEstablishments(params: {
  q?: string;
  city?: string;
  universe?: string;
  category?: string;
  limit?: number;
}): Promise<{ results: EstablishmentSearchResult[] }> {
  const q = new URLSearchParams();
  if (params.q) q.set("q", params.q);
  if (params.city) q.set("city", params.city);
  if (params.universe) q.set("universe", params.universe);
  if (params.category) q.set("category", params.category);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch(`/search/establishments${qs ? `?${qs}` : ""}`);
}

// ---------------------------------------------------------------------------
// Pro inbox API (uses /api/pro/conciergerie prefix)
// ---------------------------------------------------------------------------

async function proApiFetch<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  // Pro uses a different Supabase client — get token from pro space
  // This is imported dynamically to avoid circular deps
  const { proSupabase } = await import("@/lib/pro/supabase");
  const { data } = await proSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`/api/pro/conciergerie${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function listProConciergerieRequests(params?: {
  status?: string;
  establishment_id?: string;
}): Promise<{ requests: import("@shared/conciergerieTypes").ProConciergerieRequest[] }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.establishment_id) q.set("establishment_id", params.establishment_id);
  const qs = q.toString();
  return proApiFetch(`/requests${qs ? `?${qs}` : ""}`);
}

export function getProConciergerieRequest(
  id: string,
): Promise<import("@shared/conciergerieTypes").ProConciergerieRequest> {
  return proApiFetch(`/requests/${id}`);
}

export function acceptProConciergerieRequest(
  id: string,
  payload: AcceptRequestPayload,
): Promise<{ ok: true }> {
  return proApiFetch(`/requests/${id}/accept`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function refuseProConciergerieRequest(
  id: string,
  payload: RefuseRequestPayload,
): Promise<{ ok: true }> {
  return proApiFetch(`/requests/${id}/refuse`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Scan QR — Conciergerie side
// ---------------------------------------------------------------------------

export function generateScanQr(
  stepRequestId: string,
): Promise<{ ok: true }> {
  return apiFetch(`/scan-qr/${stepRequestId}/generate`, { method: "POST" });
}

export function getScanQrData(
  stepRequestId: string,
): Promise<{ payload: string; expiresIn: number }> {
  return apiFetch(`/scan-qr/${stepRequestId}`);
}
