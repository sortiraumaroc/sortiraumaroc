// ============================================================
// Module Conciergerie — Shared Types
// ============================================================

// --- Enums ---

export const CONCIERGE_TYPES = ["hotel", "riad", "agency", "other"] as const;
export type ConciergeType = (typeof CONCIERGE_TYPES)[number];

export const CONCIERGE_STATUSES = ["pending", "active", "suspended"] as const;
export type ConciergeStatus = (typeof CONCIERGE_STATUSES)[number];

export const CONCIERGE_USER_ROLES = ["admin", "operator"] as const;
export type ConciergeUserRole = (typeof CONCIERGE_USER_ROLES)[number];

export const CONCIERGE_USER_STATUSES = ["active", "suspended"] as const;
export type ConciergeUserStatus = (typeof CONCIERGE_USER_STATUSES)[number];

export const JOURNEY_STATUSES = ["draft", "requesting", "partially_accepted", "confirmed", "cancelled", "completed"] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export const STEP_STATUSES = ["pending", "requesting", "accepted", "refused_all", "cancelled"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const REQUEST_STATUSES = ["pending", "accepted", "refused", "expired", "superseded"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STEP_UNIVERSES = ["restaurant", "loisir", "hebergement", "sport", "culture", "wellness"] as const;
export type StepUniverse = (typeof STEP_UNIVERSES)[number];

// --- DB Row Types ---

export type Concierge = {
  id: string;
  name: string;
  type: ConciergeType;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  commission_rate: number;
  status: ConciergeStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConciergeUser = {
  id: string;
  concierge_id: string;
  user_id: string;
  role: ConciergeUserRole;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  status: ConciergeUserStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ExperienceJourney = {
  id: string;
  concierge_id: string;
  created_by: string | null;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  client_notes: string | null;
  party_size: number;
  title: string | null;
  desired_date: string;
  desired_time_start: string | null;
  desired_time_end: string | null;
  city: string | null;
  status: JourneyStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type JourneyStep = {
  id: string;
  journey_id: string;
  step_order: number;
  universe: StepUniverse | null;
  category: string | null;
  description: string | null;
  budget_min: number | null;
  budget_max: number | null;
  accepted_establishment_id: string | null;
  accepted_at: string | null;
  confirmed_price: number | null;
  status: StepStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type StepRequest = {
  id: string;
  step_id: string;
  establishment_id: string;
  message: string | null;
  party_size: number | null;
  desired_date: string | null;
  desired_time: string | null;
  budget_hint: string | null;
  status: RequestStatus;
  response_note: string | null;
  proposed_price: number | null;
  responded_at: string | null;
  responded_by: string | null;
  version: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

// --- API Payloads ---

export type CreateJourneyPayload = {
  client_name: string;
  client_phone?: string;
  client_email?: string;
  client_notes?: string;
  party_size: number;
  title?: string;
  desired_date: string;
  desired_time_start?: string;
  desired_time_end?: string;
  city?: string;
  steps: CreateStepPayload[];
};

export type CreateStepPayload = {
  step_order: number;
  universe?: StepUniverse;
  category?: string;
  description?: string;
  budget_min?: number;
  budget_max?: number;
};

export type SendStepRequestsPayload = {
  establishment_ids: string[];
  message?: string;
};

export type AcceptRequestPayload = {
  proposed_price?: number;
  response_note?: string;
};

export type RefuseRequestPayload = {
  response_note?: string;
};

// --- API Response Types ---

export type ConciergeProfile = {
  concierge: Concierge;
  user: ConciergeUser;
};

export type JourneyWithSteps = ExperienceJourney & {
  steps: (JourneyStep & {
    requests: (StepRequest & {
      establishment_name?: string;
      establishment_slug?: string;
      establishment_cover_url?: string;
    })[];
  })[];
};

export type JourneyListItem = ExperienceJourney & {
  steps_count: number;
  accepted_steps_count: number;
};

export type ProConciergerieRequest = StepRequest & {
  step: JourneyStep & {
    journey: {
      id: string;
      title: string | null;
      client_name: string;
      party_size: number;
      desired_date: string;
      desired_time_start: string | null;
      desired_time_end: string | null;
      city: string | null;
    };
  };
  concierge_name: string;
};
