export class PublicApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "PublicApiError";
    this.status = status;
    this.payload = payload;
  }
}

export type PublicEstablishment = {
  id: string;
  slug: string | null;
  name: string | null;
  universe: string | null;
  subcategory: string | null;

  city: string | null;
  address: string | null;
  postal_code: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;

  description_short: string | null;
  description_long: string | null;

  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  email: string | null;
  social_links: unknown;

  cover_url: string | null;
  gallery_urls: string[] | null;
  hours: unknown;
  tags: string[] | null;
  amenities: string[] | null;
  extra: unknown;

  booking_enabled: boolean | null;
  status: string | null;

  // Menu Digital (QR Code)
  menu_digital_enabled: boolean | null;
  menu_digital_url: string | null;
};

export type PublicOfferSlot = {
  id: string;
  starts_at: string;
  promo_type: string | null;
  promo_value: number | null;
  promo_label: string | null;
};

export type PublicOfferPack = {
  id: string;
  title: string | null;
  description: string | null;
  label: string | null;
  items: unknown;
  price: number | null;
  original_price: number | null;
  is_limited: boolean | null;
  stock: number | null;
  availability: string | null;
  max_reservations: number | null;
  active: boolean | null;
  valid_from: string | null;
  valid_to: string | null;
  conditions: unknown;
};

export type PublicDateSlots = {
  date: string;
  services: Array<{ service: string; times: string[] }>;
  promos?: Record<string, number | null>;
  slotIds?: Record<string, string>;
  remaining?: Record<string, number | null>;
};

export type PublicBookingPolicy = {
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

  /** Deposit amount per person in MAD. If null or 0, guaranteed booking is disabled. */
  deposit_per_person: number | null;
};

export type PublicMenuItem = {
  id: number;
  name: string;
  description: string;
  price: string;
  badges?: string[];
};

export type PublicMenuCategory = {
  id: string;
  name: string;
  items: PublicMenuItem[];
};

