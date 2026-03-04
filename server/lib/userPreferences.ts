/**
 * User Preferences for Personalized Search Results (Prompt 12)
 *
 * Computes preference profiles from:
 * 1. Reservations (weight 1.0) — strongest signal
 * 2. Search clicks (weight 0.5) — interest signal
 * 3. Search queries (weight 0.3) — weak but useful
 *
 * Personalization is a MULTIPLICATIVE bonus (max +30%) on search scores,
 * weighted by confidence_score (0 = no personalization, 1 = full).
 */

import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("userPreferences");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserPreferences {
  preferred_cuisines: Record<string, number>;
  preferred_ambiances: Record<string, number>;
  preferred_price_ranges: Record<string, number>;
  preferred_amenities: Record<string, number>;
  preferred_neighborhoods: Record<string, number>;
  preferred_cities: Record<string, number>;
  confidence_score: number;
}

/** Item shape expected by applyPersonalizationBonus (matches PublicEstablishmentListItem) */
interface ScoredItem {
  tags?: string[] | null;
  amenities?: string[] | null;
  price_range?: number | null;
  neighborhood?: string | null;
  city?: string | null;
  total_score?: number;
  best_score?: number;
  _personalized_score?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const DECAY_HALF_LIFE_DAYS = 90; // ~3 months half-life
const MAX_BONUS = 0.30; // cap at +30%

/** Weight for each data source */
const SOURCE_WEIGHT = {
  reservation: 1.0,
  click: 0.5,
  search: 0.3,
} as const;

/** Weight for each dimension in the final bonus */
const DIMENSION_WEIGHT = {
  cuisine: 0.15,
  ambiance: 0.10,
  price_range: 0.05,
  amenities: 0.05,
  neighborhood: 0.03,
  city: 0.02,
} as const;

// Simple keyword→cuisine mapping for parsing search queries
const CUISINE_KEYWORDS: Record<string, string> = {
  japonais: "japonais", japanese: "japonais", sushi: "japonais", ramen: "japonais",
  italien: "italien", italian: "italien", pizza: "italien", pasta: "italien",
  marocain: "marocain", moroccan: "marocain", tagine: "marocain", tajine: "marocain", couscous: "marocain",
  français: "français", french: "français", bistrot: "français",
  chinois: "chinois", chinese: "chinois",
  indien: "indien", indian: "indien", curry: "indien",
  thai: "thaïlandais", thaï: "thaïlandais", thaïlandais: "thaïlandais",
  mexicain: "mexicain", mexican: "mexicain", tacos: "mexicain",
  burger: "burger", hamburger: "burger",
  fruits_de_mer: "fruits de mer", seafood: "fruits de mer", poisson: "fruits de mer",
  brunch: "brunch",
  café: "café", coffee: "café",
  pâtisserie: "pâtisserie", patisserie: "pâtisserie",
};

const AMENITY_KEYWORDS: Record<string, string> = {
  terrasse: "terrasse", terrace: "terrasse",
  parking: "parking",
  wifi: "wifi", "wi-fi": "wifi",
  piscine: "piscine", pool: "piscine",
  spa: "spa",
  climatisation: "climatisation",
  enfants: "enfants", kids: "enfants",
};

const AMBIANCE_KEYWORDS: Record<string, string> = {
  romantique: "romantique", romantic: "romantique",
  festif: "festif", festive: "festif",
  familial: "familial", famille: "familial", family: "familial",
  cosy: "cosy", cozy: "cosy",
  chic: "chic",
  rooftop: "rooftop",
  "vue mer": "vue mer", "sea view": "vue mer",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Temporal decay: recent actions count more. decay = exp(-days / half_life) */
function temporalDecay(dateStr: string | null): number {
  if (!dateStr) return 0.5; // fallback for missing dates
  const daysAgo = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-daysAgo / DECAY_HALF_LIFE_DAYS);
}

/** Accumulate weighted value into a dimension map */
function accumulate(
  map: Map<string, number>,
  key: string,
  weight: number,
): void {
  const normalized = key.toLowerCase().trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + weight);
}

