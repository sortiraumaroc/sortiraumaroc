/**
 * Deduplicator - SAM Import CHR
 *
 * Détecte les doublons potentiels en staging et avec les établissements existants.
 * Utilise plusieurs critères: nom, téléphone, site web, distance géographique.
 */

import type {
  NormalizedPlace,
  DedupeCandidate,
  DedupeResult,
  StagingEntry,
} from "./connectors/types";
import {
  calculateNameSimilarity,
  calculateDistance,
  normalizeEstablishmentName,
  logImport,
} from "./utils";
import { getAdminSupabase } from "../supabaseAdmin";

// ============================================
// CONFIGURATION
// ============================================

/** Seuil de similarité de nom pour considérer un match */
const NAME_SIMILARITY_THRESHOLD = 0.85;

/** Distance maximale en mètres pour considérer un match géographique */
const MAX_DISTANCE_METERS = 100;

/** Score minimum pour considérer comme doublon probable */
const DUPLICATE_THRESHOLD = 85;

/** Poids des différents critères dans le score */
const WEIGHTS = {
  name: 40,
  phone: 25,
  website: 15,
  distance: 20,
};

// ============================================
// TYPES
// ============================================

interface ExistingEstablishment {
  id: string;
  name: string;
  name_normalized?: string;
  city: string;
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
  status: string;
}

interface StagingRecord {
  id: string;
  name: string;
  name_normalized: string;
  city: string;
  phone_e164?: string;
  website_url?: string;
  latitude?: number;
  longitude?: number;
}

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Recherche les doublons potentiels pour un lieu normalisé
 */
export async function findDuplicates(
  place: NormalizedPlace
): Promise<DedupeResult> {
  const candidates: DedupeCandidate[] = [];

  try {
    // 1. Chercher dans les établissements existants
    const existingDupes = await findDuplicatesInEstablishments(place);
    candidates.push(...existingDupes);

    // 2. Chercher dans le staging (autres imports en attente)
    const stagingDupes = await findDuplicatesInStaging(place);
    candidates.push(...stagingDupes);

    // Trier par score décroissant
    candidates.sort((a, b) => b.score - a.score);

    // Calculer le score de confiance (le plus haut score trouvé)
    const confidenceScore = candidates.length > 0 ? candidates[0].score : 0;
    const isLikelyDuplicate = confidenceScore >= DUPLICATE_THRESHOLD;

    return {
      candidates: candidates.slice(0, 5), // Max 5 candidats
      confidenceScore,
      isLikelyDuplicate,
      bestMatch: candidates[0],
    };
  } catch (error) {
    logImport("error", "deduplicator", "Error finding duplicates", {
      place: place.name,
      error: (error as Error).message,
    });

    return {
      candidates: [],
      confidenceScore: 0,
      isLikelyDuplicate: false,
    };
  }
}

/**
 * Recherche les doublons dans la table establishments
 */
async function findDuplicatesInEstablishments(
  place: NormalizedPlace
): Promise<DedupeCandidate[]> {
  const supabase = getAdminSupabase();
  const candidates: DedupeCandidate[] = [];

  // Recherche par nom similaire dans la même ville
  const { data: byName } = await supabase
    .from("establishments")
    .select("id, name, city, phone, website, lat, lng, status")
    .ilike("city", `%${place.city}%`)
    .not("status", "eq", "rejected")
    .limit(100);

  if (byName) {
    for (const est of byName) {
      const result = calculateMatchScore(place, {
        id: est.id,
        name: est.name || "",
        city: est.city || "",
        phone: est.phone,
        website: est.website,
        lat: est.lat,
        lng: est.lng,
        status: est.status || "",
      });

      if (result.score >= 50) {
        candidates.push({
          establishmentId: est.id,
          name: est.name || "",
          city: est.city || "",
          score: result.score,
          reasons: result.reasons,
        });
      }
    }
  }

  // Recherche par téléphone exact si disponible
  if (place.phoneE164) {
    const { data: byPhone } = await supabase
      .from("establishments")
      .select("id, name, city, phone, website, lat, lng, status")
      .eq("phone", place.phoneE164)
      .limit(10);

    if (byPhone) {
      for (const est of byPhone) {
        // Vérifier si pas déjà dans les candidats
        if (candidates.some((c) => c.establishmentId === est.id)) continue;

        candidates.push({
          establishmentId: est.id,
          name: est.name || "",
          city: est.city || "",
          score: 90, // Téléphone identique = très probable
          reasons: ["phone_exact_match"],
        });
      }
    }
  }

  return candidates;
}

