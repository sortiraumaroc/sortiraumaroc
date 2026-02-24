import type { Request, Response } from "express";

import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("publicConfig");

import {
  setBookingAttributionCookie,
} from "../lib/bookingAttribution";

import {
  getAdminSupabase,
  asString,
  asInt,
  getUserFromBearerToken,
  getSearchLang,
  getRequestIp,
  type PublicEstablishmentListItem,
  maxPromoPercent,
} from "./publicHelpers";

// ---------------------------------------------------------------------------
// PUBLIC UNIVERSES
// ---------------------------------------------------------------------------

export async function getPublicUniverses(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("universes")
    .select("slug,label_fr,label_en,icon_name,color,sort_order,image_url")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, universes: data ?? [] });
}

// ---------------------------------------------------------------------------
// PUBLIC HOME SETTINGS (Hero Background, etc.)
// ---------------------------------------------------------------------------

export async function getPublicHomeSettings(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("home_settings")
    .select("key,value");

  if (error) {
    // Table might not exist yet, return defaults
    return res.json({
      ok: true,
      settings: {
        hero: { background_image_url: null, overlay_opacity: 0.7 },
      },
    });
  }

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  // Ensure hero key exists with defaults
  if (!settings.hero) {
    settings.hero = { background_image_url: null, overlay_opacity: 0.7 };
  }

  res.json({ ok: true, settings });
}

// ---------------------------------------------------------------------------
// PUBLIC HOME CITIES
// ---------------------------------------------------------------------------

export async function getPublicHomeCities(req: Request, res: Response) {
  const supabase = getAdminSupabase();
  const countryCode = typeof req.query.country === "string" ? req.query.country.toUpperCase() : null;

  let query = supabase
    .from("home_cities")
    .select("id,name,slug,image_url,country_code")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  // Filter by country if specified
  if (countryCode) {
    query = query.eq("country_code", countryCode);
  }

  const { data, error } = await query;

  if (error) {
    // Table might not exist yet, return empty array
    if (error.code === "42P01") {
      return res.json({ ok: true, cities: [] });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, cities: data ?? [] });
}

// ---------------------------------------------------------------------------
// PUBLIC COUNTRIES
// ---------------------------------------------------------------------------

export async function getPublicCountries(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("countries")
    .select("id,name,name_en,code,flag_emoji,currency_code,is_default")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    // Table might not exist yet, return default Morocco
    if (error.code === "42P01") {
      return res.json({
        ok: true,
        countries: [
          { id: "default", name: "Maroc", name_en: "Morocco", code: "MA", flag_emoji: "🇲🇦", currency_code: "MAD", is_default: true }
        ]
      });
    }
    return res.status(500).json({ error: error.message });
  }

  // If no countries configured, return Morocco as default
  if (!data || data.length === 0) {
    return res.json({
      ok: true,
      countries: [
        { id: "default", name: "Maroc", name_en: "Morocco", code: "MA", flag_emoji: "🇲🇦", currency_code: "MAD", is_default: true }
      ]
    });
  }

  res.json({ ok: true, countries: data });
}

// ---------------------------------------------------------------------------
// DETECT USER COUNTRY (via IP geolocation)
// ---------------------------------------------------------------------------

export async function detectUserCountry(req: Request, res: Response) {
  // Get IP from various headers (for proxies/load balancers)
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.headers["x-real-ip"]?.toString() ||
    req.socket.remoteAddress ||
    "127.0.0.1";

  // For local development, return Morocco
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return res.json({ ok: true, country_code: "MA", detected: false, reason: "local" });
  }

  try {
    // Use free IP geolocation API (ip-api.com - free for non-commercial use)
    // For production, consider using a paid service like MaxMind, IPinfo, etc.
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
    if (response.ok) {
      const data = await response.json() as { countryCode?: string };
      if (data.countryCode) {
        return res.json({ ok: true, country_code: data.countryCode, detected: true });
      }
    }
  } catch (err) {
    log.warn({ err }, "country detection failed, returning default");
  }

  // Default to Morocco if detection fails
  res.json({ ok: true, country_code: "MA", detected: false, reason: "fallback" });
}

// ---------------------------------------------------------------------------
// PUBLIC HOME VIDEOS
// ---------------------------------------------------------------------------

