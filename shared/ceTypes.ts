// ============================================================
// Module CE (Comité d'Entreprise) — Shared Types
// ============================================================

// --- Enums ---

export const COMPANY_STATUSES = ["active", "suspended", "expired"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const EMPLOYEE_STATUSES = ["pending", "active", "suspended", "deleted"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const ADVANTAGE_TYPES = ["percentage", "fixed", "special_offer", "gift", "pack"] as const;
export type AdvantageType = (typeof ADVANTAGE_TYPES)[number];

export const SCAN_STATUSES = ["validated", "refused", "expired"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const COMPANY_ADMIN_ROLES = ["admin", "viewer"] as const;
export type CompanyAdminRole = (typeof COMPANY_ADMIN_ROLES)[number];

// --- DB Row Types ---

export type Company = {
  id: string;
  name: string;
  ice_siret: string | null;
  address: string | null;
  sector: string | null;
  estimated_employees: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  slug: string;
  registration_code: string;
  contract_start_date: string | null;
  contract_end_date: string | null;
  auto_validate_employees: boolean;
  auto_validate_domain: string | null;
  welcome_message: string | null;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CompanyAdmin = {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyAdminRole;
  created_at: string;
  deleted_at: string | null;
};

export type CompanyEmployee = {
  id: string;
  company_id: string;
  user_id: string;
  employee_number: string | null;
  status: EmployeeStatus;
  validated_at: string | null;
  validated_by: string | null;
  qr_code_hash: string | null;
  profile_complete: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProCeAdvantage = {
  id: string;
  establishment_id: string;
  is_active: boolean;
  advantage_type: AdvantageType;
  advantage_value: number | null;
  description: string | null;
  conditions: string | null;
  start_date: string | null;
  end_date: string | null;
  max_uses_per_employee: number;
  max_uses_total: number;
  target_companies: string[] | "all";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CeScan = {
  id: string;
  employee_id: string;
  company_id: string;
  establishment_id: string;
  advantage_id: string;
  scan_datetime: string;
  status: ScanStatus;
  refusal_reason: string | null;
  scanned_by: string | null;
  created_at: string;
};

export type CeTotpSecret = {
  id: string;
  employee_id: string;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
  is_active: boolean;
  validation_count: number;
  last_used_at: string | null;
  created_at: string;
};

// --- API Payloads ---

export type CreateCompanyPayload = {
  name: string;
  ice_siret?: string;
  address?: string;
  sector?: string;
  estimated_employees?: number;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  logo_url?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  auto_validate_employees?: boolean;
  auto_validate_domain?: string;
  welcome_message?: string;
};

export type UpdateCompanyPayload = Partial<CreateCompanyPayload> & {
  status?: CompanyStatus;
};

export type CreateAdvantagePayload = {
  establishment_id: string;
  advantage_type: AdvantageType;
  advantage_value?: number;
  description?: string;
  conditions?: string;
  start_date?: string;
  end_date?: string;
  max_uses_per_employee?: number;
  max_uses_total?: number;
  target_companies?: string[] | "all";
};

export type UpdateAdvantagePayload = Partial<Omit<CreateAdvantagePayload, "establishment_id">> & {
  is_active?: boolean;
};

// --- API Response Types ---

export type CompanyWithStats = Company & {
  employees_count: number;
  active_employees_count: number;
  pending_employees_count: number;
  scans_this_month: number;
};

export type EmployeeWithUser = CompanyEmployee & {
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  user_avatar: string | null;
  last_scan_at: string | null;
  last_scan_establishment: string | null;
};

export type AdvantageWithEstablishment = ProCeAdvantage & {
  establishment_name: string | null;
  establishment_slug: string | null;
  establishment_cover_url: string | null;
  establishment_city: string | null;
  establishment_universe: string | null;
  establishment_category: string | null;
  establishment_rating: number | null;
  establishment_lat: number | null;
  establishment_lng: number | null;
  uses_count: number;
};

export type ScanWithDetails = CeScan & {
  employee_name: string | null;
  employee_display_name: string | null;
  company_name: string | null;
  establishment_name: string | null;
  establishment_slug: string | null;
  advantage_description: string | null;
  advantage_type: AdvantageType;
  advantage_value: number | null;
};

export type CeDashboardStats = {
  total_companies: number;
  active_companies: number;
  total_employees: number;
  active_employees: number;
  pending_employees: number;
  total_advantages: number;
  active_advantages: number;
  scans_today: number;
  scans_this_week: number;
  scans_this_month: number;
  top_establishments: Array<{
    establishment_id: string;
    establishment_name: string;
    scans_count: number;
  }>;
};

export type CompanyDashboardStats = {
  total_employees: number;
  active_employees: number;
  pending_employees: number;
  suspended_employees: number;
  scans_today: number;
  scans_this_week: number;
  scans_this_month: number;
  top_establishments: Array<{
    establishment_id: string;
    establishment_name: string;
    scans_count: number;
  }>;
};

export type CeEmployeeStatus = {
  is_ce_employee: boolean;
  status: EmployeeStatus | null;
  company: {
    id: string;
    name: string;
    logo_url: string | null;
  } | null;
  profile_complete: boolean;
  employee_id: string | null;
};

export type CeScanValidationResult = {
  valid: boolean;
  employee_name: string | null;
  company_name: string | null;
  advantage: {
    description: string | null;
    type: AdvantageType;
    value: number | null;
    conditions: string | null;
  } | null;
  refusal_reason: string | null;
};

export type RegistrationInfo = {
  company_name: string;
  company_logo_url: string | null;
  welcome_message: string | null;
  valid: boolean;
  reason?: string;
};
