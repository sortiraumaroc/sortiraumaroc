/**
 * CE Pro API — Client functions for PRO establishments
 *
 * Scan validation, advantage management, stats.
 */

import { getConsumerAccessToken } from "@/lib/auth";
import type {
  CeScanValidationResult,
  ProCeAdvantage,
  ScanWithDetails,
} from "../../shared/ceTypes";

async function proJson<T>(path: string, init?: RequestInit): Promise<T> {
  // PRO uses the same Supabase auth token
  const token = await getConsumerAccessToken();
  if (!token) throw new Error("Non authentifié");

  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Erreur serveur");
  return json;
}

// --- Scan ---

export async function scanCeQrCode(
  qrPayload: string,
  establishmentId: string,
): Promise<{ ok: true; data: CeScanValidationResult }> {
  return proJson("/api/pro/ce/scan", {
    method: "POST",
    body: JSON.stringify({ qr_payload: qrPayload, establishment_id: establishmentId }),
  });
}

// --- Scans History ---

export async function listCeProScans(
  establishmentId: string,
  params?: Record<string, string>,
): Promise<{ ok: true; data: ScanWithDetails[]; total: number; page: number; limit: number }> {
  const qs = new URLSearchParams({ establishment_id: establishmentId, ...(params ?? {}) }).toString();
  return proJson(`/api/pro/ce/scans?${qs}`);
}

// --- Advantage ---

export async function getCeProAdvantage(
  establishmentId: string,
): Promise<{ ok: true; data: ProCeAdvantage | null }> {
  return proJson(`/api/pro/ce/advantage?establishment_id=${establishmentId}`);
}

export async function updateCeProAdvantage(
  establishmentId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; data: ProCeAdvantage }> {
  return proJson("/api/pro/ce/advantage", {
    method: "PUT",
    body: JSON.stringify({ ...payload, establishment_id: establishmentId }),
  });
}

// --- Stats ---

export async function getCeProStats(
  establishmentId: string,
): Promise<{
  ok: true;
  data: {
    scans_today: number;
    scans_this_week: number;
    scans_this_month: number;
    scans_total: number;
  };
}> {
  return proJson(`/api/pro/ce/stats?establishment_id=${establishmentId}`);
}
