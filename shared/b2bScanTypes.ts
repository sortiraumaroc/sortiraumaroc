// ============================================================
// Module B2B Scans Unifies (CE + Conciergerie) — Shared Types
// ============================================================

export const B2B_SCAN_TYPES = ["ce", "conciergerie"] as const;
export type B2bScanType = (typeof B2B_SCAN_TYPES)[number];

export const B2B_SCAN_STATUSES = ["validated", "refused", "expired"] as const;
export type B2bScanStatus = (typeof B2B_SCAN_STATUSES)[number];

// DB row
export type B2bScan = {
  id: string;
  scan_type: B2bScanType;
  establishment_id: string;
  scan_datetime: string;
  status: B2bScanStatus;
  refusal_reason: string | null;
  scanned_by: string | null;
  sam_commission_amount: number | null;
  // CE fields
  employee_id: string | null;
  company_id: string | null;
  advantage_id: string | null;
  agreement_line_id: string | null;
  // Conciergerie fields
  step_request_id: string | null;
  concierge_id: string | null;
  journey_id: string | null;
  client_name: string | null;
  created_at: string;
};

// Enriched for display
export type B2bScanWithDetails = B2bScan & {
  establishment_name?: string;
  company_name?: string;
  employee_name?: string;
  concierge_name?: string;
  advantage_description?: string;
};

// Conciergerie scan validation result
export type ConciergerieScanValidationResult = {
  valid: boolean;
  client_name: string | null;
  concierge_name: string | null;
  journey_title: string | null;
  step_description: string | null;
  establishment_name: string | null;
  refusal_reason: string | null;
  scanId?: string;
};

// Dashboard stats
export type B2bScanDashboardStats = {
  total_ce: number;
  total_conciergerie: number;
  today_ce: number;
  today_conciergerie: number;
  this_month_ce: number;
  this_month_conciergerie: number;
};
