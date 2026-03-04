/**
 * Google Places Lookup — Recherche & preview d'un lieu Google Maps
 *
 * POST /api/admin/google-places/lookup
 *   - Accepte un lien Google Maps OU un nom+ville
 *   - Retourne les infos extraites (adresse, tél, site, horaires, note)
 *   - Détecte les doublons potentiels en base
 */

import type { RequestHandler } from "express";
import type { Express } from "express";
import { requireAdminKey, isRecord, asString } from "./adminHelpers";
import { getAdminSupabase } from "../supabaseAdmin";
import { normalizeEstName } from "./adminEstablishments";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("googlePlacesLookup");

const GOOGLE_PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";

function getApiKey(): string {
  return process.env.GOOGLE_PLACES_API_KEY || "";
}

// =============================================================================
// Google Places helpers
// =============================================================================

/** Extrait un Place ID depuis une URL Google Maps (ou fallback via Find Place API) */
async function extractPlaceId(
  googleMapsUrl: string,
  name: string,
  city: string,
  apiKey: string,
): Promise<string | null> {
  if (!googleMapsUrl && !name) return null;

  if (googleMapsUrl.startsWith("ChIJ")) return googleMapsUrl;

  const placeIdMatch =
    googleMapsUrl.match(/!1s(0x[a-f0-9]+:[a-f0-9]+)/i) ||
    googleMapsUrl.match(/place_id[=:]([A-Za-z0-9_-]+)/);
  if (placeIdMatch) return placeIdMatch[1];

  // Fallback : Find Place from Text
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

    const data = (await res.json()) as {
      candidates?: Array<{ place_id?: string }>;
      status: string;
    };

    if (data.status === "OK" && data.candidates?.[0]?.place_id) {
      return data.candidates[0].place_id;
    }
  } catch (err) {
    log.warn({ err }, "Find Place API call failed");
  }

  return null;
}

/** Récupère les détails complets d'un lieu Google */
async function getPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<GooglePlaceDetails | null> {
  try {
    const detailsUrl = new URL(`${GOOGLE_PLACES_BASE_URL}/details/json`);
    detailsUrl.searchParams.set("place_id", placeId);
    detailsUrl.searchParams.set(
      "fields",
      "place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,geometry,opening_hours,rating,user_ratings_total,url,types",
    );
    detailsUrl.searchParams.set("key", apiKey);
    detailsUrl.searchParams.set("language", "fr");

    const res = await fetch(detailsUrl.toString());
    if (!res.ok) return null;

    const data = (await res.json()) as {
      result?: GooglePlaceDetails;
      status: string;
    };

    if (data.status === "OK" && data.result) {
      return data.result;
    }
  } catch (err) {
    log.warn({ err }, "Place Details API call failed");
  }

  return null;
}

type GooglePlaceDetails = {
  place_id: string;
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  geometry?: { location: { lat: number; lng: number } };
  opening_hours?: { weekday_text?: string[] };
  rating?: number;
  user_ratings_total?: number;
  url?: string;
  types?: string[];
};

/** Convertit les horaires Google en objet { monday: "09:00 – 22:00", ... } */
function convertOpeningHours(
  weekdayText: string[] | undefined,
): Record<string, string> | null {
  if (!weekdayText?.length) return null;

  const dayMapping: Record<string, string> = {
    lundi: "monday",
    mardi: "tuesday",
    mercredi: "wednesday",
    jeudi: "thursday",
    vendredi: "friday",
    samedi: "saturday",
    dimanche: "sunday",
  };

  const hours: Record<string, string> = {};
  for (const text of weekdayText) {
    const [dayFr, time] = text.split(": ");
    const dayKey = dayMapping[dayFr?.toLowerCase()];
    if (dayKey && time) {
      hours[dayKey] = time;
    }
  }

  return Object.keys(hours).length > 0 ? hours : null;
}

/** Extrait la ville depuis l'adresse formatée Google */
function extractCityFromAddress(address: string | undefined): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim());
  const marocIndex = parts.findIndex(
    (p) =>
      p.toLowerCase().includes("maroc") ||
      p.toLowerCase().includes("morocco"),
  );
  if (marocIndex > 0) {
    return parts[marocIndex - 1].replace(/\d+/g, "").trim();
  }
  return "";
}

// =============================================================================
// Duplicate detection
// =============================================================================

type DuplicateCandidate = {
  id: string;
  name: string;
  city: string | null;
  score: number;
  reasons: string[];
};

/** Simple Levenshtein distance (cas normalisé) */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (!la || !lb) return 0;

  const matrix: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return 1 - matrix[la][lb] / Math.max(la, lb);
}

