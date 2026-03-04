/**
 * CE Public API — Client functions for CE employees (consumers)
 *
 * Registration, status, advantages, QR code, history, home feed.
 */

import { getConsumerAccessToken } from "@/lib/auth";
import type {
  CeEmployeeStatus,
  RegistrationInfo,
  AdvantageWithEstablishment,
  ProCeAdvantage,
} from "../../shared/ceTypes";

async function ceJson<T>(path: string, init?: RequestInit): Promise<T> {
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

// --- Registration (public, no auth) ---

export async function getCeRegistrationInfo(code: string): Promise<{ ok: true; data: RegistrationInfo }> {
  const res = await fetch(`/api/ce/registration-info/${encodeURIComponent(code)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Erreur serveur");
  return json;
}

export async function registerCeEmployee(registrationCode: string): Promise<{ ok: true; data: { employeeId: string; status: string } }> {
  return ceJson("/api/ce/register", {
    method: "POST",
    body: JSON.stringify({ registration_code: registrationCode }),
  });
}

// --- Status ---

export async function getCeStatus(): Promise<{ ok: true; data: CeEmployeeStatus }> {
  return ceJson("/api/ce/me");
}

// --- Advantages ---

export async function listCeAdvantages(params?: Record<string, string>): Promise<{ ok: true; data: AdvantageWithEstablishment[]; total: number }> {
  const qs = new URLSearchParams(params ?? {}).toString();
  return ceJson(`/api/ce/advantages${qs ? `?${qs}` : ""}`);
}

export async function getCeAdvantageForEstablishment(establishmentId: string): Promise<{ ok: true; data: (ProCeAdvantage & { uses_count: number; uses_remaining: number | null }) | null }> {
  return ceJson(`/api/ce/advantages/${establishmentId}`);
}

// --- QR Code ---

export async function getCeQrSecret(): Promise<{
  ok: true;
  data: {
    employee_id: string;
    secret: string;
    algorithm: string;
    digits: number;
    period: number;
    seconds_remaining: number;
  };
}> {
  return ceJson("/api/ce/qr/secret");
}

export async function generateCeQrCode(): Promise<{
  ok: true;
  data: {
    qr_payload: string;
    code: string;
    seconds_remaining: number;
  };
}> {
  return ceJson("/api/ce/qr/generate");
}

// --- History ---

export async function listCeHistory(params?: Record<string, string>): Promise<{
  ok: true;
  data: Array<{
    id: string;
    scan_datetime: string;
    status: string;
    establishment_name: string | null;
    establishment_slug: string | null;
    establishment_cover: string | null;
    advantage_description: string | null;
    advantage_type: string | null;
    advantage_value: number | null;
  }>;
  total: number;
}> {
  const qs = new URLSearchParams(params ?? {}).toString();
  return ceJson(`/api/ce/history${qs ? `?${qs}` : ""}`);
}

// --- Home Feed ---

export async function getCeHomeFeed(limit = 12): Promise<{ ok: true; data: any[] }> {
  return ceJson(`/api/ce/home-feed?limit=${limit}`);
}