/**
 * Recherche les doublons dans la table staging
 */
async function findDuplicatesInStaging(
  place: NormalizedPlace
): Promise<DedupeCandidate[]> {
  const supabase = getAdminSupabase();
  const candidates: DedupeCandidate[] = [];

  // Recherche par nom similaire dans la même ville
  const { data: byName } = await supabase
    .from("establishment_import_staging")
    .select("id, name, name_normalized, city, phone_e164, website_url, latitude, longitude")
    .ilike("city", `%${place.city}%`)
    .in("status", ["new", "reviewed", "approved"])
    .limit(100);

  if (byName) {
    for (const staging of byName) {
      const result = calculateMatchScoreFromStaging(place, {
        id: staging.id,
        name: staging.name,
        name_normalized: staging.name_normalized,
        city: staging.city,
        phone_e164: staging.phone_e164,
        website_url: staging.website_url,
        latitude: staging.latitude,
        longitude: staging.longitude,
      });

      if (result.score >= 50) {
        candidates.push({
          stagingId: staging.id,
          name: staging.name,
          city: staging.city,
          score: result.score,
          reasons: result.reasons,
        });
      }
    }
  }

  return candidates;
}

// ============================================
// CALCUL DE SCORE
// ============================================

interface MatchResult {
  score: number;
  reasons: string[];
}

/**
 * Calcule le score de correspondance avec un établissement existant
 */
function calculateMatchScore(
  place: NormalizedPlace,
  existing: ExistingEstablishment
): MatchResult {
  let score = 0;
  const reasons: string[] = [];

  // 1. Similarité du nom
  const existingNameNorm =
    existing.name_normalized || normalizeEstablishmentName(existing.name);
  const nameSimilarity = calculateNameSimilarity(place.name, existing.name);

  if (nameSimilarity >= NAME_SIMILARITY_THRESHOLD) {
    const nameScore = Math.round(nameSimilarity * WEIGHTS.name);
    score += nameScore;
    reasons.push(`name_match:${Math.round(nameSimilarity * 100)}`);
  }

  // 2. Téléphone identique
  if (place.phoneE164 && existing.phone) {
    const placePhone = place.phoneE164.replace(/\D/g, "");
    const existingPhone = existing.phone.replace(/\D/g, "");

    if (placePhone === existingPhone || placePhone.endsWith(existingPhone.slice(-9))) {
      score += WEIGHTS.phone;
      reasons.push("phone_match");
    }
  }

  // 3. Website identique
  if (place.websiteUrl && existing.website) {
    const placeHost = extractHostname(place.websiteUrl);
    const existingHost = extractHostname(existing.website);

    if (placeHost && existingHost && placeHost === existingHost) {
      score += WEIGHTS.website;
      reasons.push("website_match");
    }
  }

  // 4. Distance géographique
  if (
    place.latitude &&
    place.longitude &&
    existing.lat &&
    existing.lng
  ) {
    const distance = calculateDistance(
      place.latitude,
      place.longitude,
      existing.lat,
      existing.lng
    );

    if (distance <= MAX_DISTANCE_METERS) {
      const distanceScore = Math.round(
        (1 - distance / MAX_DISTANCE_METERS) * WEIGHTS.distance
      );
      score += distanceScore;
      reasons.push(`distance:${Math.round(distance)}m`);
    }
  }

  return { score, reasons };
}

/**
 * Calcule le score de correspondance avec une entrée staging
 */
