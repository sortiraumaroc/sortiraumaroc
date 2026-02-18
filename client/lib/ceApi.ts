/**
 * CE Admin API — Client functions for Back Office CE management
 */

import { getAdminHeaders } from "@/lib/adminApi";
import type {
  Company,
  CompanyWithStats,
  ProCeAdvantage,
  CeDashboardStats,
  CreateCompanyPayload,
  UpdateCompanyPayload,
  CreateAdvantagePayload,
  UpdateAdvantagePayload,
  EmployeeWithUser,
  ScanWithDetails,
} from "../../shared/ceTypes";

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

// --- Companies ---

export async function listCeCompanies(params?: Record<string, string>): Promise<PaginatedResponse<CompanyWithStats>> {
  const qs = new URLSearchParams(params ?? {}).toString();
  return adminJson(`/api/admin/ce/companies${qs ? `?${qs}` : ""}`);
}

export async function getCeCompany(id: string): Promise<{ ok: true; data: Company }> {
  return adminJson(`/api/admin/ce/companies/${id}`);
}

export async function createCeCompany(payload: CreateCompanyPayload): Promise<{ ok: true; data: Company }> {
  return adminJson("/api/admin/ce/companies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCeCompany(id: string, payload: UpdateCompanyPayload): Promise<{ ok: true; data: Company }> {
  return adminJson(`/api/admin/ce/companies/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteCeCompany(id: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ce/companies/${id}`, { method: "DELETE" });
}

export async function regenerateCeCompanyLink(id: string): Promise<{ ok: true; data: { id: string; registration_code: string; slug: string } }> {
  return adminJson(`/api/admin/ce/companies/${id}/regenerate-link`, { method: "POST" });
}

// --- Employees ---

export async function listCeCompanyEmployees(companyId: string, params?: Record<string, string>): Promise<PaginatedResponse<EmployeeWithUser>> {
  const qs = new URLSearchParams(params ?? {}).toString();
  return adminJson(`/api/admin/ce/companies/${companyId}/employees${qs ? `?${qs}` : ""}`);
}

// --- Scans ---

export async function listCeCompanyScans(companyId: string, params?: Record<string, string>): Promise<PaginatedResponse<ScanWithDetails>> {
  const qs = new URLSearchParams(params ?? {}).toString();
  return adminJson(`/api/admin/ce/companies/${companyId}/scans${qs ? `?${qs}` : ""}`);
}

// --- Dashboard ---

export async function getCeDashboard(): Promise<{ ok: true; data: CeDashboardStats }> {
  return adminJson("/api/admin/ce/dashboard");
}

// --- Advantages ---

export async function listCeAdvantages(params?: Record<string, string>): Promise<PaginatedResponse<ProCeAdvantage & { establishments: any }>> {
  const qs = new URLSearchParams(params ?? {}).toString();
  return adminJson(`/api/admin/ce/advantages${qs ? `?${qs}` : ""}`);
}

export async function createCeAdvantage(establishmentId: string, payload: Omit<CreateAdvantagePayload, "establishment_id">): Promise<{ ok: true; data: ProCeAdvantage }> {
  return adminJson(`/api/admin/ce/establishments/${establishmentId}/advantages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCeAdvantage(id: string, payload: UpdateAdvantagePayload): Promise<{ ok: true; data: ProCeAdvantage }> {
  return adminJson(`/api/admin/ce/advantages/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteCeAdvantage(id: string): Promise<{ ok: true }> {
  return adminJson(`/api/admin/ce/advantages/${id}`, { method: "DELETE" });
}

// --- CSV Exports ---

export function getCeExportCompaniesUrl(): string {
  return "/api/admin/ce/export/companies";
}

export function getCeExportEmployeesUrl(companyId: string): string {
  return `/api/admin/ce/export/employees/${companyId}`;
}

export function getCeExportScansUrl(): string {
  return "/api/admin/ce/export/scans";
}
