export type AdminHealthResponse = { ok: true; session_token?: string } | { ok: false; error: string };

export type AdminApiErrorPayload = { error?: string };

export type ModerationQueueStatus =
  | "pending"
  | "approved"
  | "rejected"
  | string;

export type ModerationQueueItem = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action?: string | null;
  payload: unknown;
  status: ModerationQueueStatus;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
};

export type EstablishmentProfileDraftChangeAdmin = {
  id: string;
  draft_id: string;
  establishment_id: string;
  field: string;
  before: unknown;
  after: unknown;
  status: string;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

export type EstablishmentPendingProfileUpdateAdmin = {
  draft: {
    id: string;
    establishment_id: string;
    created_by: string;
    created_at: string;
    moderation_id: string | null;
    status: string;
    decided_at: string | null;
    reason: string | null;
  };
  author: { user_id: string; email: string | null };
  changes: EstablishmentProfileDraftChangeAdmin[];
};

export type EstablishmentStatus =
  | "pending"
  | "active"
  | "disabled"
  | "rejected"
  | string;

export type Establishment = {
  id: string;
  name?: string | null;
  title?: string | null;
  type?: string | null;
  city?: string | null;
  universe?: string | null;
  subcategory?: string | null;
  status?: EstablishmentStatus | null;
  created_at?: string | null;
  updated_at?: string | null;
  // Admin flags
  verified?: boolean;
  premium?: boolean;
  curated?: boolean;
};

export type ProUserAdmin = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  establishments_count: number;
  establishment_ids: string[];
  roles: Record<string, number>;
};

export type ProMembershipAdmin = {
  establishment_id: string;
  role: string;
  establishment: {
    id: string;
    name: string | null;
    title: string | null;
    city: string | null;
    status: string | null;
    universe: string | null;
    subcategory: string | null;
    created_at: string | null;
  } | null;
};

export type ReservationAdmin = {
  id: string;
  booking_reference: string | null;
  establishment_id: string;
  status: string | null;
  payment_status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  party_size: number | null;
  amount_total: number | null;
  amount_deposit: number | null;
  currency: string | null;
  checked_in_at: string | null;
  meta: unknown;
};

export type SupportTicketAdmin = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string | null;
  priority: string | null;
  establishment_id: string | null;
  created_by_user_id: string | null;
  created_by_role: string | null;
  subject: string | null;
  body: string | null;
  assignee_user_id: string | null;
};

export type SupportTicketMessageAdmin = {
  id: string;
  ticket_id: string;
  created_at: string;
  from_role: string;
  author_user_id: string | null;
  body: string;
  is_internal: boolean;
  meta: unknown;
};

export type ContentPageAdmin = {
  id: string;

  // Stable internal key + public slugs
  page_key: string;
  slug: string;
  slug_fr: string;
  slug_en: string;

  // status
  status: "draft" | "published" | string;
  is_published: boolean;

  // legacy/compat
  title: string;
  body_markdown: string;

  created_at: string;
  updated_at: string;

  // UI
  title_fr: string;
  title_en: string;
  page_subtitle_fr: string;
  page_subtitle_en: string;

  // legacy html (still supported)
  body_html_fr: string;
  body_html_en: string;

  // SEO (preferred)
  seo_title_fr: string;
  seo_title_en: string;
  seo_description_fr: string;
  seo_description_en: string;

  // SEO legacy (compat)
  meta_title_fr: string;
  meta_title_en: string;
  meta_description_fr: string;
  meta_description_en: string;

  // OG
  og_title_fr: string;
  og_title_en: string;
  og_description_fr: string;
  og_description_en: string;
  og_image_url: string | null;

  canonical_url_fr: string;
  canonical_url_en: string;
  robots: string;

  show_toc: boolean;
  related_links: unknown;

  schema_jsonld_fr: unknown;
  schema_jsonld_en: unknown;
};

