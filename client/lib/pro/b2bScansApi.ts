import { proSupabase } from "./supabase";
import type { ConciergerieScanValidationResult, B2bScanWithDetails } from "@shared/b2bScanTypes";

async function getProToken(): Promise<string> {
  const { data } = await proSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

async function proFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getProToken();
  const res = await fetch(path, {
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

export function scanConciergerieQr(
  payload: string,
  establishmentId: string,
): Promise<ConciergerieScanValidationResult> {
  return proFetch<ConciergerieScanValidationResult>(
    "/api/pro/conciergerie/scan",
    {
      method: "POST",
      body: JSON.stringify({ payload, establishment_id: establishmentId }),
    },
  );
}

export function listConciergerieScans(
  establishmentId: string,
  params?: { page?: number; limit?: number },
): Promise<{ scans: B2bScanWithDetails[]; total: number; page: number; limit: number }> {
  const qs = new URLSearchParams({ establishment_id: establishmentId });
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  return proFetch(`/api/pro/conciergerie/scans?${qs}`);
}
