/**
 * Admin Import CHR API Client - SAM
 *
 * Fonctions pour interagir avec l'API d'import CHR.
 */

import { loadAdminSessionToken } from "./adminApi";

// ============================================
// TYPES
// ============================================

export type ImportSource =
  | "google"
  | "madeincity";

export type ChrCategory =
  | "restaurant"
  | "cafe"
  | "bar"
  | "rooftop"
  | "lounge"
  | "patisserie"
  | "tea_room"
  | "fast_food"
  | "brasserie"
  | "snack"
  | "glacier"
  | "boulangerie"
  | "traiteur"
  | "food_truck"
  | "club";

export type BatchStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type StagingStatus =
  | "new"
  | "reviewed"
  | "approved"
  | "rejected"
  | "imported";

export interface ImportSourceInfo {
  slug: ImportSource;
  name: string;
  type: "api" | "scraper";
  enabled: boolean;
}

export interface ChrCategoryInfo {
  slug: string;
  name_fr: string;
  name_ar?: string;
  icon?: string;
  sort_order: number;
  active: boolean;
}

export interface ImportBatch {
  id: string;
  sources: ImportSource[];
  cities: string[];
  categories?: ChrCategory[];
  keywords?: string[];
  status: BatchStatus;
  totalFetched: number;
  totalNormalized: number;
  totalDuplicates: number;
  totalErrors: number;
  startedAt?: string;
  completedAt?: string;
  startedBy?: string;
  createdAt: string;
}

export interface DedupeCandidate {
  establishmentId?: string;
  stagingId?: string;
  name: string;
  city: string;
  score: number;
  reasons: string[];
}

export interface StagingPhoto {
  url: string;
  source: ImportSource;
  credit?: string;
  hash: string;
}

export interface SourceRef {
  source: ImportSource;
  sourceUrl: string;
  externalId: string;
  fetchedAt: string;
}

export interface StagingEntry {
  id: string;
  name: string;
  nameNormalized: string;
  category: string;
  subcategory?: string;
  descriptionShort?: string;
  addressFull?: string;
  city: string;
  neighborhood?: string;
  phoneE164?: string;
  websiteUrl?: string;
  email?: string;
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  openingHours?: Record<string, string>;
  priceRange?: string;
  tags?: string[];
  socialLinks?: Record<string, string>;
  photos?: StagingPhoto[];
  sources: SourceRef[];
  status: StagingStatus;
  dedupeCandidates?: DedupeCandidate[];
  confidenceScore: number;
  reviewerId?: string;
  reviewerNotes?: string;
  reviewedAt?: string;
  establishmentId?: string;
  importBatchId?: string;
  errorReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportLog {
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface ImportStats {
  staging: {
    byCity: Record<string, unknown[]>;
    byStatus: Record<string, number>;
    total: number;
  };
  batches: {
    byStatus: Record<string, number>;
    recent: number;
  };
}

// ============================================
// API FUNCTIONS
// ============================================

const API_BASE = "/api/admin/import-chr";

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const sessionToken = loadAdminSessionToken();

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { "x-admin-session": sessionToken } : {}),
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

// ============================================
// SOURCES & CATEGORIES
// ============================================

export async function listImportSources(): Promise<ImportSourceInfo[]> {
  const data = await fetchApi<{ ok: boolean; sources: ImportSourceInfo[] }>(
    "/sources"
  );
  return data.sources;
}

export async function listChrCategories(): Promise<ChrCategoryInfo[]> {
  const data = await fetchApi<{ ok: boolean; categories: ChrCategoryInfo[] }>(
    "/categories"
  );
  return data.categories;
}

// ============================================
// BATCHES
// ============================================

export async function listBatches(
  limit: number = 20,
  offset: number = 0
): Promise<{ batches: ImportBatch[]; total: number }> {
  const data = await fetchApi<{
    ok: boolean;
    batches: ImportBatch[];
    total: number;
  }>(`/batches?limit=${limit}&offset=${offset}`);
  return { batches: data.batches, total: data.total };
}

export async function createBatch(config: {
  sources: ImportSource[];
  cities: string[];
  categories?: ChrCategory[];
  keywords?: string[];
}): Promise<ImportBatch> {
  const data = await fetchApi<{ ok: boolean; batch: ImportBatch }>("/batches", {
    method: "POST",
    body: JSON.stringify(config),
  });
  return data.batch;
}

export async function runBatch(batchId: string): Promise<void> {
  await fetchApi(`/batches/${batchId}/run`, { method: "POST" });
}

export async function cancelBatch(batchId: string): Promise<void> {
  await fetchApi(`/batches/${batchId}/cancel`, { method: "POST" });
}

export async function deleteBatch(batchId: string): Promise<void> {
  await fetchApi(`/batches/${batchId}`, { method: "DELETE" });
}

// ============================================
// STAGING
// ============================================

export interface StagingFilters {
  status?: StagingStatus | StagingStatus[];
  city?: string;
  category?: string;
  batchId?: string;
  minConfidence?: number;
  maxConfidence?: number;
  search?: string;
}

export async function listStagingEntries(
  filters: StagingFilters = {},
  limit: number = 20,
  offset: number = 0
): Promise<{ entries: StagingEntry[]; total: number }> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      params.set("status", filters.status.join(","));
    } else {
      params.set("status", filters.status);
    }
  }
  if (filters.city) params.set("city", filters.city);
  if (filters.category) params.set("category", filters.category);
  if (filters.batchId) params.set("batchId", filters.batchId);
  if (filters.minConfidence !== undefined)
    params.set("minConfidence", String(filters.minConfidence));
  if (filters.maxConfidence !== undefined)
    params.set("maxConfidence", String(filters.maxConfidence));
  if (filters.search) params.set("search", filters.search);

  const data = await fetchApi<{
    ok: boolean;
    entries: StagingEntry[];
    total: number;
  }>(`/staging?${params.toString()}`);

  return { entries: data.entries, total: data.total };
}

