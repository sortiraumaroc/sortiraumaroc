/**
 * Importer - SAM Import CHR
 *
 * Orchestrateur principal du système d'import.
 * Gère le workflow: collecte -> normalisation -> déduplication -> staging.
 */

import type {
  ImportSource,
  ImportBatch,
  ImportBatchConfig,
  NormalizedPlace,
  NormalizedPhoto,
  SourceRef,
  StagingEntry,
  DedupeResult,
  ConnectorResult,
  ImportLog,
  BatchStatus,
  ChrCategory,
} from "./connectors/types";
import {
  getConnector,
  getAvailableConnectors,
  type SearchParams,
} from "./connectors/base";
import { normalizePlace, normalizeBatch, mergePlaces } from "./normalizer";
import { findDuplicates, deduplicateBatch } from "./deduplicator";
import { logImport, sleep } from "./utils";
import { getAdminSupabase } from "../supabaseAdmin";

// ============================================
// MAPPING CATÉGORIES CHR
// ============================================

/**
 * Mappe les catégories CHR internes vers des subcategories lisibles
 * pour la table establishments
 */
const CHR_CATEGORY_TO_SUBCATEGORY: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  bar: "Bar",
  rooftop: "Rooftop",
  lounge: "Lounge",
  patisserie: "Pâtisserie",
  tea_room: "Salon de thé",
  fast_food: "Fast-food",
  brasserie: "Brasserie",
  snack: "Snack",
  glacier: "Glacier",
  boulangerie: "Boulangerie",
  traiteur: "Traiteur",
  food_truck: "Food Truck",
  club: "Club / Discothèque",
};

