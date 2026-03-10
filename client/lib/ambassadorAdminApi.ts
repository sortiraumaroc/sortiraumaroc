/**
 * Ambassador Program — Admin API helpers
 */

export class AmbassadorAdminApiError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.name = "AmbassadorAdminApiError";
    this.status = status;
  }
}

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const rec = payload as Record<string, unknown> | null;
    const msg =
      (typeof rec?.error === "string" ? rec.error : null) ??
      `HTTP ${res.status}`;
    throw new AmbassadorAdminApiError(msg, res.status);
  }
  return payload as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminAmbassadorStats = {
  total_programs: number;
  active_programs: number;
  total_applications: number;
  pending_applications: number;
  total_conversions: number;
  confirmed_conversions: number;
  suspicious_conversions: number;
  total_rewards: number;
  claimed_rewards: number;
};

export type AdminAmbassadorProgram = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  reward_description: string;
  conversions_required: number;
  validity_days: number;
  max_beneficiaries_per_month: number | null;
  confirmation_mode: "manual" | "qr";
  is_active: boolean;
  created_at: string;
  ambassador_count: number;
  conversions_count: number;
};

export type AdminAmbassadorConversion = {
  id: string;
  ambassador_id: string;
  ambassador_name: string;
  visitor_id: string;
  visitor_name: string;
  establishment_id: string;
  establishment_name: string;
  program_id: string;
  status: "pending" | "confirmed" | "rejected" | "expired";
  is_suspicious: boolean;
  suspicious_reason: string | null;
  created_at: string;
  confirmed_at: string | null;
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export function getAdminAmbassadorStats() {
  return adminJson<AdminAmbassadorStats>("/api/admin/ambassador/stats");
}

export function listAdminAmbassadorPrograms(params?: {
  is_active?: boolean;
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.is_active !== undefined) qs.set("is_active", String(params.is_active));
  if (params?.page !== undefined) qs.set("page", String(params.page));
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return adminJson<{ items: AdminAmbassadorProgram[]; total: number }>(
    `/api/admin/ambassador/programs${suffix}`,
  );
}

export function listAdminAmbassadorConversions(params?: {
  status?: string;
  is_suspicious?: boolean;
  establishment_id?: string;
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.is_suspicious !== undefined) qs.set("is_suspicious", String(params.is_suspicious));
  if (params?.establishment_id) qs.set("establishment_id", params.establishment_id);
  if (params?.page !== undefined) qs.set("page", String(params.page));
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return adminJson<{ items: AdminAmbassadorConversion[]; total: number }>(
    `/api/admin/ambassador/conversions${suffix}`,
  );
}

export function listAdminSuspiciousConversions() {
  return adminJson<{ items: AdminAmbassadorConversion[]; total: number }>(
    "/api/admin/ambassador/conversions/suspicious",
  );
}

export function flagAdminConversion(
  conversionId: string,
  data: { is_suspicious: boolean; suspicious_reason?: string },
) {
  return adminJson<{ ok: true }>(
    `/api/admin/ambassador/conversions/${conversionId}/flag`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

export function forceConfirmAdminConversion(conversionId: string) {
  return adminJson<{ ok: true }>(
    `/api/admin/ambassador/conversions/${conversionId}/force-confirm`,
    { method: "POST" },
  );
}
