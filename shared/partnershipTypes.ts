// ============================================================
// Module Partner Agreements (Accords Partenaires) — Shared Types
// ============================================================

// --- Enums ---

export const AGREEMENT_STATUSES = ["draft", "proposal_sent", "in_negotiation", "active", "suspended", "expired", "refused"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const AGREEMENT_LINE_MODULES = ["ce", "conciergerie", "both"] as const;
export type AgreementLineModule = (typeof AGREEMENT_LINE_MODULES)[number];

export const AGREEMENT_LINE_TYPES = ["percentage", "fixed", "special_offer", "gift", "pack"] as const;
export type AgreementLineType = (typeof AGREEMENT_LINE_TYPES)[number];

export const AGREEMENT_HISTORY_ACTORS = ["admin", "pro", "system"] as const;
export type AgreementHistoryActor = (typeof AGREEMENT_HISTORY_ACTORS)[number];

export const AGREEMENT_COMMISSION_TYPES = ["percentage", "fixed"] as const;
export type AgreementCommissionType = (typeof AGREEMENT_COMMISSION_TYPES)[number];

// --- Status labels & colors (for UI) ---

export const AGREEMENT_STATUS_CONFIG: Record<AgreementStatus, { label: string; color: string }> = {
  draft: { label: "Brouillon", color: "slate" },
  proposal_sent: { label: "Proposition envoyée", color: "blue" },
  in_negotiation: { label: "En négociation", color: "amber" },
  active: { label: "Actif", color: "green" },
  suspended: { label: "Suspendu", color: "orange" },
  expired: { label: "Expiré", color: "red" },
  refused: { label: "Refusé", color: "red" },
};

export const MODULE_LABELS: Record<AgreementLineModule, string> = {
  ce: "CE",
  conciergerie: "Conciergerie",
  both: "CE + Conciergerie",
};

// --- DB Row Types ---

export type PartnerAgreement = {
  id: string;
  establishment_id: string;
  status: AgreementStatus;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  start_date: string | null;
  end_date: string | null;
  commission_rate: number | null;
  notes: string | null;
  created_by: string | null;
  signed_at: string | null;
  signed_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AgreementLine = {
  id: string;
  agreement_id: string;
  establishment_id: string;
  module: AgreementLineModule;
  advantage_type: AgreementLineType;
  advantage_value: number | null;
  description: string | null;
  conditions: string | null;
  start_date: string | null;
  end_date: string | null;
  max_uses_per_employee: number;
  max_uses_total: number;
  target_companies: string[] | "all";
  sam_commission_type: AgreementCommissionType | null;
  sam_commission_value: number | null;
  is_active: boolean;
  toggled_by_pro: boolean;
  toggled_by_pro_at: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AgreementHistoryEntry = {
  id: string;
  agreement_id: string;
  actor_type: AgreementHistoryActor;
  actor_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

// --- API Payloads ---

export type CreateAgreementPayload = {
  establishment_id: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  start_date?: string;
  end_date?: string;
  commission_rate?: number;
  notes?: string;
  lines?: CreateAgreementLinePayload[];
};

export type UpdateAgreementPayload = Partial<Omit<CreateAgreementPayload, "establishment_id" | "lines">> & {
  status?: AgreementStatus;
};

export type CreateAgreementLinePayload = {
  module?: AgreementLineModule;
  advantage_type: AgreementLineType;
  advantage_value?: number;
  description?: string;
  conditions?: string;
  start_date?: string;
  end_date?: string;
  max_uses_per_employee?: number;
  max_uses_total?: number;
  target_companies?: string[] | "all";
  sam_commission_type?: AgreementCommissionType;
  sam_commission_value?: number;
  sort_order?: number;
};

export type UpdateAgreementLinePayload = Partial<CreateAgreementLinePayload> & {
  is_active?: boolean;
};

// --- API Response Types ---

export type AgreementWithEstablishment = PartnerAgreement & {
  establishment_name: string | null;
  establishment_slug: string | null;
  establishment_city: string | null;
  establishment_universe: string | null;
  establishment_category: string | null;
  establishment_cover_url: string | null;
  lines_count: number;
  active_lines_count: number;
  ce_lines_count: number;
  conciergerie_lines_count: number;
};

export type AgreementDetail = PartnerAgreement & {
  establishment_name: string | null;
  establishment_slug: string | null;
  establishment_city: string | null;
  establishment_universe: string | null;
  establishment_category: string | null;
  establishment_cover_url: string | null;
  lines: AgreementLine[];
  history: AgreementHistoryEntry[];
};

export type PartnershipDashboardStats = {
  total_agreements: number;
  active_agreements: number;
  draft_agreements: number;
  proposal_sent_count: number;
  in_negotiation_count: number;
  suspended_count: number;
  expiring_30d: number;
  refused_count: number;
  total_lines: number;
  active_lines: number;
  lines_by_module: { ce: number; conciergerie: number; both: number };
};

// --- Pro-facing types (subset without sensitive fields) ---

export type ProAgreementView = Omit<PartnerAgreement, "commission_rate" | "notes" | "created_by"> & {
  establishment_name: string | null;
  lines: ProAgreementLineView[];
};

export type ProAgreementLineView = Omit<AgreementLine, "sam_commission_type" | "sam_commission_value" | "created_by" | "target_companies"> & {
  uses_count?: number;
};