export type PublicEstablishmentResponse = {
  establishment: PublicEstablishment;
  booking_policy: PublicBookingPolicy | null;
  offers: {
    slots: PublicOfferSlot[];
    packs: PublicOfferPack[];
    availableSlots: PublicDateSlots[];
  };
  menu?: PublicMenuCategory[];
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

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const maybe = payload as Record<string, unknown>;
  const msg = typeof maybe.error === "string" ? maybe.error : null;
  return msg && msg.trim() ? msg : null;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      // Avoid sending cookies by default: in embedded/iframe contexts cookies can be blocked.
      // Public endpoints do not require cookies; authenticated endpoints use Bearer tokens.
      credentials: "omit",
      headers: {
        ...(init?.headers ?? {}),
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch (e) {
    throw new PublicApiError(
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
    throw new PublicApiError(msg, res.status, payload);
  }

  return payload as T;
}

export async function getPublicEstablishment(args: {
  ref: string;
  title?: string | null;
}): Promise<PublicEstablishmentResponse> {
  const ref = String(args.ref ?? "").trim();
  if (!ref) throw new PublicApiError("missing_ref", 400);

  const qs = new URLSearchParams();
  const title = String(args.title ?? "").trim();
  if (title) qs.set("title", title);

  const path = qs.toString()
    ? `/api/public/establishments/${encodeURIComponent(ref)}?${qs.toString()}`
    : `/api/public/establishments/${encodeURIComponent(ref)}`;

  return requestJson<PublicEstablishmentResponse>(path);
}

let billingCompanyProfileCache: {
  value: BillingCompanyProfile;
  fetchedAt: number;
} | null = null;
const BILLING_COMPANY_PROFILE_TTL_MS = 5 * 60 * 1000;

export async function getBillingCompanyProfile(): Promise<BillingCompanyProfile> {
  if (
    billingCompanyProfileCache &&
    Date.now() - billingCompanyProfileCache.fetchedAt <
      BILLING_COMPANY_PROFILE_TTL_MS
  ) {
    return billingCompanyProfileCache.value;
  }

  const payload = await requestJson<{
    ok: true;
    profile: BillingCompanyProfile;
  }>("/api/public/billing/company-profile");
  billingCompanyProfileCache = {
    value: payload.profile,
    fetchedAt: Date.now(),
  };
  return payload.profile;
}

export type PublicEstablishmentListItem = {
  id: string;
  slug?: string | null;
  name: string | null;
  universe: string | null;
  subcategory: string | null;
  city: string | null;
  address: string | null;
  neighborhood?: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  cover_url: string | null;
  booking_enabled: boolean | null;
  promo_percent: number | null;
  next_slot_at: string | null;
  reservations_30d: number;
  avg_rating: number | null;
  review_count: number;
  reviews_last_30d: number;
  best_score?: number;
  verified?: boolean;
  premium?: boolean;
  curated?: boolean;
  tags?: string[] | null;
  google_rating?: number | null;
  google_review_count?: number | null;
};

export type PaginationInfo = {
  next_cursor: string | null;
  next_cursor_score: number | null;
  next_cursor_date: string | null;
  has_more: boolean;
  total_count: number | null;
};

// Prompt 13 — Search fallback types
export type FallbackSuggestion = { label: string; results_count: number; query_params: Record<string, string> };
export type FallbackRelaxedFilter = { removed_filter: string; label: string; results_count: number; query_params: Record<string, string> };
export type FallbackNearby = { city: string; distance_km: number; results_count: number };
export type FallbackPopularItem = { id: string; name: string; slug: string; city: string; cover_url: string | null; avg_rating: number | null; subcategory: string | null };
export type SearchFallbackResult = {
  type: "did_you_mean" | "semantic_expansion" | "relax_filters" | "nearby_cities" | "popular";
  suggestions?: FallbackSuggestion[];
  relaxed_filters?: FallbackRelaxedFilter[];
  nearby?: FallbackNearby[];
  popular: FallbackPopularItem[];
};

export type PublicEstablishmentsListResponse = {
  ok: true;
  items: PublicEstablishmentListItem[];
  meta: {
    limit: number;
    offset: number;
    universe?: string;
    city?: string;
    q?: string;
    promoOnly?: boolean;
    search_mode?: string;
    personalized?: boolean;
  };
  pagination?: PaginationInfo;
  fallback?: SearchFallbackResult;
};

export async function listPublicEstablishments(args?: {
  universe?: string | null;
  city?: string | null;
  q?: string | null;
  category?: string | null;
  sort?: "best" | null;
  promoOnly?: boolean;
  limit?: number;
  offset?: number;
  /** Bounding box for map "search this area" — overrides city filter */
  bounds?: { swLat: number; swLng: number; neLat: number; neLng: number } | null;
  /** Cursor-based pagination */
  cursor?: string | null;
  cursorScore?: number | null;
  cursorDate?: string | null;
  /** Locale for multilingual search (fr/en/es/it/ar) */
  lang?: string | null;
  /** Prompt 11 — practical filters */
  open_now?: boolean;
  instant_booking?: boolean;
  amenities?: string[];
  price_range?: number[];
  /** Prompt 12 — personalization toggle (false = disable) */
  personalized?: boolean;
}): Promise<PublicEstablishmentsListResponse> {
  const qs = new URLSearchParams();

  const universe = String(args?.universe ?? "").trim();
  if (universe) qs.set("universe", universe);

  const city = String(args?.city ?? "").trim();
  if (city) qs.set("city", city);

  const q = String(args?.q ?? "").trim();
  if (q) qs.set("q", q);

  const category = String(args?.category ?? "").trim();
  if (category) qs.set("category", category);

  if (args?.sort === "best") qs.set("sort", "best");

  if (args?.promoOnly) qs.set("promo", "1");

  // Prompt 11 — practical filters
  if (args?.open_now) qs.set("open_now", "1");
  if (args?.instant_booking) qs.set("instant_booking", "1");
  if (args?.amenities?.length) qs.set("amenities", args.amenities.join(","));
  if (args?.price_range?.length) qs.set("price_range", args.price_range.join(","));

  if (typeof args?.limit === "number" && Number.isFinite(args.limit)) {
    qs.set("limit", String(Math.max(1, Math.floor(args.limit))));
  }

  if (typeof args?.offset === "number" && Number.isFinite(args.offset)) {
    qs.set("offset", String(Math.max(0, Math.floor(args.offset))));
  }

  // Bounding box params for map-based area search
  if (args?.bounds) {
    qs.set("swLat", String(args.bounds.swLat));
    qs.set("swLng", String(args.bounds.swLng));
    qs.set("neLat", String(args.bounds.neLat));
    qs.set("neLng", String(args.bounds.neLng));
  }

  // Cursor-based pagination params
  if (args?.cursor) qs.set("cursor", args.cursor);
  if (args?.cursorScore != null && Number.isFinite(args.cursorScore)) {
    qs.set("cs", String(args.cursorScore));
  }
  if (args?.cursorDate) qs.set("cd", args.cursorDate);

  if (args?.lang && args.lang !== "fr") qs.set("lang", args.lang);

  // Prompt 12 — personalization
  if (args?.personalized === false) qs.set("personalized", "0");

  const path = qs.toString()
    ? `/api/public/establishments?${qs.toString()}`
    : "/api/public/establishments";

  // Prompt 12: pass auth token for personalized results (optional, non-blocking)
  if (args?.personalized !== false) {
    try {
      const token = await getOptionalAuthToken();
      if (token) {
        return requestJson<PublicEstablishmentsListResponse>(path, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch { /* ignore auth errors */ }
  }

  return requestJson<PublicEstablishmentsListResponse>(path);
}

export type PublicHomeFeedItem = PublicEstablishmentListItem & {
  distance_km?: number | null;
  curated?: boolean;
  score?: number;
};

export type PublicHomeFeedResponse = {
  ok: true;
  lists: {
    best_deals: PublicHomeFeedItem[];
    selected_for_you: PublicHomeFeedItem[];
    near_you: PublicHomeFeedItem[];
    most_booked: PublicHomeFeedItem[];
    open_now: PublicHomeFeedItem[];
    trending: PublicHomeFeedItem[];
    new_establishments: PublicHomeFeedItem[];
    top_rated: PublicHomeFeedItem[];
    deals: PublicHomeFeedItem[];
    themed: PublicHomeFeedItem[];
  };
  meta: {
    universe?: string;
    city?: string;
    lat?: number;
    lng?: number;
    sessionId?: string;
    favoriteCount?: number;
    theme?: string | null;
    ramadan_active?: boolean;
  };
};

export async function getPublicHomeFeed(args?: {
  universe?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  sessionId?: string | null;
  favorites?: string[] | Set<string> | null;
}): Promise<PublicHomeFeedResponse> {
  const qs = new URLSearchParams();

  const universe = String(args?.universe ?? "").trim();
  if (universe) qs.set("universe", universe);

  const city = String(args?.city ?? "").trim();
  if (city) qs.set("city", city);

  if (typeof args?.lat === "number" && Number.isFinite(args.lat))
    qs.set("lat", String(args.lat));
  if (typeof args?.lng === "number" && Number.isFinite(args.lng))
    qs.set("lng", String(args.lng));

  const sessionId = String(args?.sessionId ?? "").trim();
  if (sessionId) qs.set("sessionId", sessionId);

  const favorites = Array.isArray(args?.favorites)
    ? args?.favorites
    : args?.favorites instanceof Set
      ? Array.from(args.favorites)
      : [];

  const favoriteIds = favorites
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 50);
  if (favoriteIds.length) qs.set("favorites", favoriteIds.join(","));

  const path = qs.toString()
    ? `/api/public/home?${qs.toString()}`
    : "/api/public/home";
  return requestJson<PublicHomeFeedResponse>(path);
}

// ============================================
// SEARCH AUTOCOMPLETE
// ============================================
export type AutocompleteSuggestion = {
  id: string;
  term: string;
  category: "establishment" | "cuisine" | "specialty" | "dish" | "tag" | "city" | "activity" | "accommodation" | "hashtag";
  displayLabel: string;
  iconName: string | null;
  universe: string | null;
  extra?: {
    establishmentId?: string;
    coverUrl?: string;
    city?: string;
    usageCount?: number;
    resultCount?: number;
  };
};

export type AutocompleteResponse = {
  ok: true;
  suggestions: AutocompleteSuggestion[];
  query: string;
  /** When a city filter was applied and no establishment matched, this message is set */
  noEstablishmentsMessage?: string | null;
};

export type PopularSearchesResponse = {
  ok: true;
  searches: Array<{
    term: string;
    category: string;
    displayLabel: string;
    iconName: string | null;
    searchCount?: number;
  }>;
};

export async function searchAutocomplete(args: {
  q: string;
  universe?: string | null;
  city?: string | null;
  limit?: number;
  lang?: string | null;
}): Promise<AutocompleteResponse> {
  const qs = new URLSearchParams();
  qs.set("q", args.q);
  if (args.universe) qs.set("universe", args.universe);
  if (args.city) qs.set("city", args.city);
  if (args.limit) qs.set("limit", String(args.limit));
  if (args.lang && args.lang !== "fr") qs.set("lang", args.lang);

  return requestJson<AutocompleteResponse>(`/api/public/search/autocomplete?${qs.toString()}`);
}

export async function getPopularSearches(args?: {
  universe?: string | null;
  city?: string | null;
  limit?: number;
  lang?: string | null;
}): Promise<PopularSearchesResponse> {
  const qs = new URLSearchParams();
  if (args?.universe) qs.set("universe", args.universe);
  if (args?.city) qs.set("city", args.city);
  if (args?.limit) qs.set("limit", String(args.limit));
  if (args?.lang && args.lang !== "fr") qs.set("lang", args.lang);

  const path = qs.toString()
    ? `/api/public/search/popular?${qs.toString()}`
    : "/api/public/search/popular";
  return requestJson<PopularSearchesResponse>(path);
}

// ============================================
// SEARCH HISTORY
// ============================================

const SESSION_ID_KEY = "sam_search_session_id";

/** Get or create a stable session ID for anonymous search tracking */
function getSearchSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(SESSION_ID_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

/** Try to get consumer auth token (null if not logged in) */
async function getOptionalAuthToken(): Promise<string | null> {
  try {
    // Dynamic import to avoid circular deps — consumerSupabase is not imported in publicApi
    const { consumerSupabase } = await import("@/lib/supabase");
    const { data } = await consumerSupabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export type SearchHistoryEntry = {
  id: string;
  query: string;
  universe: string | null;
  city: string | null;
  results_count: number | null;
  searched_at: string;
};

/**
 * Save a search to server-side history.
 * Fire-and-forget — errors are silently swallowed.
 */
export async function saveSearchToServerHistory(args: {
  query: string;
  universe?: string | null;
  city?: string | null;
  results_count?: number | null;
  filters_applied?: Record<string, unknown>;
}): Promise<void> {
  if (!args.query || args.query.trim().length < 2) return;

  try {
    const token = await getOptionalAuthToken();
    const sessionId = getSearchSessionId();

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    await fetch("/api/public/search/history", {
      method: "POST",
      credentials: "omit",
      headers,
      body: JSON.stringify({
        query: args.query.trim(),
        universe: args.universe ?? null,
        city: args.city ?? null,
        results_count: args.results_count ?? null,
        filters_applied: args.filters_applied ?? {},
        session_id: sessionId,
      }),
    });
  } catch {
    // Fire-and-forget — don't block UI
  }
}

/**
 * Fetch recent search history from server.
 */
export async function fetchSearchHistory(args?: {
  universe?: string | null;
  limit?: number;
}): Promise<{ ok: true; history: SearchHistoryEntry[] }> {
  try {
    const token = await getOptionalAuthToken();
    const sessionId = getSearchSessionId();

    const qs = new URLSearchParams();
    qs.set("session_id", sessionId);
    if (args?.universe) qs.set("universe", args.universe);
    if (args?.limit) qs.set("limit", String(args.limit));

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`/api/public/search/history?${qs.toString()}`, {
      credentials: "omit",
      headers,
    });

    if (!res.ok) return { ok: true, history: [] };
    return await res.json();
  } catch {
    return { ok: true, history: [] };
  }
}

/**
 * Delete a search history entry (by id) or all entries.
 */
export async function deleteSearchHistoryEntry(args?: { id?: string; query?: string }): Promise<void> {
  try {
    const token = await getOptionalAuthToken();
    const sessionId = getSearchSessionId();

    const qs = new URLSearchParams();
    qs.set("session_id", sessionId);
    if (args?.id) qs.set("id", args.id);
    else if (args?.query) qs.set("query", args.query);

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    await fetch(`/api/public/search/history?${qs.toString()}`, {
      method: "DELETE",
      credentials: "omit",
      headers,
    });
  } catch {
    // Fire-and-forget
  }
}

/**
 * Track a click on an establishment from search results.
 * Fire-and-forget.
 */
export async function trackSearchResultClick(historyId: string, establishmentId: string): Promise<void> {
  if (!historyId || !establishmentId) return;
  try {
    await fetch(`/api/public/search/history/${encodeURIComponent(historyId)}/click`, {
      method: "PATCH",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ establishment_id: establishmentId }),
    });
  } catch {
    // Fire-and-forget
  }
}

// ============================================
// PUBLIC CATEGORIES (Level 2)
// ============================================
export type PublicCategoryItem = {
  id: string;
  slug: string;
  universe: string;
  nameFr: string;
  nameEn: string | null;
  descriptionFr: string | null;
  descriptionEn: string | null;
  iconName: string | null;
  imageUrl: string | null;
  requiresBooking: boolean;
  supportsPacks: boolean;
};

export type PublicCategoriesResponse = {
  ok: true;
  items: PublicCategoryItem[];
};

export async function getPublicCategories(args?: {
  universe?: string | null;
}): Promise<PublicCategoriesResponse> {
  const qs = new URLSearchParams();

  const universe = String(args?.universe ?? "").trim();
  if (universe) qs.set("universe", universe);

  const path = qs.toString()
    ? `/api/public/categories?${qs.toString()}`
    : "/api/public/categories";
  return requestJson<PublicCategoriesResponse>(path);
}

// ============================================
// PUBLIC CATEGORY IMAGES / SUBCATEGORIES (Level 3)
// ============================================
export type PublicCategoryImageItem = {
  id: string;
  name: string;
  imageUrl: string;
  universe: string;
  categorySlug: string | null;
};

export type PublicCategoryImagesResponse = {
  ok: true;
  items: PublicCategoryImageItem[];
};

export async function getPublicCategoryImages(args?: {
  universe?: string | null;
  category?: string | null;
}): Promise<PublicCategoryImagesResponse> {
  const qs = new URLSearchParams();

  const universe = String(args?.universe ?? "").trim();
  if (universe) qs.set("universe", universe);

  const category = String(args?.category ?? "").trim();
  if (category) qs.set("category", category);

  const path = qs.toString()
    ? `/api/public/category-images?${qs.toString()}`
    : "/api/public/category-images";
  return requestJson<PublicCategoryImagesResponse>(path);
}

// ============================================
// UNIVERSES
// ============================================

export type PublicUniverse = {
  slug: string;
  label_fr: string;
  label_en: string;
  icon_name: string;
  color: string;
  sort_order: number;
  image_url?: string | null;
};

export async function getPublicUniverses(): Promise<{
  ok: true;
  universes: PublicUniverse[];
}> {
  return requestJson<{ ok: true; universes: PublicUniverse[] }>(
    "/api/public/universes",
  );
}

// ============================================
// PUBLIC HOME SETTINGS
// ============================================

export type PublicHowItWorksItem = {
  icon: string;
  title: string;
  description: string;
};

export type PublicHomeSettings = {
  hero: {
    background_image_url: string | null;
    overlay_opacity: number;
    title?: string | null;
    subtitle?: string | null;
  };
  how_it_works?: {
    title: string;
    items: PublicHowItWorksItem[];
  };
};

export async function getPublicHomeSettings(): Promise<{
  ok: true;
  settings: PublicHomeSettings;
}> {
  return requestJson<{ ok: true; settings: PublicHomeSettings }>(
    "/api/public/home-settings",
  );
}

// ============================================
// PUBLIC HOME CITIES
// ============================================

export type PublicHomeCity = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  country_code?: string;
};

export async function getPublicHomeCities(options?: {
  country?: string;
}): Promise<{
  ok: true;
  cities: PublicHomeCity[];
}> {
  const params = new URLSearchParams();
  if (options?.country) params.set("country", options.country);
  const qs = params.toString();
  return requestJson<{ ok: true; cities: PublicHomeCity[] }>(
    `/api/public/home-cities${qs ? `?${qs}` : ""}`,
  );
}

// ============================================
// PUBLIC HOME VIDEOS
// ============================================

export type PublicHomeVideo = {
  id: string;
  youtube_url: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  establishment_id: string | null;
  establishment_name: string | null;
  establishment_universe: string | null;
  establishment_slug: string | null;
};

export async function getPublicHomeVideos(): Promise<{
  ok: true;
  videos: PublicHomeVideo[];
}> {
  return requestJson<{ ok: true; videos: PublicHomeVideo[] }>(
    "/api/public/home-videos",
  );
}

// ============================================
// PUBLIC COUNTRIES
// ============================================

export type PublicCountry = {
  id: string;
  name: string;
  name_en: string | null;
  code: string;
  flag_emoji: string | null;
  currency_code: string | null;
  is_default: boolean;
};

export async function getPublicCountries(): Promise<{
  ok: true;
  countries: PublicCountry[];
}> {
  return requestJson<{ ok: true; countries: PublicCountry[] }>(
    "/api/public/countries",
  );
}

export async function detectUserCountry(): Promise<{
  ok: true;
  country_code: string;
  detected: boolean;
  reason?: string;
}> {
  return requestJson<{ ok: true; country_code: string; detected: boolean; reason?: string }>(
    "/api/public/detect-country",
  );
}

// ============================================
// SPONSORED RESULTS (ADS)
// ============================================

export type SponsoredResultItem = {
  campaign_id: string;
  position: number;
  establishment: {
    id: string;
    name: string;
    city: string | null;
    address: string | null;
    neighborhood?: string | null;
    cover_url: string | null;
    subcategory: string | null;
    avg_rating: number | null;
    review_count: number | null;
    booking_enabled: boolean;
    lat: number | null;
    lng: number | null;
  };
  bid_amount_cents: number | null;
};

export type SponsoredResultsResponse = {
  ok: true;
  sponsored: SponsoredResultItem[];
  total: number;
};

export async function getSponsoredResults(args?: {
  city?: string | null;
  universe?: string | null;
  q?: string | null;
  limit?: number;
}): Promise<SponsoredResultsResponse> {
  const qs = new URLSearchParams();

  const city = String(args?.city ?? "").trim();
  if (city) qs.set("city", city);

  const universe = String(args?.universe ?? "").trim();
  if (universe) qs.set("universe", universe);

  const q = String(args?.q ?? "").trim();
  if (q) qs.set("q", q);

  if (typeof args?.limit === "number" && Number.isFinite(args.limit)) {
    qs.set("limit", String(Math.max(1, Math.min(args.limit, 5))));
  }

  const path = qs.toString()
    ? `/api/public/ads/sponsored?${qs.toString()}`
    : "/api/public/ads/sponsored";
  return requestJson<SponsoredResultsResponse>(path);
}

export async function trackAdImpression(args: {
  campaign_id: string;
  position?: number;
  search_query?: string;
  user_id?: string;
}): Promise<{ ok: true; impression_id: string }> {
  return requestJson<{ ok: true; impression_id: string }>(
    "/api/public/ads/impression",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    },
  );
}

export async function trackAdClick(args: {
  campaign_id: string;
  impression_id?: string;
  user_id?: string;
  destination_url?: string;
}): Promise<{ ok: true; click_id: string; is_valid: boolean }> {
  return requestJson<{ ok: true; click_id: string; is_valid: boolean }>(
    "/api/public/ads/click",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    },
  );
}

// =============================================================================
// FEATURED PACK (Pack Mise en Avant) - Homepage sections
// =============================================================================

export type FeaturedPackItem = {
  campaign_id: string;
  establishment: {
    id: string;
    slug: string | null;
    name: string;
    universe: string | null;
    city: string | null;
    address: string | null;
    neighborhood?: string | null;
    cover_url: string | null;
    subcategory: string | null;
    avg_rating: number | null;
    review_count: number | null;
    booking_enabled: boolean;
    lat: number | null;
    lng: number | null;
  };
  cpm_cents: number | null;
};

export type FeaturedPackResponse = {
  ok: true;
  featured: FeaturedPackItem | null;
};

export async function getFeaturedPack(args?: {
  section?: string;
  universe?: string | null;
  exclude?: string[];
}): Promise<FeaturedPackResponse> {
  const qs = new URLSearchParams();

  const section = String(args?.section ?? "selected_for_you").trim();
  if (section) qs.set("section", section);

  const universe = String(args?.universe ?? "").trim();
  if (universe) qs.set("universe", universe);

  if (args?.exclude?.length) {
    qs.set("exclude", args.exclude.join(","));
  }

  const path = `/api/public/ads/featured-pack?${qs.toString()}`;
  return requestJson<FeaturedPackResponse>(path);
}

// =============================================================================
// HOME TAKEOVER (Habillage Homepage)
// =============================================================================

export type HomeTakeoverItem = {
  campaign_id: string;
  title: string;
  banner_desktop_url: string | null;
  banner_mobile_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  establishment: {
    id: string;
    name: string;
    slug: string | null;
    cover_url: string | null;
  } | null;
};

export type HomeTakeoverResponse = {
  ok: true;
  takeover: HomeTakeoverItem | null;
};

export async function getHomeTakeover(): Promise<HomeTakeoverResponse> {
  return requestJson<HomeTakeoverResponse>("/api/public/ads/home-takeover");
}
