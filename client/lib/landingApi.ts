// ============================================================================
// Landing Pages SEO — Client API helpers
// ============================================================================

import type { LandingPage, LandingSlugEntry, RelatedLanding } from "../../shared/landingPageTypes";
import type { PublicEstablishmentListItem, PaginationInfo } from "./publicApi";

class LandingApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LandingApiError";
    this.status = status;
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "omit" });
  if (!res.ok) {
    throw new LandingApiError(
      `Landing API error ${res.status}`,
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Landing page data (metadata + establishments + pagination)
// ---------------------------------------------------------------------------

export type LandingPageResponse = {
  ok: true;
  landing: LandingPage;
  items: PublicEstablishmentListItem[];
  pagination: PaginationInfo;
  stats: { total_count: number };
  related_landings: RelatedLanding[];
};

export async function getPublicLanding(
  slug: string,
  opts?: {
    cursor?: string | null;
    cursorScore?: number | null;
    cursorDate?: string | null;
    limit?: number;
  },
): Promise<LandingPageResponse> {
  const qs = new URLSearchParams();
  if (opts?.cursor) qs.set("cursor", opts.cursor);
  if (opts?.cursorScore != null && Number.isFinite(opts.cursorScore)) {
    qs.set("cs", String(opts.cursorScore));
  }
  if (opts?.cursorDate) qs.set("cd", opts.cursorDate);
  if (opts?.limit) qs.set("limit", String(opts.limit));

  const queryStr = qs.toString();
  const path = `/api/public/landing/${encodeURIComponent(slug)}${queryStr ? `?${queryStr}` : ""}`;
  return fetchJson<LandingPageResponse>(path);
}

// ---------------------------------------------------------------------------
// Landing slug map (for redirect lookup from Results page)
// ---------------------------------------------------------------------------

let _cachedSlugs: LandingSlugEntry[] | null = null;
let _cacheTs = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getLandingSlugMap(): Promise<LandingSlugEntry[]> {
  const now = Date.now();
  if (_cachedSlugs && now - _cacheTs < CACHE_TTL) return _cachedSlugs;

  const res = await fetchJson<{ ok: true; slugs: LandingSlugEntry[] }>(
    "/api/public/landing-slugs",
  );
  _cachedSlugs = res.slugs;
  _cacheTs = now;
  return _cachedSlugs;
}

/**
 * Find the landing page slug that matches a given universe + city combination.
 * Returns null if no match found.
 */
export function findLandingSlug(
  slugs: LandingSlugEntry[],
  universe: string,
  city: string | null,
  cuisineType?: string | null,
): string | null {
  const uniLower = (universe || "").toLowerCase();
  const cityLower = (city || "").toLowerCase();

  // Normalize UI universe to DB universe
  const dbUniverse = {
    restaurants: "restaurant",
    restaurant: "restaurant",
    loisirs: "loisir",
    loisir: "loisir",
    wellness: "wellness",
    hebergement: "hebergement",
    hotels: "hebergement",
    hotel: "hebergement",
    culture: "culture",
  }[uniLower] ?? uniLower;

  // Try exact match: universe + city + cuisine
  if (cuisineType && city) {
    const match = slugs.find(
      (s) =>
        s.universe === dbUniverse &&
        s.city?.toLowerCase() === cityLower &&
        s.cuisine_type === cuisineType,
    );
    if (match) return match.slug;
  }

  // Try universe + city (no cuisine)
  if (city && !cuisineType) {
    const match = slugs.find(
      (s) =>
        s.universe === dbUniverse &&
        s.city?.toLowerCase() === cityLower &&
        !s.cuisine_type &&
        !s.category,
    );
    if (match) return match.slug;
  }

  return null;
}
