/**
 * Google Places Rating Sync
 *
 * Endpoint to sync Google ratings for establishments that have a google_maps_url.
 * Should be called periodically (e.g., every 24h) via cron or admin trigger.
 *
 * Flow:
 * 1. Fetch all establishments with a non-empty google_maps_url
 * 2. For each, extract or lookup the Google Place ID
 * 3. Call Google Places Details API to get rating + user_ratings_total
 * 4. Update the establishment in DB
 */

import type { Request, Response, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";

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
  } catch {
    // Silently fail
  }

  return null;
}

/**
 * Get rating details from Google Places API
 */
async function getGoogleRating(
  placeId: string,
  apiKey: string,
): Promise<{ rating: number; reviewCount: number } | null> {
  try {
    const detailsUrl = new URL(`${GOOGLE_PLACES_BASE_URL}/details/json`);
    detailsUrl.searchParams.set("place_id", placeId);
    detailsUrl.searchParams.set("fields", "rating,user_ratings_total");
    detailsUrl.searchParams.set("key", apiKey);

    const res = await fetch(detailsUrl.toString());
    if (!res.ok) return null;

    const data = await res.json() as {
      result?: { rating?: number; user_ratings_total?: number };
      status: string;
    };

    if (data.status !== "OK" || !data.result) return null;

    return {
      rating: data.result.rating ?? 0,
      reviewCount: data.result.user_ratings_total ?? 0,
    };
  } catch {
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
    .select("id,name,city,google_maps_url,google_place_id,google_rating_updated_at")
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

    // Step 2: Fetch rating from Google
    const ratingData = await getGoogleRating(placeId, apiKey);

    if (!ratingData) {
      results.push({ id: estId, name, status: "api_error" });
      continue;
    }

    // Step 3: Update DB
    const { error: updateErr } = await supabase
      .from("establishments")
      .update({
        google_rating: ratingData.rating,
        google_review_count: ratingData.reviewCount,
        google_place_id: placeId,
        google_rating_updated_at: new Date().toISOString(),
      })
      .eq("id", estId);

    if (updateErr) {
      results.push({ id: estId, name, status: "api_error" });
    } else {
      results.push({
        id: estId,
        name,
        status: "ok",
        rating: ratingData.rating,
        reviewCount: ratingData.reviewCount,
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
