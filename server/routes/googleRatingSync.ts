/**
 * Google Places Rating & Hours Sync
 *
 * Endpoint to sync Google ratings and opening hours for establishments
 * that have a google_maps_url.
 * Should be called periodically (e.g., every 24h) via cron or admin trigger.
 *
 * Flow:
 * 1. Fetch all establishments with a non-empty google_maps_url
 * 2. For each, extract or lookup the Google Place ID
 * 3. Call Google Places Details API to get rating + user_ratings_total + opening_hours
 * 4. Update the establishment in DB (rating + hours)
 */

import type { Request, Response, RequestHandler } from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("googleRatingSync");

const GOOGLE_PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";

function getApiKey(): string {
  return process.env.GOOGLE_PLACES_API_KEY || "";
}

/**
 * Extract a Google Place ID from a Google Maps URL.
 * Supports formats like:
 *   - https://www.google.com/maps/place/.../@33.5,...data=!...!1s0x...!2s<PLACE_ID>
 *   - https://maps.app.goo.gl/... (short link — needs redirect follow)
 *   - Direct Place ID if stored
 */
async function extractPlaceId(
  googleMapsUrl: string,
  name: string,
  city: string,
  apiKey: string,
): Promise<string | null> {
  if (!googleMapsUrl && !name) return null;

  // If it's already a Place ID (starts with ChIJ)
  if (googleMapsUrl.startsWith("ChIJ")) return googleMapsUrl;

  // Try to extract from URL patterns with data= parameter
  const placeIdMatch = googleMapsUrl.match(/!1s(0x[a-f0-9]+:[a-f0-9]+)/i)
    || googleMapsUrl.match(/place_id[=:]([A-Za-z0-9_-]+)/);
  if (placeIdMatch) return placeIdMatch[1];

  // Fallback: use Google Find Place from Text API
  const query = `${name} ${city}`.trim();
  if (!query) return null;

  try {
    const findUrl = new URL(`${GOOGLE_PLACES_BASE_URL}/findplacefromtext/json`);
    findUrl.searchParams.set("input", query);
    findUrl.searchParams.set("inputtype", "textquery");
    findUrl.searchParams.set("fields", "place_id");
    findUrl.searchParams.set("key", apiKey);
    findUrl.searchParams.set("language", "fr");

    const res = await fetch(findUrl.toString());
    if (!res.ok) return null;

    const data = await res.json() as {
      candidates?: Array<{ place_id?: string }>;
      status: string;
    };

    if (data.status === "OK" && data.candidates?.[0]?.place_id) {
      return data.candidates[0].place_id;
    }
  } catch (err) {
    log.warn({ err }, "Google Places findPlaceId API call failed");
  }

  return null;
}

// ---------------------------------------------------------------------------
// Google opening_hours → DB OpeningHours format
// ---------------------------------------------------------------------------

/**
 * Google Places API `opening_hours.periods` format:
 *   { open: { day: 0-6 (0=Sunday), time: "HHMM" }, close: { day, time } }
 *
 * DB OpeningHours format:
 *   { monday: [{ type: "lunch", from: "12:00", to: "15:00" }], ... }
 */

type GooglePeriod = {
  open: { day: number; time: string };
  close?: { day: number; time: string };
};

type OpeningInterval = { type: string; from: string; to: string };

const GOOGLE_DAY_TO_KEY: Record<number, string> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Convert "HHMM" → "HH:MM" */
function formatTime(hhmm: string): string {
  if (!hhmm || hhmm.length < 4) return "00:00";
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
}

/**
 * Transform Google Places `opening_hours.periods` to the DB OpeningHours format.
 * Groups periods by day and assigns type labels ("lunch", "dinner").
 */