function mapCategoryToSubcategory(category: string | null | undefined): string {
  if (!category) return "Restaurant"; // Défaut
  const mapped = CHR_CATEGORY_TO_SUBCATEGORY[category.toLowerCase()];
  if (mapped) return mapped;
  // Capitaliser la première lettre si pas trouvé
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

// ============================================
// INITIALISATION DES CONNECTEURS
// ============================================

import { createGooglePlacesConnector } from "./connectors/googlePlaces";
import { createMadeInCityConnector } from "./connectors/madeincity";

// Initialiser les connecteurs au démarrage
let connectorsInitialized = false;

export function initializeConnectors(): void {
  if (connectorsInitialized) return;

  // Google Places API (nécessite GOOGLE_PLACES_API_KEY)
  createGooglePlacesConnector();

  // Made In City scraper
  createMadeInCityConnector();

  connectorsInitialized = true;
  logImport("info", "importer", "CHR connectors initialized (2 sources: google, madeincity)");
}

// ============================================
// CRÉATION DE BATCH
// ============================================

/**
 * Crée un nouveau batch d'import
 */
export async function createImportBatch(
  config: ImportBatchConfig,
  startedBy: string
): Promise<ImportBatch> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("establishment_import_batches")
    .insert({
      sources: config.sources,
      cities: config.cities,
      categories: config.categories || null,
      keywords: config.keywords || null,
      status: "pending",
      started_by: startedBy,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create import batch: ${error.message}`);
  }

  return mapBatchRow(data);
}

/**
 * Met à jour le statut d'un batch
 */
export async function updateBatchStatus(
  batchId: string,
  status: BatchStatus,
  metrics?: Partial<{
    totalFetched: number;
    totalNormalized: number;
    totalDuplicates: number;
    totalErrors: number;
  }>,
  errorLog?: Record<string, unknown>
): Promise<void> {
  const supabase = getAdminSupabase();

  const updates: Record<string, unknown> = { status };

  if (status === "running") {
    updates.started_at = new Date().toISOString();
  } else if (status === "completed" || status === "failed") {
    updates.completed_at = new Date().toISOString();
  }

  if (metrics) {
    if (metrics.totalFetched !== undefined) updates.total_fetched = metrics.totalFetched;
    if (metrics.totalNormalized !== undefined) updates.total_normalized = metrics.totalNormalized;
    if (metrics.totalDuplicates !== undefined) updates.total_duplicates = metrics.totalDuplicates;
    if (metrics.totalErrors !== undefined) updates.total_errors = metrics.totalErrors;
  }

  if (errorLog) {
    updates.error_log = errorLog;
  }

  const { error } = await supabase
    .from("establishment_import_batches")
    .update(updates)
    .eq("id", batchId);

  if (error) {
    logImport("error", "importer", `Failed to update batch status: ${error.message}`);
  }
}

// ============================================
// EXÉCUTION D'UN BATCH
// ============================================

/**
 * Exécute un batch d'import complet
 */
export async function runImportBatch(batchId: string): Promise<{
  success: boolean;
  totalFetched: number;
  totalNormalized: number;
  totalDuplicates: number;
  totalErrors: number;
  errors: string[];
}> {
  initializeConnectors();

  const supabase = getAdminSupabase();
  const errors: string[] = [];

  // Récupérer la config du batch
  const { data: batch, error: batchError } = await supabase
    .from("establishment_import_batches")
    .select("*")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    throw new Error(`Batch not found: ${batchId}`);
  }

  // Marquer comme en cours
  await updateBatchStatus(batchId, "running");

  let totalFetched = 0;
  let totalNormalized = 0;
  let totalDuplicates = 0;
  let totalErrors = 0;

  try {
    const { sources, cities, categories, keywords } = batch;

    // Pour chaque source
    for (const source of sources as ImportSource[]) {
      const connector = getConnector(source);

      if (!connector) {
        logImport("warn", "importer", `Connector not found for source: ${source}`);
        continue;
      }

      if (!(await connector.isAvailable())) {
        logImport("warn", "importer", `Connector not available: ${source}`);
        continue;
      }

      // Pour chaque ville
      for (const city of cities as string[]) {
        // Pour chaque catégorie (ou toutes si non spécifié)
        const categoriesToSearch = (categories as ChrCategory[]) || [undefined as unknown as ChrCategory];

        for (const category of categoriesToSearch) {
          try {
            const searchParams: SearchParams = {
              city,
              category,
              keywords: keywords as string[] | undefined,
              limit: 50,
            };

            logImport("info", "importer", `Fetching ${source}/${city}/${category || "all"}`);

            const result = await connector.search(searchParams);

            // Logger le résultat
            await logConnectorResult(batchId, result);

            if (!result.success) {
              totalErrors++;
              errors.push(`${source}/${city}: ${result.error}`);
              continue;
            }

            totalFetched += result.places.length;

            // Normaliser les résultats
            const normalized = normalizeBatch(result.places);
            totalNormalized += normalized.length;

            // Dédupliquer et insérer en staging
            logImport("info", "importer", `Deduplicating ${normalized.length} places...`);
            const deduped = await deduplicateBatch(normalized);

            let inserted = 0;
            let skippedDuplicates = 0;
            for (const { place, dedupe } of deduped) {
              // Vérifier si c'est un doublon probable
              if (dedupe.isLikelyDuplicate && dedupe.confidenceScore >= 85) {
                totalDuplicates++;
                skippedDuplicates++;
                logImport("info", "importer", `Skipping duplicate: ${place.name} (score: ${dedupe.confidenceScore}, match: ${dedupe.bestMatch?.name})`);
                continue; // Ne pas insérer les doublons avec score élevé
              }

              try {
                await insertIntoStaging(place, dedupe, batchId);
                inserted++;
              } catch (insertErr) {
                logImport("error", "importer", `Failed to insert ${place.name}: ${(insertErr as Error).message}`);
                totalErrors++;
              }
            }

            logImport("info", "importer", `Inserted ${inserted}/${deduped.length} places into staging (${skippedDuplicates} duplicates skipped)`);

            // Petit délai entre les recherches pour éviter la surcharge
            await sleep(500);
          } catch (err) {
            totalErrors++;
            const errorMsg = `${source}/${city}/${category}: ${(err as Error).message}`;
            errors.push(errorMsg);
            logImport("error", "importer", errorMsg);
          }
        }
      }
    }

    // Marquer comme terminé
    await updateBatchStatus(batchId, "completed", {
      totalFetched,
      totalNormalized,
      totalDuplicates,
      totalErrors,
    });

    return {
      success: true,
      totalFetched,
      totalNormalized,
      totalDuplicates,
      totalErrors,
      errors,
    };
  } catch (error) {
    // Marquer comme échoué
    await updateBatchStatus(
      batchId,
      "failed",
      { totalFetched, totalNormalized, totalDuplicates, totalErrors },
      { error: (error as Error).message, errors }
    );

    return {
      success: false,
      totalFetched,
      totalNormalized,
      totalDuplicates,
      totalErrors,
      errors: [...errors, (error as Error).message],
    };
  }
}

// ============================================
// STAGING
// ============================================

/**
 * Insère un lieu normalisé dans la table staging
 */
async function insertIntoStaging(
  place: NormalizedPlace,
  dedupe: DedupeResult,
  batchId: string
): Promise<string> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("establishment_import_staging")
    .insert({
      name: place.name,
      name_normalized: place.nameNormalized,
      category: place.category,
      subcategory: place.subcategory,
      description_short: place.descriptionShort,
      address_full: place.addressFull,
      city: place.city,
      neighborhood: place.neighborhood,
      phone_e164: place.phoneE164,
      website_url: place.websiteUrl,
      email: place.email,
      google_maps_url: place.googleMapsUrl,
      latitude: place.latitude,
      longitude: place.longitude,
      opening_hours: place.openingHours,
      price_range: place.priceRange,
      tags: place.tags,
      social_links: place.socialLinks,
      photos: place.photos,
      sources: place.sources,
      payload_raw: place.payloadRaw,
      dedupe_candidates: dedupe.candidates.length > 0 ? dedupe.candidates : null,
      confidence_score: dedupe.confidenceScore,
      status: "new",
      import_batch_id: batchId,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to insert staging entry: ${error.message}`);
  }

  return data.id;
}

