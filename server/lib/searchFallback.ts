/**
 * Prompt 13 — Search Fallback Cascade
 *
 * When a search returns < 3 results, this module generates contextual
 * suggestions so the user always has a way forward (no dead-end pages).
 *
 * 5-level cascade:
 *   1. "Did you mean?" — trigram correction on search_suggestions + establishment names
 *   2. Semantic expansion — synonym / individual word fallback
 *   3. Filter relaxation — try removing filters one at a time
 *   4. Nearby cities — same query in other cities
 *   5. Popular fallback — top establishments (always returned)
 */

import { getAdminSupabase } from "../supabaseAdmin";
import { cachedQuery, buildCacheKey, normalizeQuery } from "./cache";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("searchFallback");

// ---------------------------------------------------------------------------
// Types (re-exported for use in public.ts and client-side publicApi.ts)
// ---------------------------------------------------------------------------

export type FallbackSuggestion = {
  label: string;
  results_count: number;
  query_params: Record<string, string>;
};

export type FallbackRelaxedFilter = {
  removed_filter: string;
  label: string;
  results_count: number;
  query_params: Record<string, string>;
};

export type FallbackNearby = {
  city: string;
  distance_km: number;
  results_count: number;
};

export type FallbackPopularItem = {
  id: string;
  name: string;
  slug: string;
  city: string;
  cover_url: string | null;
  avg_rating: number | null;
  subcategory: string | null;
};

export type SearchFallbackResult = {
  type: "did_you_mean" | "semantic_expansion" | "relax_filters" | "nearby_cities" | "popular";
  suggestions?: FallbackSuggestion[];
  relaxed_filters?: FallbackRelaxedFilter[];
  nearby?: FallbackNearby[];
  popular: FallbackPopularItem[];
};

export interface FallbackParams {
  query: string;
  universe: string | null;
  city: string | null;
  filters: {
    amenities: string[];
    price_range: number[];
    open_now: boolean;
    instant_booking: boolean;
    promo_only: boolean;
  };
}

// ---------------------------------------------------------------------------
// Haversine (duplicated from public.ts to keep this module self-contained)
// ---------------------------------------------------------------------------

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aVal =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

// ---------------------------------------------------------------------------
// Helper: lightweight count query
// ---------------------------------------------------------------------------