export async function getPublicHomeVideos(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("home_videos")
    .select("id,youtube_url,title,description,thumbnail_url,establishment_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    // Table might not exist yet, return empty array
    if (error.code === "42P01") {
      return res.json({ ok: true, videos: [] });
    }
    return res.status(500).json({ error: error.message });
  }

  // Fetch establishment names for videos that have establishment_id
  const videos = data ?? [];
  const establishmentIds = videos
    .filter((v: any) => v.establishment_id)
    .map((v: any) => v.establishment_id);

  let establishmentMap: Record<string, { name: string; universe: string; slug: string | null }> = {};
  if (establishmentIds.length > 0) {
    const { data: establishments } = await supabase
      .from("establishments")
      .select("id,name,universe,slug")
      .in("id", establishmentIds);

    if (establishments) {
      for (const e of establishments as Array<{ id: string; name: string; universe: string; slug: string | null }>) {
        establishmentMap[e.id] = { name: e.name, universe: e.universe, slug: e.slug };
      }
    }
  }

  const enrichedVideos = videos.map((v: any) => ({
    id: v.id,
    youtube_url: v.youtube_url,
    title: v.title,
    description: v.description,
    thumbnail_url: v.thumbnail_url,
    establishment_id: v.establishment_id,
    establishment_name: v.establishment_id ? establishmentMap[v.establishment_id]?.name ?? null : null,
    establishment_universe: v.establishment_id ? establishmentMap[v.establishment_id]?.universe ?? null : null,
    establishment_slug: v.establishment_id ? establishmentMap[v.establishment_id]?.slug ?? null : null,
  }));

  res.json({ ok: true, videos: enrichedVideos });
}

// ---------------------------------------------------------------------------
// PUBLIC HOME TAKEOVER
// ---------------------------------------------------------------------------

export async function getPublicHomeTakeover(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  // Call the database function to get today's confirmed home takeover
  const { data, error } = await supabase.rpc("get_today_home_takeover");

  if (error) {
    // Table or function might not exist yet
    if (error.code === "42P01" || error.code === "42883") {
      return res.json({ ok: true, takeover: null });
    }
    return res.status(500).json({ error: error.message });
  }

  // The function returns a table, so data is an array
  const takeover = Array.isArray(data) && data.length > 0 ? data[0] : null;

  // If no takeover today or no visual assets configured, return null
  if (!takeover) {
    return res.json({ ok: true, takeover: null });
  }

  // Only return takeover if it has at least a headline or a banner
  const hasContent =
    takeover.headline ||
    takeover.banner_desktop_url ||
    takeover.banner_mobile_url;

  if (!hasContent) {
    return res.json({ ok: true, takeover: null });
  }

  res.json({ ok: true, takeover });
}

// ---------------------------------------------------------------------------
// PUBLIC ESTABLISHMENT BY USERNAME (for book.sam.ma/:username)
// ---------------------------------------------------------------------------

/**
 * Get establishment by username and set booking attribution cookie.
 * This endpoint is used by the direct booking page (book.sam.ma/:username).
 *
 * The cookie is HTTPOnly to prevent client-side manipulation (anti-cheat).
 * It contains the establishment ID and username, valid for 48 hours.
 *
 * Reservations made within 48h of visiting via this endpoint will be
 * attributed as "direct_link" and will NOT incur commission.
 */