/** Normalize a dimension map: values become 0.0–1.0 relative to the max */
function normalizeMap(map: Map<string, number>): Record<string, number> {
  if (map.size === 0) return {};
  const maxVal = Math.max(...map.values());
  if (maxVal <= 0) return {};
  const result: Record<string, number> = {};
  for (const [key, val] of map) {
    result[key] = Math.round((val / maxVal) * 100) / 100; // 2 decimal places
  }
  return result;
}

// ---------------------------------------------------------------------------
// Core: Compute preferences from behavioral data
// ---------------------------------------------------------------------------

export async function computeUserPreferences(userId: string): Promise<UserPreferences> {
  const supabase = getAdminSupabase();

  // Accumulators per dimension
  const cuisines = new Map<string, number>();
  const ambiances = new Map<string, number>();
  const priceRanges = new Map<string, number>();
  const amenitiesMap = new Map<string, number>();
  const neighborhoods = new Map<string, number>();
  const cities = new Map<string, number>();

  let totalBookings = 0;
  let totalClicks = 0;
  let totalSearches = 0;
  let ratingSum = 0;
  let ratingCount = 0;

  // ── 1. Reservations (weight 1.0) ──────────────────────────────────────
  const { data: reservations } = await supabase
    .from("reservations")
    .select("establishment_id,starts_at,status")
    .eq("user_id", userId)
    .in("status", ["confirmed", "consumed", "consumed_default", "checked_in", "pre_confirmed"])
    .order("starts_at", { ascending: false })
    .limit(200);

  if (reservations && reservations.length > 0) {
    const estIds = [...new Set(reservations.map((r: any) => r.establishment_id).filter(Boolean))];

    const { data: estData } = estIds.length > 0
      ? await supabase
          .from("establishments")
          .select("id,cuisine_types,tags,amenities,price_range,neighborhood,city,google_rating")
          .in("id", estIds)
      : { data: [] };

    const estMap = new Map<string, any>();
    for (const e of (estData ?? []) as any[]) {
      estMap.set(e.id, e);
    }

    for (const r of reservations as any[]) {
      const e = estMap.get(r.establishment_id);
      if (!e) continue;
      totalBookings++;

      const decay = temporalDecay(r.starts_at);
      const w = SOURCE_WEIGHT.reservation * decay;

      // Cuisine types
      if (Array.isArray(e.cuisine_types)) {
        for (const c of e.cuisine_types) accumulate(cuisines, c, w);
      }

      // Tags → split into ambiances and cuisines
      if (Array.isArray(e.tags)) {
        for (const tag of e.tags) {
          const tl = (tag as string).toLowerCase().trim();
          // Check if it's an ambiance keyword
          if (AMBIANCE_KEYWORDS[tl] || tl.includes("romantique") || tl.includes("festif") || tl.includes("familial") || tl.includes("cosy") || tl.includes("chic") || tl.includes("rooftop")) {
            accumulate(ambiances, tl, w);
          } else {
            // Otherwise treat as cuisine/specialty
            accumulate(cuisines, tl, w * 0.5);
          }
        }
      }

      // Amenities
      if (Array.isArray(e.amenities)) {
        for (const a of e.amenities) accumulate(amenitiesMap, a, w);
      }

      // Price range
      if (typeof e.price_range === "number" && e.price_range >= 1 && e.price_range <= 4) {
        accumulate(priceRanges, String(e.price_range), w);
      }

      // Neighborhood & City
      if (typeof e.neighborhood === "string" && e.neighborhood) {
        accumulate(neighborhoods, e.neighborhood, w);
      }
      if (typeof e.city === "string" && e.city) {
        accumulate(cities, e.city, w);
      }

      // Rating tracking
      const rating = typeof e.google_rating === "number" ? e.google_rating : null;
      if (rating && rating > 0) {
        ratingSum += rating;
        ratingCount++;
      }
    }
  }

  // ── 2. Search clicks (weight 0.5) ─────────────────────────────────────
  const { data: clicks } = await supabase
    .from("search_history")
    .select("clicked_establishment_id,created_at")
    .eq("user_id", userId)
    .not("clicked_establishment_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (clicks && clicks.length > 0) {
    const clickEstIds = [...new Set(clicks.map((c: any) => c.clicked_establishment_id).filter(Boolean))];

    const { data: clickEstData } = clickEstIds.length > 0
      ? await supabase
          .from("establishments")
          .select("id,cuisine_types,tags,amenities,price_range,neighborhood,city")
          .in("id", clickEstIds)
      : { data: [] };

    const clickEstMap = new Map<string, any>();
    for (const e of (clickEstData ?? []) as any[]) {
      clickEstMap.set(e.id, e);
    }

    for (const c of clicks as any[]) {
      const e = clickEstMap.get(c.clicked_establishment_id);
      if (!e) continue;
      totalClicks++;

      const decay = temporalDecay(c.created_at);
      const w = SOURCE_WEIGHT.click * decay;

      if (Array.isArray(e.cuisine_types)) {
        for (const cuisine of e.cuisine_types) accumulate(cuisines, cuisine, w);
      }
      if (Array.isArray(e.tags)) {
        for (const tag of e.tags) {
          const tl = (tag as string).toLowerCase().trim();
          if (AMBIANCE_KEYWORDS[tl]) accumulate(ambiances, tl, w);
          else accumulate(cuisines, tl, w * 0.5);
        }
      }
      if (Array.isArray(e.amenities)) {
        for (const a of e.amenities) accumulate(amenitiesMap, a, w);
      }
      if (typeof e.price_range === "number" && e.price_range >= 1 && e.price_range <= 4) {
        accumulate(priceRanges, String(e.price_range), w);
      }
      if (typeof e.neighborhood === "string" && e.neighborhood) {
        accumulate(neighborhoods, e.neighborhood, w);
      }
      if (typeof e.city === "string" && e.city) {
        accumulate(cities, e.city, w);
      }
    }
  }

  // ── 3. Search queries (weight 0.3) ────────────────────────────────────
  const { data: searches } = await supabase
    .from("search_history")
    .select("query,city,filters,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (searches && searches.length > 0) {
    for (const s of searches as any[]) {
      totalSearches++;
      const decay = temporalDecay(s.created_at);
      const w = SOURCE_WEIGHT.search * decay;

      // Extract cuisine keywords from query text
      if (typeof s.query === "string") {
        const words = s.query.toLowerCase().split(/\s+/);
        for (const word of words) {
          if (CUISINE_KEYWORDS[word]) accumulate(cuisines, CUISINE_KEYWORDS[word], w);
          if (AMENITY_KEYWORDS[word]) accumulate(amenitiesMap, AMENITY_KEYWORDS[word], w);
          if (AMBIANCE_KEYWORDS[word]) accumulate(ambiances, AMBIANCE_KEYWORDS[word], w);
        }
      }

      // City from search
      if (typeof s.city === "string" && s.city) {
        accumulate(cities, s.city, w * 0.5);
      }

      // Parse filters JSONB
      if (s.filters && typeof s.filters === "object") {
        const filters = s.filters as Record<string, unknown>;
        if (typeof filters.price_range === "number") {
          accumulate(priceRanges, String(filters.price_range), w);
        }
        if (Array.isArray(filters.amenities)) {
          for (const a of filters.amenities) {
            if (typeof a === "string") accumulate(amenitiesMap, a, w);
          }
        }
      }
    }
  }

  // ── 4. Compute confidence ─────────────────────────────────────────────
  const confidence = Math.min(
    1.0,
    (totalBookings * 0.3 + totalClicks * 0.1 + totalSearches * 0.05) / 10,
  );

  const avgRating = ratingCount > 0
    ? Math.round((ratingSum / ratingCount) * 100) / 100
    : null;

  // ── 5. Build preferences object ───────────────────────────────────────
  const prefs: UserPreferences = {
    preferred_cuisines: normalizeMap(cuisines),
    preferred_ambiances: normalizeMap(ambiances),
    preferred_price_ranges: normalizeMap(priceRanges),
    preferred_amenities: normalizeMap(amenitiesMap),
    preferred_neighborhoods: normalizeMap(neighborhoods),
    preferred_cities: normalizeMap(cities),
    confidence_score: Math.round(confidence * 100) / 100,
  };

  // ── 6. UPSERT into DB ────────────────────────────────────────────────
  const now = new Date().toISOString();
  await supabase
    .from("user_preferences_computed")
    .upsert(
      {
        user_id: userId,
        preferred_cuisines: prefs.preferred_cuisines,
        preferred_ambiances: prefs.preferred_ambiances,
        preferred_price_ranges: prefs.preferred_price_ranges,
        preferred_amenities: prefs.preferred_amenities,
        preferred_neighborhoods: prefs.preferred_neighborhoods,
        preferred_cities: prefs.preferred_cities,
        avg_rating_booked: avgRating,
        total_bookings: totalBookings,
        total_clicks: totalClicks,
        total_searches: totalSearches,
        confidence_score: prefs.confidence_score,
        computed_at: now,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );

  return prefs;
}

// ---------------------------------------------------------------------------
// Load (with lazy recomputation)
// ---------------------------------------------------------------------------

export async function loadOrComputePreferences(
  userId: string,
): Promise<UserPreferences | null> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("user_preferences_computed")
    .select(
      "preferred_cuisines,preferred_ambiances,preferred_price_ranges,preferred_amenities,preferred_neighborhoods,preferred_cities,confidence_score,updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    log.warn({ err: error.message }, "failed to load preferences");
    return null;
  }

  // If no record exists, trigger async compute and return null (no personalization this time)
  if (!data) {
    void computeUserPreferences(userId).catch((e) => {
      log.warn({ err: e }, "background compute failed");
    });
    return null;
  }

  // If record is stale (>24h), trigger async recompute but serve stale data
  const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
  if (Date.now() - updatedAt > STALE_THRESHOLD_MS) {
    void computeUserPreferences(userId).catch((e) => {
      log.warn({ err: e }, "background recompute failed");
    });
  }

  // If confidence is 0, no personalization
  const confidence = typeof data.confidence_score === "number" ? data.confidence_score : 0;
  if (confidence <= 0) return null;

  return {
    preferred_cuisines: (data.preferred_cuisines as Record<string, number>) ?? {},
    preferred_ambiances: (data.preferred_ambiances as Record<string, number>) ?? {},
    preferred_price_ranges: (data.preferred_price_ranges as Record<string, number>) ?? {},
    preferred_amenities: (data.preferred_amenities as Record<string, number>) ?? {},
    preferred_neighborhoods: (data.preferred_neighborhoods as Record<string, number>) ?? {},
    preferred_cities: (data.preferred_cities as Record<string, number>) ?? {},
    confidence_score: confidence,
  };
}