async function countEstablishments(
  term: string,
  universe: string | null,
  city: string | null,
): Promise<number> {
  const supabase = getAdminSupabase();
  let q = supabase
    .from("establishments")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  if (universe) q = q.eq("universe", universe);
  if (city) q = q.ilike("city", city);

  // Match on name OR subcategory OR tags
  q = q.or(
    `name.ilike.%${term}%,subcategory.ilike.%${term}%,tags.cs.{${term}}`,
  );

  const { count } = await q;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Level 1 — "Did you mean?" (trigram correction)
// ---------------------------------------------------------------------------

async function getDidYouMeanSuggestions(
  query: string,
  universe: string | null,
  city: string | null,
): Promise<FallbackSuggestion[]> {
  const supabase = getAdminSupabase();
  const normalized = normalizeQuery(query);

  // Two parallel queries: search_suggestions + establishment names
  const [suggestionsResult, namesResult] = await Promise.all([
    supabase.rpc("similarity_search_suggestions", {
      search_term: normalized,
      min_similarity: 0.3,
      result_limit: 5,
      filter_universe: universe,
    }).then(
      (res) => res.data as Array<{ term: string; sim: number }> | null,
      () => null,
    ),
    // Fallback: direct query if RPC doesn't exist
    supabase
      .from("search_suggestions")
      .select("term")
      .gt("search_count", 2)
      .eq("is_active", true)
      .ilike("term", `%${normalized.slice(0, 3)}%`)
      .limit(10)
      .then(
        (res) => res.data as Array<{ term: string }> | null,
        () => null,
      ),
  ]);

  // Collect candidate terms (deduplicated)
  const candidates = new Map<string, number>(); // term -> similarity approximation

  if (suggestionsResult) {
    for (const s of suggestionsResult) {
      if (s.sim > 0.3) candidates.set(s.term.toLowerCase(), s.sim);
    }
  }

  // If RPC fallback didn't work, try the basic ilike results
  if (!suggestionsResult && namesResult) {
    for (const n of namesResult) {
      const t = n.term.toLowerCase();
      if (t !== normalized && t.length > 2) {
        // Rough similarity: shared character ratio
        const shared = [...t].filter((c) => normalized.includes(c)).length;
        const approxSim = shared / Math.max(t.length, normalized.length);
        if (approxSim > 0.3) candidates.set(t, approxSim);
      }
    }
  }

  // Also check establishment names with trigram-like matching
  const { data: nameMatches } = await supabase
    .from("establishments")
    .select("name")
    .eq("status", "active")
    .ilike("name", `%${normalized.slice(0, Math.min(4, normalized.length))}%`)
    .limit(10);

  if (nameMatches) {
    for (const n of nameMatches) {
      const name = n.name.toLowerCase();
      if (name !== normalized) {
        // Simple char overlap similarity
        const shared = [...normalizeQuery(name)].filter((c) => normalized.includes(c)).length;
        const approxSim = shared / Math.max(name.length, normalized.length);
        if (approxSim > 0.35) {
          candidates.set(name, approxSim);
        }
      }
    }
  }

  if (candidates.size === 0) return [];

  // Sort by similarity DESC, take top 5
  const sorted = [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // For each candidate, run a count query to verify it yields results
  const results = await Promise.all(
    sorted.map(async ([term]) => {
      const count = await countEstablishments(term, universe, city);
      if (count === 0) return null;
      const qp: Record<string, string> = { q: term };
      if (universe) qp.universe = universe;
      if (city) qp.city = city;
      return { label: term, results_count: count, query_params: qp } as FallbackSuggestion;
    }),
  );

  return results.filter(Boolean).slice(0, 3) as FallbackSuggestion[];
}

// ---------------------------------------------------------------------------
// Level 2 — Semantic expansion (synonyms + word splitting)
// ---------------------------------------------------------------------------

async function getSemanticExpansion(
  query: string,
  universe: string | null,
  city: string | null,
): Promise<FallbackSuggestion[]> {
  const supabase = getAdminSupabase();
  const normalized = normalizeQuery(query);
  const words = normalized.split(/\s+/).filter((w) => w.length >= 3);

  const suggestions: FallbackSuggestion[] = [];

  // Strategy A: Look up synonyms for the full query or individual words
  const { data: synonymMatches } = await supabase
    .from("search_synonyms")
    .select("term, expanded_terms")
    .or(
      words.map((w) => `term.ilike.%${w}%`).join(","),
    )
    .limit(5);

  if (synonymMatches) {
    for (const syn of synonymMatches) {
      // Try the synonym term itself
      const synTerm = syn.term.toLowerCase();
      if (synTerm !== normalized) {
        const count = await countEstablishments(synTerm, universe, city);
        if (count > 0) {
          const qp: Record<string, string> = { q: synTerm };
          if (universe) qp.universe = universe;
          if (city) qp.city = city;
          suggestions.push({ label: synTerm, results_count: count, query_params: qp });
        }
      }

      // Try a key expanded term (first word different from original)
      const expanded = (syn.expanded_terms || "").split(/\s+/).filter((w: string) => w.length >= 3);
      for (const exp of expanded.slice(0, 3)) {
        const expLow = exp.toLowerCase();
        if (expLow !== normalized && !words.includes(expLow)) {
          const count = await countEstablishments(expLow, universe, city);
          if (count > 0) {
            const qp: Record<string, string> = { q: expLow };
            if (universe) qp.universe = universe;
            if (city) qp.city = city;
            suggestions.push({ label: expLow, results_count: count, query_params: qp });
            break; // one expanded term per synonym is enough
          }
        }
      }

      if (suggestions.length >= 3) break;
    }
  }

  // Strategy B: If multi-word query, try individual words
  if (words.length >= 2 && suggestions.length < 3) {
    for (const word of words) {
      if (suggestions.some((s) => s.label === word)) continue;
      const count = await countEstablishments(word, universe, city);
      if (count >= 3) {
        const qp: Record<string, string> = { q: word };
        if (universe) qp.universe = universe;
        if (city) qp.city = city;
        suggestions.push({ label: word, results_count: count, query_params: qp });
        if (suggestions.length >= 3) break;
      }
    }
  }

  return suggestions.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Level 3 — Filter relaxation
// ---------------------------------------------------------------------------

async function getRelaxedFilters(
  query: string,
  universe: string | null,
  city: string | null,
  filters: FallbackParams["filters"],
): Promise<FallbackRelaxedFilter[]> {
  const supabase = getAdminSupabase();
  const hasAnyFilter =
    filters.amenities.length > 0 ||
    filters.price_range.length > 0 ||
    filters.open_now ||
    filters.instant_booking ||
    filters.promo_only ||
    !!city;

  if (!hasAnyFilter) return [];

  // Build candidate relaxations
  type Candidate = { filter: string; label: string; queryOverride: Record<string, string> };
  const candidates: Candidate[] = [];

  if (filters.amenities.length > 0) {
    candidates.push({
      filter: "amenities",
      label: filters.amenities.join(", "),
      queryOverride: {},
    });
  }
  if (filters.open_now) {
    candidates.push({ filter: "open_now", label: "open_now", queryOverride: {} });
  }
  if (filters.instant_booking) {
    candidates.push({ filter: "instant_booking", label: "instant_booking", queryOverride: {} });
  }
  if (filters.price_range.length > 0) {
    candidates.push({
      filter: "price_range",
      label: filters.price_range.map((p) => "€".repeat(p)).join(", "),
      queryOverride: {},
    });
  }
  if (filters.promo_only) {
    candidates.push({ filter: "promo_only", label: "promotions", queryOverride: {} });
  }
  if (city) {
    candidates.push({ filter: "city", label: city, queryOverride: {} });
  }

  // Run count queries in parallel, each removing one filter
  const results = await Promise.all(
    candidates.map(async (cand) => {
      let q = supabase
        .from("establishments")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");

      if (universe) q = q.eq("universe", universe);

      // Apply all filters EXCEPT the one we're relaxing
      if (cand.filter !== "city" && city) q = q.ilike("city", city);
      // Note: amenities, open_now, price_range are post-fetch JS filters in the main handler,
      // but for count estimation we can only check DB-level filters.
      // name/subcategory/tags matching for the query
      if (query) {
        q = q.or(
          `name.ilike.%${query}%,subcategory.ilike.%${query}%,tags.cs.{${query}}`,
        );
      }

      const { count } = await q;
      const resultCount = count ?? 0;
      if (resultCount < 3) return null;

      // Build query_params that remove this specific filter
      const qp: Record<string, string> = { q: query };
      if (universe) qp.universe = universe;
      if (cand.filter !== "city" && city) qp.city = city;
      if (cand.filter !== "amenities" && filters.amenities.length > 0)
        qp.amenities = filters.amenities.join(",");
      if (cand.filter !== "price_range" && filters.price_range.length > 0)
        qp.price_range = filters.price_range.join(",");
      if (cand.filter !== "open_now" && filters.open_now) qp.open_now = "1";
      if (cand.filter !== "instant_booking" && filters.instant_booking) qp.instant_booking = "1";
      if (cand.filter !== "promo_only" && filters.promo_only) qp.promo = "1";

      return {
        removed_filter: cand.filter,
        label: cand.label,
        results_count: resultCount,
        query_params: qp,
      } as FallbackRelaxedFilter;
    }),
  );

  return results
    .filter(Boolean)
    .sort((a, b) => (b as FallbackRelaxedFilter).results_count - (a as FallbackRelaxedFilter).results_count)
    .slice(0, 3) as FallbackRelaxedFilter[];
}

// ---------------------------------------------------------------------------
// Level 4 — Nearby cities
// ---------------------------------------------------------------------------

async function getNearbyCities(
  query: string,
  universe: string | null,
  currentCity: string,
): Promise<FallbackNearby[]> {
  const supabase = getAdminSupabase();

  // Step 1: Get source city center coordinates
  const { data: sourceCoords } = await supabase
    .from("establishments")
    .select("lat, lng")
    .eq("status", "active")
    .ilike("city", currentCity)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .limit(20);

  if (!sourceCoords || sourceCoords.length === 0) return [];

  const srcLat = sourceCoords.reduce((s, e) => s + (e.lat as number), 0) / sourceCoords.length;
  const srcLng = sourceCoords.reduce((s, e) => s + (e.lng as number), 0) / sourceCoords.length;

  // Step 2: Find cities with matching results
  const { data: cityResults } = await supabase.rpc("nearby_city_counts", {
    search_term: query,
    exclude_city: currentCity,
    filter_universe: universe,
  }).then(
    (res) => res,
    // If RPC doesn't exist, fall back to direct query
    async () => {
      // Direct query fallback
      const { data } = await supabase
        .from("establishments")
        .select("city, lat, lng")
        .eq("status", "active")
        .not("city", "ilike", currentCity)
        .or(`name.ilike.%${query}%,subcategory.ilike.%${query}%,tags.cs.{${query}}`)
        .not("lat", "is", null)
        .not("lng", "is", null)
        .limit(100);

      if (!data) return { data: null };

      // Group by city manually
      const cityMap = new Map<string, { lat: number; lng: number; count: number }>();
      for (const e of data) {
        if (universe && (e as any).universe !== universe) continue;
        const c = (e as any).city as string;
        const existing = cityMap.get(c);
        if (existing) {
          existing.count++;
          existing.lat = (existing.lat * (existing.count - 1) + (e.lat as number)) / existing.count;
          existing.lng = (existing.lng * (existing.count - 1) + (e.lng as number)) / existing.count;
        } else {
          cityMap.set(c, { lat: e.lat as number, lng: e.lng as number, count: 1 });
        }
      }

      return {
        data: [...cityMap.entries()].map(([city, v]) => ({
          city,
          lat: v.lat,
          lng: v.lng,
          cnt: v.count,
        })),
      };
    },
  );

  if (!cityResults || (cityResults as any[]).length === 0) return [];

  // Step 3: Calculate distances and sort
  const nearby = (cityResults as Array<{ city: string; lat: number; lng: number; cnt: number }>)
    .map((c) => ({
      city: c.city,
      distance_km: Math.round(haversineKm({ lat: srcLat, lng: srcLng }, { lat: c.lat, lng: c.lng })),
      results_count: c.cnt,
    }))
    .filter((c) => c.results_count > 0 && c.distance_km < 500)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, 5);

  return nearby;
}

// ---------------------------------------------------------------------------
// Level 5 — Popular fallback (always returns results)
// ---------------------------------------------------------------------------

async function getPopularFallback(
  universe: string | null,
  city: string | null,
): Promise<FallbackPopularItem[]> {
  const supabase = getAdminSupabase();

  const fields = "id, name, slug, city, cover_url, avg_rating:rating_avg, subcategory";

  // Try with city first
  if (city) {
    const { data } = await supabase
      .from("establishments")
      .select(fields)
      .eq("status", "active")
      .ilike("city", city)
      .not("cover_url", "is", null)
      .order("activity_score", { ascending: false, nullsFirst: false })
      .order("rating_avg", { ascending: false, nullsFirst: false })
      .limit(5);

    if (data && data.length >= 3) {
      return data.map(mapPopularItem);
    }
  }

  // Fallback: same universe without city
  let q = supabase
    .from("establishments")
    .select(fields)
    .eq("status", "active")
    .not("cover_url", "is", null);

  if (universe) q = q.eq("universe", universe);

  q = q
    .order("activity_score", { ascending: false, nullsFirst: false })
    .order("rating_avg", { ascending: false, nullsFirst: false })
    .limit(5);

  const { data } = await q;
  return (data ?? []).map(mapPopularItem);
}

function mapPopularItem(e: any): FallbackPopularItem {
  return {
    id: e.id,
    name: e.name,
    slug: e.slug ?? "",
    city: e.city ?? "",
    cover_url: e.cover_url ?? null,
    avg_rating: e.avg_rating ?? null,
    subcategory: e.subcategory ?? null,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator — cascade through levels
// ---------------------------------------------------------------------------

export async function generateSearchFallback(
  params: FallbackParams,
): Promise<SearchFallbackResult | null> {
  const { query, universe, city, filters } = params;
  if (!query || query.trim().length < 2) return null;

  const cacheKey = buildCacheKey("fallback", {
    q: normalizeQuery(query),
    u: universe ?? "",
    c: city ?? "",
    f: JSON.stringify(filters),
  });

  return cachedQuery<SearchFallbackResult | null>(cacheKey, 300, async () => {
    // Level 5 (popular) always runs — start it immediately
    const popularPromise = getPopularFallback(universe, city);

    // Level 1 + Level 2 in parallel
    const [didYouMean, semanticExpansion] = await Promise.all([
      getDidYouMeanSuggestions(query, universe, city).catch(() => [] as FallbackSuggestion[]),
      getSemanticExpansion(query, universe, city).catch(() => [] as FallbackSuggestion[]),
    ]);

    const popular = await popularPromise;

    // Level 1 wins
    if (didYouMean.length > 0) {
      return { type: "did_you_mean" as const, suggestions: didYouMean, popular };
    }

    // Level 2 wins
    if (semanticExpansion.length > 0) {
      return { type: "semantic_expansion" as const, suggestions: semanticExpansion, popular };
    }

    // Level 3 — filter relaxation
    const hasFilters =
      filters.amenities.length > 0 ||
      filters.price_range.length > 0 ||
      filters.open_now ||
      filters.instant_booking ||
      filters.promo_only ||
      !!city;

    if (hasFilters) {
      try {
        const relaxed = await getRelaxedFilters(query, universe, city, filters);
        if (relaxed.length > 0) {
          return { type: "relax_filters" as const, relaxed_filters: relaxed, popular };
        }
      } catch (err) { log.warn({ err }, "Non-fatal: relaxed filters search failed"); }
    }

    // Level 4 — nearby cities
    if (city) {
      try {
        const nearby = await getNearbyCities(query, universe, city);
        if (nearby.length > 0) {
          return { type: "nearby_cities" as const, nearby, popular };
        }
      } catch (err) { log.warn({ err }, "Non-fatal: nearby cities search failed"); }
    }

    // Level 5 — popular only
    if (popular.length > 0) {
      return { type: "popular" as const, popular };
    }

    return null;
  });
}