/**
 * Log le résultat d'un connecteur
 */
async function logConnectorResult(
  batchId: string,
  result: ConnectorResult
): Promise<void> {
  const supabase = getAdminSupabase();

  await supabase.from("establishment_import_logs").insert({
    batch_id: batchId,
    source: result.source,
    source_url: result.sourceUrl,
    status: result.success
      ? "success"
      : result.rateLimited
        ? "rate_limited"
        : "error",
    response_code: result.statusCode,
    duration_ms: result.durationMs,
    items_fetched: result.places.length,
    error_message: result.error,
  });
}

// ============================================
// VALIDATION ET IMPORT
// ============================================

/**
 * Valide une entrée staging et crée l'établissement en DRAFT
 */
export async function approveAndImport(
  stagingId: string,
  reviewerId: string,
  notes?: string
): Promise<{ success: boolean; establishmentId?: string; error?: string }> {
  const supabase = getAdminSupabase();

  // Récupérer l'entrée staging
  const { data: staging, error: fetchError } = await supabase
    .from("establishment_import_staging")
    .select("*")
    .eq("id", stagingId)
    .single();

  if (fetchError || !staging) {
    return { success: false, error: "Staging entry not found" };
  }

  // Vérifier que pas déjà importé
  if (staging.status === "imported" && staging.establishment_id) {
    return {
      success: true,
      establishmentId: staging.establishment_id,
      error: "Already imported",
    };
  }

  try {
    // Créer l'établissement en DRAFT
    const { data: establishment, error: createError } = await supabase
      .from("establishments")
      .insert({
        name: staging.name,
        slug: generateSlug(staging.name, staging.city),
        universe: "restaurant", // CHR = restaurant universe (singulier!)
        subcategory: mapCategoryToSubcategory(staging.category),
        city: staging.city,
        address: staging.address_full,
        lat: staging.latitude,
        lng: staging.longitude,
        phone: staging.phone_e164,
        website: staging.website_url,
        email: staging.email,
        social_links: staging.social_links || {},
        hours: staging.opening_hours || {},
        tags: staging.tags || [],
        description_short: staging.description_short,
        gallery_urls: staging.photos?.map((p: { url: string }) => p.url) || [],
        source_refs: staging.sources,
        status: "pending", // Équivalent DRAFT
        verified: false,
        premium: false,
        booking_enabled: false,
      })
      .select("id")
      .single();

    if (createError) {
      throw new Error(createError.message);
    }

    // Mettre à jour le staging
    await supabase
      .from("establishment_import_staging")
      .update({
        status: "imported",
        establishment_id: establishment.id,
        reviewer_id: reviewerId,
        reviewer_notes: notes,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", stagingId);

    // Log d'audit
    await supabase.from("admin_audit_log").insert({
      action: "import.chr.approve",
      entity_type: "establishments",
      entity_id: establishment.id,
      metadata: {
        staging_id: stagingId,
        reviewer_id: reviewerId,
        notes,
      },
    });

    logImport("info", "importer", `Imported ${staging.name} as ${establishment.id}`);

    return { success: true, establishmentId: establishment.id };
  } catch (error) {
    logImport("error", "importer", `Failed to import ${staging.name}: ${(error as Error).message}`);

    // Marquer l'erreur dans staging
    await supabase
      .from("establishment_import_staging")
      .update({
        error_reason: (error as Error).message,
      })
      .eq("id", stagingId);

    return { success: false, error: (error as Error).message };
  }
}

/**
 * Rejette une entrée staging
 */
export async function rejectStaging(
  stagingId: string,
  reviewerId: string,
  notes?: string
): Promise<void> {
  const supabase = getAdminSupabase();

  await supabase
    .from("establishment_import_staging")
    .update({
      status: "rejected",
      reviewer_id: reviewerId,
      reviewer_notes: notes,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", stagingId);

  // Log d'audit
  await supabase.from("admin_audit_log").insert({
    action: "import.chr.reject",
    entity_type: "establishment_import_staging",
    entity_id: stagingId,
    metadata: { reviewer_id: reviewerId, notes },
  });
}

/**
 * Valide plusieurs entrées staging en masse
 */
export async function bulkApprove(
  stagingIds: string[],
  reviewerId: string
): Promise<{
  success: number;
  failed: number;
  results: Array<{ stagingId: string; success: boolean; establishmentId?: string; error?: string }>;
}> {
  const results: Array<{ stagingId: string; success: boolean; establishmentId?: string; error?: string }> = [];

  for (const stagingId of stagingIds) {
    const result = await approveAndImport(stagingId, reviewerId);
    results.push({ stagingId, ...result });
  }

  return {
    success: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Génère un slug unique
 */
function generateSlug(name: string, city: string): string {
  const base = `${name}-${city}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  // Ajouter un suffixe aléatoire pour l'unicité
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/**
 * Mappe une ligne de batch DB en objet
 */
function mapBatchRow(row: Record<string, unknown>): ImportBatch {
  return {
    id: row.id as string,
    sources: row.sources as ImportSource[],
    cities: row.cities as string[],
    categories: row.categories as ChrCategory[] | undefined,
    keywords: row.keywords as string[] | undefined,
    status: row.status as BatchStatus,
    totalFetched: row.total_fetched as number,
    totalNormalized: row.total_normalized as number,
    totalDuplicates: row.total_duplicates as number,
    totalErrors: row.total_errors as number,
    startedAt: row.started_at as string | undefined,
    completedAt: row.completed_at as string | undefined,
    startedBy: row.started_by as string | undefined,
    errorLog: row.error_log as Record<string, unknown> | undefined,
    createdAt: row.created_at as string,
  };
}

// ============================================
// NETTOYAGE DES DOUBLONS
// ============================================

/**
 * Supprime les doublons détectés dans le staging
 * Compare les entrées staging entre elles et avec les établissements existants
 */
export async function cleanupStagingDuplicates(): Promise<{
  deleted: number;
  errors: number;
}> {
  const supabase = getAdminSupabase();
  let deleted = 0;
  let errors = 0;

  logImport("info", "importer", "Starting staging duplicates cleanup...");

  // 1. Récupérer toutes les entrées staging non traitées
  const { data: stagingEntries, error: fetchError } = await supabase
    .from("establishment_import_staging")
    .select("id, name, name_normalized, city, phone_e164, website_url, latitude, longitude, confidence_score, dedupe_candidates, created_at")
    .in("status", ["new", "reviewed"])
    .order("created_at", { ascending: true });

  if (fetchError || !stagingEntries) {
    logImport("error", "importer", `Failed to fetch staging entries: ${fetchError?.message}`);
    return { deleted: 0, errors: 1 };
  }

  logImport("info", "importer", `Found ${stagingEntries.length} staging entries to check`);

  // 2. Grouper par nom normalisé + ville pour détecter les doublons internes
  const groups = new Map<string, typeof stagingEntries>();

  for (const entry of stagingEntries) {
    const key = `${(entry.city || "").toLowerCase()}_${(entry.name_normalized || entry.name).toLowerCase()}`;
    const existing = groups.get(key);

    if (existing) {
      existing.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  // 3. Pour chaque groupe avec plus d'une entrée, garder la plus ancienne (première importée)
  const toDelete: string[] = [];

  groups.forEach((entries, key) => {
    if (entries.length > 1) {
      // Trier par date de création (la plus ancienne en premier)
      entries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      // Marquer toutes sauf la première pour suppression
      for (let i = 1; i < entries.length; i++) {
        toDelete.push(entries[i].id);
        logImport("info", "importer", `Duplicate found: "${entries[i].name}" (keeping first: ${entries[0].name})`);
      }
    }
  });

  // 4. Aussi supprimer les entrées avec un score de confiance >= 90 (doublons confirmés avec des établissements existants)
  for (const entry of stagingEntries) {
    if ((entry.confidence_score || 0) >= 90 && !toDelete.includes(entry.id)) {
      const candidates = entry.dedupe_candidates as Array<{ establishmentId?: string; name: string }> | null;
      if (candidates && candidates.some(c => c.establishmentId)) {
        toDelete.push(entry.id);
        logImport("info", "importer", `Duplicate of existing establishment: "${entry.name}" (score: ${entry.confidence_score})`);
      }
    }
  }

  logImport("info", "importer", `Found ${toDelete.length} duplicates to delete`);

  // 5. Supprimer les doublons
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("establishment_import_staging")
      .delete()
      .in("id", toDelete);

    if (deleteError) {
      logImport("error", "importer", `Failed to delete duplicates: ${deleteError.message}`);
      errors++;
    } else {
      deleted = toDelete.length;
      logImport("info", "importer", `Successfully deleted ${deleted} duplicate entries`);
    }
  }

  return { deleted, errors };
}

/**
 * Fusionne les données de doublons détectés
 * Garde l'entrée avec le plus d'informations et supprime les autres
 */
export async function mergeStagingDuplicates(stagingIds: string[]): Promise<{
  success: boolean;
  keptId?: string;
  error?: string;
}> {
  if (stagingIds.length < 2) {
    return { success: false, error: "Need at least 2 entries to merge" };
  }

  const supabase = getAdminSupabase();

  // Récupérer toutes les entrées
  const { data: entries, error } = await supabase
    .from("establishment_import_staging")
    .select("*")
    .in("id", stagingIds);

  if (error || !entries || entries.length < 2) {
    return { success: false, error: "Failed to fetch entries" };
  }

  // Calculer un score de "richesse" pour chaque entrée (nombre de champs remplis)
  const scored = entries.map(entry => {
    let score = 0;
    if (entry.phone_e164) score += 10;
    if (entry.website_url) score += 8;
    if (entry.email) score += 8;
    if (entry.latitude && entry.longitude) score += 10;
    if (entry.description_short) score += 5;
    if (entry.opening_hours && Object.keys(entry.opening_hours).length > 0) score += 7;
    if (entry.photos && entry.photos.length > 0) score += entry.photos.length * 3;
    if (entry.tags && entry.tags.length > 0) score += entry.tags.length;
    if (entry.social_links && Object.keys(entry.social_links).length > 0) score += 5;
    return { entry, score };
  });

  // Trier par score décroissant
  scored.sort((a, b) => b.score - a.score);

  // Garder la meilleure entrée
  const keeper = scored[0].entry;
  const toDelete = scored.slice(1).map(s => s.entry.id);

  // Supprimer les autres
  const { error: deleteError } = await supabase
    .from("establishment_import_staging")
    .delete()
    .in("id", toDelete);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  logImport("info", "importer", `Merged ${stagingIds.length} entries, kept "${keeper.name}"`);

  return { success: true, keptId: keeper.id };
}

// ============================================
// QUERIES
// ============================================

/**
 * Liste les batches d'import
 */
export async function listBatches(
  limit: number = 20,
  offset: number = 0
): Promise<{ batches: ImportBatch[]; total: number }> {
  const supabase = getAdminSupabase();

  const { data, error, count } = await supabase
    .from("establishment_import_batches")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to list batches: ${error.message}`);
  }

  return {
    batches: (data || []).map(mapBatchRow),
    total: count || 0,
  };
}

/**
 * Liste les entrées staging
 */
export async function listStagingEntries(
  filters: {
    status?: string | string[];
    city?: string;
    category?: string;
    batchId?: string;
    minConfidence?: number;
    maxConfidence?: number;
    search?: string;
  },
  limit: number = 20,
  offset: number = 0
): Promise<{ entries: StagingEntry[]; total: number }> {
  const supabase = getAdminSupabase();

  let query = supabase
    .from("establishment_import_staging")
    .select("*", { count: "exact" });

  // Filtres
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query = query.in("status", filters.status);
    } else {
      query = query.eq("status", filters.status);
    }
  }

  if (filters.city) {
    query = query.ilike("city", `%${filters.city}%`);
  }

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (filters.batchId) {
    query = query.eq("import_batch_id", filters.batchId);
  }

  if (filters.minConfidence !== undefined) {
    query = query.gte("confidence_score", filters.minConfidence);
  }

  if (filters.maxConfidence !== undefined) {
    query = query.lte("confidence_score", filters.maxConfidence);
  }

  if (filters.search) {
    query = query.ilike("name", `%${filters.search}%`);
  }

  // Tri et pagination
  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list staging entries: ${error.message}`);
  }

  return {
    entries: (data || []).map(mapStagingRow),
    total: count || 0,
  };
}

/**
 * Mappe une ligne staging DB en objet
 */
function mapStagingRow(row: Record<string, unknown>): StagingEntry {
  return {
    id: row.id as string,
    name: row.name as string,
    nameNormalized: row.name_normalized as string,
    category: row.category as string,
    subcategory: row.subcategory as string | undefined,
    descriptionShort: row.description_short as string | undefined,
    addressFull: row.address_full as string | undefined,
    city: row.city as string,
    neighborhood: row.neighborhood as string | undefined,
    phoneE164: row.phone_e164 as string | undefined,
    websiteUrl: row.website_url as string | undefined,
    email: row.email as string | undefined,
    googleMapsUrl: row.google_maps_url as string | undefined,
    latitude: row.latitude as number | undefined,
    longitude: row.longitude as number | undefined,
    openingHours: row.opening_hours as Record<string, string> | undefined,
    priceRange: row.price_range as string | undefined,
    tags: row.tags as string[] | undefined,
    socialLinks: row.social_links as Record<string, string> | undefined,
    photos: row.photos as NormalizedPhoto[] | undefined,
    sources: row.sources as SourceRef[],
    status: row.status as StagingEntry["status"],
    dedupeCandidates: row.dedupe_candidates as Array<{ establishmentId?: string; stagingId?: string; name: string; city: string; score: number; reasons: string[] }> | undefined,
    confidenceScore: row.confidence_score as number,
    reviewerId: row.reviewer_id as string | undefined,
    reviewerNotes: row.reviewer_notes as string | undefined,
    reviewedAt: row.reviewed_at as string | undefined,
    establishmentId: row.establishment_id as string | undefined,
    importBatchId: row.import_batch_id as string | undefined,
    errorReason: row.error_reason as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