export async function getPublicEstablishmentByUsername(
  req: Request,
  res: Response
) {
  const username = String(req.params.username ?? "").trim().toLowerCase();

  if (!username || username.length < 3) {
    return res.status(400).json({ error: "invalid_username" });
  }

  const supabase = getAdminSupabase();

  // Find establishment by username (case-insensitive)
  const { data: establishment, error: estError } = await supabase
    .from("establishments")
    .select(
      "id,slug,username,name,universe,subcategory,city,address,postal_code,region,country,lat,lng,description_short,description_long,phone,whatsapp,website,social_links,cover_url,gallery_urls,hours,tags,amenities,extra,booking_enabled,status,email"
    )
    .ilike("username", username)
    .eq("status", "active")
    .maybeSingle();

  if (estError) {
    return res.status(500).json({ error: estError.message });
  }

  if (!establishment) {
    return res.status(404).json({ error: "establishment_not_found" });
  }

  const establishmentId = String((establishment as any).id ?? "");
  const establishmentUsername = String((establishment as any).username ?? "");

  // Set the booking attribution cookie (HTTPOnly, 48h expiration)
  // This cookie will be read when creating a reservation to determine
  // if it's a "direct_link" (no commission) or "platform" (commission) booking.
  setBookingAttributionCookie(res, {
    slug: establishmentUsername,
    establishmentId: establishmentId,
  });

  // Fetch additional data (slots, packs, booking policy) like getPublicEstablishment
  const nowIso = new Date().toISOString();

  const [
    { data: slots, error: slotsError },
    { data: packs, error: packsError },
    { data: bookingPolicy, error: bookingPolicyError },
  ] = await Promise.all([
    supabase
      .from("pro_slots")
      .select(
        "id,starts_at,ends_at,capacity,base_price,promo_type,promo_value,promo_label,service_label"
      )
      .eq("establishment_id", establishmentId)
      .eq("active", true)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(500),
    supabase
      .from("pro_packs")
      .select(
        "id,title,description,label,items,price,original_price,is_limited,stock,availability,valid_from,valid_to,conditions,max_reservations"
      )
      .eq("establishment_id", establishmentId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("pro_booking_policies")
      .select("*")
      .eq("establishment_id", establishmentId)
      .maybeSingle(),
  ]);

  // Compute average rating
  let avgRating: number | null = null;
  let reviewCount = 0;
  try {
    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating")
      .eq("establishment_id", establishmentId)
      .eq("status", "approved")
      .limit(1000);

    if (reviews && reviews.length > 0) {
      reviewCount = reviews.length;
      const sum = reviews.reduce(
        (acc: number, r: any) => acc + (Number(r.rating) || 0),
        0
      );
      avgRating = Math.round((sum / reviewCount) * 10) / 10;
    }
  } catch (err) {
    log.warn({ err }, "avg rating calculation failed");
  }

  // Group slots by date (simplified for direct booking)
  const slotsByDate: Record<string, any[]> = {};
  for (const slot of (slots ?? []) as any[]) {
    const date = String(slot.starts_at ?? "").split("T")[0];
    if (!date) continue;
    if (!slotsByDate[date]) slotsByDate[date] = [];
    slotsByDate[date].push(slot);
  }

  res.json({
    ok: true,
    establishment: {
      ...establishment,
      avg_rating: avgRating,
      review_count: reviewCount,
    },
    slots: slots ?? [],
    slotsByDate,
    packs: packs ?? [],
    bookingPolicy: bookingPolicy ?? null,
    attributionSet: true, // Indicates the attribution cookie was set
  });
}

/**
 * Validate a promo code for a booking/reservation.
 * POST /api/public/booking/promo/validate
 *
 * Body: { code: string, establishmentId?: string }
 * Response: { valid: boolean, discount_bps?: number, message?: string }
 */
export async function validateBookingPromoCode(req: Request, res: Response) {
  const supabase = getAdminSupabase();
  try {
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    const establishmentId = req.body?.establishmentId
      ? String(req.body.establishmentId).trim()
      : null;

    if (!code) {
      return res.status(400).json({ valid: false, message: "Code requis" });
    }

    const { data: promo, error: promoErr } = await supabase
      .from("consumer_promo_codes")
      .select(
        "id,code,discount_bps,applies_to_establishment_ids,active,starts_at,ends_at,max_uses_total,max_uses_per_user,deleted_at"
      )
      .eq("code", code)
      .is("deleted_at", null)
      .maybeSingle();

    if (promoErr) {
      log.error({ err: promoErr }, "validateBookingPromoCode DB error");
      return res.status(500).json({ valid: false, message: "Erreur serveur" });
    }

    if (!promo) {
      return res.json({ valid: false, message: "Code promo invalide" });
    }

    // Check if active
    if (!promo.active) {
      return res.json({ valid: false, message: "Ce code promo n'est plus actif" });
    }

    // Check date validity
    const now = new Date();
    if (promo.starts_at && new Date(promo.starts_at) > now) {
      return res.json({ valid: false, message: "Ce code promo n'est pas encore valide" });
    }
    if (promo.ends_at && new Date(promo.ends_at) < now) {
      return res.json({ valid: false, message: "Ce code promo a expiré" });
    }

    // Check establishment scope if specified
    if (
      establishmentId &&
      promo.applies_to_establishment_ids &&
      Array.isArray(promo.applies_to_establishment_ids) &&
      promo.applies_to_establishment_ids.length > 0
    ) {
      if (!promo.applies_to_establishment_ids.includes(establishmentId)) {
        return res.json({
          valid: false,
          message: "Ce code promo n'est pas valide pour cet établissement",
        });
      }
    }

    // Check max total uses
    if (promo.max_uses_total != null && promo.max_uses_total > 0) {
      const { count, error: countErr } = await supabase
        .from("consumer_promo_code_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("promo_code_id", promo.id);

      if (!countErr && count != null && count >= promo.max_uses_total) {
        return res.json({
          valid: false,
          message: "Ce code promo a atteint son nombre maximum d'utilisations",
        });
      }
    }

    // Calculate discount percentage for display
    const discountPercent = Math.round(promo.discount_bps / 100);

    return res.json({
      valid: true,
      discount_bps: promo.discount_bps,
      discount_percent: discountPercent,
      message: `Code valide ! -${discountPercent}% sur votre réservation`,
      promo_id: promo.id,
    });
  } catch (err: any) {
    log.error({ err }, "validateBookingPromoCode error");
    return res.status(500).json({ valid: false, message: "Erreur serveur" });
  }
}

// ============================================
// SEARCH HISTORY
// ============================================

/** Extract optional consumer user ID from Bearer token (null if not authed) */
async function getOptionalSearchUserId(req: Request): Promise<string | null> {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;

  const supabase = getAdminSupabase();
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch (err) {
    log.warn({ err }, "getOptionalSearchUserId token validation failed");
    return null;
  }
}

/**
 * POST /api/public/search/history
 * Save a search to the search_history table.
 * - Authenticated users: stored with user_id
 * - Anonymous users: stored with session_id (generated client-side)
 * - Deduplicates: same query+universe within 30s is ignored
 * - Ignores empty queries or queries < 2 chars
 */
export async function saveSearchHistory(req: Request, res: Response) {
  try {
    const query = String(req.body.query ?? "").trim();
    const universe = asString(req.body.universe) ?? null;
    const city = asString(req.body.city) ?? null;
    const resultsCount = typeof req.body.results_count === "number" ? req.body.results_count : null;
    const filtersApplied = req.body.filters_applied && typeof req.body.filters_applied === "object"
      ? req.body.filters_applied
      : {};
    const sessionId = asString(req.body.session_id) ?? null;

    // Validate: reject empty or too-short queries
    if (!query || query.length < 2) {
      return res.status(400).json({ ok: false, error: "query_too_short" });
    }

    // Need either auth or session_id
    const userId = await getOptionalSearchUserId(req);
    if (!userId && !sessionId) {
      return res.status(400).json({ ok: false, error: "missing_identity" });
    }

    const supabase = getAdminSupabase();

    // Deduplication: check if same query+universe was saved within last 30s
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    let dedupeQuery = supabase
      .from("search_history")
      .select("id", { count: "exact", head: true })
      .eq("query", query)
      .gte("created_at", thirtySecondsAgo);

    if (universe) dedupeQuery = dedupeQuery.eq("universe", universe);
    if (userId) {
      dedupeQuery = dedupeQuery.eq("user_id", userId);
    } else {
      dedupeQuery = dedupeQuery.eq("session_id", sessionId);
    }

    const { count: dupeCount } = await dedupeQuery;
    if (dupeCount && dupeCount > 0) {
      return res.json({ ok: true, deduplicated: true });
    }

    // Insert into search_history
    const { data: inserted, error: insertError } = await supabase
      .from("search_history")
      .insert({
        user_id: userId,
        session_id: userId ? null : sessionId,
        query,
        universe,
        city,
        results_count: resultsCount,
        filters: filtersApplied,
      })
      .select("id")
      .single();

    if (insertError) {
      log.error({ err: insertError }, "saveSearchHistory insert error");
      return res.status(500).json({ ok: false, error: "insert_failed" });
    }

    return res.json({ ok: true, id: inserted?.id });
  } catch (err: any) {
    log.error({ err }, "saveSearchHistory error");
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}

/**
 * GET /api/public/search/history
 * Retrieve recent search history for a user or session.
 * - Deduplicates by query+universe (keeps most recent)
 * - Returns max 10 entries, default 5
 */
export async function getSearchHistoryList(req: Request, res: Response) {
  try {
    const limit = Math.min(Math.max(asInt(req.query.limit) ?? 5, 1), 10);
    const universe = asString(req.query.universe) ?? null;
    const sessionId = asString(req.query.session_id) ?? null;

    const userId = await getOptionalSearchUserId(req);
    if (!userId && !sessionId) {
      return res.json({ ok: true, history: [] });
    }

    const supabase = getAdminSupabase();

    // Fetch recent searches, ordered by created_at DESC
    // We fetch more than needed to allow for deduplication
    let query = supabase
      .from("search_history")
      .select("id,query,universe,city,results_count,created_at")
      .order("created_at", { ascending: false })
      .limit(limit * 3); // Over-fetch for dedup

    if (userId) {
      query = query.eq("user_id", userId);
    } else {
      query = query.eq("session_id", sessionId);
    }

    if (universe) {
      query = query.eq("universe", universe);
    }

    const { data, error } = await query;

    if (error) {
      // Gracefully degrade if search_history table doesn't exist yet
      log.warn({ err: error }, "getSearchHistoryList error (table may not exist)");
      return res.json({ ok: true, history: [] });
    }

    // Deduplicate by query+universe (keep most recent)
    const seen = new Set<string>();
    const deduplicated: Array<{
      id: string;
      query: string;
      universe: string | null;
      city: string | null;
      results_count: number | null;
      searched_at: string;
    }> = [];

    for (const row of data ?? []) {
      const key = `${String(row.query).toLowerCase()}::${row.universe ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduplicated.push({
        id: row.id,
        query: row.query,
        universe: row.universe,
        city: row.city,
        results_count: row.results_count,
        searched_at: row.created_at,
      });
      if (deduplicated.length >= limit) break;
    }

    return res.json({ ok: true, history: deduplicated });
  } catch (err: any) {
    log.error({ err }, "getSearchHistoryList error");
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}

/**
 * DELETE /api/public/search/history
 * Delete search history entries.
 * - Without ?query → delete all history for user/session
 * - With ?query=xxx → delete specific entry by query text
 * - With ?id=xxx → delete specific entry by ID
 */
export async function deleteSearchHistory(req: Request, res: Response) {
  try {
    const queryFilter = asString(req.query.query) ?? null;
    const idFilter = asString(req.query.id) ?? null;
    const sessionId = asString(req.query.session_id) ?? null;

    const userId = await getOptionalSearchUserId(req);
    if (!userId && !sessionId) {
      return res.status(400).json({ ok: false, error: "missing_identity" });
    }

    const supabase = getAdminSupabase();

    let deleteQuery = supabase.from("search_history").delete();

    // Scope to user or session
    if (userId) {
      deleteQuery = deleteQuery.eq("user_id", userId);
    } else {
      deleteQuery = deleteQuery.eq("session_id", sessionId);
    }

    // Optional filters
    if (idFilter) {
      deleteQuery = deleteQuery.eq("id", idFilter);
    } else if (queryFilter) {
      deleteQuery = deleteQuery.eq("query", queryFilter);
    }

    const { error } = await deleteQuery;

    if (error) {
      log.error({ err: error }, "deleteSearchHistory DB error");
      return res.status(500).json({ ok: false, error: "delete_failed" });
    }

    return res.json({ ok: true });
  } catch (err: any) {
    log.error({ err }, "deleteSearchHistory error");
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}

/**
 * PATCH /api/public/search/history/:id/click
 * Record which establishment was clicked from a search result.
 * Fire-and-forget analytics endpoint.
 */
export async function trackSearchClick(req: Request, res: Response) {
  try {
    const historyId = req.params.id;
    const establishmentId = asString(req.body.establishment_id);

    if (!historyId || !establishmentId) {
      return res.status(400).json({ ok: false, error: "missing_params" });
    }

    const supabase = getAdminSupabase();

    const { error } = await supabase
      .from("search_history")
      .update({ clicked_establishment_id: establishmentId })
      .eq("id", historyId);

    if (error) {
      log.error({ err: error }, "trackSearchClick DB error");
      // Don't fail — this is fire-and-forget analytics
    }

    return res.json({ ok: true });
  } catch (err: any) {
    log.error({ err }, "trackSearchClick error");
    return res.json({ ok: true }); // Don't fail
  }
}

// TODO: Add a cron job to clean up search_history entries older than 90 days
// DELETE FROM search_history WHERE created_at < NOW() - INTERVAL '90 days';

// ============================================================================
// SEO LANDING PAGES API
// ============================================================================

/**
 * GET /api/public/landing/:slug
 * Fetch a landing page by slug + filtered establishments with cursor pagination.
 */
export async function getPublicLandingPage(req: Request, res: Response) {
  const slug = typeof req.params.slug === "string" ? req.params.slug.trim() : "";
  if (!slug) return res.status(400).json({ error: "missing_slug" });

  const supabase = getAdminSupabase();

  // 1. Fetch landing page metadata
  const { data: landing, error: landingErr } = await supabase
    .from("landing_pages")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (landingErr || !landing) {
    return res.status(404).json({ error: "landing_page_not_found" });
  }

  // 2. Parse pagination params
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 12;
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 12;
  const cursor = (typeof req.query.cursor === "string" ? req.query.cursor : "") || null;
  const cursorScoreRaw = typeof req.query.cs === "string" ? Number(req.query.cs) : NaN;
  const cursorScore = Number.isFinite(cursorScoreRaw) ? cursorScoreRaw : null;
  const cursorDate = (typeof req.query.cd === "string" ? req.query.cd : "") || null;

  const universe = typeof landing.universe === "string" ? landing.universe : "";
  const city = typeof landing.city === "string" ? landing.city : null;
  const cuisineType = typeof landing.cuisine_type === "string" ? landing.cuisine_type : null;
  const category = typeof landing.category === "string" ? landing.category : null;

  const isFirstPage = !cursor;

  // 3. Determine search strategy
  // If cuisine_type or category exists, use scored search (full-text matching)
  // Otherwise (city-only), use direct Supabase query ordered by activity_score
  const searchQuery = cuisineType || category || null;

  let items: PublicEstablishmentListItem[] = [];
  let hasMore = false;
  let totalCount: number | null = null;

  if (searchQuery) {
    // ---- SCORED SEARCH PATH ----
    const searchLang = getSearchLang(req);
    const rpcParams: Record<string, unknown> = {
      search_query: searchQuery,
      filter_universe: universe || null,
      filter_city: city,
      result_limit: limit + 1,
      result_offset: 0,
      search_lang: searchLang,
    };
    if (cursor && cursorScore !== null) {
      rpcParams.cursor_score = cursorScore;
      rpcParams.cursor_id = cursor;
    }

    const [{ data: scoredResultsRaw, error: searchErr }, countResult] = await Promise.all([
      supabase.rpc("search_establishments_scored", rpcParams),
      isFirstPage
        ? supabase.rpc("count_establishments_scored", {
            search_query: searchQuery,
            filter_universe: universe || null,
            filter_city: city,
            search_lang: searchLang,
          })
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (searchErr) {
      log.error({ err: searchErr }, "landing scored search failed");
      return res.status(500).json({ error: "search_failed" });
    }

    const scored = ((scoredResultsRaw ?? []) as Array<Record<string, unknown>>).filter(
      (r) => r.cover_url && r.cover_url !== ""
    );
    hasMore = scored.length > limit;
    const scoredResults = hasMore ? scored.slice(0, limit) : scored;
    totalCount = isFirstPage && countResult.data != null ? Number(countResult.data) : null;

    // Fetch slots + reservations + geo data for enrichment
    const ids = scoredResults.map((e) => String(e.id ?? "")).filter(Boolean);
    const nowIso = new Date().toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: slots }, { data: reservations }, { data: geoRows }] = await Promise.all([
      ids.length
        ? supabase.from("pro_slots").select("establishment_id,starts_at,promo_type,promo_value,active")
            .in("establishment_id", ids).eq("active", true).gte("starts_at", nowIso)
            .order("starts_at", { ascending: true }).limit(5000)
        : Promise.resolve({ data: [] as unknown[] }),
      ids.length
        ? supabase.from("reservations").select("establishment_id,created_at,status")
            .in("establishment_id", ids).gte("created_at", thirtyDaysAgo)
            .in("status", ["confirmed", "pending_pro_validation", "requested"]).limit(5000)
        : Promise.resolve({ data: [] as unknown[] }),
      // Fetch lat/lng/address/neighborhood (not returned by scored RPC)
      ids.length
        ? supabase.from("establishments").select("id,lat,lng,address,neighborhood,booking_enabled")
            .in("id", ids)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    // Build geo lookup map
    const geoByEst = new Map<string, { lat: number | null; lng: number | null; address: string | null; neighborhood: string | null; booking_enabled: boolean | null }>();
    for (const g of (geoRows ?? []) as Array<Record<string, unknown>>) {
      const gid = typeof g.id === "string" ? g.id : "";
      if (!gid) continue;
      geoByEst.set(gid, {
        lat: typeof g.lat === "number" && Number.isFinite(g.lat) ? g.lat : null,
        lng: typeof g.lng === "number" && Number.isFinite(g.lng) ? g.lng : null,
        address: typeof g.address === "string" ? g.address : null,
        neighborhood: typeof g.neighborhood === "string" ? g.neighborhood : null,
        booking_enabled: typeof g.booking_enabled === "boolean" ? g.booking_enabled : null,
      });
    }

    const nextSlotByEst = new Map<string, string>();
    const promoByEst = new Map<string, number>();
    for (const s of (slots ?? []) as Array<Record<string, unknown>>) {
      const eid = typeof s.establishment_id === "string" ? s.establishment_id : "";
      const startsAt = typeof s.starts_at === "string" ? s.starts_at : "";
      if (!eid || !startsAt) continue;
      if (!nextSlotByEst.has(eid)) nextSlotByEst.set(eid, startsAt);
      const promo = maxPromoPercent(s.promo_type, s.promo_value);
      if (promo != null) promoByEst.set(eid, Math.max(promoByEst.get(eid) ?? 0, promo));
    }

    const reservationCountByEst = new Map<string, number>();
    for (const r of (reservations ?? []) as Array<Record<string, unknown>>) {
      const eid = typeof r.establishment_id === "string" ? r.establishment_id : "";
      if (!eid) continue;
      reservationCountByEst.set(eid, (reservationCountByEst.get(eid) ?? 0) + 1);
    }

    items = scoredResults.map((e) => {
      const id = String(e.id ?? "");
      if (!id) return null as unknown as PublicEstablishmentListItem;
      const isOnline = typeof e.is_online === "boolean" ? e.is_online : false;
      const activityScore = typeof e.activity_score === "number" ? e.activity_score : null;
      const geo = geoByEst.get(id);
      return {
        id,
        name: typeof e.name === "string" ? e.name : null,
        universe: typeof e.universe === "string" ? e.universe : null,
        subcategory: typeof e.subcategory === "string" ? e.subcategory : null,
        city: typeof e.city === "string" ? e.city : null,
        address: geo?.address ?? null,
        neighborhood: geo?.neighborhood ?? null,
        region: null,
        country: null,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        cover_url: typeof e.cover_url === "string" ? e.cover_url : null,
        booking_enabled: geo?.booking_enabled ?? null,
        promo_percent: promoByEst.get(id) ?? null,
        next_slot_at: nextSlotByEst.get(id) ?? null,
        reservations_30d: reservationCountByEst.get(id) ?? 0,
        avg_rating: typeof e.rating_avg === "number" ? e.rating_avg : null,
        review_count: 0,
        reviews_last_30d: 0,
        verified: typeof e.verified === "boolean" ? e.verified : false,
        premium: typeof e.premium === "boolean" ? e.premium : false,
        curated: typeof e.curated === "boolean" ? e.curated : false,
        tags: Array.isArray(e.tags) ? e.tags as string[] : null,
        slug: typeof e.slug === "string" ? e.slug : null,
        is_online: isOnline,
        activity_score: activityScore ?? undefined,
        relevance_score: typeof e.relevance_score === "number" ? e.relevance_score : undefined,
        total_score: typeof e.total_score === "number" ? e.total_score : undefined,
        google_rating: typeof e.google_rating === "number" ? e.google_rating : null,
        google_review_count: typeof e.google_review_count === "number" ? e.google_review_count : null,
      };
    }).filter(Boolean) as PublicEstablishmentListItem[];

    const lastItem = scoredResults.length > 0 ? scoredResults[scoredResults.length - 1] : null;
    const nextCursor = hasMore && lastItem ? String(lastItem.id) : null;
    const nextCursorScore = hasMore && lastItem ? Number(lastItem.total_score) : null;

    // 4. Fetch related landing pages
    const { data: relatedRaw } = await supabase
      .from("landing_pages")
      .select("slug,title_fr,title_en,h1_fr,h1_en,city,cuisine_type")
      .eq("is_active", true)
      .eq("universe", universe)
      .neq("slug", slug)
      .limit(20);

    return res.json({
      ok: true,
      landing,
      items,
      pagination: {
        next_cursor: nextCursor,
        next_cursor_score: nextCursorScore,
        next_cursor_date: null as string | null,
        has_more: hasMore,
        total_count: totalCount,
      },
      stats: { total_count: totalCount ?? items.length },
      related_landings: relatedRaw ?? [],
    });
  }

  // ---- FALLBACK PATH (city-only, no search query) ----
  let estQuery = supabase
    .from("establishments")
    .select(
      "id,slug,name,universe,subcategory,city,address,neighborhood,region,country,lat,lng,phone,cover_url,booking_enabled,updated_at,tags,amenities,is_online,activity_score,verified,premium,curated,google_rating,google_review_count,avg_rating,review_count,reviews_last_30d"
    )
    .eq("status", "active")
    .not("cover_url", "is", null)
    .neq("cover_url", "");

  if (universe) estQuery = estQuery.eq("universe", universe);
  if (city) estQuery = estQuery.ilike("city", city);
  if (category) estQuery = estQuery.ilike("subcategory", `%${category}%`);

  // Order by activity_score DESC for city landing pages (most active first)
  estQuery = estQuery
    .order("activity_score", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });

  // Cursor pagination (using updated_at + id as key)
  if (cursor && cursorDate) {
    estQuery = estQuery.or(
      `updated_at.lt.${cursorDate},and(updated_at.eq.${cursorDate},id.lt.${cursor})`
    );
  }
  estQuery = estQuery.limit(limit + 1);

  // Count on first page
  if (isFirstPage) {
    let countQuery = supabase
      .from("establishments")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .not("cover_url", "is", null)
      .neq("cover_url", "");
    if (universe) countQuery = countQuery.eq("universe", universe);
    if (city) countQuery = countQuery.ilike("city", city);
    if (category) countQuery = countQuery.ilike("subcategory", `%${category}%`);
    const { count } = await countQuery;
    totalCount = typeof count === "number" ? count : null;
  }

  const { data: establishments, error: estErr } = await estQuery;
  if (estErr) return res.status(500).json({ error: estErr.message });

  const estArrRaw = (establishments ?? []) as Array<Record<string, unknown>>;
  hasMore = estArrRaw.length > limit;
  const estArr = hasMore ? estArrRaw.slice(0, limit) : estArrRaw;

  // Fetch slots + reservations
  const ids = estArr.map((e) => String(e.id ?? "")).filter(Boolean);
  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: slots }, { data: reservations }] = await Promise.all([
    ids.length
      ? supabase.from("pro_slots").select("establishment_id,starts_at,promo_type,promo_value,active")
          .in("establishment_id", ids).eq("active", true).gte("starts_at", nowIso)
          .order("starts_at", { ascending: true }).limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
    ids.length
      ? supabase.from("reservations").select("establishment_id,created_at,status")
          .in("establishment_id", ids).gte("created_at", thirtyDaysAgo)
          .in("status", ["confirmed", "pending_pro_validation", "requested"]).limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const nextSlotByEst = new Map<string, string>();
  const promoByEst = new Map<string, number>();
  for (const s of (slots ?? []) as Array<Record<string, unknown>>) {
    const eid = typeof s.establishment_id === "string" ? s.establishment_id : "";
    const startsAt = typeof s.starts_at === "string" ? s.starts_at : "";
    if (!eid || !startsAt) continue;
    if (!nextSlotByEst.has(eid)) nextSlotByEst.set(eid, startsAt);
    const promo = maxPromoPercent(s.promo_type, s.promo_value);
    if (promo != null) promoByEst.set(eid, Math.max(promoByEst.get(eid) ?? 0, promo));
  }

  const reservationCountByEst = new Map<string, number>();
  for (const r of (reservations ?? []) as Array<Record<string, unknown>>) {
    const eid = typeof r.establishment_id === "string" ? r.establishment_id : "";
    if (!eid) continue;
    reservationCountByEst.set(eid, (reservationCountByEst.get(eid) ?? 0) + 1);
  }

  items = estArr.map((e) => {
    const id = typeof e.id === "string" ? e.id : "";
    if (!id) return null as unknown as PublicEstablishmentListItem;
    const isOnline = typeof e.is_online === "boolean" ? e.is_online : false;
    const activityScore = typeof e.activity_score === "number" && Number.isFinite(e.activity_score) ? e.activity_score : null;
    return {
      id,
      name: typeof e.name === "string" ? e.name : null,
      universe: typeof e.universe === "string" ? e.universe : null,
      subcategory: typeof e.subcategory === "string" ? e.subcategory : null,
      city: typeof e.city === "string" ? e.city : null,
      address: typeof e.address === "string" ? e.address : null,
      neighborhood: typeof e.neighborhood === "string" ? e.neighborhood : null,
      region: typeof e.region === "string" ? e.region : null,
      country: typeof e.country === "string" ? e.country : null,
      lat: typeof e.lat === "number" && Number.isFinite(e.lat) ? e.lat : null,
      lng: typeof e.lng === "number" && Number.isFinite(e.lng) ? e.lng : null,
      cover_url: typeof e.cover_url === "string" ? e.cover_url : null,
      booking_enabled: typeof e.booking_enabled === "boolean" ? e.booking_enabled : null,
      promo_percent: promoByEst.get(id) ?? null,
      next_slot_at: nextSlotByEst.get(id) ?? null,
      reservations_30d: reservationCountByEst.get(id) ?? 0,
      avg_rating: typeof e.avg_rating === "number" ? e.avg_rating : null,
      review_count: typeof e.review_count === "number" ? e.review_count : 0,
      reviews_last_30d: typeof e.reviews_last_30d === "number" ? e.reviews_last_30d : 0,
      verified: typeof e.verified === "boolean" ? e.verified : false,
      premium: typeof e.premium === "boolean" ? e.premium : false,
      curated: typeof e.curated === "boolean" ? e.curated : false,
      tags: Array.isArray(e.tags) ? (e.tags as string[]) : null,
      slug: typeof e.slug === "string" ? e.slug : null,
      is_online: isOnline,
      activity_score: activityScore ?? undefined,
      google_rating: typeof e.google_rating === "number" ? e.google_rating : null,
      google_review_count: typeof e.google_review_count === "number" ? e.google_review_count : null,
    };
  }).filter(Boolean) as PublicEstablishmentListItem[];

  const lastEstItem = estArr.length > 0 ? estArr[estArr.length - 1] : null;
  const nextCursorFallback = hasMore && lastEstItem && typeof lastEstItem.id === "string" ? lastEstItem.id : null;
  const nextCursorDateFallback = hasMore && lastEstItem && typeof lastEstItem.updated_at === "string" ? lastEstItem.updated_at : null;

  // Fetch related landing pages
  const { data: relatedRaw } = await supabase
    .from("landing_pages")
    .select("slug,title_fr,title_en,h1_fr,h1_en,city,cuisine_type")
    .eq("is_active", true)
    .eq("universe", universe)
    .neq("slug", slug)
    .limit(20);

  return res.json({
    ok: true,
    landing,
    items,
    pagination: {
      next_cursor: nextCursorFallback,
      next_cursor_score: null as number | null,
      next_cursor_date: nextCursorDateFallback,
      has_more: hasMore,
      total_count: totalCount,
    },
    stats: { total_count: totalCount ?? items.length },
    related_landings: relatedRaw ?? [],
  });
}

// In-memory cache for landing slug map (refresh every 5 min)
let _landingSlugCache: { data: unknown[]; ts: number } | null = null;
const LANDING_SLUG_CACHE_TTL = 5 * 60 * 1000;

/**
 * GET /api/public/landing-slugs
 * Lightweight list of all active landing pages for redirect lookup.
 */
export async function getPublicLandingSlugMap(_req: Request, res: Response) {
  const now = Date.now();
  if (_landingSlugCache && now - _landingSlugCache.ts < LANDING_SLUG_CACHE_TTL) {
    return res.json({ ok: true, slugs: _landingSlugCache.data });
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("landing_pages")
    .select("slug,universe,city,cuisine_type,category")
    .eq("is_active", true)
    .limit(1000);

  if (error) return res.status(500).json({ error: error.message });

  _landingSlugCache = { data: data ?? [], ts: now };
  return res.json({ ok: true, slugs: data ?? [] });
}
