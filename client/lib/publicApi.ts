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
  social_links: unknown;

  cover_url: string | null;
  gallery_urls: string[] | null;
  hours: unknown;
  tags: string[] | null;
  amenities: string[] | null;
  extra: unknown;

  booking_enabled: boolean | null;
  status: string | null;
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
};

export type PublicEstablishmentResponse = {
  establishment: PublicEstablishment;
  booking_policy: PublicBookingPolicy | null;
  offers: {
    slots: PublicOfferSlot[];
    packs: PublicOfferPack[];
    availableSlots: PublicDateSlots[];
  };
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
  name: string | null;
  universe: string | null;
  subcategory: string | null;
  city: string | null;
  address: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
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
  };
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

  if (typeof args?.limit === "number" && Number.isFinite(args.limit)) {
    qs.set("limit", String(Math.max(1, Math.floor(args.limit))));
  }

  if (typeof args?.offset === "number" && Number.isFinite(args.offset)) {
    qs.set("offset", String(Math.max(0, Math.floor(args.offset))));
  }

  const path = qs.toString()
    ? `/api/public/establishments?${qs.toString()}`
    : "/api/public/establishments";
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
  };
  meta: {
    universe?: string;
    city?: string;
    lat?: number;
    lng?: number;
    sessionId?: string;
    favoriteCount?: number;
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
};

export async function getPublicHomeCities(): Promise<{
  ok: true;
  cities: PublicHomeCity[];
}> {
  return requestJson<{ ok: true; cities: PublicHomeCity[] }>(
    "/api/public/home-cities",
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