// ---------------------------------------------------------------------------
// Apply personalization bonus to search results
// ---------------------------------------------------------------------------

/**
 * Compute personalization multiplier for a single establishment.
 * Returns 1.0 (no change) to 1.30 (max +30% boost).
 */
function getPersonalizationMultiplier(
  item: ScoredItem,
  prefs: UserPreferences,
): number {
  let bonus = 0;

  const tags = (item.tags ?? []).map((t) => t.toLowerCase().trim());

  // Cuisine match — check tags against preferred_cuisines
  for (const tag of tags) {
    const score = prefs.preferred_cuisines[tag];
    if (score) bonus += score * DIMENSION_WEIGHT.cuisine;
  }

  // Ambiance match
  for (const tag of tags) {
    const score = prefs.preferred_ambiances[tag];
    if (score) bonus += score * DIMENSION_WEIGHT.ambiance;
  }

  // Price range match
  if (item.price_range != null) {
    const score = prefs.preferred_price_ranges[String(item.price_range)];
    if (score) bonus += score * DIMENSION_WEIGHT.price_range;
  }

  // Amenities overlap — not in standard search results, but check if available
  // (Amenities are not returned in the search response by default, but tags may overlap)

  // Neighborhood match
  if (typeof item.neighborhood === "string" && item.neighborhood) {
    const score = prefs.preferred_neighborhoods[item.neighborhood.toLowerCase().trim()];
    if (score) bonus += score * DIMENSION_WEIGHT.neighborhood;
  }

  // City match
  if (typeof item.city === "string" && item.city) {
    const score = prefs.preferred_cities[item.city.toLowerCase().trim()];
    if (score) bonus += score * DIMENSION_WEIGHT.city;
  }

  // Cap and weight by confidence
  const cappedBonus = Math.min(bonus, MAX_BONUS);
  return 1 + cappedBonus * prefs.confidence_score;
}

