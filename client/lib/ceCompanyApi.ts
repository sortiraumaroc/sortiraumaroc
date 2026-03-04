/**
 * CE Company Admin API — Client functions for the company management portal
 *
 * Uses consumer Supabase auth token (company admins are consumer users).
 */

import { getConsumerAccessToken } from "@/lib/auth";
import type {
  Company,
  CompanyDashboardStats,
  EmployeeWithUser,
  ScanWithDetails,
} from "../../shared/ceTypes";

type PaginatedResponse<T> = { ok: true; data: T[]; total: number; page: number; limit: number };

async function ceAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
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

// --- Company Info ---

export async function getCeCompanyMe(): Promise<{ ok: true; data: Company }> {
  return ceAdminJson("/api/ce/company/me");
}

// --- Employees ---

export async function listCeCompanyEmployees(params?: Record<string, string>): Promise<PaginatedResponse<EmployeeWithUser>> {
  const qs = new URLSearchParams(params ?? {}).toString();
  return ceAdminJson(`/api/ce/company/employees${qs ? `?${qs}` : ""}`);
}

export async function validateCeEmployee(id: string): Promise<{ ok: true }> {
  return ceAdminJson(`/api/ce/company/employees/${id}/validate`, { method: "PUT" });
}

export async function suspendCeEmployee(id: string): Promise<{ ok: true }> {
  return ceAdminJson(`/api/ce/company/employees/${id}/suspend`, { method: "PUT" });
}

export async function reactivateCeEmployee(id: string): Promise<{ ok: true }> {
  return ceAdminJson(`/api/ce/company/employees/${id}/reactivate`, { method: "PUT" });
}

export async function deleteCeEmployee(id: string): Promise<{ ok: true }> {
  return ceAdminJson(`/api/ce/company/employees/${id}`, { method: "DELETE" });
}

// --- Scans ---

export async function listCeCompanyScans(params?: Record<string, string>): Promise<PaginatedResponse<ScanWithDetails>> {
  const qs = new URLSearchParams(params ?? {}).toString();
  return ceAdminJson(`/api/ce/company/scans${qs ? `?${qs}` : ""}`);
}

// --- Dashboard ---

export async function getCeCompanyDashboard(): Promise<{ ok: true; data: CompanyDashboardStats }> {
  return ceAdminJson("/api/ce/company/dashboard");
}

// --- Settings ---

export async function updateCeCompanySettings(payload: {
  auto_validate_employees?: boolean;
  auto_validate_domain?: string | null;
  welcome_message?: string | null;
}): Promise<{ ok: true; data: Company }> {
  return ceAdminJson("/api/ce/company/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// --- CSV Exports ---

export function getCeCompanyExportEmployeesUrl(): string {
  return "/api/ce/company/export/employees";
}

export function getCeCompanyExportScansUrl(): string {
  return "/api/ce/company/export/scans";
}