function calculateMatchScoreFromStaging(
  place: NormalizedPlace,
  staging: StagingRecord
): MatchResult {
  let score = 0;
  const reasons: string[] = [];

  // 1. Similarité du nom
  const nameSimilarity = calculateNameSimilarity(place.name, staging.name);

  if (nameSimilarity >= NAME_SIMILARITY_THRESHOLD) {
    const nameScore = Math.round(nameSimilarity * WEIGHTS.name);
    score += nameScore;
    reasons.push(`name_match:${Math.round(nameSimilarity * 100)}`);
  }

  // 2. Téléphone identique
  if (place.phoneE164 && staging.phone_e164) {
    if (place.phoneE164 === staging.phone_e164) {
      score += WEIGHTS.phone;
      reasons.push("phone_match");
    }
  }

  // 3. Website identique
  if (place.websiteUrl && staging.website_url) {
    const placeHost = extractHostname(place.websiteUrl);
    const stagingHost = extractHostname(staging.website_url);

    if (placeHost && stagingHost && placeHost === stagingHost) {
      score += WEIGHTS.website;
      reasons.push("website_match");
    }
  }

  // 4. Distance géographique
  if (
    place.latitude &&
    place.longitude &&
    staging.latitude &&
    staging.longitude
  ) {
    const distance = calculateDistance(
      place.latitude,
      place.longitude,
      staging.latitude,
      staging.longitude
    );

    if (distance <= MAX_DISTANCE_METERS) {
      const distanceScore = Math.round(
        (1 - distance / MAX_DISTANCE_METERS) * WEIGHTS.distance
      );
      score += distanceScore;
      reasons.push(`distance:${Math.round(distance)}m`);
    }
  }

  return { score, reasons };
}

// ============================================
// HELPERS
// ============================================

/**
 * Extrait le hostname d'une URL
 */
function extractHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// ============================================
// BATCH DEDUPLICATION
// ============================================

/**
 * Déduplique un batch de lieux normalisés
 * Retourne les lieux avec leurs résultats de déduplication
 */
export async function deduplicateBatch(
  places: NormalizedPlace[]
): Promise<Array<{ place: NormalizedPlace; dedupe: DedupeResult }>> {
  const results: Array<{ place: NormalizedPlace; dedupe: DedupeResult }> = [];

  // Dédupliquer aussi entre les places du batch
  const seenInBatch = new Map<string, NormalizedPlace>();

  for (const place of places) {
    // Vérifier les doublons dans la DB
    const dedupe = await findDuplicates(place);

    // Vérifier aussi les doublons dans le batch courant
    const batchKey = `${place.city.toLowerCase()}_${place.nameNormalized}`;
    const existingInBatch = seenInBatch.get(batchKey);

    if (existingInBatch) {
      // Fusionner avec l'existant du batch
      const batchCandidate: DedupeCandidate = {
        name: existingInBatch.name,
        city: existingInBatch.city,
        score: 95,
        reasons: ["batch_duplicate"],
      };

      if (!dedupe.candidates.some((c) => c.score >= 95)) {
        dedupe.candidates.unshift(batchCandidate);
        dedupe.confidenceScore = Math.max(dedupe.confidenceScore, 95);
        dedupe.isLikelyDuplicate = true;
        dedupe.bestMatch = batchCandidate;
      }
    } else {
      seenInBatch.set(batchKey, place);
    }

    results.push({ place, dedupe });
  }

  // Stats
  const duplicates = results.filter((r) => r.dedupe.isLikelyDuplicate).length;
  logImport(
    "info",
    "deduplicator",
    `Deduplicated ${places.length} places: ${duplicates} probable duplicates found`
  );

  return results;
}

// ============================================
// UTILITAIRES DB
// ============================================

/**
 * Recherche rapide par nom normalisé avec pg_trgm
 * (Nécessite l'extension pg_trgm activée)
 */
export async function searchByNameSimilarity(
  nameNormalized: string,
  city: string,
  minSimilarity: number = 0.7
): Promise<ExistingEstablishment[]> {
  const supabase = getAdminSupabase();

  // Utiliser la fonction de similarité PostgreSQL
  const { data, error } = await supabase.rpc("search_establishments_by_name_similarity", {
    search_name: nameNormalized,
    search_city: city,
    min_similarity: minSimilarity,
  });

  if (error) {
    logImport("warn", "deduplicator", "RPC search_establishments_by_name_similarity not available", {
      error: error.message,
    });
    return [];
  }

  return data || [];
}
