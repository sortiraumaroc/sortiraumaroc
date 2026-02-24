/**
 * Partnership Admin API — Client functions for Back Office Partnership management
 */

import { getAdminHeaders } from "@/lib/adminApi";
import type {
  AgreementWithEstablishment,
  AgreementDetail,
  PartnershipDashboardStats,
  CreateAgreementPayload,
  UpdateAgreementPayload,
  CreateAgreementLinePayload,
  UpdateAgreementLinePayload,
  AgreementLine,
  PartnerAgreement,
} from "../../shared/partnershipTypes";

type PaginatedResponse<T> = { ok: true; data: T[]; total: number; page: number; limit: number };

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...getAdminHeaders(), ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Erreur serveur");
  return json;
}

// --- Agreements ---

export async function listPartnerships(params?: Record<string, string>): Promise<PaginatedResponse<AgreementWithEstablishment>> {
  const qs = new URLSearchParams(params ?? {}).toString();
  return adminJson(`/api/admin/partnerships${qs ? `?${qs}` : ""}`);
}

export async function getPartnership(id: string): Promise<{ ok: true; data: AgreementDetail }> {
  return adminJson(`/api/admin/partnerships/${id}`);
}

export async function createPartnership(payload: CreateAgreementPayload): Promise<{ ok: true; data: PartnerAgreement }> {
  return adminJson("/api/admin/partnerships", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePartnership(id: string, payload: UpdateAgreementPayload): Promise<{ ok: true; data: PartnerAgreement }> {
  return adminJson(`/api/admin/partnerships/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deletePartnership(id: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/partnerships/${id}`, { method: "DELETE" });
}

// --- Agreement Lines ---

export async function addPartnershipLine(agreementId: string, payload: CreateAgreementLinePayload): Promise<{ ok: true; data: AgreementLine }> {
  return adminJson(`/api/admin/partnerships/${agreementId}/lines`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePartnershipLine(agreementId: string, lineId: string, payload: UpdateAgreementLinePayload): Promise<{ ok: true; data: AgreementLine }> {
  return adminJson(`/api/admin/partnerships/${agreementId}/lines/${lineId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deletePartnershipLine(agreementId: string, lineId: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/partnerships/${agreementId}/lines/${lineId}`, { method: "DELETE" });
}

// --- Actions ---

export async function sendPartnershipProposal(id: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/partnerships/${id}/send-proposal`, { method: "POST" });
}

// --- Dashboard ---

export async function getPartnershipDashboard(): Promise<{ ok: true; data: PartnershipDashboardStats }> {
  return adminJson("/api/admin/partnerships/dashboard");
}

// --- CSV Exports ---

export function getPartnershipExportUrl(): string {
  return "/api/admin/partnerships/export";
}