export async function getStagingEntry(stagingId: string): Promise<StagingEntry> {
  const data = await fetchApi<{ ok: boolean; entry: StagingEntry }>(
    `/staging/${stagingId}`
  );
  return data.entry;
}

export async function approveStagingEntry(
  stagingId: string,
  notes?: string
): Promise<{ establishmentId: string }> {
  const data = await fetchApi<{ ok: boolean; establishmentId: string }>(
    `/staging/${stagingId}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ notes }),
    }
  );
  return { establishmentId: data.establishmentId };
}

export async function rejectStagingEntry(
  stagingId: string,
  notes?: string
): Promise<void> {
  await fetchApi(`/staging/${stagingId}/reject`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

export async function bulkApproveStagingEntries(
  stagingIds: string[]
): Promise<{
  success: number;
  failed: number;
  results: Array<{
    stagingId: string;
    success: boolean;
    establishmentId?: string;
    error?: string;
  }>;
}> {
  const data = await fetchApi<{
    ok: boolean;
    success: number;
    failed: number;
    results: Array<{
      stagingId: string;
      success: boolean;
      establishmentId?: string;
      error?: string;
    }>;
  }>("/staging/bulk-approve", {
    method: "POST",
    body: JSON.stringify({ stagingIds }),
  });
  return { success: data.success, failed: data.failed, results: data.results };
}

export async function bulkRejectStagingEntries(
  stagingIds: string[],
  notes?: string
): Promise<{ count: number }> {
  const data = await fetchApi<{ ok: boolean; count: number }>(
    "/staging/bulk-reject",
    {
      method: "POST",
      body: JSON.stringify({ stagingIds, notes }),
    }
  );
  return { count: data.count };
}

/**
 * Nettoie automatiquement les doublons du staging
 * Garde l'entrée avec le plus de données et supprime les autres
 */
export async function cleanupStagingDuplicates(): Promise<{
  deletedCount: number;
  keptCount: number;
  groups: number;
}> {
  const data = await fetchApi<{
    ok: boolean;
    deletedCount: number;
    keptCount: number;
    groups: number;
  }>("/staging/cleanup-duplicates", {
    method: "POST",
  });
  return {
    deletedCount: data.deletedCount,
    keptCount: data.keptCount,
    groups: data.groups,
  };
}

// ============================================
// LOGS & STATS
// ============================================

export async function getImportLogs(limit: number = 100): Promise<ImportLog[]> {
  const data = await fetchApi<{ ok: boolean; logs: ImportLog[] }>(
    `/logs?limit=${limit}`
  );
  return data.logs;
}

export async function clearImportLogs(): Promise<void> {
  await fetchApi("/logs", { method: "DELETE" });
}

export async function getImportStats(): Promise<ImportStats> {
  const data = await fetchApi<{ ok: boolean; stats: ImportStats }>("/stats");
  return data.stats;
}

// ============================================
// EXPORT
// ============================================

export function getStagingExportUrl(filters: StagingFilters = {}): string {
  const params = new URLSearchParams();

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      params.set("status", filters.status.join(","));
    } else {
      params.set("status", filters.status);
    }
  }
  if (filters.city) params.set("city", filters.city);
  if (filters.category) params.set("category", filters.category);
  if (filters.batchId) params.set("batchId", filters.batchId);

  return `${API_BASE}/staging/export?${params.toString()}`;
}

// ============================================
// HELPERS
// ============================================

export function getStatusColor(status: StagingStatus): string {
  switch (status) {
    case "new":
      return "bg-blue-100 text-blue-800";
    case "reviewed":
      return "bg-yellow-100 text-yellow-800";
    case "approved":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    case "imported":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function getStatusLabel(status: StagingStatus): string {
  switch (status) {
    case "new":
      return "Nouveau";
    case "reviewed":
      return "En revue";
    case "approved":
      return "Approuvé";
    case "rejected":
      return "Rejeté";
    case "imported":
      return "Importé";
    default:
      return status;
  }
}

export function getBatchStatusColor(status: BatchStatus): string {
  switch (status) {
    case "pending":
      return "bg-gray-100 text-gray-800";
    case "running":
      return "bg-blue-100 text-blue-800";
    case "completed":
      return "bg-green-100 text-green-800";
    case "failed":
      return "bg-red-100 text-red-800";
    case "cancelled":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function getBatchStatusLabel(status: BatchStatus): string {
  switch (status) {
    case "pending":
      return "En attente";
    case "running":
      return "En cours";
    case "completed":
      return "Terminé";
    case "failed":
      return "Échoué";
    case "cancelled":
      return "Annulé";
    default:
      return status;
  }
}

export function getSourceLabel(source: ImportSource | string): string {
  const labels: Record<string, string> = {
    google: "Google Places API",
    sortiraumaroc: "Sortir au Maroc",
    bestrestaurantsmaroc: "Best Restaurants Maroc",
    madeincity: "Made In City",
    marrakechbestof: "Marrakech Best Of",
  };
  return labels[source] || source;
}

export function getCategoryLabel(category: ChrCategory | string): string {
  const labels: Record<string, string> = {
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
  return labels[category] || category;
}

export const MOROCCAN_CITIES = [
  { value: "casablanca", label: "Casablanca" },
  { value: "marrakech", label: "Marrakech" },
  { value: "rabat", label: "Rabat" },
  { value: "fes", label: "Fès" },
  { value: "tanger", label: "Tanger" },
  { value: "agadir", label: "Agadir" },
  { value: "meknes", label: "Meknès" },
  { value: "oujda", label: "Oujda" },
  { value: "kenitra", label: "Kénitra" },
  { value: "tetouan", label: "Tétouan" },
  { value: "essaouira", label: "Essaouira" },
  { value: "mohammedia", label: "Mohammedia" },
  { value: "el_jadida", label: "El Jadida" },
];