function transformGoogleHoursToOpeningHours(
  periods: GooglePeriod[],
): Record<string, OpeningInterval[]> {
  // Handle 24/7 case: single period with open day=0, time=0000, no close
  if (
    periods.length === 1 &&
    periods[0].open.day === 0 &&
    periods[0].open.time === "0000" &&
    !periods[0].close
  ) {
    const result: Record<string, OpeningInterval[]> = {};
    for (const day of ALL_DAYS) {
      result[day] = [{ type: "lunch", from: "00:00", to: "23:59" }];
    }
    return result;
  }

  // Group periods by opening day
  const byDay: Record<string, { from: string; to: string }[]> = {};
  for (const day of ALL_DAYS) byDay[day] = [];

  for (const period of periods) {
    const dayKey = GOOGLE_DAY_TO_KEY[period.open.day];
    if (!dayKey) continue;

    const from = formatTime(period.open.time);
    const to = period.close ? formatTime(period.close.time) : "23:59";

    byDay[dayKey].push({ from, to });
  }

  // Sort ranges by opening time and assign type labels
  const result: Record<string, OpeningInterval[]> = {};
  const typeLabels = ["lunch", "dinner", "other"];

  for (const day of ALL_DAYS) {
    const ranges = byDay[day].sort((a, b) => a.from.localeCompare(b.from));
    result[day] = ranges.map((r, i) => ({
      type: typeLabels[i] ?? "other",
      from: r.from,
      to: r.to,
    }));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Google Places Details API
// ---------------------------------------------------------------------------

type PlaceDetailsResult = {
  rating: number;
  reviewCount: number;
  hours: Record<string, OpeningInterval[]> | null;
};

/**
 * Get rating + opening hours from Google Places API.
 */
async function getGooglePlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetailsResult | null> {
  try {
    const detailsUrl = new URL(`${GOOGLE_PLACES_BASE_URL}/details/json`);
    detailsUrl.searchParams.set("place_id", placeId);
    detailsUrl.searchParams.set("fields", "rating,user_ratings_total,opening_hours");
    detailsUrl.searchParams.set("key", apiKey);
    detailsUrl.searchParams.set("language", "fr");

    const res = await fetch(detailsUrl.toString());
    if (!res.ok) return null;

    const data = await res.json() as {
      result?: {
        rating?: number;
        user_ratings_total?: number;
        opening_hours?: {
          periods?: GooglePeriod[];
        };
      };
      status: string;
    };

    if (data.status !== "OK" || !data.result) return null;

    // Transform opening hours if available
    let hours: Record<string, OpeningInterval[]> | null = null;
    if (data.result.opening_hours?.periods && data.result.opening_hours.periods.length > 0) {
      hours = transformGoogleHoursToOpeningHours(data.result.opening_hours.periods);
    }

    return {
      rating: data.result.rating ?? 0,
      reviewCount: data.result.user_ratings_total ?? 0,
      hours,
    };
  } catch (err) {
    log.warn({ err }, "Google Places getGooglePlaceDetails API call failed");
    return null;
  }
}

/**
 * Sync Google ratings for all establishments.
 * GET /api/admin/cron/sync-google-ratings
 *
 * Query params:
 * - limit: max number of establishments to process (default 50)
 * - force: if "true", re-sync even if already synced within 24h
 */
export const syncGoogleRatings: RequestHandler = async (
  req: Request,
  res: Response,
) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({
      error: "GOOGLE_PLACES_API_KEY not configured",
    });
  }

  // Simple admin key check
  const adminKey = req.headers["x-admin-key"] || req.query.admin_key;
  const expectedKey = process.env.ADMIN_CRON_KEY || process.env.ADMIN_API_KEY;
  if (expectedKey && adminKey !== expectedKey) {
    // Also allow standard session auth
    const sessionToken = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!sessionToken) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  const limit = Math.min(
    200,
    Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50),
  );
  const force = req.query.force === "true";

  const supabase = getAdminSupabase();

  // Fetch establishments that have a google_maps_url and haven't been synced recently
  let query = supabase
    .from("establishments")
    .select("id,name,city,google_maps_url,google_place_id,google_rating_updated_at,hours")
    .eq("status", "active")
    .not("google_maps_url", "is", null)
    .neq("google_maps_url", "")
    .order("google_rating_updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (!force) {
    // Only sync those not updated in the last 24h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    query = query.or(`google_rating_updated_at.is.null,google_rating_updated_at.lt.${twentyFourHoursAgo}`);
  }

  const { data: establishments, error: fetchErr } = await query;

  if (fetchErr) {
    return res.status(500).json({ error: fetchErr.message });
  }

  if (!establishments || establishments.length === 0) {
    return res.json({ ok: true, synced: 0, message: "No establishments to sync" });
  }

  const results: Array<{
    id: string;
    name: string;
    status: "ok" | "no_place_id" | "api_error";
    rating?: number;
    reviewCount?: number;
    hoursSynced?: boolean;
  }> = [];

  for (const est of establishments) {
    const estId = String(est.id);
    const name = String(est.name ?? "");
    const city = String(est.city ?? "");
    const googleMapsUrl = String(est.google_maps_url ?? "");
    let placeId = est.google_place_id ? String(est.google_place_id) : null;

    // Step 1: Resolve place ID if not already stored
    if (!placeId) {
      placeId = await extractPlaceId(googleMapsUrl, name, city, apiKey);
      if (placeId) {
        // Store the resolved place ID for future use
        await supabase
          .from("establishments")
          .update({ google_place_id: placeId })
          .eq("id", estId);
      }
    }

    if (!placeId) {
      results.push({ id: estId, name, status: "no_place_id" });
      // Still mark as checked so we don't retry too often
      await supabase
        .from("establishments")
        .update({ google_rating_updated_at: new Date().toISOString() })
        .eq("id", estId);
      continue;
    }

    // Step 2: Fetch rating + hours from Google
    const details = await getGooglePlaceDetails(placeId, apiKey);

    if (!details) {
      results.push({ id: estId, name, status: "api_error" });
      continue;
    }

    // Step 3: Build update payload
    const updatePayload: Record<string, unknown> = {
      google_rating: details.rating,
      google_review_count: details.reviewCount,
      google_place_id: placeId,
      google_rating_updated_at: new Date().toISOString(),
    };

    // Only set hours if the establishment doesn't already have them
    // (avoid overwriting manually-set hours)
    const existingHours = est.hours;
    const hasExistingHours = existingHours && typeof existingHours === "object"
      && Object.keys(existingHours as Record<string, unknown>).length > 0;

    let hoursSynced = false;
    if (details.hours && (!hasExistingHours || force)) {
      updatePayload.hours = details.hours;
      hoursSynced = true;
    }

    // Step 4: Update DB
    const { error: updateErr } = await supabase
      .from("establishments")
      .update(updatePayload)
      .eq("id", estId);

    if (updateErr) {
      results.push({ id: estId, name, status: "api_error" });
    } else {
      results.push({
        id: estId,
        name,
        status: "ok",
        rating: details.rating,
        reviewCount: details.reviewCount,
        hoursSynced,
      });
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  const synced = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status !== "ok").length;

  return res.json({
    ok: true,
    synced,
    failed,
    total: results.length,
    results,
  });
};