/** Cherche les doublons en base pour un nom + ville donnés */
async function findDuplicatesInDb(
  name: string,
  city: string,
  phone?: string | null,
  googlePlaceId?: string | null,
): Promise<{ candidates: DuplicateCandidate[]; isLikelyDuplicate: boolean }> {
  const supabase = getAdminSupabase();
  const normalizedName = normalizeEstName(name);
  const normalizedCity = normalizeEstName(city);
  const candidates: DuplicateCandidate[] = [];

  // 1. Vérifier par google_place_id (match certain)
  if (googlePlaceId) {
    const { data } = await supabase
      .from("establishments")
      .select("id, name, city")
      .eq("google_place_id", googlePlaceId)
      .limit(5);

    if (data?.length) {
      for (const row of data) {
        candidates.push({
          id: row.id,
          name: row.name ?? "",
          city: row.city,
          score: 100,
          reasons: ["google_place_id exact"],
        });
      }
      return { candidates, isLikelyDuplicate: true };
    }
  }

  // 2. Chercher par nom + ville (similaires)
  const { data: sameCityRows } = await supabase
    .from("establishments")
    .select("id, name, city, phone")
    .ilike("city", `%${city}%`)
    .limit(200);

  if (sameCityRows?.length) {
    for (const row of sameCityRows) {
      const rowNorm = normalizeEstName(row.name);
      const sim = levenshteinSimilarity(normalizedName, rowNorm);

      if (sim >= 0.8) {
        const reasons: string[] = [`name_match:${Math.round(sim * 100)}%`];
        let score = Math.round(sim * 60);

        // Bonus si même ville exacte
        if (normalizeEstName(row.city) === normalizedCity) {
          score += 20;
          reasons.push("same_city");
        }

        // Bonus si même téléphone
        if (phone && row.phone && normalizePhone(phone) === normalizePhone(row.phone)) {
          score += 20;
          reasons.push("phone_match");
        }

        candidates.push({
          id: row.id,
          name: row.name ?? "",
          city: row.city,
          score: Math.min(100, score),
          reasons,
        });
      }
    }
  }

  // 3. Chercher par téléphone
  if (phone) {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length >= 8) {
      const { data: phoneRows } = await supabase
        .from("establishments")
        .select("id, name, city, phone")
        .not("phone", "is", null)
        .limit(500);

      if (phoneRows?.length) {
        for (const row of phoneRows) {
          if (normalizePhone(row.phone) === normalizedPhone) {
            const existing = candidates.find((c) => c.id === row.id);
            if (existing) {
              if (!existing.reasons.includes("phone_match")) {
                existing.score = Math.min(100, existing.score + 20);
                existing.reasons.push("phone_match");
              }
            } else {
              candidates.push({
                id: row.id,
                name: row.name ?? "",
                city: row.city,
                score: 50,
                reasons: ["phone_match"],
              });
            }
          }
        }
      }
    }
  }

  // Trier par score descendant
  candidates.sort((a, b) => b.score - a.score);

  return {
    candidates: candidates.slice(0, 5),
    isLikelyDuplicate: candidates.some((c) => c.score >= 85),
  };
}

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").replace(/^212/, "0").replace(/^0{2,}/, "0");
}

// =============================================================================
// Route handler
// =============================================================================

const lookupHandler: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const body = isRecord(req.body) ? req.body : {};
  const googleMapsUrl = asString(body.google_maps_url) ?? "";
  const inputName = asString(body.name) ?? "";
  const inputCity = asString(body.city) ?? "";

  if (!googleMapsUrl && !inputName) {
    return res.status(400).json({ error: "google_maps_url ou name requis" });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY non configurée" });
  }

  // Si on a une URL Google Maps → fetch Place Details
  let place: Record<string, unknown> | null = null;
  let googlePlaceId: string | null = null;

  if (googleMapsUrl) {
    googlePlaceId = await extractPlaceId(googleMapsUrl, inputName, inputCity, apiKey);

    if (googlePlaceId) {
      const details = await getPlaceDetails(googlePlaceId, apiKey);
      if (details) {
        const extractedCity = extractCityFromAddress(details.formatted_address);
        place = {
          name: details.name ?? inputName,
          address: details.formatted_address ?? null,
          city: extractedCity || inputCity,
          phone: details.international_phone_number ?? details.formatted_phone_number ?? null,
          website: details.website ?? null,
          lat: details.geometry?.location.lat ?? null,
          lng: details.geometry?.location.lng ?? null,
          rating: details.rating ?? null,
          review_count: details.user_ratings_total ?? null,
          hours: convertOpeningHours(details.opening_hours?.weekday_text),
          google_maps_url: details.url ?? googleMapsUrl,
          google_place_id: googlePlaceId,
        };
      }
    }
  }

  // Données à utiliser pour la détection de doublons
  const checkName = (place?.name as string) || inputName;
  const checkCity = (place?.city as string) || inputCity;
  const checkPhone = (place?.phone as string) || null;

  if (!checkName) {
    return res.status(400).json({ error: "Impossible d'identifier le lieu" });
  }

  // Détection de doublons
  const { candidates, isLikelyDuplicate } = await findDuplicatesInDb(
    checkName,
    checkCity,
    checkPhone,
    googlePlaceId,
  );

  return res.json({
    place: place ?? { name: inputName, city: inputCity },
    duplicates: candidates,
    isLikelyDuplicate,
  });
};

// =============================================================================
// Register
// =============================================================================

export function registerGooglePlacesLookupRoutes(app: Express) {
  app.post("/api/admin/google-places/lookup", lookupHandler);
}