export type FaqArticleAdmin = {
  id: string;
  category: string | null;
  display_order: number;
  title: string;
  body: string;
  question_fr: string;
  question_en: string;
  answer_html_fr: string;
  answer_html_en: string;
  tags: string[] | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type CmsBlockAdmin = {
  id: string;
  sort_order: number;
  type: string;
  is_enabled: boolean;
  data: unknown;
  data_fr: unknown;
  data_en: unknown;
  created_at: string;
  updated_at: string;
};

export type CmsBlockInput = {
  type: string;
  is_enabled?: boolean;
  data?: unknown;
  data_fr?: unknown;
  data_en?: unknown;
};

export type BlogArticleAdmin = {
  id: string;
  slug: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  // legacy/compat
  title: string;
  description_google: string;
  short: string;
  content: string;
  img: string;
  miniature: string;
  // bilingual + SEO
  title_fr: string;
  title_en: string;
  excerpt_fr: string;
  excerpt_en: string;
  body_html_fr: string;
  body_html_en: string;
  meta_title_fr: string;
  meta_title_en: string;
  meta_description_fr: string;
  meta_description_en: string;
  // metadata (compat + phase 1)
  author_name: string;
  category: string;

  author_id: string | null;
  primary_category_id: string | null;
  secondary_category_ids: string[];

  show_read_count: boolean;
  read_count: number;
};

export type BlogAuthorAdmin = {
  id: string;
  slug: string;
  display_name: string;
  bio_short: string;
  avatar_url: string | null;
  role: "editor" | "team" | "guest" | "sam";
  profile_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BlogCategoryAdmin = {
  id: string;
  slug: string;
  title: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type BlogArticleBlockAdmin = CmsBlockAdmin & {
  article_id: string;
};

export type ContentPageBlockAdmin = CmsBlockAdmin & {
  page_id: string;
};

// ---------------------------------------------------------------------------
// MODE A (MySQL schema-only) — Content/Blog (fixed pages + blog_article)
// These mirror the provided MySQL schema names/fields.
// ---------------------------------------------------------------------------

export type MysqlFixedContentPageAdmin = {
  key: "about" | "contact" | "careers" | "terms" | "privacy" | "faq";
  label: string;
  content_id: number;
  titre: string;
  exists: boolean;
  updated_at: string | null;
};

export type MysqlContentRowAdmin = {
  id: number;
  titre: string;
  contenu: string;
  updated_at: string | null;
};

export type MysqlBlogCategoryAdmin = {
  blog_category_id: number;
  name: string;
  title: string;
  slug: string;
  icon: string;
};

export type MysqlBlogAuthorAdmin = {
  blog_author_id: number;
  name: string;
  title: string;
  description: string;
  img: string;
  email: string;
  password: string;
  status: 0 | 1;
};

export type MysqlBlogArticleAdmin = {
  blog_article_id: number;
  title: string;
  description_google: string;
  slug: string;
  short: string;
  content: string;
  img: string;
  miniature: string;
  place_id: number;
  blog_category_id: number;
  blog_author_id: number;
  date_creation: string;
  active: 0 | 1;
  category: { blog_category_id: number; title: string; slug: string } | null;
  author: { blog_author_id: number; name: string; title: string } | null;
};

export type QrScanLogAdmin = {
  id: string;
  establishment_id: string;
  reservation_id: string | null;
  booking_reference: string | null;
  scanned_at: string | null;
  scanned_by_user_id: string | null;
  holder_name: string | null;
  result: string | null;
  payload: string | null;
};

export type FinanceDiscrepancyAdmin = {
  id: string;
  created_at: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  expected_amount_cents: number | null;
  actual_amount_cents: number | null;
  currency: string;
  severity: "low" | "medium" | "high" | string;
  status: "open" | "acknowledged" | "resolved" | string;
  opened_at: string;
  resolved_at: string | null;
  notes: string | null;
  metadata: unknown;
};

export type FinancePayoutEstablishmentAdmin = {
  id: string;
  name: string | null;
  city: string | null;
};

export type FinancePayoutAdmin = {
  id: string;
  created_at: string;
  requested_at: string;
  processed_at: string | null;
  establishment_id: string;
  amount_cents: number | string;
  currency: string;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled" | string;
  provider: string | null;
  provider_reference: string | null;
  failure_reason: string | null;
  idempotency_key: string | null;
  metadata: unknown;
  establishment: FinancePayoutEstablishmentAdmin | null;
};

export type ProConversationAdmin = {
  id: string;
  establishment_id: string;
  reservation_id: string | null;
  subject: string | null;
  status: string | null;
  updated_at: string | null;
  created_at: string | null;
  meta: unknown;
};

export type ProMessageAdmin = {
  id: string;
  establishment_id: string;
  conversation_id: string;
  from_role: string | null;
  body: string | null;
  sender_user_id: string | null;
  created_at: string | null;
  meta: unknown;
};

export type AdminLogEntry = {
  id: string;
  created_at: string;
  source: "admin" | "system";
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_user_id?: string | null;
  actor_role?: string | null;
  details: unknown;
};

export type ListResponse<T> = { items: T[] };

export type ConsumerUser = {
  id: string;
  name: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  auth_method?: "email" | "phone";
  status: string;
  city: string;
  country: string;
  reliability_score: number;
  reservations_count: number;
  no_shows_count: number;
  created_at: string;
  last_activity_at: string;
};

export type ConsumerUserEvent = {
  id: string;
  user_id: string;
  event_type: string;
  occurred_at: string;
  metadata: unknown;
};

export type ConsumerPurchase = {
  id: string;
  user_id: string;
  currency: string;
  total_amount: number;
  status: string;
  purchased_at: string;
  items: unknown;
  metadata: unknown;
};

export type ConsumerAccountAction = {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action_type: string;
  occurred_at: string;
  reason_code: string | null;
  reason_text: string | null;
  ip: string | null;
  user_agent: string | null;
};

export class AdminApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.payload = payload;
  }
}

const STORAGE_KEY = "sam_admin_api_key";
const SESSION_TOKEN_KEY = "sam_admin_session_token";

export function loadAdminApiKey(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function saveAdminApiKey(key: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    // ignore
  }
}

export function clearAdminApiKey(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadAdminSessionToken(): string | null {
  try {
    const v = sessionStorage.getItem(SESSION_TOKEN_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function saveAdminSessionToken(token: string): void {
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearAdminSessionToken(): void {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export type AdminSessionPayload = {
  v?: number;
  exp?: number;
  sub?: string;
  collaborator_id?: string;
  role?: string;
  name?: string;
};

/**
 * Get standard admin headers for API requests
 */
export function getAdminHeaders(): Record<string, string> {
  const adminKey = loadAdminApiKey();
  const sessionToken = loadAdminSessionToken();
  const session = decodeAdminSessionToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (adminKey) headers["x-admin-key"] = adminKey;
  if (sessionToken) headers["x-admin-session"] = sessionToken;
  if (session?.role) headers["x-admin-role"] = session.role;

  return headers;
}

export function decodeAdminSessionToken(): AdminSessionPayload | null {
  const token = loadAdminSessionToken();
  if (!token) return null;

  try {
    const parts = token.split(".");
    // Support both formats:
    // - Custom format: payload.signature (2 parts)
    // - JWT format: header.payload.signature (3 parts)
    let payloadBase64: string;
    if (parts.length === 2) {
      // Custom token format used by server: payload.signature
      payloadBase64 = parts[0];
    } else if (parts.length === 3) {
      // JWT format: header.payload.signature
      payloadBase64 = parts[1];
    } else {
      return null;
    }

    // Handle URL-safe base64
    const payloadJson = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as AdminSessionPayload;

    // Check if expired
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getAdminUserRole(): string | null {
  const payload = decodeAdminSessionToken();
  return payload?.role ?? null;
}

export function isAdminSuperadmin(): boolean {
  const role = getAdminUserRole();
  return role === "superadmin";
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const maybe = payload as Record<string, unknown>;
  const msg = typeof maybe.error === "string" ? maybe.error : null;
  return msg && msg.trim() ? msg : null;
}

async function requestJson<T>(
  path: string,
  adminKey?: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    const sessionToken = loadAdminSessionToken();

    // Always omit cookies.
    // In embedded/iframe contexts, credentialed requests can be blocked (third-party cookie rules).
    // Admin login returns a session token that we send via header, so cookies are not required.
    res = await fetch(path, {
      ...init,
      credentials: "omit",
      headers: {
        ...(init?.headers ?? {}),
        ...(adminKey ? { "x-admin-key": adminKey } : {}),
        ...(sessionToken ? { "x-admin-session": sessionToken } : {}),
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch (e) {
    throw new AdminApiError(
      "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
      0,
      e,
    );
  }

  let payload: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
  } else {
    try {
      payload = await res.text();
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const msg = extractErrorMessage(payload) || `HTTP ${res.status}`;
    throw new AdminApiError(msg, res.status, payload);
  }

  return payload as T;
}

export async function adminHealth(
  adminKey?: string,
): Promise<AdminHealthResponse> {
  return requestJson<AdminHealthResponse>("/api/admin/health", adminKey);
}

export type AdminProductionCheckItem = {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
};

export type AdminProductionCheckResponse = {
  ok: true;
  at: string;
  env: {
    node_env: string;
    allow_demo_routes: boolean;
  };
  checks: AdminProductionCheckItem[];
};

export async function adminProductionCheck(
  adminKey?: string,
): Promise<AdminProductionCheckResponse> {
  return requestJson<AdminProductionCheckResponse>(
    "/api/admin/production-check",
    adminKey,
  );
}

export type ImpactMetricBlock = {
  eligible: number;
  no_shows: number;
  honored: number;
  protected: number;
  no_show_rate: number;
  honored_rate: number;
  protected_share: number;
};

export type ImpactUniverseRow = ImpactMetricBlock & { universe: string };

export type ImpactSeriesRow = {
  week_start: string;
  universe: string;
  eligible: number;
  no_shows: number;
  protected: number;
  no_show_rate: number;
  protected_share: number;
};

export type AdminImpactReport = {
  ok: true;
  generated_at: string;
  periods: {
    before: { start: string; end: string };
    after: { start: string; end: string };
    series: { start: string; end: string; weeks: number };
  };
  kpi: {
    before: ImpactMetricBlock;
    after: ImpactMetricBlock;
    after_protected: ImpactMetricBlock;
    after_non_protected: ImpactMetricBlock;
    by_universe_before: ImpactUniverseRow[];
    by_universe_after: ImpactUniverseRow[];
    series: ImpactSeriesRow[];
    assumptions: {
      eligible_status_excluded: string[];
      honored_definition: string;
      no_show_definition: string;
      protected_definition: string;
    };
  };
};

export async function getAdminImpactReport(
  adminKey?: string,
  args?: {
    before_start?: string;
    before_end?: string;
    after_start?: string;
    after_end?: string;
    series_weeks?: number;
  },
): Promise<AdminImpactReport> {
  const sp = new URLSearchParams();

  if (args?.before_start) sp.set("before_start", args.before_start);
  if (args?.before_end) sp.set("before_end", args.before_end);
  if (args?.after_start) sp.set("after_start", args.after_start);
  if (args?.after_end) sp.set("after_end", args.after_end);
  if (
    typeof args?.series_weeks === "number" &&
    Number.isFinite(args.series_weeks)
  ) {
    sp.set("series_weeks", String(Math.floor(args.series_weeks)));
  }

  const qs = sp.toString();
  return requestJson<AdminImpactReport>(
    `/api/admin/impact${qs ? `?${qs}` : ""}`,
    adminKey,
  );
}

export async function adminLogin(args: {
  username: string;
  password: string;
}): Promise<{ ok: true; session_token?: string }> {
  return requestJson<{ ok: true; session_token?: string }>(
    "/api/admin/auth/login",
    undefined,
    {
      method: "POST",
      body: JSON.stringify({
        username: args.username,
        password: args.password,
      }),
    },
  );
}

export async function adminLogout(): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>("/api/admin/auth/logout", undefined, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ---------------------------------------------------------------------------
// Superadmin settings (Paramètres)
// ---------------------------------------------------------------------------

export type AdminCity = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminCategory = {
  id: string;
  universe: string;
  name: string;
  parent_id: string | null;
  icon: string | null;
  commission_percent: number | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FinanceRules = {
  id: number;
  standard_commission_percent: number;
  boost_commission_percent_min: number;
  boost_commission_percent_max: number;
  guarantee_commission_percent: number;
  min_deposit_amount_cents: number;
  created_at: string;
  updated_at: string;
};

export type ReservationRules = {
  id: number;
  deposit_required_below_score: boolean;
  deposit_required_score_threshold: number;
  max_party_size: number;
  no_show_limit_before_block: number;
  auto_detect_no_show: boolean;
  max_reservations_per_slot: number;
  created_at: string;
  updated_at: string;
};

export type BillingCompanyProfile = {
  legal_name: string;
  trade_name: string;
  legal_form: string;
  ice: string;
  rc_number: string;
  rc_court: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  country: string;
  capital_mad: number;
  default_currency: string;

  bank_name: string | null;
  rib: string | null;
  iban: string | null;
  swift: string | null;
  bank_account_holder: string | null;
  bank_instructions: string | null;

  updated_at: string;
};

export type AdminBillingCompanyProfilePatch = Partial<
  Omit<BillingCompanyProfile, "updated_at">
>;

export type AdminFeatureFlag = {
  key: string;
  label: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminSettingsSnapshot = {
  ok: true;
  cities: AdminCity[];
  categories: AdminCategory[];
  finance_rules: FinanceRules;
  reservation_rules: ReservationRules;
  feature_flags: AdminFeatureFlag[];
  billing_company_profile: BillingCompanyProfile | null;
};

export async function getAdminSettingsSnapshot(
  adminKey?: string,
): Promise<AdminSettingsSnapshot> {
  return requestJson<AdminSettingsSnapshot>(
    "/api/admin/settings/snapshot",
    adminKey,
  );
}

export async function updateAdminBillingCompanyProfile(
  adminKey: string | undefined,
  args: AdminBillingCompanyProfilePatch,
): Promise<{ ok: true; profile: BillingCompanyProfile }> {
  return requestJson<{ ok: true; profile: BillingCompanyProfile }>(
    "/api/admin/settings/billing-company-profile/update",
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

export async function listAdminCities(
  adminKey?: string,
): Promise<{ ok: true; items: AdminCity[] }> {
  return requestJson<{ ok: true; items: AdminCity[] }>(
    "/api/admin/settings/cities",
    adminKey,
  );
}

export async function createAdminCity(
  adminKey: string | undefined,
  args: { name: string; active?: boolean },
): Promise<{ ok: true; item: AdminCity }> {
  return requestJson<{ ok: true; item: AdminCity }>(
    "/api/admin/settings/cities",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminCity(
  adminKey: string | undefined,
  args: { id: string; name?: string; active?: boolean },
): Promise<{ ok: true; item: AdminCity }> {
  return requestJson<{ ok: true; item: AdminCity }>(
    `/api/admin/settings/cities/${encodeURIComponent(args.id)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ name: args.name, active: args.active }),
    },
  );
}

export async function deleteAdminCity(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/settings/cities/${encodeURIComponent(id)}/delete`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function listAdminCategories(
  adminKey?: string,
): Promise<{ ok: true; items: AdminCategory[] }> {
  return requestJson<{ ok: true; items: AdminCategory[] }>(
    "/api/admin/settings/categories",
    adminKey,
  );
}

export async function createAdminCategory(
  adminKey: string | undefined,
  args: {
    universe: string;
    name: string;
    icon?: string | null;
    parent_id?: string | null;
    commission_percent?: number | null;
    active?: boolean;
    sort_order?: number;
  },
): Promise<{ ok: true; item: AdminCategory }> {
  return requestJson<{ ok: true; item: AdminCategory }>(
    "/api/admin/settings/categories",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminCategory(
  adminKey: string | undefined,
  args: {
    id: string;
    universe?: string;
    name?: string;
    icon?: string | null;
    parent_id?: string | null;
    commission_percent?: number | null;
    active?: boolean;
    sort_order?: number;
  },
): Promise<{ ok: true; item: AdminCategory }> {
  const { id, ...body } = args;
  return requestJson<{ ok: true; item: AdminCategory }>(
    `/api/admin/settings/categories/${encodeURIComponent(id)}/update`,
    adminKey,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function deleteAdminCategory(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/settings/categories/${encodeURIComponent(id)}/delete`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function applyAdminUniverseCommission(
  adminKey: string | undefined,
  args: { universe: string; commission_percent: number },
): Promise<{ ok: true; affected: number }> {
  return requestJson<{ ok: true; affected: number }>(
    `/api/admin/settings/categories/apply-universe-commission`,
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

export async function getAdminFinanceRules(
  adminKey?: string,
): Promise<{ ok: true; item: FinanceRules }> {
  return requestJson<{ ok: true; item: FinanceRules }>(
    "/api/admin/settings/finance-rules",
    adminKey,
  );
}

export async function updateAdminFinanceRules(
  adminKey: string | undefined,
  args: Partial<
    Pick<
      FinanceRules,
      | "standard_commission_percent"
      | "boost_commission_percent_min"
      | "boost_commission_percent_max"
      | "guarantee_commission_percent"
      | "min_deposit_amount_cents"
    >
  >,
): Promise<{ ok: true; item: FinanceRules }> {
  return requestJson<{ ok: true; item: FinanceRules }>(
    "/api/admin/settings/finance-rules/update",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function getAdminReservationRules(
  adminKey?: string,
): Promise<{ ok: true; item: ReservationRules }> {
  return requestJson<{ ok: true; item: ReservationRules }>(
    "/api/admin/settings/reservation-rules",
    adminKey,
  );
}

export async function updateAdminReservationRules(
  adminKey: string | undefined,
  args: Partial<
    Pick<
      ReservationRules,
      | "deposit_required_below_score"
      | "deposit_required_score_threshold"
      | "max_party_size"
      | "no_show_limit_before_block"
      | "auto_detect_no_show"
      | "max_reservations_per_slot"
    >
  >,
): Promise<{ ok: true; item: ReservationRules }> {
  return requestJson<{ ok: true; item: ReservationRules }>(
    "/api/admin/settings/reservation-rules/update",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function listAdminFeatureFlags(
  adminKey?: string,
): Promise<{ ok: true; items: AdminFeatureFlag[] }> {
  return requestJson<{ ok: true; items: AdminFeatureFlag[] }>(
    "/api/admin/settings/feature-flags",
    adminKey,
  );
}

export async function updateAdminFeatureFlag(
  adminKey: string | undefined,
  args: { key: string; enabled: boolean },
): Promise<{ ok: true; item: AdminFeatureFlag }> {
  return requestJson<{ ok: true; item: AdminFeatureFlag }>(
    `/api/admin/settings/feature-flags/${encodeURIComponent(args.key)}/update`,
    adminKey,
    { method: "POST", body: JSON.stringify({ enabled: args.enabled }) },
  );
}

// ============================================================================
// Platform Settings (Superadmin only)
// ============================================================================

export type PlatformMode = "test" | "commercial" | "maintenance";

export type PlatformSetting = {
  key: string;
  value: string;
  value_type: "string" | "boolean" | "number" | "json";
  label: string;
  description: string | null;
  category: string;
  is_sensitive: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformSettingsSnapshot = {
  mode: PlatformMode;
  payments: {
    reservations_enabled: boolean;
    commissions_enabled: boolean;
    subscriptions_enabled: boolean;
    packs_purchases_enabled: boolean;
    payouts_enabled: boolean;
    guarantee_deposits_enabled: boolean;
    wallet_credits_enabled: boolean;
  };
  visibility: {
    orders_enabled: boolean;
  };
  reservations: {
    free_enabled: boolean;
  };
  branding: {
    name: string;
    short: string;
    domain: string;
  };
};

export async function listPlatformSettings(
  adminKey?: string,
): Promise<{ ok: true; items: PlatformSetting[] }> {
  return requestJson<{ ok: true; items: PlatformSetting[] }>(
    "/api/admin/settings/platform",
    adminKey,
  );
}

export async function getPlatformSettingsSnapshot(
  adminKey?: string,
): Promise<{ ok: true; snapshot: PlatformSettingsSnapshot }> {
  return requestJson<{ ok: true; snapshot: PlatformSettingsSnapshot }>(
    "/api/admin/settings/platform/snapshot",
    adminKey,
  );
}

export async function updatePlatformSetting(
  adminKey: string | undefined,
  args: { key: string; value: string },
): Promise<{ ok: true; item: PlatformSetting }> {
  return requestJson<{ ok: true; item: PlatformSetting }>(
    `/api/admin/settings/platform/${encodeURIComponent(args.key)}/update`,
    adminKey,
    { method: "POST", body: JSON.stringify({ value: args.value }) },
  );
}

export async function setPlatformMode(
  adminKey: string | undefined,
  mode: PlatformMode,
): Promise<{ ok: true; mode: PlatformMode; snapshot: PlatformSettingsSnapshot }> {
  return requestJson<{ ok: true; mode: PlatformMode; snapshot: PlatformSettingsSnapshot }>(
    "/api/admin/settings/platform/set-mode",
    adminKey,
    { method: "POST", body: JSON.stringify({ mode }) },
  );
}

export async function invalidatePlatformSettingsCache(
  adminKey?: string,
): Promise<{ ok: true; message: string }> {
  return requestJson<{ ok: true; message: string }>(
    "/api/admin/settings/platform/invalidate-cache",
    adminKey,
    { method: "POST" },
  );
}

export type AdminWaitlistEntry = {
  id: string;
  reservation_id: string | null;
  slot_id: string | null;
  user_id: string | null;
  status: string | null;
  position: number | null;
  offer_sent_at: string | null;
  offer_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  reservations?: {
    id: string;
    booking_reference: string | null;
    establishment_id: string | null;
    starts_at: string | null;
    party_size: number | null;
    status: string | null;
    meta: unknown;
    created_at: string | null;
    phone: string | null;
    establishments?: {
      id: string;
      name: string | null;
      city: string | null;
      universe: string | null;
    } | null;
  } | null;
};

export async function listAdminWaitlist(
  adminKey: string | undefined,
  args?: {
    establishment_id?: string;
    status?: string | string[];
    from?: string;
    to?: string;
    limit?: number;
  },
): Promise<{ ok: true; items: AdminWaitlistEntry[] }> {
  const qs = new URLSearchParams();
  if (args?.establishment_id)
    qs.set("establishment_id", String(args.establishment_id));
  if (args?.status) {
    const v = Array.isArray(args.status)
      ? args.status.join(",")
      : String(args.status);
    if (v.trim()) qs.set("status", v);
  }
  if (args?.from) qs.set("from", String(args.from));
  if (args?.to) qs.set("to", String(args.to));
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminWaitlistEntry[] }>(
    `/api/admin/waitlist${suffix}`,
    adminKey,
  );
}

export async function listAdminLogs(
  adminKey: string | undefined,
  args?: {
    source?: "all" | "admin" | "system" | string;
    entity_type?: string;
    entity_id?: string;
    action?: string;
    limit?: number;
  },
): Promise<{ ok: true; items: AdminLogEntry[] }> {
  const qs = new URLSearchParams();
  if (args?.source && args.source !== "all")
    qs.set("source", String(args.source));
  if (args?.entity_type) qs.set("entity_type", String(args.entity_type));
  if (args?.entity_id) qs.set("entity_id", String(args.entity_id));
  if (args?.action) qs.set("action", String(args.action));
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminLogEntry[] }>(
    `/api/admin/logs${suffix}`,
    adminKey,
  );
}

export async function listAdminFinanceDiscrepancies(
  adminKey: string | undefined,
  args?: {
    status?: "open" | "acknowledged" | "resolved" | "all" | string;
    severity?: "low" | "medium" | "high" | "all" | string;
    limit?: number;
  },
): Promise<{ ok: true; items: FinanceDiscrepancyAdmin[] }> {
  const qs = new URLSearchParams();
  if (args?.status) qs.set("status", String(args.status));
  if (args?.severity) qs.set("severity", String(args.severity));
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: FinanceDiscrepancyAdmin[] }>(
    `/api/admin/finance/discrepancies${suffix}`,
    adminKey,
  );
}

export async function updateAdminFinanceDiscrepancy(
  adminKey: string | undefined,
  args: {
    id: string;
    status?: "open" | "acknowledged" | "resolved" | string;
    notes?: string | null;
  },
): Promise<{ ok: true }> {
  const id = encodeURIComponent(args.id);
  return requestJson<{ ok: true }>(
    `/api/admin/finance/discrepancies/${id}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ status: args.status, notes: args.notes }),
    },
  );
}

export async function runAdminFinanceReconciliation(
  adminKey: string | undefined,
  args?: { limit?: number },
): Promise<{
  ok: true;
  limit: number;
  holdsEnsured: number;
  settlesAttempted: number;
  errorsCount: number;
}> {
  const qs = new URLSearchParams();
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  return requestJson<{
    ok: true;
    limit: number;
    holdsEnsured: number;
    settlesAttempted: number;
    errorsCount: number;
  }>(`/api/admin/finance/reconcile/run${suffix}`, adminKey, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function listAdminFinancePayouts(
  adminKey: string | undefined,
  args?: {
    status?:
      | "pending"
      | "processing"
      | "sent"
      | "failed"
      | "cancelled"
      | "all"
      | string;
    establishment_id?: string;
    currency?: string;
    limit?: number;
  },
): Promise<{ ok: true; items: FinancePayoutAdmin[] }> {
  const qs = new URLSearchParams();
  if (args?.status) qs.set("status", String(args.status));
  if (args?.establishment_id)
    qs.set("establishment_id", String(args.establishment_id));
  if (args?.currency) qs.set("currency", String(args.currency));
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: FinancePayoutAdmin[] }>(
    `/api/admin/finance/payouts${suffix}`,
    adminKey,
  );
}

export async function updateAdminFinancePayout(
  adminKey: string | undefined,
  args: {
    id: string;
    status?:
      | "pending"
      | "processing"
      | "sent"
      | "failed"
      | "cancelled"
      | string;
    provider?: string | null;
    provider_reference?: string | null;
    failure_reason?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<{ ok: true }> {
  const id = encodeURIComponent(args.id);
  return requestJson<{ ok: true }>(
    `/api/admin/finance/payouts/${id}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({
        status: args.status,
        provider: args.provider,
        provider_reference: args.provider_reference,
        failure_reason: args.failure_reason,
        metadata: args.metadata,
      }),
    },
  );
}

export async function listModerationQueue(
  adminKey: string | undefined,
  status: ModerationQueueStatus,
): Promise<ListResponse<ModerationQueueItem>> {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  return requestJson<ListResponse<ModerationQueueItem>>(
    `/api/admin/moderation?${qs.toString()}`,
    adminKey,
  );
}

export async function approveModeration(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/moderation/${encodeURIComponent(id)}/approve`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function rejectModeration(
  adminKey: string | undefined,
  id: string,
  reason: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/moderation/${encodeURIComponent(id)}/reject`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
}

export async function listEstablishments(
  adminKey: string | undefined,
  status?: EstablishmentStatus,
): Promise<ListResponse<Establishment>> {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<ListResponse<Establishment>>(
    `/api/admin/establishments${suffix}`,
    adminKey,
  );
}

export async function createEstablishment(
  adminKey: string | undefined,
  args: {
    name: string;
    city: string;
    universe?: string;
    owner_email: string;
    contact_name?: string;
    contact_phone?: string;
  },
): Promise<{
  item: Establishment;
  owner: { email: string; user_id: string; temporary_password: string };
}> {
  return requestJson<{
    item: Establishment;
    owner: { email: string; user_id: string; temporary_password: string };
  }>(`/api/admin/establishments`, adminKey, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function updateEstablishmentStatus(
  adminKey: string | undefined,
  id: string,
  status: EstablishmentStatus,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/establishments/${encodeURIComponent(id)}/status`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ status }),
    },
  );
}

export async function updateEstablishmentFlags(
  adminKey: string | undefined,
  id: string,
  flags: { verified?: boolean; premium?: boolean; curated?: boolean },
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/establishments/${encodeURIComponent(id)}/flags`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(flags),
    },
  );
}

export async function listProUsers(
  adminKey: string | undefined,
): Promise<ListResponse<ProUserAdmin>> {
  return requestJson<ListResponse<ProUserAdmin>>(
    "/api/admin/pros/users",
    adminKey,
  );
}

export async function listProUserMemberships(
  adminKey: string | undefined,
  userId: string,
): Promise<ListResponse<ProMembershipAdmin>> {
  return requestJson<ListResponse<ProMembershipAdmin>>(
    `/api/admin/pros/users/${encodeURIComponent(userId)}/memberships`,
    adminKey,
  );
}

export async function createProUser(
  adminKey: string | undefined,
  args: { email: string; establishment_ids?: string[]; role?: string },
): Promise<{
  owner: { email: string; user_id: string; temporary_password: string };
}> {
  return requestJson<{
    owner: { email: string; user_id: string; temporary_password: string };
  }>(`/api/admin/pros/users`, adminKey, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function setProUserMemberships(
  adminKey: string | undefined,
  userId: string,
  args: { establishment_ids: string[]; role?: string },
): Promise<{ ok: true; establishment_ids: string[]; removed_ids: string[] }> {
  return requestJson<{
    ok: true;
    establishment_ids: string[];
    removed_ids: string[];
  }>(
    `/api/admin/pros/users/${encodeURIComponent(userId)}/memberships`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export type RegeneratePasswordResponse = {
  ok: true;
  message: string;
  credentials: {
    email: string;
    password: string;
  };
};

export async function regenerateProUserPassword(
  adminKey: string | undefined,
  userId: string,
): Promise<RegeneratePasswordResponse> {
  return requestJson<RegeneratePasswordResponse>(
    `/api/admin/pros/users/${encodeURIComponent(userId)}/regenerate-password`,
    adminKey,
    {
      method: "POST",
    },
  );
}

export async function suspendProUser(
  adminKey: string | undefined,
  userId: string,
  suspend: boolean,
  reason?: string,
): Promise<{ ok: true; status: "suspended" | "active"; email: string }> {
  return requestJson<{ ok: true; status: "suspended" | "active"; email: string }>(
    `/api/admin/pros/users/${encodeURIComponent(userId)}/suspend`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({
        suspend,
        reason: reason ?? null,
      }),
    },
  );
}

export interface BulkDeleteProUsersResult {
  id: string;
  email: string | null;
  success: boolean;
  error?: string;
}

export async function bulkDeleteProUsers(
  adminKey: string | undefined,
  ids: string[],
): Promise<{ ok: true; deleted: number; failed: number; results: BulkDeleteProUsersResult[] }> {
  return requestJson<{ ok: true; deleted: number; failed: number; results: BulkDeleteProUsersResult[] }>(
    "/api/admin/pros/users/bulk-delete",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ ids }),
    },
  );
}

export async function getEstablishment(
  adminKey: string | undefined,
  id: string,
): Promise<{ item: any }> {
  return requestJson<{ item: any }>(
    `/api/admin/establishments/${encodeURIComponent(id)}`,
    adminKey,
  );
}

export type AdminEstablishmentBookingPolicy = {
  cancellation_enabled: boolean;
  free_cancellation_hours: number;
  cancellation_penalty_percent: number;
  no_show_penalty_percent: number;
  no_show_always_100_guaranteed: boolean;
  cancellation_text_fr: string;
  cancellation_text_en: string;
  modification_enabled: boolean;
  modification_deadline_hours: number;
  require_guarantee_below_score: number | null;
  modification_text_fr: string;
  modification_text_en: string;
};

export async function getAdminEstablishmentBookingPolicy(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<{ ok: true; policy: AdminEstablishmentBookingPolicy | null }> {
  return requestJson<{ ok: true; policy: AdminEstablishmentBookingPolicy | null }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/booking-policy`,
    adminKey,
  );
}

export async function updateAdminEstablishmentBookingPolicy(
  adminKey: string | undefined,
  establishmentId: string,
  data: Partial<AdminEstablishmentBookingPolicy>,
): Promise<{ ok: true; policy: AdminEstablishmentBookingPolicy }> {
  return requestJson<{ ok: true; policy: AdminEstablishmentBookingPolicy }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/booking-policy/update`,
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function resetAdminEstablishmentBookingPolicy(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<{ ok: true; policy: null }> {
  return requestJson<{ ok: true; policy: null }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/booking-policy/reset`,
    adminKey,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function listAdminEstablishmentPendingProfileUpdates(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<{ items: EstablishmentPendingProfileUpdateAdmin[] }> {
  return requestJson<{ items: EstablishmentPendingProfileUpdateAdmin[] }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/profile-updates/pending`,
    adminKey,
  );
}

export async function acceptAdminEstablishmentProfileChange(
  adminKey: string | undefined,
  establishmentId: string,
  draftId: string,
  changeId: string,
): Promise<{ ok: true; finalized: boolean; status: string | null }> {
  return requestJson<{ ok: true; finalized: boolean; status: string | null }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/profile-updates/${encodeURIComponent(draftId)}/changes/${encodeURIComponent(changeId)}/accept`,
    adminKey,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function rejectAdminEstablishmentProfileChange(
  adminKey: string | undefined,
  establishmentId: string,
  draftId: string,
  changeId: string,
  reason?: string,
): Promise<{ ok: true; finalized: boolean; status: string | null }> {
  return requestJson<{ ok: true; finalized: boolean; status: string | null }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/profile-updates/${encodeURIComponent(draftId)}/changes/${encodeURIComponent(changeId)}/reject`,
    adminKey,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
  );
}

export async function acceptAllAdminEstablishmentProfileUpdates(
  adminKey: string | undefined,
  establishmentId: string,
  draftId: string,
): Promise<{ ok: true; finalized: boolean; status: string | null }> {
  return requestJson<{ ok: true; finalized: boolean; status: string | null }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/profile-updates/${encodeURIComponent(draftId)}/accept-all`,
    adminKey,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function rejectAllAdminEstablishmentProfileUpdates(
  adminKey: string | undefined,
  establishmentId: string,
  draftId: string,
  reason?: string,
): Promise<{ ok: true; finalized: boolean; status: string | null }> {
  return requestJson<{ ok: true; finalized: boolean; status: string | null }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/profile-updates/${encodeURIComponent(draftId)}/reject-all`,
    adminKey,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
  );
}

export async function listAdminEstablishmentReservations(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<ListResponse<ReservationAdmin>> {
  return requestJson<ListResponse<ReservationAdmin>>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/reservations`,
    adminKey,
  );
}

export async function updateAdminEstablishmentReservation(
  adminKey: string | undefined,
  args: {
    establishmentId: string;
    reservationId: string;
    status?: string;
    payment_status?: string;
    checked_in_at?: string;
    starts_at?: string;
    meta_delete_keys?: string[];
  },
): Promise<{ ok: true }> {
  const { establishmentId, reservationId, ...patch } = args;
  return requestJson<{ ok: true }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/reservations/${encodeURIComponent(reservationId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(patch),
    },
  );
}

export async function listAdminSupportTickets(
  adminKey: string | undefined,
  args?: { status?: string; priority?: string; role?: string; limit?: number },
): Promise<ListResponse<SupportTicketAdmin>> {
  const qs = new URLSearchParams();
  if (args?.status) qs.set("status", args.status);
  if (args?.priority) qs.set("priority", args.priority);
  if (args?.role) qs.set("role", args.role);
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<ListResponse<SupportTicketAdmin>>(
    `/api/admin/support/tickets${suffix}`,
    adminKey,
  );
}

export async function getAdminSupportTicket(
  adminKey: string | undefined,
  id: string,
): Promise<{ item: SupportTicketAdmin }> {
  return requestJson<{ item: SupportTicketAdmin }>(
    `/api/admin/support/tickets/${encodeURIComponent(id)}`,
    adminKey,
  );
}

export async function listAdminSupportTicketMessages(
  adminKey: string | undefined,
  id: string,
): Promise<ListResponse<SupportTicketMessageAdmin>> {
  return requestJson<ListResponse<SupportTicketMessageAdmin>>(
    `/api/admin/support/tickets/${encodeURIComponent(id)}/messages`,
    adminKey,
  );
}

export async function postAdminSupportTicketMessage(
  adminKey: string | undefined,
  args: { ticketId: string; body: string; is_internal?: boolean },
): Promise<{ ok: true; item: SupportTicketMessageAdmin }> {
  return requestJson<{ ok: true; item: SupportTicketMessageAdmin }>(
    `/api/admin/support/tickets/${encodeURIComponent(args.ticketId)}/messages`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({
        body: args.body,
        is_internal: args.is_internal ?? false,
      }),
    },
  );
}

export async function updateAdminSupportTicket(
  adminKey: string | undefined,
  args: {
    ticketId: string;
    status?: string;
    priority?: string;
    assignee_user_id?: string;
  },
): Promise<{ ok: true }> {
  const { ticketId, ...patch } = args;
  return requestJson<{ ok: true }>(
    `/api/admin/support/tickets/${encodeURIComponent(ticketId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(patch),
    },
  );
}

export async function listAdminContentPages(
  adminKey: string | undefined,
): Promise<ListResponse<ContentPageAdmin>> {
  return requestJson<ListResponse<ContentPageAdmin>>(
    `/api/admin/content/pages`,
    adminKey,
  );
}

export async function createAdminContentPage(
  adminKey: string | undefined,
  args: {
    // legacy/compat (keep)
    slug: string;

    // New: stable key + locale slugs
    page_key?: string;
    slug_fr?: string;
    slug_en?: string;

    // status
    status?: "draft" | "published";
    is_published?: boolean;

    // UI
    title_fr?: string;
    title_en?: string;
    page_subtitle_fr?: string;
    page_subtitle_en?: string;

    // legacy html (still supported)
    body_html_fr?: string;
    body_html_en?: string;

    // SEO (preferred)
    seo_title_fr?: string;
    seo_title_en?: string;
    seo_description_fr?: string;
    seo_description_en?: string;

    // SEO legacy (compat)
    meta_title_fr?: string;
    meta_title_en?: string;
    meta_description_fr?: string;
    meta_description_en?: string;

    // OG
    og_title_fr?: string;
    og_title_en?: string;
    og_description_fr?: string;
    og_description_en?: string;
    og_image_url?: string | null;

    // Canonical/robots
    canonical_url_fr?: string;
    canonical_url_en?: string;
    robots?: string;

    // Legal UX
    show_toc?: boolean;
    related_links?: unknown;

    // Structured data
    schema_jsonld_fr?: unknown;
    schema_jsonld_en?: unknown;

    // legacy (kept for compatibility)
    title?: string;
    body_markdown?: string;
  },
): Promise<{ item: ContentPageAdmin }> {
  return requestJson<{ item: ContentPageAdmin }>(
    `/api/admin/content/pages`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminContentPage(
  adminKey: string | undefined,
  args: {
    id: string;

    // legacy/compat
    slug?: string;

    // New: stable key + locale slugs
    page_key?: string;
    slug_fr?: string;
    slug_en?: string;

    // status
    status?: "draft" | "published";
    is_published?: boolean;

    // UI
    title_fr?: string;
    title_en?: string;
    page_subtitle_fr?: string;
    page_subtitle_en?: string;

    // legacy html
    body_html_fr?: string;
    body_html_en?: string;

    // SEO (preferred)
    seo_title_fr?: string;
    seo_title_en?: string;
    seo_description_fr?: string;
    seo_description_en?: string;

    // SEO legacy (compat)
    meta_title_fr?: string;
    meta_title_en?: string;
    meta_description_fr?: string;
    meta_description_en?: string;

    // OG
    og_title_fr?: string;
    og_title_en?: string;
    og_description_fr?: string;
    og_description_en?: string;
    og_image_url?: string | null;

    canonical_url_fr?: string;
    canonical_url_en?: string;
    robots?: string;

    show_toc?: boolean;
    related_links?: unknown;

    schema_jsonld_fr?: unknown;
    schema_jsonld_en?: unknown;

    // legacy
    title?: string;
    body_markdown?: string;
  },
): Promise<{ ok: true }> {
  const { id, ...patch } = args;
  return requestJson<{ ok: true }>(
    `/api/admin/content/pages/${encodeURIComponent(id)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(patch),
    },
  );
}

export async function listAdminContentPageBlocks(
  adminKey: string | undefined,
  pageId: string,
): Promise<ListResponse<ContentPageBlockAdmin>> {
  return requestJson<ListResponse<ContentPageBlockAdmin>>(
    `/api/admin/content/pages/${encodeURIComponent(pageId)}/blocks`,
    adminKey,
  );
}

export async function replaceAdminContentPageBlocks(
  adminKey: string | undefined,
  args: { pageId: string; blocks: CmsBlockInput[] },
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/content/pages/${encodeURIComponent(args.pageId)}/blocks/replace`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ blocks: args.blocks }),
    },
  );
}

export async function listAdminFaqArticles(
  adminKey: string | undefined,
): Promise<ListResponse<FaqArticleAdmin>> {
  return requestJson<ListResponse<FaqArticleAdmin>>(
    `/api/admin/content/faq`,
    adminKey,
  );
}

export async function createAdminFaqArticle(
  adminKey: string | undefined,
  args: {
    category?: string;
    display_order?: number;
    tags?: string[];
    is_published?: boolean;
    // bilingual
    question_fr?: string;
    question_en?: string;
    answer_html_fr?: string;
    answer_html_en?: string;
    // legacy
    title?: string;
    body?: string;
  },
): Promise<{ item: FaqArticleAdmin }> {
  return requestJson<{ item: FaqArticleAdmin }>(
    `/api/admin/content/faq`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminFaqArticle(
  adminKey: string | undefined,
  args: {
    id: string;
    category?: string;
    display_order?: number;
    tags?: string[];
    is_published?: boolean;
    // bilingual
    question_fr?: string;
    question_en?: string;
    answer_html_fr?: string;
    answer_html_en?: string;
    // legacy
    title?: string;
    body?: string;
  },
): Promise<{ ok: true }> {
  const { id, ...patch } = args;
  return requestJson<{ ok: true }>(
    `/api/admin/content/faq/${encodeURIComponent(id)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(patch),
    },
  );
}

export async function listAdminCmsBlogArticles(
  adminKey: string | undefined,
): Promise<ListResponse<BlogArticleAdmin>> {
  return requestJson<ListResponse<BlogArticleAdmin>>(
    `/api/admin/content/blog`,
    adminKey,
  );
}

export async function deleteAdminCmsBlogArticle(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/content/blog/${encodeURIComponent(id)}`,
    adminKey,
    { method: "DELETE" },
  );
}

export async function listAdminCmsBlogAuthors(
  adminKey: string | undefined,
): Promise<ListResponse<BlogAuthorAdmin>> {
  return requestJson<ListResponse<BlogAuthorAdmin>>(
    `/api/admin/content/blog/authors`,
    adminKey,
  );
}

export async function createAdminCmsBlogAuthor(
  adminKey: string | undefined,
  args: {
    display_name: string;
    bio_short?: string;
    avatar_url?: string | null;
    role?: BlogAuthorAdmin["role"];
    profile_url?: string | null;
    is_active?: boolean;
  },
): Promise<{ item: BlogAuthorAdmin }> {
  return requestJson<{ item: BlogAuthorAdmin }>(
    `/api/admin/content/blog/authors`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminCmsBlogAuthor(
  adminKey: string | undefined,
  args: {
    id: string;
    display_name?: string;
    bio_short?: string;
    avatar_url?: string | null;
    role?: BlogAuthorAdmin["role"];
    profile_url?: string | null;
    is_active?: boolean;
  },
): Promise<{ ok: true }> {
  const { id, ...patch } = args;
  return requestJson<{ ok: true }>(
    `/api/admin/content/blog/authors/${encodeURIComponent(id)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(patch),
    },
  );
}

export async function listAdminCmsBlogCategories(
  adminKey: string | undefined,
): Promise<ListResponse<BlogCategoryAdmin>> {
  return requestJson<ListResponse<BlogCategoryAdmin>>(
    `/api/admin/content/blog/categories`,
    adminKey,
  );
}

export async function createAdminCmsBlogArticle(
  adminKey: string | undefined,
  args: {
    slug: string;
    is_published?: boolean;
    published_at?: string | null;

    // legacy
    title?: string;
    description_google?: string;
    short?: string;
    content?: string;
    img?: string;
    miniature?: string;

    // bilingual
    title_fr?: string;
    title_en?: string;
    excerpt_fr?: string;
    excerpt_en?: string;
    body_html_fr?: string;
    body_html_en?: string;

    // seo
    meta_title_fr?: string;
    meta_title_en?: string;
    meta_description_fr?: string;
    meta_description_en?: string;

    // metadata (compat + phase 1)
    author_name?: string;
    category?: string;

    author_id?: string | null;
    primary_category_id?: string | null;
    secondary_category_ids?: string[];
    show_read_count?: boolean;
  },
): Promise<{ item: BlogArticleAdmin }> {
  return requestJson<{ item: BlogArticleAdmin }>(
    `/api/admin/content/blog`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminCmsBlogArticle(
  adminKey: string | undefined,
  args: {
    id: string;
    slug?: string;
    is_published?: boolean;
    published_at?: string | null;

    // legacy
    title?: string;
    description_google?: string;
    short?: string;
    content?: string;
    img?: string;
    miniature?: string;

    // bilingual
    title_fr?: string;
    title_en?: string;
    excerpt_fr?: string;
    excerpt_en?: string;
    body_html_fr?: string;
    body_html_en?: string;

    // seo
    meta_title_fr?: string;
    meta_title_en?: string;
    meta_description_fr?: string;
    meta_description_en?: string;

    // metadata (compat + phase 1)
    author_name?: string;
    category?: string;

    author_id?: string | null;
    primary_category_id?: string | null;
    secondary_category_ids?: string[];
    show_read_count?: boolean;
  },
): Promise<{ ok: true }> {
  const { id, ...patch } = args;
  return requestJson<{ ok: true }>(
    `/api/admin/content/blog/${encodeURIComponent(id)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(patch),
    },
  );
}

export async function listAdminCmsBlogArticleBlocks(
  adminKey: string | undefined,
  articleId: string,
): Promise<ListResponse<BlogArticleBlockAdmin>> {
  return requestJson<ListResponse<BlogArticleBlockAdmin>>(
    `/api/admin/content/blog/${encodeURIComponent(articleId)}/blocks`,
    adminKey,
  );
}

export async function replaceAdminCmsBlogArticleBlocks(
  adminKey: string | undefined,
  args: { articleId: string; blocks: CmsBlockInput[] },
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/content/blog/${encodeURIComponent(args.articleId)}/blocks/replace`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ blocks: args.blocks }),
    },
  );
}

export type BlogPollStatsAdmin = {
  poll_id: string;
  block_id: string;
  total_votes: number;
  total_votes_auth: number;
  total_votes_legacy: number;
  counts: Array<{ option_index: number; count: number; percent: number }>;
  question_fr: string;
  question_en: string;
  options_fr: string[];
  options_en: string[];
};

export async function getAdminCmsBlogPollStats(
  adminKey: string | undefined,
  articleId: string,
): Promise<ListResponse<BlogPollStatsAdmin>> {
  return requestJson<ListResponse<BlogPollStatsAdmin>>(
    `/api/admin/content/blog/${encodeURIComponent(articleId)}/polls/stats`,
    adminKey,
  );
}

export type CmsUploadedImageAdmin = {
  bucket: string;
  path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
};

export async function uploadAdminCmsBlogImage(
  adminKey: string | undefined,
  args: { file: Blob; fileName: string },
): Promise<{ ok: true; item: CmsUploadedImageAdmin }> {
  const headers: Record<string, string> = {
    "content-type": args.file.type || "application/octet-stream",
    "x-file-name": args.fileName,
  };

  if (adminKey) headers["x-admin-key"] = adminKey;

  const res = await fetch("/api/admin/content/blog/media/images/upload", {
    method: "POST",
    headers,
    body: args.file,
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const message =
      json && typeof json.error === "string"
        ? json.error
        : `HTTP_${res.status}`;
    throw new Error(message);
  }

  return json as { ok: true; item: CmsUploadedImageAdmin };
}

export type CmsUploadedDocumentAdmin = {
  bucket: string;
  path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  file_name: string;
};

export async function uploadAdminCmsBlogDocument(
  adminKey: string | undefined,
  args: { file: Blob; fileName: string },
): Promise<{ ok: true; item: CmsUploadedDocumentAdmin }> {
  const headers: Record<string, string> = {
    "content-type": args.file.type || "application/pdf",
    "x-file-name": args.fileName,
  };

  if (adminKey) headers["x-admin-key"] = adminKey;

  const res = await fetch("/api/admin/content/blog/media/documents/upload", {
    method: "POST",
    headers,
    body: args.file,
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const message =
      json && typeof json.error === "string"
        ? json.error
        : `HTTP_${res.status}`;
    throw new Error(message);
  }

  return json as { ok: true; item: CmsUploadedDocumentAdmin };
}

export async function listMysqlFixedContentPages(
  adminKey: string | undefined,
): Promise<ListResponse<MysqlFixedContentPageAdmin>> {
  return requestJson<ListResponse<MysqlFixedContentPageAdmin>>(
    `/api/admin/mysql/content/pages`,
    adminKey,
  );
}

export async function getMysqlFixedContentPage(
  adminKey: string | undefined,
  key: MysqlFixedContentPageAdmin["key"],
): Promise<{
  item: MysqlContentRowAdmin & {
    key: MysqlFixedContentPageAdmin["key"];
    label: string;
  };
}> {
  return requestJson<{
    item: MysqlContentRowAdmin & {
      key: MysqlFixedContentPageAdmin["key"];
      label: string;
    };
  }>(`/api/admin/mysql/content/pages/${encodeURIComponent(key)}`, adminKey);
}

export async function updateMysqlFixedContentPage(
  adminKey: string | undefined,
  args: {
    key: MysqlFixedContentPageAdmin["key"];
    titre: string;
    contenu: string;
  },
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/mysql/content/pages/${encodeURIComponent(args.key)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ titre: args.titre, contenu: args.contenu }),
    },
  );
}

export async function listMysqlBlogCategories(
  adminKey: string | undefined,
): Promise<ListResponse<MysqlBlogCategoryAdmin>> {
  return requestJson<ListResponse<MysqlBlogCategoryAdmin>>(
    `/api/admin/mysql/blog/categories`,
    adminKey,
  );
}

export async function listMysqlBlogAuthors(
  adminKey: string | undefined,
): Promise<ListResponse<MysqlBlogAuthorAdmin>> {
  return requestJson<ListResponse<MysqlBlogAuthorAdmin>>(
    `/api/admin/mysql/blog/authors`,
    adminKey,
  );
}

export async function listMysqlBlogArticles(
  adminKey: string | undefined,
): Promise<ListResponse<MysqlBlogArticleAdmin>> {
  return requestJson<ListResponse<MysqlBlogArticleAdmin>>(
    `/api/admin/mysql/blog/articles`,
    adminKey,
  );
}

export type MysqlBlogArticlePatch = {
  title?: string;
  slug?: string;
  description_google?: string;
  short?: string;
  content?: string;
  img?: string;
  miniature?: string;
  place_id?: number;
  blog_category_id?: number;
  blog_author_id?: number;
  active?: boolean;
};

export async function createMysqlBlogArticle(
  adminKey: string | undefined,
  args: {
    title: string;
    slug: string;
    description_google?: string;
    short?: string;
    content?: string;
    img?: string;
    miniature?: string;
    place_id?: number;
    blog_category_id?: number;
    blog_author_id?: number;
    active?: boolean;
  },
): Promise<{ item: MysqlBlogArticleAdmin }> {
  return requestJson<{ item: MysqlBlogArticleAdmin }>(
    `/api/admin/mysql/blog/articles`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({
        ...args,
        active: Boolean(args.active),
      }),
    },
  );
}

export async function updateMysqlBlogArticle(
  adminKey: string | undefined,
  args: { id: number; patch: MysqlBlogArticlePatch },
): Promise<{ ok: true }> {
  const id = encodeURIComponent(String(args.id));
  return requestJson<{ ok: true }>(
    `/api/admin/mysql/blog/articles/${id}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args.patch),
    },
  );
}

export async function listAdminEstablishmentOffers(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<{ ok: true; slots: any[]; packs: any[] }> {
  return requestJson<{ ok: true; slots: any[]; packs: any[] }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/offers`,
    adminKey,
  );
}

export async function listAdminEstablishmentPackBilling(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<{ ok: true; purchases: any[]; redemptions: any[] }> {
  return requestJson<{ ok: true; purchases: any[]; redemptions: any[] }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/billing/packs`,
    adminKey,
  );
}

export async function listAdminEstablishmentQrLogs(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<ListResponse<QrScanLogAdmin>> {
  return requestJson<ListResponse<QrScanLogAdmin>>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/qr/logs`,
    adminKey,
  );
}

export async function listAdminEstablishmentConversations(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<ListResponse<ProConversationAdmin>> {
  return requestJson<ListResponse<ProConversationAdmin>>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/conversations`,
    adminKey,
  );
}

export async function listAdminEstablishmentConversationMessages(
  adminKey: string | undefined,
  args: { establishmentId: string; conversationId: string },
): Promise<ListResponse<ProMessageAdmin>> {
  return requestJson<ListResponse<ProMessageAdmin>>(
    `/api/admin/establishments/${encodeURIComponent(args.establishmentId)}/conversations/${encodeURIComponent(args.conversationId)}/messages`,
    adminKey,
  );
}

export async function listConsumerUsers(
  adminKey: string | undefined,
): Promise<ListResponse<ConsumerUser>> {
  return requestJson<ListResponse<ConsumerUser>>("/api/admin/users", adminKey);
}

export async function listConsumerAccountActions(
  adminKey: string | undefined,
  args?: { limit?: number; type?: string; user_id?: string },
): Promise<ListResponse<ConsumerAccountAction>> {
  const qs = new URLSearchParams();
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));
  if (typeof args?.type === "string" && args.type.trim())
    qs.set("type", args.type.trim());
  if (typeof args?.user_id === "string" && args.user_id.trim())
    qs.set("user_id", args.user_id.trim());

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<ListResponse<ConsumerAccountAction>>(
    `/api/admin/users/account-actions${suffix}`,
    adminKey,
  );
}

export async function getConsumerUser(
  adminKey: string | undefined,
  id: string,
): Promise<{ item: ConsumerUser }> {
  return requestJson<{ item: ConsumerUser }>(
    `/api/admin/users/${encodeURIComponent(id)}`,
    adminKey,
  );
}

export async function recomputeConsumerUserReliability(
  adminKey: string | undefined,
  id: string,
): Promise<{
  ok: true;
  reliability_score: number;
  reliability_level: string;
  reservations_count: number;
  no_shows_count: number;
}> {
  return requestJson<{
    ok: true;
    reliability_score: number;
    reliability_level: string;
    reservations_count: number;
    no_shows_count: number;
  }>(
    `/api/admin/users/${encodeURIComponent(id)}/reliability/recompute`,
    adminKey,
    { method: "POST" },
  );
}

export async function listConsumerUserEvents(
  adminKey: string | undefined,
  id: string,
  limit?: number,
): Promise<ListResponse<ConsumerUserEvent>> {
  const qs = new URLSearchParams();
  if (typeof limit === "number" && Number.isFinite(limit))
    qs.set("limit", String(Math.floor(limit)));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<ListResponse<ConsumerUserEvent>>(
    `/api/admin/users/${encodeURIComponent(id)}/events${suffix}`,
    adminKey,
  );
}

export async function updateConsumerUserStatus(
  adminKey: string | undefined,
  id: string,
  status: "active" | "suspended",
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/users/${encodeURIComponent(id)}/status`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ status }),
    },
  );
}

export async function updateConsumerUserEvent(
  adminKey: string | undefined,
  args: {
    userId: string;
    eventId: string;
    event_type?: string;
    occurred_at?: string;
    metadata?: unknown;
  },
): Promise<{ ok: true }> {
  const { userId, eventId, ...patch } = args;
  return requestJson<{ ok: true }>(
    `/api/admin/users/${encodeURIComponent(userId)}/events/${encodeURIComponent(eventId)}`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(patch),
    },
  );
}

export async function listConsumerUserPurchases(
  adminKey: string | undefined,
  id: string,
): Promise<ListResponse<ConsumerPurchase>> {
  return requestJson<ListResponse<ConsumerPurchase>>(
    `/api/admin/users/${encodeURIComponent(id)}/purchases`,
    adminKey,
  );
}

export async function updateConsumerUserPurchase(
  adminKey: string | undefined,
  args: {
    userId: string;
    purchaseId: string;
    status?: string;
    currency?: string;
    total_amount?: number;
    purchased_at?: string;
    items?: unknown;
    metadata?: unknown;
  },
): Promise<{ ok: true }> {
  const { userId, purchaseId, ...patch } = args;
  return requestJson<{ ok: true }>(
    `/api/admin/users/${encodeURIComponent(userId)}/purchases/${encodeURIComponent(purchaseId)}`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(patch),
    },
  );
}

// ---------------------------------------------------------------------------
// Superadmin notifications
// ---------------------------------------------------------------------------

export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  created_at: string;
  read_at: string | null;
};

export async function listAdminNotifications(
  adminKey: string | undefined,
  args?: { limit?: number; unread?: boolean; after?: string },
): Promise<ListResponse<AdminNotification>> {
  const params = new URLSearchParams();
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    params.set("limit", String(Math.round(args.limit)));
  if (args?.unread === true) params.set("unread", "true");
  if (typeof args?.after === "string" && args.after.trim())
    params.set("after", args.after.trim());

  const suffix = params.toString();
  return requestJson<ListResponse<AdminNotification>>(
    `/api/admin/alerts${suffix ? `?${suffix}` : ""}`,
    adminKey,
  );
}

export async function getAdminNotificationsUnreadCount(
  adminKey: string | undefined,
): Promise<{ ok: true; unread: number }> {
  return requestJson<{ ok: true; unread: number }>(
    "/api/admin/alerts/unread-count",
    adminKey,
  );
}

export async function markAdminNotificationRead(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/alerts/${encodeURIComponent(id)}/read`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function markAllAdminNotificationsRead(
  adminKey: string | undefined,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    "/api/admin/alerts/mark-all-read",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function deleteAdminNotification(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/alerts/${encodeURIComponent(id)}`,
    adminKey,
    {
      method: "DELETE",
    },
  );
}

// ---------------------------------------------------------------------------
// Commission overrides
// ---------------------------------------------------------------------------

export type EstablishmentCommissionOverride = {
  establishment_id: string;
  active: boolean;
  commission_percent: number | null;
  commission_amount_cents: number | null;
  pack_commission_percent: number | null;
  pack_commission_amount_cents: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listAdminCommissionOverrides(
  adminKey: string | undefined,
  args?: { active_only?: boolean; limit?: number },
): Promise<{ ok: true; items: EstablishmentCommissionOverride[] }> {
  const qs = new URLSearchParams();
  if (args?.active_only) qs.set("active_only", "true");
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: EstablishmentCommissionOverride[] }>(
    `/api/admin/finance/commission-overrides${suffix}`,
    adminKey,
  );
}

export async function createAdminCommissionOverride(
  adminKey: string | undefined,
  args: {
    establishment_id: string;
    active?: boolean;
    commission_percent?: number | null;
    commission_amount_cents?: number | null;
    pack_commission_percent?: number | null;
    pack_commission_amount_cents?: number | null;
    notes?: string | null;
  },
): Promise<{ ok: true; item: EstablishmentCommissionOverride }> {
  return requestJson<{ ok: true; item: EstablishmentCommissionOverride }>(
    "/api/admin/finance/commission-overrides/create",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminCommissionOverride(
  adminKey: string | undefined,
  establishmentId: string,
  args: {
    active?: boolean;
    commission_percent?: number | null;
    commission_amount_cents?: number | null;
    pack_commission_percent?: number | null;
    pack_commission_amount_cents?: number | null;
    notes?: string | null;
  },
): Promise<{ ok: true; item: EstablishmentCommissionOverride }> {
  return requestJson<{ ok: true; item: EstablishmentCommissionOverride }>(
    `/api/admin/finance/commission-overrides/${encodeURIComponent(establishmentId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function deleteAdminCommissionOverride(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/finance/commission-overrides/${encodeURIComponent(establishmentId)}/delete`,
    adminKey,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function getAdminCommissionOverride(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<{ ok: true; item: EstablishmentCommissionOverride | null }> {
  return requestJson<{ ok: true; item: EstablishmentCommissionOverride | null }>(
    `/api/admin/finance/commission-overrides/${encodeURIComponent(establishmentId)}`,
    adminKey,
  );
}

// ---------------------------------------------------------------------------
// PRO Terms
// ---------------------------------------------------------------------------

export type ProTerms = {
  id: number;
  version: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export async function getAdminProTerms(
  adminKey: string | undefined,
): Promise<{ ok: true; item: ProTerms }> {
  return requestJson<{ ok: true; item: ProTerms }>(
    "/api/admin/pro-terms",
    adminKey,
  );
}

export async function updateAdminProTerms(
  adminKey: string | undefined,
  args: { version: string; title: string; body: string },
): Promise<{ ok: true; item: ProTerms }> {
  return requestJson<{ ok: true; item: ProTerms }>(
    "/api/admin/pro-terms/update",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

// ---------------------------------------------------------------------------
// Payout Requests
// ---------------------------------------------------------------------------

export type PayoutRequest = {
  id: string;
  payout_id: string;
  establishment_id: string;
  status: string;
  created_by_user_id: string | null;
  pro_comment: string | null;
  admin_comment: string | null;
  paid_reference: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listAdminPayoutRequests(
  adminKey: string | undefined,
  args?: { status?: string; establishment_id?: string; limit?: number },
): Promise<{ ok: true; items: PayoutRequest[] }> {
  const qs = new URLSearchParams();
  if (args?.status) qs.set("status", String(args.status));
  if (args?.establishment_id)
    qs.set("establishment_id", String(args.establishment_id));
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: PayoutRequest[] }>(
    `/api/admin/finance/payout-requests${suffix}`,
    adminKey,
  );
}

export async function updateAdminPayoutRequest(
  adminKey: string | undefined,
  requestId: string,
  args: {
    status?: string;
    admin_comment?: string | null;
    paid_reference?: string | null;
  },
): Promise<{ ok: true; item: PayoutRequest }> {
  return requestJson<{ ok: true; item: PayoutRequest }>(
    `/api/admin/finance/payout-requests/${encodeURIComponent(requestId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

// ---------------------------------------------------------------------------
// PRO Bank details (RIB) — Superadmin-only write
// ---------------------------------------------------------------------------

export type AdminProBankDetails = {
  id: string;
  establishment_id: string;
  bank_code: string;
  locality_code: string;
  branch_code: string;
  account_number: string;
  rib_key: string;
  bank_name: string;
  bank_address: string | null;
  holder_name: string;
  holder_address: string | null;
  rib_24: string;
  is_validated: boolean;
  validated_at: string | null;
  validated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminProBankDetailsUpsertInput = {
  bank_code: string;
  locality_code: string;
  branch_code: string;
  account_number: string;
  rib_key: string;
  bank_address?: string | null;
  holder_name: string;
  holder_address?: string | null;
};

export type AdminProBankDetailsHistoryItem = {
  id: string;
  pro_bank_id: string;
  changed_by: string | null;
  changed_at: string;
  old_data: unknown;
  new_data: unknown;
};

export type AdminProBankDocument = {
  id: string;
  pro_bank_id: string;
  file_path: string;
  file_name: string | null;
  mime_type: string;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  signed_url?: string | null;
};

export async function getAdminEstablishmentBankDetails(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<{ ok: true; item: AdminProBankDetails | null }> {
  return requestJson<{ ok: true; item: AdminProBankDetails | null }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/bank-details`,
    adminKey,
  );
}

export async function upsertAdminEstablishmentBankDetails(
  adminKey: string | undefined,
  establishmentId: string,
  input: AdminProBankDetailsUpsertInput,
): Promise<{ ok: true; item: AdminProBankDetails }> {
  return requestJson<{ ok: true; item: AdminProBankDetails }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/bank-details/upsert`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function validateAdminEstablishmentBankDetails(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<{ ok: true; item: AdminProBankDetails }> {
  return requestJson<{ ok: true; item: AdminProBankDetails }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/bank-details/validate`,
    adminKey,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function listAdminEstablishmentBankDetailsHistory(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<{ ok: true; items: AdminProBankDetailsHistoryItem[] }> {
  return requestJson<{ ok: true; items: AdminProBankDetailsHistoryItem[] }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/bank-details/history`,
    adminKey,
  );
}

export async function listAdminEstablishmentBankDocuments(
  adminKey: string | undefined,
  establishmentId: string,
): Promise<{ ok: true; items: AdminProBankDocument[] }> {
  return requestJson<{ ok: true; items: AdminProBankDocument[] }>(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/bank-details/documents`,
    adminKey,
  );
}

export async function uploadAdminEstablishmentBankDocument(
  adminKey: string | undefined,
  establishmentId: string,
  file: File,
): Promise<{ ok: true; item: AdminProBankDocument }> {
  const sessionToken = loadAdminSessionToken();

  let res: Response;
  try {
    res = await fetch(
      `/api/admin/establishments/${encodeURIComponent(establishmentId)}/bank-details/documents/upload`,
      {
        method: "POST",
        credentials: "omit",
        headers: {
          ...(adminKey ? { "x-admin-key": adminKey } : {}),
          ...(sessionToken ? { "x-admin-session": sessionToken } : {}),
          "content-type": "application/pdf",
          "x-file-name": file.name,
        },
        body: await file.arrayBuffer(),
      },
    );
  } catch (e) {
    throw new AdminApiError(
      "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
      0,
      e,
    );
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = extractErrorMessage(payload) || `HTTP ${res.status}`;
    throw new AdminApiError(msg, res.status, payload);
  }

  return payload as { ok: true; item: AdminProBankDocument };
}

// ---------------------------------------------------------------------------
// Visibilité (SAM Media) - offers + orders (admin)
// ---------------------------------------------------------------------------

export type AdminVisibilityOfferType =
  | "pack"
  | "option"
  | "menu_digital"
  | "media_video"
  | "article_sponsorise"
  | "newsletter"
  | string;

export type AdminVisibilityOffer = {
  id: string;
  title: string;
  description: string | null;
  type: AdminVisibilityOfferType;
  deliverables: string[];
  duration_days: number | null;
  price_cents: number | null;
  currency: string;
  allow_quantity: boolean;
  tax_rate_bps: number;
  tax_label: string;

  // New (quotes/invoices)
  is_quotable?: boolean;
  is_external_allowed?: boolean;
  category?: string;
  tax_rate?: number;

  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export async function listAdminVisibilityOffers(
  adminKey: string | undefined,
  args?: { include_deleted?: boolean },
): Promise<{ ok: true; offers: AdminVisibilityOffer[] }> {
  const qs = new URLSearchParams();
  if (args?.include_deleted) qs.set("include_deleted", "true");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; offers: AdminVisibilityOffer[] }>(
    `/api/admin/visibility/offers${suffix}`,
    adminKey,
  );
}

export type AdminVisibilityOfferInput = {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  deliverables?: unknown;
  duration_days?: unknown;
  price_cents?: unknown;
  currency?: unknown;
  active?: unknown;
  allow_quantity?: unknown;
  tax_rate_bps?: unknown;
  tax_label?: unknown;
  display_order?: unknown;
};

export async function createAdminVisibilityOffer(
  adminKey: string | undefined,
  args: AdminVisibilityOfferInput,
): Promise<{ ok: true; offer: AdminVisibilityOffer }> {
  return requestJson<{ ok: true; offer: AdminVisibilityOffer }>(
    "/api/admin/visibility/offers",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminVisibilityOffer(
  adminKey: string | undefined,
  offerId: string,
  args: AdminVisibilityOfferInput,
): Promise<{ ok: true; offer: AdminVisibilityOffer }> {
  return requestJson<{ ok: true; offer: AdminVisibilityOffer }>(
    `/api/admin/visibility/offers/${encodeURIComponent(offerId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function deleteAdminVisibilityOffer(
  adminKey: string | undefined,
  offerId: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/visibility/offers/${encodeURIComponent(offerId)}/delete`,
    adminKey,
    {
      method: "POST",
    },
  );
}

export type AdminVisibilityPromoCode = {
  id: string;
  code: string;
  description: string | null;
  discount_bps: number;
  applies_to_type: AdminVisibilityOfferType | null;
  applies_to_offer_id: string | null;
  applies_to_establishment_ids: string[] | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AdminVisibilityPromoCodeInput = {
  code?: unknown;
  description?: unknown;
  discount_bps?: unknown;
  applies_to_type?: unknown;
  applies_to_offer_id?: unknown;
  applies_to_establishment_ids?: unknown;
  active?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
};

export async function listAdminVisibilityPromoCodes(
  adminKey: string | undefined,
  args?: { include_deleted?: boolean },
): Promise<{ ok: true; promo_codes: AdminVisibilityPromoCode[] }> {
  const qs = new URLSearchParams();
  if (args?.include_deleted) qs.set("include_deleted", "true");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  return requestJson<{ ok: true; promo_codes: AdminVisibilityPromoCode[] }>(
    `/api/admin/visibility/promo-codes${suffix}`,
    adminKey,
  );
}

export async function createAdminVisibilityPromoCode(
  adminKey: string | undefined,
  args: AdminVisibilityPromoCodeInput,
): Promise<{ ok: true; promo_code: AdminVisibilityPromoCode }> {
  return requestJson<{ ok: true; promo_code: AdminVisibilityPromoCode }>(
    "/api/admin/visibility/promo-codes",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminVisibilityPromoCode(
  adminKey: string | undefined,
  promoId: string,
  args: AdminVisibilityPromoCodeInput,
): Promise<{ ok: true; promo_code: AdminVisibilityPromoCode }> {
  return requestJson<{ ok: true; promo_code: AdminVisibilityPromoCode }>(
    `/api/admin/visibility/promo-codes/${encodeURIComponent(promoId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function deleteAdminVisibilityPromoCode(
  adminKey: string | undefined,
  promoId: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/visibility/promo-codes/${encodeURIComponent(promoId)}/delete`,
    adminKey,
    {
      method: "POST",
    },
  );
}

export type AdminConsumerPromoCode = {
  id: string;
  code: string;
  description: string | null;
  discount_bps: number;
  applies_to_pack_id: string | null;
  applies_to_establishment_ids: string[] | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AdminConsumerPromoCodeInput = {
  code?: unknown;
  description?: unknown;
  discount_bps?: unknown;
  applies_to_pack_id?: unknown;
  applies_to_establishment_ids?: unknown;
  active?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
};

export async function listAdminConsumerPromoCodes(
  adminKey: string | undefined,
  args?: { include_deleted?: boolean },
): Promise<{ ok: true; promo_codes: AdminConsumerPromoCode[] }> {
  const qs = new URLSearchParams();
  if (args?.include_deleted) qs.set("include_deleted", "true");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  return requestJson<{ ok: true; promo_codes: AdminConsumerPromoCode[] }>(
    `/api/admin/consumer/promo-codes${suffix}`,
    adminKey,
  );
}

export async function createAdminConsumerPromoCode(
  adminKey: string | undefined,
  args: AdminConsumerPromoCodeInput,
): Promise<{ ok: true; promo_code: AdminConsumerPromoCode }> {
  return requestJson<{ ok: true; promo_code: AdminConsumerPromoCode }>(
    "/api/admin/consumer/promo-codes",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminConsumerPromoCode(
  adminKey: string | undefined,
  promoId: string,
  args: AdminConsumerPromoCodeInput,
): Promise<{ ok: true; promo_code: AdminConsumerPromoCode }> {
  return requestJson<{ ok: true; promo_code: AdminConsumerPromoCode }>(
    `/api/admin/consumer/promo-codes/${encodeURIComponent(promoId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function deleteAdminConsumerPromoCode(
  adminKey: string | undefined,
  promoId: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/consumer/promo-codes/${encodeURIComponent(promoId)}/delete`,
    adminKey,
    {
      method: "POST",
    },
  );
}

export type AdminVisibilityOrderItem = {
  id: string;
  order_id: string;
  offer_id: string | null;
  title: string;
  description: string | null;
  type: AdminVisibilityOfferType;
  deliverables: string[];
  duration_days: number | null;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  currency: string;
  tax_rate_bps: number;
  tax_label: string;
  meta: unknown;
  created_at: string;
};

export type AdminVisibilityOrder = {
  id: string;
  establishment_id: string;
  created_by_user_id: string | null;
  payment_status: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_at: string | null;
  meta: unknown;
  created_at: string;
  updated_at: string;
  establishments: {
    id: string;
    name: string | null;
    city: string | null;
  } | null;
  items: AdminVisibilityOrderItem[];
  finance_invoice: {
    id: string;
    invoice_number: string;
    issued_at: string;
  } | null;
};

export async function listAdminVisibilityOrders(
  adminKey: string | undefined,
  args?: { limit?: number; payment_status?: string; status?: string },
): Promise<{ ok: true; orders: AdminVisibilityOrder[] }> {
  const qs = new URLSearchParams();
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));
  if (args?.payment_status)
    qs.set("payment_status", String(args.payment_status));
  if (args?.status) qs.set("status", String(args.status));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; orders: AdminVisibilityOrder[] }>(
    `/api/admin/visibility/orders${suffix}`,
    adminKey,
  );
}

export async function updateAdminVisibilityOrderStatus(
  adminKey: string | undefined,
  orderId: string,
  args: { status: string },
): Promise<{ ok: true; order: AdminVisibilityOrder }> {
  return requestJson<{ ok: true; order: AdminVisibilityOrder }>(
    `/api/admin/visibility/orders/${encodeURIComponent(orderId)}/update-status`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminVisibilityOrderItemMeta(
  adminKey: string | undefined,
  args: { orderId: string; itemId: string; meta: Record<string, unknown> },
): Promise<{
  ok: true;
  item: { id: string; order_id: string; meta: unknown };
}> {
  return requestJson<{
    ok: true;
    item: { id: string; order_id: string; meta: unknown };
  }>(
    `/api/admin/visibility/orders/${encodeURIComponent(args.orderId)}/items/${encodeURIComponent(args.itemId)}/update-meta`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ meta: args.meta }),
    },
  );
}

// ---------------------------------------------------------------------------
// Visibilité (SAM Media) - quotes & invoices (admin)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PRO profiles (clients = PRO)
// ---------------------------------------------------------------------------

export type AdminProProfile = {
  user_id: string;
  client_type: "A" | "B" | string;
  company_name: string | null;
  contact_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  postal_code: string | null;
  country: string | null;
  ice: string | null;
  rc: string | null;
  notes: string | null;
  establishments: Array<{
    id: string;
    name: string | null;
    city: string | null;
  }>;
};

export type AdminProProfileInput = {
  company_name?: string | null;
  contact_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  postal_code?: string | null;
  country?: string | null;
  ice?: string | null;
  rc?: string | null;
  notes?: string | null;
  client_type?: "A" | "B";
};

export async function listAdminProProfiles(
  adminKey: string | undefined,
  args?: { q?: string; limit?: number },
): Promise<{ ok: true; items: AdminProProfile[] }> {
  const qs = new URLSearchParams();
  if (args?.q) qs.set("q", args.q);
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  return requestJson<{ ok: true; items: AdminProProfile[] }>(
    `/api/admin/pro-profiles${suffix}`,
    adminKey,
  );
}

export async function getAdminProProfile(
  adminKey: string | undefined,
  userId: string,
): Promise<{ ok: true; profile: AdminProProfile }> {
  return requestJson<{ ok: true; profile: AdminProProfile }>(
    `/api/admin/pro-profiles/${userId}`,
    adminKey,
  );
}

export async function updateAdminProProfile(
  adminKey: string | undefined,
  userId: string,
  input: AdminProProfileInput,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/pro-profiles/${userId}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export type AdminMediaQuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled"
  | string;
export type AdminMediaClientType = "pro" | string;

export type AdminMediaQuoteItem = {
  id: string;
  quote_id: string;
  catalog_item_id: string | null;
  item_type: string;
  name_snapshot: string;
  description_snapshot: string | null;
  category_snapshot: string | null;
  unit_price_snapshot: number;
  quantity: number;
  tax_rate_snapshot: number;
  line_subtotal: number;
  line_tax: number;
  line_total: number;
  created_at: string;
};

export type AdminMediaQuote = {
  id: string;
  quote_number: string;
  status: AdminMediaQuoteStatus;

  client_type: AdminMediaClientType;
  pro_user_id: string;
  establishment_id: string | null;

  issued_at: string;
  valid_until: string | null;
  currency: string;
  payment_method?: "card" | "bank_transfer" | string;
  notes: string | null;
  payment_terms: string | null;
  delivery_estimate: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;

  pro_profiles?: Pick<
    AdminProProfile,
    | "user_id"
    | "client_type"
    | "company_name"
    | "contact_name"
    | "email"
    | "city"
    | "ice"
  > | null;
  establishments?: {
    id: string;
    name: string | null;
    city: string | null;
  } | null;
  items?: AdminMediaQuoteItem[];
};

export async function listAdminMediaQuotes(
  adminKey: string | undefined,
  args?: { status?: string; client_type?: string; limit?: number },
): Promise<{ ok: true; quotes: AdminMediaQuote[] }> {
  const qs = new URLSearchParams();
  if (args?.status) qs.set("status", String(args.status));
  if (args?.client_type) qs.set("client_type", String(args.client_type));
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; quotes: AdminMediaQuote[] }>(
    `/api/admin/media/quotes${suffix}`,
    adminKey,
  );
}

export async function getAdminMediaQuote(
  adminKey: string | undefined,
  quoteId: string,
): Promise<{ ok: true; quote: AdminMediaQuote }> {
  return requestJson<{ ok: true; quote: AdminMediaQuote }>(
    `/api/admin/media/quotes/${encodeURIComponent(quoteId)}`,
    adminKey,
  );
}

export async function createAdminMediaQuote(
  adminKey: string | undefined,
  args: {
    pro_user_id: string;
    establishment_id?: string | null;
    valid_until?: string | null;
    currency?: string;
    payment_method?: "card" | "bank_transfer" | string;
    notes?: string | null;
    payment_terms?: string | null;
    delivery_estimate?: string | null;
  },
): Promise<{ ok: true; quote: AdminMediaQuote }> {
  return requestJson<{ ok: true; quote: AdminMediaQuote }>(
    `/api/admin/media/quotes`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminMediaQuote(
  adminKey: string | undefined,
  quoteId: string,
  args: {
    status?: string;
    valid_until?: string | null;
    currency?: string;
    payment_method?: "card" | "bank_transfer" | string;
    notes?: string | null;
    payment_terms?: string | null;
    delivery_estimate?: string | null;
  },
): Promise<{ ok: true; quote: AdminMediaQuote }> {
  return requestJson<{ ok: true; quote: AdminMediaQuote }>(
    `/api/admin/media/quotes/${encodeURIComponent(quoteId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function addAdminMediaQuoteItem(
  adminKey: string | undefined,
  quoteId: string,
  args: { catalog_item_id?: string; quantity?: number },
): Promise<{ ok: true; quote: AdminMediaQuote }> {
  return requestJson<{ ok: true; quote: AdminMediaQuote }>(
    `/api/admin/media/quotes/${encodeURIComponent(quoteId)}/items`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminMediaQuoteItem(
  adminKey: string | undefined,
  quoteId: string,
  itemId: string,
  args: { quantity: number },
): Promise<{ ok: true; quote: AdminMediaQuote }> {
  return requestJson<{ ok: true; quote: AdminMediaQuote }>(
    `/api/admin/media/quotes/${encodeURIComponent(quoteId)}/items/${encodeURIComponent(itemId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function deleteAdminMediaQuoteItem(
  adminKey: string | undefined,
  quoteId: string,
  itemId: string,
): Promise<{ ok: true; quote: AdminMediaQuote }> {
  return requestJson<{ ok: true; quote: AdminMediaQuote }>(
    `/api/admin/media/quotes/${encodeURIComponent(quoteId)}/items/${encodeURIComponent(itemId)}/delete`,
    adminKey,
    { method: "POST" },
  );
}

export async function createAdminMediaQuotePublicLink(
  adminKey: string | undefined,
  quoteId: string,
): Promise<{
  ok: true;
  public_link: string;
  expires_at: string;
  token: string;
}> {
  return requestJson<{
    ok: true;
    public_link: string;
    expires_at: string;
    token: string;
  }>(
    `/api/admin/media/quotes/${encodeURIComponent(quoteId)}/public-link`,
    adminKey,
    { method: "POST" },
  );
}

export async function sendAdminMediaQuoteEmail(
  adminKey: string | undefined,
  quoteId: string,
  args?: { lang?: "fr" | "en"; to_email?: string },
): Promise<{
  ok: true;
  quote: AdminMediaQuote;
  email_id: string;
  public_link: string;
}> {
  return requestJson<{
    ok: true;
    quote: AdminMediaQuote;
    email_id: string;
    public_link: string;
  }>(
    `/api/admin/media/quotes/${encodeURIComponent(quoteId)}/send-email`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args ?? {}),
    },
  );
}

export async function markAdminMediaQuoteAccepted(
  adminKey: string | undefined,
  quoteId: string,
): Promise<{ ok: true; quote: AdminMediaQuote }> {
  return requestJson<{ ok: true; quote: AdminMediaQuote }>(
    `/api/admin/media/quotes/${encodeURIComponent(quoteId)}/mark-accepted`,
    adminKey,
    {
      method: "POST",
    },
  );
}

export async function markAdminMediaQuoteRejected(
  adminKey: string | undefined,
  quoteId: string,
): Promise<{ ok: true; quote: AdminMediaQuote }> {
  return requestJson<{ ok: true; quote: AdminMediaQuote }>(
    `/api/admin/media/quotes/${encodeURIComponent(quoteId)}/mark-rejected`,
    adminKey,
    {
      method: "POST",
    },
  );
}

export type AdminMediaInvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "partial"
  | "overdue"
  | "cancelled"
  | string;

export type AdminMediaInvoiceItem = {
  id: string;
  invoice_id: string;
  catalog_item_id: string | null;
  item_type: string;
  name_snapshot: string;
  description_snapshot: string | null;
  category_snapshot: string | null;
  unit_price_snapshot: number;
  quantity: number;
  tax_rate_snapshot: number;
  line_subtotal: number;
  line_tax: number;
  line_total: number;
  created_at: string;
};

export type AdminMediaInvoice = {
  id: string;
  invoice_number: string;
  status: AdminMediaInvoiceStatus;
  source_quote_id: string | null;

  client_type: AdminMediaClientType;
  pro_user_id: string;
  establishment_id: string | null;

  issued_at: string;
  due_at: string | null;
  currency: string;
  payment_method?: "card" | "bank_transfer" | string;
  notes: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  created_at: string;
  updated_at: string;

  pro_profiles?: Pick<
    AdminProProfile,
    | "user_id"
    | "client_type"
    | "company_name"
    | "contact_name"
    | "email"
    | "city"
    | "ice"
  > | null;
  establishments?: {
    id: string;
    name: string | null;
    city: string | null;
  } | null;
  media_quotes?: { id: string; quote_number: string } | null;
  items?: AdminMediaInvoiceItem[];
};

export async function convertAdminMediaQuoteToInvoice(
  adminKey: string | undefined,
  quoteId: string,
  args?: {
    due_at?: string | null;
    notes?: string | null;
    payment_method?: "card" | "bank_transfer" | string;
  },
): Promise<{ ok: true; invoice: AdminMediaInvoice }> {
  return requestJson<{ ok: true; invoice: AdminMediaInvoice }>(
    `/api/admin/media/quotes/${encodeURIComponent(quoteId)}/convert-to-invoice`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args ?? {}),
    },
  );
}

export async function listAdminMediaInvoices(
  adminKey: string | undefined,
  args?: { status?: string; limit?: number },
): Promise<{ ok: true; invoices: AdminMediaInvoice[] }> {
  const qs = new URLSearchParams();
  if (args?.status) qs.set("status", String(args.status));
  if (typeof args?.limit === "number" && Number.isFinite(args.limit))
    qs.set("limit", String(Math.floor(args.limit)));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; invoices: AdminMediaInvoice[] }>(
    `/api/admin/media/invoices${suffix}`,
    adminKey,
  );
}

export async function getAdminMediaInvoice(
  adminKey: string | undefined,
  invoiceId: string,
): Promise<{ ok: true; invoice: AdminMediaInvoice }> {
  return requestJson<{ ok: true; invoice: AdminMediaInvoice }>(
    `/api/admin/media/invoices/${encodeURIComponent(invoiceId)}`,
    adminKey,
  );
}

export async function createAdminMediaInvoicePublicLink(
  adminKey: string | undefined,
  invoiceId: string,
): Promise<{
  ok: true;
  public_link: string;
  expires_at: string;
  token: string;
}> {
  return requestJson<{
    ok: true;
    public_link: string;
    expires_at: string;
    token: string;
  }>(
    `/api/admin/media/invoices/${encodeURIComponent(invoiceId)}/public-link`,
    adminKey,
    { method: "POST" },
  );
}

export async function sendAdminMediaInvoiceEmail(
  adminKey: string | undefined,
  invoiceId: string,
  args?: { lang?: "fr" | "en"; to_email?: string },
): Promise<{ ok: true; email_id: string }> {
  return requestJson<{ ok: true; email_id: string }>(
    `/api/admin/media/invoices/${encodeURIComponent(invoiceId)}/send-email`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args ?? {}),
    },
  );
}

export async function markAdminMediaInvoicePaid(
  adminKey: string | undefined,
  invoiceId: string,
  args: {
    amount: number;
    method?: "card" | "bank_transfer" | "cash" | "other";
    reference?: string;
    paid_at?: string;
  },
): Promise<{ ok: true; invoice: AdminMediaInvoice }> {
  return requestJson<{ ok: true; invoice: AdminMediaInvoice }>(
    `/api/admin/media/invoices/${encodeURIComponent(invoiceId)}/mark-paid`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

export type AdminTestEmailSenderKey =
  | "hello"
  | "support"
  | "pro"
  | "finance"
  | "noreply";

export async function sendAdminTestEmail(
  adminKey: string | undefined,
  args: {
    from: AdminTestEmailSenderKey;
    to: string;
    subject?: string;
    message?: string;
    cta_label?: string;
    cta_url?: string;
  },
): Promise<
  | { ok: true; email_id: string; message_id: string | null }
  | { ok: false; email_id: string; error: string }
> {
  return requestJson<
    | { ok: true; email_id: string; message_id: string | null }
    | { ok: false; email_id: string; error: string }
  >("/api/admin/emails/test", adminKey, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export type AdminEmailTemplate = {
  id: string;
  key: string;
  audience: "consumer" | "pro" | "finance" | "system" | "marketing" | string;
  name: string;
  subject_fr: string;
  subject_en: string;
  body_fr: string;
  body_en: string;
  cta_label_fr: string | null;
  cta_label_en: string | null;
  cta_url: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export async function listAdminEmailTemplates(
  adminKey: string | undefined,
  args?: { audience?: string },
): Promise<{ ok: true; items: AdminEmailTemplate[] }> {
  const qs = new URLSearchParams();
  if (args?.audience) qs.set("audience", args.audience);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminEmailTemplate[] }>(
    `/api/admin/emails/templates${suffix}`,
    adminKey,
  );
}

export async function upsertAdminEmailTemplate(
  adminKey: string | undefined,
  args: Partial<AdminEmailTemplate> & {
    key: string;
    audience: string;
    name: string;
    subject_fr: string;
    subject_en: string;
    body_fr: string;
    body_en: string;
  },
): Promise<{ ok: true; id: string | null }> {
  return requestJson<{ ok: true; id: string | null }>(
    "/api/admin/emails/templates/upsert",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function duplicateAdminEmailTemplate(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true; id: string | null; key: string }> {
  return requestJson<{ ok: true; id: string | null; key: string }>(
    `/api/admin/emails/templates/${encodeURIComponent(id)}/duplicate`,
    adminKey,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export type AdminEmailBranding = {
  id: number;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  from_name: string;
  contact_email: string;
  legal_links: any;
  signature_fr: string;
  signature_en: string;
  created_at: string;
  updated_at: string;
};

export async function getAdminEmailBranding(
  adminKey: string | undefined,
): Promise<{ ok: true; item: AdminEmailBranding }> {
  return requestJson<{ ok: true; item: AdminEmailBranding }>(
    "/api/admin/emails/branding",
    adminKey,
  );
}

export async function updateAdminEmailBranding(
  adminKey: string | undefined,
  args: Partial<AdminEmailBranding> & { legal_links?: any },
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    "/api/admin/emails/branding/update",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function uploadEmailBrandingLogo(
  adminKey: string | undefined,
  file: Blob,
): Promise<{ ok: true; url: string; path: string; size_bytes: number }> {
  const session = getStoredAdminSession();
  const headers: Record<string, string> = {
    "Content-Type": file.type,
  };
  if (adminKey) headers["x-admin-key"] = adminKey;
  if (session?.token) headers["x-admin-session"] = session.token;

  const response = await fetch("/api/admin/emails/branding/logo/upload", {
    method: "POST",
    headers,
    body: file,
    credentials: "include",
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Upload failed" }));
    throw new AdminApiError(err.error || "Upload failed", response.status);
  }

  return response.json();
}

export async function deleteEmailBrandingLogo(
  adminKey: string | undefined,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    "/api/admin/emails/branding/logo",
    adminKey,
    { method: "DELETE" },
  );
}

export async function previewAdminEmail(
  adminKey: string | undefined,
  args: {
    from: AdminTestEmailSenderKey;
    subject: string;
    body: string;
    cta_label?: string | null;
    cta_url?: string | null;
    variables?: Record<string, string | number | null | undefined>;
  },
): Promise<{ ok: true; html: string; text: string }> {
  return requestJson<{ ok: true; html: string; text: string }>(
    "/api/admin/emails/preview",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export type AdminEmailCampaign = {
  id: string;
  name: string;
  template_id: string;
  subject_override: string | null;
  audience: "consumer" | "pro" | string;
  status: string;
  scheduled_at: string | null;
  send_started_at: string | null;
  send_finished_at: string | null;
  created_at: string;
  updated_at: string;
  email_templates?: { name: string; key: string; audience: string } | null;
};

export async function listAdminEmailCampaigns(
  adminKey: string | undefined,
): Promise<{ ok: true; items: AdminEmailCampaign[] }> {
  return requestJson<{ ok: true; items: AdminEmailCampaign[] }>(
    "/api/admin/emails/campaigns",
    adminKey,
  );
}

export async function createAdminEmailCampaign(
  adminKey: string | undefined,
  args: {
    name: string;
    template_id: string;
    audience: "consumer" | "pro";
    subject_override?: string | null;
    scheduled_at?: string | null;
  },
): Promise<{ ok: true; id: string | null }> {
  return requestJson<{ ok: true; id: string | null }>(
    "/api/admin/emails/campaigns",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function sendAdminEmailCampaignNow(
  adminKey: string | undefined,
  args: { id: string; limit?: number; dry_run?: boolean },
): Promise<
  | {
      ok: true;
      dry_run: boolean;
      inserted: number;
      sent: number;
      failed: number;
      skipped_unsubscribed: number;
    }
  | { error: string }
> {
  return requestJson<
    | {
        ok: true;
        dry_run: boolean;
        inserted: number;
        sent: number;
        failed: number;
        skipped_unsubscribed: number;
      }
    | { error: string }
  >(
    `/api/admin/emails/campaigns/${encodeURIComponent(args.id)}/send`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ limit: args.limit, dry_run: args.dry_run }),
    },
  );
}

export type AdminEmailCampaignRecipient = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  email_id: string | null;
  message_id: string | null;
  error: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
};

export async function listAdminEmailCampaignRecipients(
  adminKey: string | undefined,
  args: { campaignId: string; status?: string; limit?: number },
): Promise<{ ok: true; items: AdminEmailCampaignRecipient[] }> {
  const qs = new URLSearchParams();
  if (args.status) qs.set("status", args.status);
  if (typeof args.limit === "number") qs.set("limit", String(args.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminEmailCampaignRecipient[] }>(
    `/api/admin/emails/campaigns/${encodeURIComponent(args.campaignId)}/recipients${suffix}`,
    adminKey,
  );
}

export type AdminEmailSendRow = {
  id: string;
  campaign_id: string;
  email: string;
  full_name: string | null;
  status: string;
  email_id: string | null;
  message_id: string | null;
  error: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
  email_campaigns?: { name: string; audience: string } | null;
};

export async function listAdminEmailSends(
  adminKey: string | undefined,
  args?: { q?: string; status?: string; limit?: number },
): Promise<{ ok: true; items: AdminEmailSendRow[] }> {
  const qs = new URLSearchParams();
  if (args?.q) qs.set("q", args.q);
  if (args?.status) qs.set("status", args.status);
  if (typeof args?.limit === "number") qs.set("limit", String(args.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminEmailSendRow[] }>(
    `/api/admin/emails/sends${suffix}`,
    adminKey,
  );
}

// ---------------------------------------------------------------------------
// NEWSLETTER TEMPLATES
// ---------------------------------------------------------------------------

export type NewsletterTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  audience: string;
  subject_fr: string;
  subject_en: string;
  preheader_fr: string | null;
  preheader_en: string | null;
  blocks: unknown[];
  design_settings: Record<string, unknown>;
  thumbnail_url: string | null;
  is_template: boolean;
  is_featured: boolean;
  enabled: boolean;
  times_used: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function listNewsletterTemplates(
  adminKey: string | undefined,
  args?: { category?: string; audience?: string; featured?: boolean },
): Promise<{ ok: true; items: NewsletterTemplate[] }> {
  const qs = new URLSearchParams();
  if (args?.category) qs.set("category", args.category);
  if (args?.audience) qs.set("audience", args.audience);
  if (typeof args?.featured === "boolean") qs.set("featured", String(args.featured));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: NewsletterTemplate[] }>(
    `/api/admin/newsletter/templates${suffix}`,
    adminKey,
  );
}

export async function getNewsletterTemplate(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true; item: NewsletterTemplate }> {
  return requestJson<{ ok: true; item: NewsletterTemplate }>(
    `/api/admin/newsletter/templates/${encodeURIComponent(id)}`,
    adminKey,
  );
}

export async function upsertNewsletterTemplate(
  adminKey: string | undefined,
  args: {
    id?: string;
    name: string;
    description?: string | null;
    category: string;
    audience: string;
    subject_fr: string;
    subject_en: string;
    preheader_fr?: string | null;
    preheader_en?: string | null;
    blocks: unknown[];
    design_settings: Record<string, unknown>;
    is_template?: boolean;
    is_featured?: boolean;
    enabled?: boolean;
  },
): Promise<{ ok: true; id: string }> {
  return requestJson<{ ok: true; id: string }>(
    "/api/admin/newsletter/templates/upsert",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function duplicateNewsletterTemplate(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true; id: string; name: string }> {
  return requestJson<{ ok: true; id: string; name: string }>(
    `/api/admin/newsletter/templates/${encodeURIComponent(id)}/duplicate`,
    adminKey,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function deleteNewsletterTemplate(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/newsletter/templates/${encodeURIComponent(id)}`,
    adminKey,
    { method: "DELETE" },
  );
}

export async function previewNewsletterTemplate(
  adminKey: string | undefined,
  args: {
    subject: string;
    blocks: unknown[];
    design_settings: Record<string, unknown>;
    lang: "fr" | "en";
    variables?: Record<string, string | number | null | undefined>;
  },
): Promise<{ ok: true; html: string; text: string }> {
  return requestJson<{ ok: true; html: string; text: string }>(
    "/api/admin/newsletter/preview",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

// Newsletter Campaigns
export type NewsletterCampaign = {
  id: string;
  template_id: string | null;
  name: string;
  internal_notes: string | null;
  subject_fr: string;
  subject_en: string;
  preheader_fr: string | null;
  preheader_en: string | null;
  blocks: unknown[];
  design_settings: Record<string, unknown>;
  audience: string;
  target_tags: string[];
  target_cities: string[];
  target_query: unknown | null;
  ab_test_enabled: boolean;
  ab_variant_subject_fr: string | null;
  ab_variant_subject_en: string | null;
  ab_test_percentage: number;
  status: string;
  scheduled_at: string | null;
  timezone: string;
  send_started_at: string | null;
  send_finished_at: string | null;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  complained_count: number;
  unsubscribed_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function listNewsletterCampaigns(
  adminKey: string | undefined,
  args?: { status?: string },
): Promise<{ ok: true; items: NewsletterCampaign[] }> {
  const qs = new URLSearchParams();
  if (args?.status) qs.set("status", args.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: NewsletterCampaign[] }>(
    `/api/admin/newsletter/campaigns${suffix}`,
    adminKey,
  );
}

export async function createNewsletterCampaign(
  adminKey: string | undefined,
  args: {
    template_id?: string;
    name: string;
    subject_fr: string;
    subject_en: string;
    preheader_fr?: string | null;
    preheader_en?: string | null;
    blocks: unknown[];
    design_settings: Record<string, unknown>;
    audience: string;
    target_tags?: string[];
    target_cities?: string[];
    scheduled_at?: string | null;
  },
): Promise<{ ok: true; id: string }> {
  return requestJson<{ ok: true; id: string }>(
    "/api/admin/newsletter/campaigns",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function sendNewsletterCampaign(
  adminKey: string | undefined,
  args: { id: string; limit?: number; dry_run?: boolean },
): Promise<{
  ok: true;
  dry_run: boolean;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  return requestJson<{
    ok: true;
    dry_run: boolean;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
  }>(
    `/api/admin/newsletter/campaigns/${encodeURIComponent(args.id)}/send`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ limit: args.limit, dry_run: args.dry_run }),
    },
  );
}

// ---------------------------------------------------------------------------
// MEDIA FACTORY (Admin / Production)
// ---------------------------------------------------------------------------

export type AdminMediaFactoryJobListItem = {
  id: string;
  establishment_id: string;
  order_id: string | null;
  order_item_id: string | null;
  title: string | null;
  status: string;
  responsible_admin_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminMediaFactoryJobDetails = {
  ok: true;
  job: any;
  brief: any | null;
  schedule_slots: any[];
  appointment: any | null;
  deliverables: any[];
  thread: any | null;
  messages: any[];
  invoice_requests: any[];
  communication_logs: any[];
};

export async function listAdminMediaFactoryJobs(
  adminKey: string | undefined,
  args?: { status?: string; establishment_id?: string },
): Promise<{ ok: true; items: AdminMediaFactoryJobListItem[] }> {
  const qs = new URLSearchParams();
  if (args?.status) qs.set("status", args.status);
  if (args?.establishment_id) qs.set("establishment_id", args.establishment_id);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminMediaFactoryJobListItem[] }>(
    `/api/admin/production/jobs${suffix}`,
    adminKey,
  );
}

export async function getAdminMediaFactoryJob(
  adminKey: string | undefined,
  jobId: string,
): Promise<AdminMediaFactoryJobDetails> {
  return requestJson<AdminMediaFactoryJobDetails>(
    `/api/admin/production/jobs/${encodeURIComponent(jobId)}`,
    adminKey,
  );
}

export async function approveAdminMediaBrief(
  adminKey: string | undefined,
  jobId: string,
  args: { review_note: string | null },
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/production/jobs/${encodeURIComponent(jobId)}/brief/approve`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ review_note: args.review_note }),
    },
  );
}

export async function createAdminMediaCheckinToken(
  adminKey: string | undefined,
  jobId: string,
): Promise<{ ok: true; token: string }> {
  return requestJson<{ ok: true; token: string }>(
    `/api/admin/production/jobs/${encodeURIComponent(jobId)}/checkin-token`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function createAdminMediaScheduleSlot(
  adminKey: string | undefined,
  jobId: string,
  args: {
    starts_at: string;
    ends_at: string;
    location_text?: string | null;
    address?: string | null;
  },
): Promise<{ ok: true; slot: any }> {
  return requestJson<{ ok: true; slot: any }>(
    `/api/admin/production/jobs/${encodeURIComponent(jobId)}/schedule-slots`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function assignAdminDeliverablePartner(
  adminKey: string | undefined,
  deliverableId: string,
  args: { partner_user_id: string | null },
): Promise<{ ok: true; deliverable: any }> {
  return requestJson<{ ok: true; deliverable: any }>(
    `/api/admin/production/deliverables/${encodeURIComponent(deliverableId)}/assign-partner`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function reviewAdminDeliverable(
  adminKey: string | undefined,
  deliverableId: string,
  args: {
    status: "in_review" | "approved" | "rejected";
    review_comment?: string | null;
  },
): Promise<{ ok: true; deliverable: any }> {
  return requestJson<{ ok: true; deliverable: any }>(
    `/api/admin/production/deliverables/${encodeURIComponent(deliverableId)}/review`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

export async function updateAdminMediaFactoryJob(
  adminKey: string | undefined,
  jobId: string,
  args: { status?: string; responsible_admin_id?: string | null },
): Promise<{ ok: true; job: any }> {
  return requestJson<{ ok: true; job: any }>(
    `/api/admin/production/jobs/${encodeURIComponent(jobId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
}

// MEDIA FACTORY Compta (Invoice Requests)

export type AdminPartnerInvoiceRequest = {
  id: string;
  job_id: string;
  partner_user_id: string;
  role: string;
  status: "requested" | "approved" | "paid" | "rejected";
  amount_cents: number;
  currency: string;
  requested_at: string;
  paid_at: string | null;
  payment_reference: string | null;
  media_jobs?: {
    id: string;
    title: string | null;
    status: string;
    establishment_id: string;
    establishments?: { name: string | null; city: string | null } | null;
  } | null;
  partner_profiles?: { display_name: string | null; user_id: string } | null;
};

export async function listAdminPartnerInvoiceRequests(
  adminKey: string | undefined,
  args?: { status?: string; job_id?: string },
): Promise<{ ok: true; items: AdminPartnerInvoiceRequest[] }> {
  const qs = new URLSearchParams();
  if (args?.status) qs.set("status", args.status);
  if (args?.job_id) qs.set("job_id", args.job_id);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminPartnerInvoiceRequest[] }>(
    `/api/admin/production/invoice-requests${suffix}`,
    adminKey,
  );
}

export async function updateAdminInvoiceRequest(
  adminKey: string | undefined,
  requestId: string,
  args: {
    status: "requested" | "approved" | "paid" | "rejected";
    payment_reference?: string | null;
  },
): Promise<{ ok: true; request: AdminPartnerInvoiceRequest }> {
  return requestJson<{ ok: true; request: AdminPartnerInvoiceRequest }>(
    `/api/admin/production/invoice-requests/${encodeURIComponent(requestId)}`,
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

// ---------------------------------------------------------------------------
// Admin Partner Management
// ---------------------------------------------------------------------------

export type PartnerRole =
  | "camera"
  | "editor"
  | "voice"
  | "blogger"
  | "photographer";

export type AdminPartnerProfile = {
  user_id: string;
  primary_role: PartnerRole;
  display_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  partner_billing_profiles?: {
    status: string | null;
    legal_name: string | null;
    rib: string | null;
  } | null;
};

export type AdminPartnerBilling = {
  user_id: string;
  status: string;
  legal_name: string | null;
  company_name: string | null;
  ice: string | null;
  address: string | null;
  bank_name: string | null;
  rib: string | null;
  iban: string | null;
  swift: string | null;
  account_holder: string | null;
};

export async function listAdminPartners(
  adminKey: string | undefined,
): Promise<{ ok: true; items: AdminPartnerProfile[] }> {
  return requestJson<{ ok: true; items: AdminPartnerProfile[] }>(
    "/api/admin/partners",
    adminKey,
  );
}

export async function getAdminPartner(
  adminKey: string | undefined,
  userId: string,
): Promise<{
  ok: true;
  profile: AdminPartnerProfile;
  billing: AdminPartnerBilling | null;
  deliverables: any[];
}> {
  return requestJson<{
    ok: true;
    profile: AdminPartnerProfile;
    billing: AdminPartnerBilling | null;
    deliverables: any[];
  }>(`/api/admin/partners/${encodeURIComponent(userId)}`, adminKey);
}

export async function createAdminPartner(
  adminKey: string | undefined,
  args: {
    email: string;
    password: string;
    display_name: string;
    primary_role: PartnerRole;
    phone?: string;
    city?: string;
    notes?: string;
  },
): Promise<{ ok: true; profile: AdminPartnerProfile }> {
  return requestJson<{ ok: true; profile: AdminPartnerProfile }>(
    "/api/admin/partners",
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

export async function updateAdminPartner(
  adminKey: string | undefined,
  userId: string,
  args: Partial<{
    display_name: string;
    primary_role: PartnerRole;
    phone: string | null;
    city: string | null;
    notes: string | null;
    status: "pending" | "active" | "paused" | "disabled";
  }>,
): Promise<{ ok: true; profile: AdminPartnerProfile }> {
  return requestJson<{ ok: true; profile: AdminPartnerProfile }>(
    `/api/admin/partners/${encodeURIComponent(userId)}`,
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

export async function updateAdminPartnerBilling(
  adminKey: string | undefined,
  userId: string,
  args: Partial<AdminPartnerBilling>,
): Promise<{ ok: true; billing: AdminPartnerBilling }> {
  return requestJson<{ ok: true; billing: AdminPartnerBilling }>(
    `/api/admin/partners/${encodeURIComponent(userId)}/billing`,
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

// ---------------------------------------------------------------------------
// PRESTATAIRES MODULE
// ---------------------------------------------------------------------------

export type PrestataireStatut =
  | "DEMANDE"
  | "BROUILLON"
  | "EN_VALIDATION"
  | "VALIDE"
  | "BLOQUE"
  | "REFUSE"
  | "ARCHIVE";
export type PrestataireType =
  | "personne_physique"
  | "auto_entrepreneur"
  | "sarl"
  | "sa"
  | "sas"
  | "autre";
export type PrestataireCategorie =
  | "camera"
  | "editor"
  | "voice"
  | "blogger"
  | "photographer"
  | "designer"
  | "developer"
  | "consultant"
  | "autre";
export type DocumentType =
  | "CARTE_AE_OU_RC"
  | "RIB_SCAN"
  | "ATTESTATION_FISCALE"
  | "CIN"
  | "PATENTE"
  | "AUTRE";
export type DocumentStatut =
  | "MANQUANT"
  | "UPLOADED"
  | "EN_REVISION"
  | "VALIDE"
  | "REFUSE";

export type AdminPrestataire = {
  id: string;
  partner_user_id: string | null;
  type_prestataire: PrestataireType;
  nom_legal: string;
  ice: string | null;
  identifiant_fiscal: string | null;
  registre_commerce: string | null;
  adresse: string | null;
  ville: string | null;
  pays: string | null;
  banque_nom: string | null;
  rib_encrypted: string | null;
  rib_last4: string | null;
  titulaire_compte: string | null;
  tva_applicable: boolean;
  tva_taux: number;
  email: string | null;
  telephone: string | null;
  categorie_prestation: PrestataireCategorie | null;
  zone_intervention: string[] | null;
  referent_interne_id: string | null;
  statut: PrestataireStatut;
  raison_blocage: string | null;
  validated_by: string | null;
  validated_at: string | null;
  blocked_by: string | null;
  blocked_at: string | null;
  risk_score: number;
  fraud_flag: boolean;
  lock_finance: boolean;
  internal_notes: string | null;
  last_audit_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  prestataire_documents?: AdminPrestataireDocument[];
};

export type AdminPrestataireDocument = {
  id: string;
  prestataire_id: string;
  type_document: DocumentType;
  bucket: string | null;
  storage_path: string;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  statut: DocumentStatut;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  refus_count: number;
  uploaded_at: string;
  uploaded_by_user_id: string | null;
};

export type AdminPrestataireDemande = {
  id: string;
  demandeur_user_id: string;
  establishment_id: string | null;
  nom: string;
  contact_email: string | null;
  contact_telephone: string | null;
  type_prestation: string | null;
  ville: string | null;
  notes: string | null;
  documents_paths: string[] | null;
  statut: "NOUVELLE" | "EN_COURS" | "CONVERTIE" | "REFUSEE" | "ANNULEE";
  prestataire_id: string | null;
  traite_par: string | null;
  traite_at: string | null;
  motif_refus: string | null;
  created_at: string;
  updated_at: string;
  prestataires?: { id: string; nom_legal: string; statut: string } | null;
};

export type AdminPrestataireAuditLog = {
  id: string;
  prestataire_id: string | null;
  demande_id: string | null;
  action: string;
  actor_type: string;
  actor_user_id: string | null;
  actor_admin_id: string | null;
  actor_ip: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
  prestataires?: { nom_legal: string } | null;
};

export type AdminPrestatairePaiement = {
  id: string;
  prestataire_id: string;
  invoice_request_id: string | null;
  job_id: string | null;
  montant_ht_cents: number;
  tva_cents: number;
  montant_ttc_cents: number;
  devise: string;
  statut: "EN_ATTENTE" | "AUTORISE" | "GELE" | "PAYE" | "ANNULE";
  autorise_par: string | null;
  autorise_at: string | null;
  gele_par: string | null;
  gele_at: string | null;
  motif_gel: string | null;
  paye_at: string | null;
  reference_paiement: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminPrestataireDashboard = {
  total: number;
  par_statut: Record<string, number>;
  a_risque: number;
  paiements_geles: number;
  demandes_en_attente: number;
};

// List prestataires
export async function listAdminPrestataires(
  adminKey: string | undefined,
  args?: {
    statut?: string;
    ville?: string;
    categorie?: string;
    search?: string;
  },
): Promise<{ ok: true; items: AdminPrestataire[] }> {
  const qs = new URLSearchParams();
  if (args?.statut) qs.set("statut", args.statut);
  if (args?.ville) qs.set("ville", args.ville);
  if (args?.categorie) qs.set("categorie", args.categorie);
  if (args?.search) qs.set("search", args.search);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminPrestataire[] }>(
    `/api/admin/prestataires${suffix}`,
    adminKey,
  );
}

// Get single prestataire with all related data
export async function getAdminPrestataire(
  adminKey: string | undefined,
  prestataireId: string,
): Promise<{
  ok: true;
  prestataire: AdminPrestataire;
  documents: AdminPrestataireDocument[];
  audit_logs: AdminPrestataireAuditLog[];
  paiements: AdminPrestatairePaiement[];
  demandes: AdminPrestataireDemande[];
}> {
  return requestJson(
    `/api/admin/prestataires/${encodeURIComponent(prestataireId)}`,
    adminKey,
  );
}

// Create prestataire
export async function createAdminPrestataire(
  adminKey: string | undefined,
  args: {
    nom_legal: string;
    type_prestataire?: PrestataireType;
    ice?: string | null;
    identifiant_fiscal?: string | null;
    registre_commerce?: string | null;
    adresse?: string | null;
    ville?: string | null;
    pays?: string | null;
    banque_nom?: string | null;
    titulaire_compte?: string | null;
    tva_applicable?: boolean;
    tva_taux?: number;
    email?: string | null;
    telephone?: string | null;
    categorie_prestation?: PrestataireCategorie | null;
    zone_intervention?: string[] | null;
    referent_interne_id?: string | null;
  },
): Promise<{ ok: true; prestataire: AdminPrestataire }> {
  return requestJson<{ ok: true; prestataire: AdminPrestataire }>(
    "/api/admin/prestataires",
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

// Update prestataire
export async function updateAdminPrestataire(
  adminKey: string | undefined,
  prestataireId: string,
  args: Partial<{
    nom_legal: string;
    type_prestataire: PrestataireType;
    ice: string | null;
    identifiant_fiscal: string | null;
    registre_commerce: string | null;
    adresse: string | null;
    ville: string | null;
    pays: string | null;
    banque_nom: string | null;
    titulaire_compte: string | null;
    tva_applicable: boolean;
    tva_taux: number;
    email: string | null;
    telephone: string | null;
    categorie_prestation: PrestataireCategorie | null;
    zone_intervention: string[] | null;
    referent_interne_id: string | null;
    internal_notes: string | null;
  }>,
): Promise<{ ok: true; prestataire: AdminPrestataire }> {
  return requestJson<{ ok: true; prestataire: AdminPrestataire }>(
    `/api/admin/prestataires/${encodeURIComponent(prestataireId)}/update`,
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

// Update prestataire status
export async function updateAdminPrestataireStatus(
  adminKey: string | undefined,
  prestataireId: string,
  args: { statut: PrestataireStatut; raison?: string | null },
): Promise<{ ok: true; prestataire: AdminPrestataire }> {
  return requestJson<{ ok: true; prestataire: AdminPrestataire }>(
    `/api/admin/prestataires/${encodeURIComponent(prestataireId)}/status`,
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

// Review document
export async function reviewAdminPrestataireDocument(
  adminKey: string | undefined,
  prestataireId: string,
  docId: string,
  args: { action: "validate" | "refuse"; note?: string | null },
): Promise<{ ok: true; action: string; statut: string }> {
  return requestJson<{ ok: true; action: string; statut: string }>(
    `/api/admin/prestataires/${encodeURIComponent(prestataireId)}/documents/${encodeURIComponent(docId)}/review`,
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

// Dashboard stats
export async function getAdminPrestataireDashboard(
  adminKey: string | undefined,
): Promise<{ ok: true; stats: AdminPrestataireDashboard }> {
  return requestJson<{ ok: true; stats: AdminPrestataireDashboard }>(
    "/api/admin/prestataires/dashboard",
    adminKey,
  );
}

// List demandes
export async function listAdminPrestataireDemandes(
  adminKey: string | undefined,
  args?: { statut?: string },
): Promise<{ ok: true; items: AdminPrestataireDemande[] }> {
  const qs = new URLSearchParams();
  if (args?.statut) qs.set("statut", args.statut);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminPrestataireDemande[] }>(
    `/api/admin/prestataires/demandes${suffix}`,
    adminKey,
  );
}

// Process demande
export async function processAdminPrestataireDemande(
  adminKey: string | undefined,
  demandeId: string,
  args: { action: "convert" | "refuse"; motif_refus?: string | null },
): Promise<{ ok: true; action: string; prestataire?: AdminPrestataire }> {
  return requestJson<{
    ok: true;
    action: string;
    prestataire?: AdminPrestataire;
  }>(
    `/api/admin/prestataires/demandes/${encodeURIComponent(demandeId)}/process`,
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

// Batch actions
export async function batchAdminPrestatairesAction(
  adminKey: string | undefined,
  args: {
    ids: string[];
    action: "validate" | "block" | "unblock" | "archive";
    raison?: string | null;
  },
): Promise<{ ok: true; updated: number }> {
  return requestJson<{ ok: true; updated: number }>(
    "/api/admin/prestataires/batch-action",
    adminKey,
    { method: "POST", body: JSON.stringify(args) },
  );
}

// Export
export async function exportAdminPrestataires(
  adminKey: string | undefined,
  format: "json" | "csv" = "json",
): Promise<{ ok: true; items: AdminPrestataire[] } | string> {
  const qs = new URLSearchParams();
  qs.set("format", format);
  if (format === "csv") {
    const res = await fetch(`/api/admin/prestataires/export?${qs.toString()}`, {
      headers: adminKey ? { "x-admin-key": adminKey } : {},
    });
    if (!res.ok)
      throw new AdminApiError(
        (await res.json().catch(() => ({}))).error || `HTTP ${res.status}`,
      );
    return res.text();
  }
  return requestJson<{ ok: true; items: AdminPrestataire[] }>(
    `/api/admin/prestataires/export?${qs.toString()}`,
    adminKey,
  );
}

// Audit logs
export async function listAdminPrestataireAuditLogs(
  adminKey: string | undefined,
  args?: { prestataire_id?: string; limit?: number },
): Promise<{ ok: true; items: AdminPrestataireAuditLog[] }> {
  const qs = new URLSearchParams();
  if (args?.prestataire_id) qs.set("prestataire_id", args.prestataire_id);
  if (args?.limit) qs.set("limit", String(args.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminPrestataireAuditLog[] }>(
    `/api/admin/prestataires/audit-logs${suffix}`,
    adminKey,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Roles & Collaborators
// ─────────────────────────────────────────────────────────────────────────────

export type AdminRoleDb = {
  id: string;
  name: string;
  permissions: Record<string, Record<string, boolean>>;
  created_at: string;
  updated_at: string;
};

export type AdminCollaboratorDb = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  function: string | null;
  joined_at: string | null;
  avatar_url: string | null;
  role_id: string;
  status: "active" | "suspended";
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  role?: AdminRoleDb | null;
};

// Roles API
export async function listAdminRoles(
  adminKey: string | undefined,
): Promise<{ ok: true; roles: AdminRoleDb[] }> {
  return requestJson<{ ok: true; roles: AdminRoleDb[] }>(
    "/api/admin/roles",
    adminKey,
  );
}

export async function createAdminRole(
  adminKey: string | undefined,
  data: { id: string; name: string; permissions: Record<string, Record<string, boolean>> },
): Promise<{ ok: true; role: AdminRoleDb }> {
  return requestJson<{ ok: true; role: AdminRoleDb }>(
    "/api/admin/roles",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function updateAdminRole(
  adminKey: string | undefined,
  roleId: string,
  data: { name?: string; permissions?: Record<string, Record<string, boolean>> },
): Promise<{ ok: true; role: AdminRoleDb }> {
  return requestJson<{ ok: true; role: AdminRoleDb }>(
    `/api/admin/roles/${encodeURIComponent(roleId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function deleteAdminRole(
  adminKey: string | undefined,
  roleId: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/roles/${encodeURIComponent(roleId)}/delete`,
    adminKey,
    { method: "POST" },
  );
}

// Collaborators API
export async function listAdminCollaborators(
  adminKey: string | undefined,
): Promise<{ ok: true; collaborators: AdminCollaboratorDb[] }> {
  return requestJson<{ ok: true; collaborators: AdminCollaboratorDb[] }>(
    "/api/admin/collaborators",
    adminKey,
  );
}

export async function createAdminCollaborator(
  adminKey: string | undefined,
  data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    display_name?: string;
    function?: string;
    joined_at?: string;
    avatar_url?: string;
    role_id: string;
  },
): Promise<{ ok: true; collaborator: AdminCollaboratorDb }> {
  return requestJson<{ ok: true; collaborator: AdminCollaboratorDb }>(
    "/api/admin/collaborators",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function updateAdminCollaborator(
  adminKey: string | undefined,
  collaboratorId: string,
  data: {
    first_name?: string;
    last_name?: string;
    display_name?: string;
    function?: string;
    joined_at?: string;
    avatar_url?: string;
    role_id?: string;
  },
): Promise<{ ok: true; collaborator: AdminCollaboratorDb }> {
  return requestJson<{ ok: true; collaborator: AdminCollaboratorDb }>(
    `/api/admin/collaborators/${encodeURIComponent(collaboratorId)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function deleteAdminCollaborator(
  adminKey: string | undefined,
  collaboratorId: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/collaborators/${encodeURIComponent(collaboratorId)}/delete`,
    adminKey,
    { method: "POST" },
  );
}

export async function suspendAdminCollaborator(
  adminKey: string | undefined,
  collaboratorId: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/collaborators/${encodeURIComponent(collaboratorId)}/suspend`,
    adminKey,
    { method: "POST" },
  );
}

export async function reactivateAdminCollaborator(
  adminKey: string | undefined,
  collaboratorId: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/collaborators/${encodeURIComponent(collaboratorId)}/reactivate`,
    adminKey,
    { method: "POST" },
  );
}

export async function resetAdminCollaboratorPassword(
  adminKey: string | undefined,
  collaboratorId: string,
  newPassword: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/collaborators/${encodeURIComponent(collaboratorId)}/reset-password`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ new_password: newPassword }),
    },
  );
}

// =============================================================================
// CURRENT USER PROFILE (self-service)
// =============================================================================

export type AdminMyProfile = {
  id: string | null;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  function: string | null;
  joinedAt?: string | null;
  avatarUrl: string | null;
  roleId: string;
  status?: string;
  createdAt?: string;
  isLegacySession?: boolean;
};

export async function getAdminMyProfile(
  adminKey: string | undefined,
): Promise<{ ok: true; profile: AdminMyProfile }> {
  return requestJson<{ ok: true; profile: AdminMyProfile }>(
    "/api/admin/me",
    adminKey,
  );
}

export async function updateAdminMyProfile(
  adminKey: string | undefined,
  data: { email?: string; displayName?: string; avatarUrl?: string; currentPassword?: string; newPassword?: string },
): Promise<{ ok: true; profile: AdminMyProfile }> {
  return requestJson<{ ok: true; profile: AdminMyProfile }>(
    "/api/admin/me",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

// =============================================================================
// CATEGORIES (Level 2 in hierarchy: Universe > Category > Subcategory)
// =============================================================================

export type CategoryAdmin = {
  id: string;
  universe_slug: string;
  slug: string;
  name_fr: string;
  name_en: string | null;
  description_fr: string | null;
  description_en: string | null;
  icon_name: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  requires_booking: boolean;
  supports_packs: boolean;
  created_at: string;
  updated_at: string;
};

export async function listAdminCategoriesLevel2(
  adminKey: string | undefined,
  universe?: string,
  includeInactive?: boolean,
): Promise<{ items: CategoryAdmin[] }> {
  const params = new URLSearchParams();
  if (universe) params.set("universe", universe);
  if (includeInactive) params.set("include_inactive", "true");
  const qs = params.toString();
  return requestJson<{ items: CategoryAdmin[] }>(
    `/api/admin/categories-level2${qs ? `?${qs}` : ""}`,
    adminKey,
  );
}

export async function createAdminCategoryLevel2(
  adminKey: string | undefined,
  data: {
    universe_slug: string;
    slug: string;
    name_fr: string;
    name_en?: string;
    description_fr?: string;
    description_en?: string;
    icon_name?: string;
    image_url?: string;
    display_order?: number;
    is_active?: boolean;
    requires_booking?: boolean;
    supports_packs?: boolean;
  },
): Promise<{ item: CategoryAdmin }> {
  return requestJson<{ item: CategoryAdmin }>(
    "/api/admin/categories-level2",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function updateAdminCategoryLevel2(
  adminKey: string | undefined,
  data: {
    id: string;
    name_fr?: string;
    name_en?: string;
    description_fr?: string;
    description_en?: string;
    icon_name?: string;
    image_url?: string;
    display_order?: number;
    is_active?: boolean;
    requires_booking?: boolean;
    supports_packs?: boolean;
  },
): Promise<{ item: CategoryAdmin }> {
  return requestJson<{ item: CategoryAdmin }>(
    `/api/admin/categories-level2/${encodeURIComponent(data.id)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function deleteAdminCategoryLevel2(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/categories-level2/${encodeURIComponent(id)}/delete`,
    adminKey,
    { method: "POST" },
  );
}

// =============================================================================
// CATEGORY IMAGES / SUBCATEGORIES (Level 3 in hierarchy)
// =============================================================================

export type CategoryImageAdmin = {
  id: string;
  universe: string;
  category_id: string;
  category_slug: string | null;
  name: string;
  image_url: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listAdminCategoryImages(
  adminKey: string | undefined,
  universe?: string,
): Promise<{ items: CategoryImageAdmin[] }> {
  const params = new URLSearchParams();
  if (universe) params.set("universe", universe);
  const qs = params.toString();
  return requestJson<{ items: CategoryImageAdmin[] }>(
    `/api/admin/category-images${qs ? `?${qs}` : ""}`,
    adminKey,
  );
}

export async function createAdminCategoryImage(
  adminKey: string | undefined,
  data: {
    universe: string;
    category_id: string;
    category_slug?: string;
    name: string;
    image_url: string;
    display_order?: number;
    is_active?: boolean;
  },
): Promise<{ item: CategoryImageAdmin }> {
  return requestJson<{ item: CategoryImageAdmin }>(
    "/api/admin/category-images",
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function updateAdminCategoryImage(
  adminKey: string | undefined,
  data: {
    id: string;
    universe?: string;
    category_id?: string;
    category_slug?: string;
    name?: string;
    image_url?: string;
    display_order?: number;
    is_active?: boolean;
  },
): Promise<{ item: CategoryImageAdmin }> {
  return requestJson<{ item: CategoryImageAdmin }>(
    `/api/admin/category-images/${encodeURIComponent(data.id)}/update`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function deleteAdminCategoryImage(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/category-images/${encodeURIComponent(id)}/delete`,
    adminKey,
    { method: "POST" },
  );
}

export type CategoryImageUploadResult = {
  bucket: string;
  path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
};

export async function uploadAdminCategoryImage(
  adminKey: string | undefined,
  args: { file: Blob; fileName: string },
): Promise<{ ok: true; item: CategoryImageUploadResult }> {
  const sessionToken = loadAdminSessionToken();

  const headers: Record<string, string> = {
    "content-type": args.file.type || "application/octet-stream",
    "x-file-name": args.fileName,
  };

  if (adminKey) headers["x-admin-key"] = adminKey;
  if (sessionToken) headers["x-admin-session"] = sessionToken;

  const res = await fetch("/api/admin/category-images/upload", {
    method: "POST",
    headers,
    body: args.file,
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const message =
      json && typeof json.error === "string"
        ? json.error
        : `HTTP_${res.status}`;
    throw new AdminApiError(message, res.status);
  }

  return json as { ok: true; item: CategoryImageUploadResult };
}

// ============================================
// HOME CURATION (Homepage sections management)
// ============================================

export type HomeCurationKind = "best_deals" | "selected_for_you" | "near_you" | "most_booked";

export type HomeCurationItemAdmin = {
  id: string;
  universe: string;
  city: string | null;
  kind: HomeCurationKind;
  establishment_id: string;
  starts_at: string | null;
  ends_at: string | null;
  weight: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  establishments?: {
    id: string;
    name: string;
    city: string | null;
    universe: string | null;
    subcategory: string | null;
    cover_url: string | null;
    status: string | null;
  } | null;
};

export async function listAdminHomeCurationItems(
  adminKey: string | undefined,
  filters?: { universe?: string; city?: string; kind?: HomeCurationKind },
): Promise<{ items: HomeCurationItemAdmin[] }> {
  const params = new URLSearchParams();
  if (filters?.universe) params.set("universe", filters.universe);
  if (filters?.city) params.set("city", filters.city);
  if (filters?.kind) params.set("kind", filters.kind);
  const qs = params.toString();
  return requestJson<{ items: HomeCurationItemAdmin[] }>(
    `/api/admin/home-curation${qs ? `?${qs}` : ""}`,
    adminKey,
  );
}

export async function createAdminHomeCurationItem(
  adminKey: string | undefined,
  data: {
    universe: string;
    kind: HomeCurationKind;
    establishment_id: string;
    city?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    weight?: number;
    note?: string | null;
  },
): Promise<{ item: { id: string } }> {
  return requestJson<{ item: { id: string } }>(
    "/api/admin/home-curation",
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function updateAdminHomeCurationItem(
  adminKey: string | undefined,
  data: {
    id: string;
    universe?: string;
    kind?: HomeCurationKind;
    establishment_id?: string;
    city?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    weight?: number;
    note?: string | null;
  },
): Promise<{ item: { id: string } }> {
  return requestJson<{ item: { id: string } }>(
    `/api/admin/home-curation/${encodeURIComponent(data.id)}/update`,
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function deleteAdminHomeCurationItem(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/home-curation/${encodeURIComponent(id)}/delete`,
    adminKey,
    { method: "POST" },
  );
}

// ============================================
// UNIVERSES MANAGEMENT
// ============================================

export type UniverseAdmin = {
  id: string;
  slug: string;
  label_fr: string;
  label_en: string;
  icon_name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  image_url?: string | null;
  created_at: string;
  updated_at: string;
};

export async function listAdminUniverses(
  adminKey: string | undefined,
  options?: { includeInactive?: boolean },
): Promise<{ items: UniverseAdmin[] }> {
  const params = new URLSearchParams();
  if (options?.includeInactive) params.set("include_inactive", "true");
  const qs = params.toString();
  return requestJson<{ items: UniverseAdmin[] }>(
    `/api/admin/universes${qs ? `?${qs}` : ""}`,
    adminKey,
  );
}

export async function createAdminUniverse(
  adminKey: string | undefined,
  data: {
    slug: string;
    label_fr: string;
    label_en: string;
    icon_name: string;
    color?: string;
    sort_order?: number;
    is_active?: boolean;
    image_url?: string | null;
  },
): Promise<{ id: string }> {
  return requestJson<{ id: string }>(
    "/api/admin/universes",
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function updateAdminUniverse(
  adminKey: string | undefined,
  data: {
    id: string;
    slug?: string;
    label_fr?: string;
    label_en?: string;
    icon_name?: string;
    color?: string;
    sort_order?: number;
    is_active?: boolean;
    image_url?: string | null;
  },
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/universes/${encodeURIComponent(data.id)}/update`,
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function reorderAdminUniverses(
  adminKey: string | undefined,
  order: string[],
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    "/api/admin/universes/reorder",
    adminKey,
    { method: "POST", body: JSON.stringify({ order }) },
  );
}

export async function deleteAdminUniverse(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/universes/${encodeURIComponent(id)}/delete`,
    adminKey,
    { method: "POST" },
  );
}

export type UniverseImageUploadResult = {
  bucket: string;
  path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
};

export async function uploadAdminUniverseImage(
  adminKey: string | undefined,
  args: { file: Blob; fileName: string },
): Promise<{ ok: true; item: UniverseImageUploadResult }> {
  const sessionToken = loadAdminSessionToken();

  const headers: Record<string, string> = {
    "content-type": args.file.type || "application/octet-stream",
    "x-file-name": args.fileName,
  };

  if (adminKey) headers["x-admin-key"] = adminKey;
  if (sessionToken) headers["x-admin-session"] = sessionToken;

  const res = await fetch("/api/admin/universes/upload-image", {
    method: "POST",
    headers,
    body: args.file,
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const message =
      json && typeof json.error === "string"
        ? json.error
        : `HTTP_${res.status}`;
    throw new AdminApiError(message, res.status);
  }

  return json as { ok: true; item: UniverseImageUploadResult };
}

// ============================================
// HOME SETTINGS (Hero Background, etc.)
// ============================================

export type HowItWorksItem = {
  icon: string;
  title: string;
  description: string;
};

export type HomeSettings = {
  hero: {
    background_image_url: string | null;
    overlay_opacity: number;
    title?: string | null;
    subtitle?: string | null;
  };
  how_it_works?: {
    title: string;
    items: HowItWorksItem[];
  };
};

export async function getAdminHomeSettings(
  adminKey: string | undefined,
): Promise<{ settings: HomeSettings }> {
  return requestJson<{ settings: HomeSettings }>(
    "/api/admin/home-settings",
    adminKey,
  );
}

export async function updateAdminHomeSettings(
  adminKey: string | undefined,
  key: string,
  value: unknown,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    "/api/admin/home-settings",
    adminKey,
    { method: "POST", body: JSON.stringify({ key, value }) },
  );
}

export async function uploadAdminHeroImage(
  adminKey: string | undefined,
  imageBase64: string,
  mimeType: string,
): Promise<{ ok: true; url: string }> {
  return requestJson<{ ok: true; url: string }>(
    "/api/admin/home-settings/hero-image",
    adminKey,
    { method: "POST", body: JSON.stringify({ image: imageBase64, mime_type: mimeType }) },
  );
}

export async function deleteAdminHeroImage(
  adminKey: string | undefined,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    "/api/admin/home-settings/hero-image/delete",
    adminKey,
    { method: "POST" },
  );
}

// ============================================
// HOME CITIES MANAGEMENT
// ============================================

export type HomeCityAdmin = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  country_code: string | null;
  created_at: string;
  updated_at: string;
};

export async function listAdminHomeCities(
  adminKey: string | undefined,
  options?: { includeInactive?: boolean },
): Promise<{ items: HomeCityAdmin[] }> {
  const params = new URLSearchParams();
  if (options?.includeInactive) params.set("include_inactive", "true");
  const qs = params.toString();
  return requestJson<{ items: HomeCityAdmin[] }>(
    `/api/admin/home-cities${qs ? `?${qs}` : ""}`,
    adminKey,
  );
}

export async function createAdminHomeCity(
  adminKey: string | undefined,
  data: {
    name: string;
    slug: string;
    image_url?: string | null;
    sort_order?: number;
    is_active?: boolean;
    country_code?: string;
  },
): Promise<{ id: string }> {
  return requestJson<{ id: string }>(
    "/api/admin/home-cities",
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function updateAdminHomeCity(
  adminKey: string | undefined,
  data: {
    id: string;
    name?: string;
    slug?: string;
    image_url?: string | null;
    sort_order?: number;
    is_active?: boolean;
    country_code?: string;
  },
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/home-cities/${encodeURIComponent(data.id)}/update`,
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function reorderAdminHomeCities(
  adminKey: string | undefined,
  order: string[],
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    "/api/admin/home-cities/reorder",
    adminKey,
    { method: "POST", body: JSON.stringify({ order }) },
  );
}

export async function deleteAdminHomeCity(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/home-cities/${encodeURIComponent(id)}/delete`,
    adminKey,
    { method: "POST" },
  );
}

export async function uploadAdminHomeCityImage(
  adminKey: string | undefined,
  cityId: string,
  imageBase64: string,
  mimeType: string,
): Promise<{ ok: true; url: string }> {
  return requestJson<{ ok: true; url: string }>(
    `/api/admin/home-cities/${encodeURIComponent(cityId)}/image`,
    adminKey,
    { method: "POST", body: JSON.stringify({ image: imageBase64, mime_type: mimeType }) },
  );
}

export async function updateAdminHomeCityCountry(
  adminKey: string | undefined,
  cityId: string,
  countryCode: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/home-cities/${encodeURIComponent(cityId)}/country`,
    adminKey,
    { method: "POST", body: JSON.stringify({ country_code: countryCode }) },
  );
}

// ============================================
// HOME VIDEOS MANAGEMENT
// ============================================

export type HomeVideoAdmin = {
  id: string;
  youtube_url: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  establishment_id: string | null;
  establishment_name?: string | null;
  establishment_universe?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listAdminHomeVideos(
  adminKey: string | undefined,
  options?: { includeInactive?: boolean },
): Promise<{ items: HomeVideoAdmin[] }> {
  const params = new URLSearchParams();
  if (options?.includeInactive) params.set("include_inactive", "true");
  const qs = params.toString();
  return requestJson<{ items: HomeVideoAdmin[] }>(
    `/api/admin/home-videos${qs ? `?${qs}` : ""}`,
    adminKey,
  );
}

export async function createAdminHomeVideo(
  adminKey: string | undefined,
  data: {
    youtube_url: string;
    title: string;
    description?: string | null;
    thumbnail_url?: string | null;
    establishment_id?: string | null;
    sort_order?: number;
    is_active?: boolean;
  },
): Promise<{ id: string }> {
  return requestJson<{ id: string }>(
    "/api/admin/home-videos",
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function updateAdminHomeVideo(
  adminKey: string | undefined,
  data: {
    id: string;
    youtube_url?: string;
    title?: string;
    description?: string | null;
    thumbnail_url?: string | null;
    establishment_id?: string | null;
    sort_order?: number;
    is_active?: boolean;
  },
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/home-videos/${encodeURIComponent(data.id)}/update`,
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function reorderAdminHomeVideos(
  adminKey: string | undefined,
  order: string[],
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    "/api/admin/home-videos/reorder",
    adminKey,
    { method: "POST", body: JSON.stringify({ order }) },
  );
}

export async function deleteAdminHomeVideo(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/home-videos/${encodeURIComponent(id)}/delete`,
    adminKey,
    { method: "POST" },
  );
}

export type VideoThumbnailUploadResult = {
  bucket: string;
  path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
};

export async function uploadAdminVideoThumbnail(
  adminKey: string | undefined,
  args: { file: Blob; fileName: string },
): Promise<{ ok: true; item: VideoThumbnailUploadResult }> {
  const sessionToken = loadAdminSessionToken();

  const headers: Record<string, string> = {
    "content-type": args.file.type || "application/octet-stream",
    "x-file-name": args.fileName,
  };

  if (adminKey) headers["x-admin-key"] = adminKey;
  if (sessionToken) headers["x-admin-session"] = sessionToken;

  const res = await fetch("/api/admin/home-videos/upload-thumbnail", {
    method: "POST",
    headers,
    body: args.file,
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const message =
      json && typeof json.error === "string"
        ? json.error
        : `HTTP_${res.status}`;
    throw new AdminApiError(message, res.status);
  }

  return json as { ok: true; item: VideoThumbnailUploadResult };
}

// ============================================
// COUNTRIES MANAGEMENT
// ============================================

export type CountryAdmin = {
  id: string;
  name: string;
  name_en: string | null;
  code: string;
  flag_emoji: string | null;
  currency_code: string | null;
  phone_prefix: string | null;
  default_locale: string | null;
  timezone: string | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function listAdminCountries(
  adminKey: string | undefined,
  options?: { includeInactive?: boolean },
): Promise<{ items: CountryAdmin[] }> {
  const params = new URLSearchParams();
  if (options?.includeInactive) params.set("include_inactive", "true");
  const qs = params.toString();
  return requestJson<{ items: CountryAdmin[] }>(
    `/api/admin/countries${qs ? `?${qs}` : ""}`,
    adminKey,
  );
}

export async function createAdminCountry(
  adminKey: string | undefined,
  data: {
    name: string;
    code: string;
    name_en?: string | null;
    flag_emoji?: string | null;
    currency_code?: string | null;
    phone_prefix?: string | null;
    default_locale?: string | null;
    timezone?: string | null;
    is_active?: boolean;
    is_default?: boolean;
    sort_order?: number;
  },
): Promise<{ id: string }> {
  return requestJson<{ id: string }>(
    "/api/admin/countries",
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function updateAdminCountry(
  adminKey: string | undefined,
  data: {
    id: string;
    name?: string;
    code?: string;
    name_en?: string | null;
    flag_emoji?: string | null;
    currency_code?: string | null;
    phone_prefix?: string | null;
    default_locale?: string | null;
    timezone?: string | null;
    is_active?: boolean;
    is_default?: boolean;
    sort_order?: number;
  },
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/countries/${encodeURIComponent(data.id)}/update`,
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function deleteAdminCountry(
  adminKey: string | undefined,
  id: string,
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    `/api/admin/countries/${encodeURIComponent(id)}/delete`,
    adminKey,
    { method: "POST" },
  );
}

export async function reorderAdminCountries(
  adminKey: string | undefined,
  order: string[],
): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(
    "/api/admin/countries/reorder",
    adminKey,
    { method: "POST", body: JSON.stringify({ order }) },
  );
}

// ============================================
// ESTABLISHMENTS (for search/autocomplete)
// ============================================

export type EstablishmentListItemAdmin = {
  id: string;
  name: string;
  city: string | null;
  universe: string | null;
  subcategory: string | null;
  cover_url: string | null;
  status: string | null;
};

export async function listAdminEstablishmentsForSearch(
  adminKey: string | undefined,
): Promise<{ items: EstablishmentListItemAdmin[] }> {
  return requestJson<{ items: EstablishmentListItemAdmin[] }>(
    "/api/admin/establishments",
    adminKey,
  );
}

// ============================================
// REVIEWS & REPORTS MODERATION
// ============================================

export type AdminReviewStatus =
  | "pending_moderation"
  | "sent_to_pro"
  | "pro_responded_hidden"
  | "approved"
  | "rejected"
  | "auto_published";

export type AdminReview = {
  id: string;
  establishment_id: string;
  user_id: string;
  user_email: string | null;
  reservation_id: string | null;
  overall_rating: number;
  criteria_ratings: Record<string, number>;
  title: string | null;
  comment: string | null;
  anonymous: boolean;
  status: AdminReviewStatus;
  sent_to_pro_at: string | null;
  pro_response_deadline: string | null;
  pro_response_type: string | null;
  pro_response_at: string | null;
  pro_promo_code_id: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  rejection_reason: string | null;
  pro_public_response: string | null;
  pro_public_response_at: string | null;
  created_at: string;
  published_at: string | null;
  establishments?: {
    id: string;
    name: string | null;
    title: string | null;
    city: string | null;
    universe: string | null;
  };
};

export type AdminReportStatus = "pending" | "investigating" | "resolved" | "dismissed";

export type AdminReportReasonCode =
  | "inappropriate_content"
  | "false_information"
  | "closed_permanently"
  | "duplicate_listing"
  | "spam_or_scam"
  | "safety_concern"
  | "harassment"
  | "other";

export type AdminReport = {
  id: string;
  establishment_id: string;
  reporter_user_id: string | null;
  reporter_email: string | null;
  reason_code: AdminReportReasonCode;
  reason_text: string | null;
  status: AdminReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  action_taken: string | null;
  created_at: string;
  establishments?: {
    id: string;
    name: string | null;
    title: string | null;
    city: string | null;
    universe: string | null;
  };
};

export type AdminReviewStats = {
  reviews: Record<string, number>;
  reports: Record<string, number>;
  expiring_soon: number;
};

export async function listAdminReviews(
  adminKey: string | undefined,
  filters?: {
    status?: AdminReviewStatus | "all";
    establishment_id?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ ok: true; items: AdminReview[] }> {
  const qs = new URLSearchParams();
  if (filters?.status && filters.status !== "all") qs.set("status", filters.status);
  if (filters?.establishment_id) qs.set("establishment_id", filters.establishment_id);
  if (filters?.limit) qs.set("limit", String(filters.limit));
  if (filters?.offset) qs.set("offset", String(filters.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminReview[] }>(
    `/api/admin/reviews${suffix}`,
    adminKey,
  );
}

export async function getAdminReview(
  adminKey: string | undefined,
  reviewId: string,
): Promise<{ ok: true; review: AdminReview }> {
  return requestJson<{ ok: true; review: AdminReview }>(
    `/api/admin/reviews/${encodeURIComponent(reviewId)}`,
    adminKey,
  );
}

export async function approveAdminReview(
  adminKey: string | undefined,
  reviewId: string,
): Promise<{ ok: true; status: string }> {
  return requestJson<{ ok: true; status: string }>(
    `/api/admin/reviews/${encodeURIComponent(reviewId)}/approve`,
    adminKey,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function rejectAdminReview(
  adminKey: string | undefined,
  reviewId: string,
  reason: string,
): Promise<{ ok: true; status: string }> {
  return requestJson<{ ok: true; status: string }>(
    `/api/admin/reviews/${encodeURIComponent(reviewId)}/reject`,
    adminKey,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export async function sendAdminReviewToPro(
  adminKey: string | undefined,
  reviewId: string,
): Promise<{ ok: true; status: string; deadline: string }> {
  return requestJson<{ ok: true; status: string; deadline: string }>(
    `/api/admin/reviews/${encodeURIComponent(reviewId)}/send-to-pro`,
    adminKey,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function getAdminReviewStats(
  adminKey: string | undefined,
): Promise<{ ok: true } & AdminReviewStats> {
  return requestJson<{ ok: true } & AdminReviewStats>(
    "/api/admin/reviews/stats",
    adminKey,
  );
}

export async function listAdminReports(
  adminKey: string | undefined,
  filters?: {
    status?: AdminReportStatus | "all";
    establishment_id?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ ok: true; items: AdminReport[] }> {
  const qs = new URLSearchParams();
  if (filters?.status && filters.status !== "all") qs.set("status", filters.status);
  if (filters?.establishment_id) qs.set("establishment_id", filters.establishment_id);
  if (filters?.limit) qs.set("limit", String(filters.limit));
  if (filters?.offset) qs.set("offset", String(filters.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return requestJson<{ ok: true; items: AdminReport[] }>(
    `/api/admin/reports${suffix}`,
    adminKey,
  );
}

export async function resolveAdminReport(
  adminKey: string | undefined,
  reportId: string,
  data: {
    status: "resolved" | "dismissed";
    notes?: string;
    action_taken?: string;
  },
): Promise<{ ok: true; status: string }> {
  return requestJson<{ ok: true; status: string }>(
    `/api/admin/reports/${encodeURIComponent(reportId)}/resolve`,
    adminKey,
    { method: "POST", body: JSON.stringify(data) },
  );
}

// ---------------------------------------------------------------------------
// Username moderation
// ---------------------------------------------------------------------------

export type UsernameRequest = {
  id: string;
  establishment_id: string;
  requested_username: string;
  requested_by: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  establishments?: {
    id: string;
    name: string | null;
    city: string | null;
    username: string | null;
  };
};

export async function listUsernameRequests(
  adminKey: string | undefined,
  options?: {
    status?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{
  requests: UsernameRequest[];
  total: number;
  limit: number;
  offset: number;
}> {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));

  const query = params.toString();
  return requestJson<{
    requests: UsernameRequest[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/admin/username-requests${query ? `?${query}` : ""}`, adminKey);
}

export async function approveUsernameRequest(
  adminKey: string | undefined,
  requestId: string,
): Promise<{ ok: true; message: string }> {
  return requestJson<{ ok: true; message: string }>(
    `/api/admin/username-requests/${encodeURIComponent(requestId)}/approve`,
    adminKey,
    { method: "POST" },
  );
}

export async function rejectUsernameRequest(
  adminKey: string | undefined,
  requestId: string,
  reason?: string,
): Promise<{ ok: true; message: string }> {
  return requestJson<{ ok: true; message: string }>(
    `/api/admin/username-requests/${encodeURIComponent(requestId)}/reject`,
    adminKey,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

// ---------------------------------------------------------------------------
// Username Subscriptions (Admin)
// ---------------------------------------------------------------------------

export type AdminUsernameSubscription = {
  id: string;
  establishment_id: string;
  visibility_order_id: string | null;
  status: "trial" | "pending" | "active" | "expired" | "grace_period" | "cancelled";
  is_trial: boolean;
  trial_ends_at: string | null;
  starts_at: string | null;
  expires_at: string | null;
  grace_period_ends_at: string | null;
  cancelled_at: string | null;
  price_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
  // Joined data
  establishment_name?: string | null;
  establishment_city?: string | null;
  username?: string | null;
  days_remaining?: number;
};

export type AdminUsernameSubscriptionStats = {
  active_count: number;
  trial_count: number;
  grace_period_count: number;
  expired_count: number;
  mrr_cents: number;
  arr_cents: number;
  expiring_this_month: number;
  expiring_next_month: number;
};

export async function listAdminUsernameSubscriptions(
  adminKey: string | undefined,
  options?: {
    status?: string;
    establishment_id?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{
  ok: true;
  subscriptions: AdminUsernameSubscription[];
  total: number;
}> {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.establishment_id) params.set("establishment_id", options.establishment_id);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));

  const query = params.toString();
  return requestJson<{
    ok: true;
    subscriptions: AdminUsernameSubscription[];
    total: number;
  }>(`/api/admin/username-subscriptions${query ? `?${query}` : ""}`, adminKey);
}

export async function getAdminUsernameSubscriptionStats(
  adminKey: string | undefined,
): Promise<{
  ok: true;
  stats: AdminUsernameSubscriptionStats;
}> {
  return requestJson<{
    ok: true;
    stats: AdminUsernameSubscriptionStats;
  }>("/api/admin/username-subscriptions/stats", adminKey);
}

export async function extendAdminUsernameSubscription(
  adminKey: string | undefined,
  subscriptionId: string,
  days: number,
  reason?: string,
): Promise<{ ok: true; message: string }> {
  return requestJson<{ ok: true; message: string }>(
    `/api/admin/username-subscriptions/${encodeURIComponent(subscriptionId)}/extend`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ days, reason }),
    },
  );
}

export async function cancelAdminUsernameSubscription(
  adminKey: string | undefined,
  subscriptionId: string,
  reason?: string,
): Promise<{ ok: true; message: string }> {
  return requestJson<{ ok: true; message: string }>(
    `/api/admin/username-subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    adminKey,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
}