/**
 * Apply personalization bonus to a list of search result items.
 * Re-sorts items by personalized score (in-place mutation + sort).
 *
 * Works with both scored path (total_score) and fallback path (best_score).
 */
export function applyPersonalizationBonus(
  items: ScoredItem[],
  prefs: UserPreferences,
): void {
  if (items.length <= 1 || prefs.confidence_score <= 0) return;

  // Determine which score field to use
  const useTotal = items[0].total_score != null;
  const useBest = !useTotal && items[0].best_score != null;

  for (const item of items) {
    const multiplier = getPersonalizationMultiplier(item, prefs);
    if (useTotal && typeof item.total_score === "number") {
      item._personalized_score = item.total_score * multiplier;
    } else if (useBest && typeof item.best_score === "number") {
      item._personalized_score = item.best_score * multiplier;
    } else {
      // No score to boost — assign a neutral personalized score
      item._personalized_score = multiplier;
    }
  }

  // Re-sort by personalized score (descending)
  items.sort((a, b) => (b._personalized_score ?? 0) - (a._personalized_score ?? 0));
}

// ---------------------------------------------------------------------------
// Cron: batch recompute for active users
// ---------------------------------------------------------------------------

export async function recomputeActiveUserPreferences(): Promise<{
  processed: number;
  errors: number;
}> {
  const supabase = getAdminSupabase();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Find users active in last 7 days (from reservations or search_history)
  const { data: activeFromReservations } = await supabase
    .from("reservations")
    .select("user_id")
    .gte("created_at", sevenDaysAgo)
    .limit(500);

  const { data: activeFromSearches } = await supabase
    .from("search_history")
    .select("user_id")
    .not("user_id", "is", null)
    .gte("created_at", sevenDaysAgo)
    .limit(500);

  // Deduplicate user IDs
  const userIds = new Set<string>();
  for (const r of (activeFromReservations ?? []) as any[]) {
    if (typeof r.user_id === "string" && r.user_id) userIds.add(r.user_id);
  }
  for (const s of (activeFromSearches ?? []) as any[]) {
    if (typeof s.user_id === "string" && s.user_id) userIds.add(s.user_id);
  }

  let processed = 0;
  let errors = 0;

  // Process in batches of 20
  const batchSize = 20;
  const ids = [...userIds];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((uid) => computeUserPreferences(uid)),
    );

    for (const r of results) {
      if (r.status === "fulfilled") processed++;
      else errors++;
    }

    // Small delay between batches to avoid overwhelming the DB
    if (i + batchSize < ids.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  log.info({ processed, errors, activeUsers: userIds.size }, "recomputed user preferences");

  return { processed, errors };
}