/**
 * Sync Google rating for a SINGLE establishment.
 * POST /api/admin/google-rating-sync/:establishmentId
 */
export const syncSingleGoogleRating: RequestHandler = async (
  req: Request,
  res: Response,
) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY not configured" });
  }

  const { establishmentId } = req.params;
  if (!establishmentId) {
    return res.status(400).json({ error: "establishmentId is required" });
  }

  const supabase = getAdminSupabase();

  const { data: est, error: fetchErr } = await supabase
    .from("establishments")
    .select("id,name,city,google_maps_url,google_place_id,hours")
    .eq("id", establishmentId)
    .single();

  if (fetchErr || !est) {
    return res.status(404).json({ error: "Establishment not found" });
  }

  const name = String(est.name ?? "");
  const city = String(est.city ?? "");
  const googleMapsUrl = String(est.google_maps_url ?? "");
  let placeId = est.google_place_id ? String(est.google_place_id) : null;

  if (!googleMapsUrl && !placeId) {
    return res.status(400).json({
      error: "Cet établissement n'a pas de lien Google Maps. Ajoutez-en un d'abord.",
    });
  }

  // Resolve place ID
  if (!placeId) {
    placeId = await extractPlaceId(googleMapsUrl, name, city, apiKey);
    if (placeId) {
      await supabase
        .from("establishments")
        .update({ google_place_id: placeId })
        .eq("id", establishmentId);
    }
  }

  if (!placeId) {
    return res.status(422).json({
      error: "Impossible de trouver le Place ID Google pour cet établissement.",
    });
  }

  // Fetch rating + hours
  const details = await getGooglePlaceDetails(placeId, apiKey);

  if (!details) {
    return res.status(502).json({ error: "Erreur lors de la récupération des données Google." });
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    google_rating: details.rating,
    google_review_count: details.reviewCount,
    google_place_id: placeId,
    google_rating_updated_at: new Date().toISOString(),
  };

  // For single sync, always update hours if available from Google
  // (admin explicitly triggered sync for this establishment)
  let hoursSynced = false;
  if (details.hours) {
    updatePayload.hours = details.hours;
    hoursSynced = true;
  }

  // Update DB
  const { error: updateErr } = await supabase
    .from("establishments")
    .update(updatePayload)
    .eq("id", establishmentId);

  if (updateErr) {
    return res.status(500).json({ error: updateErr.message });
  }

  return res.json({
    ok: true,
    rating: details.rating,
    reviewCount: details.reviewCount,
    hoursSynced,
    updatedAt: new Date().toISOString(),
  });
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerGoogleRatingSyncRoutes(app: Express) {
  app.post("/api/admin/google-rating-sync", syncGoogleRatings);
  app.post("/api/admin/google-rating-sync/:establishmentId", syncSingleGoogleRating);
}
