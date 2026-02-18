/**
 * Types pour le système d'import CHR - SAM
 *
 * Interfaces communes pour les connecteurs, normalisation et déduplication.
 */

// ============================================
// SOURCES D'IMPORT
// ============================================

export type ImportSource =
  | "google"
  | "madeincity"
  | "sortiraumaroc"
  | "marrakechbestof"
  | "bestrestaurantsmaroc";

export const IMPORT_SOURCES: ImportSource[] = [
  "google",
  "madeincity",
  "sortiraumaroc",
  "marrakechbestof",
  "bestrestaurantsmaroc",
];

// ============================================
// CATÉGORIES CHR
// ============================================

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

export const CHR_CATEGORIES: ChrCategory[] = [
  "restaurant",
  "cafe",
  "bar",
  "rooftop",
  "lounge",
  "patisserie",
  "tea_room",
  "fast_food",
  "brasserie",
  "snack",
  "glacier",
  "boulangerie",
  "traiteur",
  "food_truck",
  "club",
];

// ============================================
// VILLES PRINCIPALES MAROC
// ============================================

export const MOROCCAN_CITIES = [
  "casablanca",
  "marrakech",
  "rabat",
  "fes",
  "tanger",
  "agadir",
  "meknes",
  "oujda",
  "kenitra",
  "tetouan",
  "sale",
  "mohammedia",
  "el jadida",
  "beni mellal",
  "nador",
  "taza",
  "essaouira",
  "ouarzazate",
  "settat",
  "khouribga",
] as const;

export type MoroccanCity = (typeof MOROCCAN_CITIES)[number];

// ============================================
// DONNÉES BRUTES (output des connecteurs)
// ============================================

/**
 * Photo brute d'un lieu
 */
export interface RawPhoto {
  url: string;
  caption?: string;
  credit?: string;
  width?: number;
  height?: number;
}

/**
 * Liens sociaux
 */
export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  whatsapp?: string;
  twitter?: string;
  youtube?: string;
  linkedin?: string;
}

/**
 * Horaires d'ouverture
 */
export interface OpeningHours {
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
  notes?: string;
}

/**
 * Données brutes d'un lieu (output des connecteurs)
 */
export interface RawPlace {
  // Identifiants source
  source: ImportSource;
  sourceUrl: string;
  externalId: string;
  fetchedAt: string; // ISO datetime

  // Données principales
  name: string;
  category?: string;
  subcategory?: string;
  description?: string;

  // Adresse
  address?: string;
  city?: string;
  neighborhood?: string;
  postalCode?: string;
  country?: string;

  // Contact
  phone?: string;
  website?: string;
  email?: string;

  // Géolocalisation
  latitude?: number;
  longitude?: number;
  googleMapsUrl?: string;

  // Détails
  openingHours?: OpeningHours;
  priceRange?: string; // €, €€, €€€, €€€€
  rating?: number;
  reviewCount?: number;

  // Médias
  photos?: RawPhoto[];

  // Social
  socialLinks?: SocialLinks;

  // Tags
  tags?: string[];
  amenities?: string[];
  cuisineTypes?: string[];

  // Données brutes pour debug
  rawData?: Record<string, unknown>;
}

// ============================================
// DONNÉES NORMALISÉES (prêt pour staging)
// ============================================

/**
 * Photo normalisée avec hash pour déduplication
 */
export interface NormalizedPhoto {
  url: string;
  source: ImportSource;
  credit?: string;
  hash: string; // SHA256 de l'URL
}

/**
 * Référence source
 */
export interface SourceRef {
  source: ImportSource;
  sourceUrl: string;
  externalId: string;
  fetchedAt: string;
}

/**
 * Établissement normalisé (prêt pour insertion en staging)
 */
export interface NormalizedPlace {
  // Identité
  name: string;
  nameNormalized: string;
  category: ChrCategory | string;
  subcategory?: string;

  // Description
  descriptionShort?: string;

  // Localisation
  addressFull?: string;
  city: string;
  neighborhood?: string;

  // Contact
  phoneE164?: string; // Format +212XXXXXXXXX
  websiteUrl?: string;
  email?: string;
  googleMapsUrl?: string;

  // Géolocalisation
  latitude?: number;
  longitude?: number;

  // Détails
  openingHours?: OpeningHours;
  priceRange?: string;

  // Tags et médias
  tags?: string[];
  socialLinks?: SocialLinks;
  photos?: NormalizedPhoto[];

  // Sources
  sources: SourceRef[];

  // Données brutes (debug)
  payloadRaw?: Record<string, unknown>;
}

// ============================================
// DÉDUPLICATION
// ============================================

/**
 * Candidat de déduplication
 */
export interface DedupeCandidate {
  establishmentId?: string; // Si doublon avec établissement existant
  stagingId?: string; // Si doublon avec autre entrée staging
  name: string;
  city: string;
  score: number; // 0-100
  reasons: string[]; // Ex: ["name_match:95", "phone_match", "distance:50m"]
}

/**
 * Résultat de déduplication pour un lieu
 */
export interface DedupeResult {
  candidates: DedupeCandidate[];
  confidenceScore: number; // 0-100, haut = probable doublon
  isLikelyDuplicate: boolean; // true si score > 85
  bestMatch?: DedupeCandidate;
}

// ============================================
// STAGING
// ============================================

export type StagingStatus =
  | "new"
  | "reviewed"
  | "approved"
  | "rejected"
  | "imported";

/**
 * Entrée dans la table staging
 */
export interface StagingEntry extends NormalizedPlace {
  id: string;
  status: StagingStatus;
  dedupeCandidates?: DedupeCandidate[];
  confidenceScore: number;
  reviewerId?: string;
  reviewerNotes?: string;
  reviewedAt?: string;
  establishmentId?: string; // Après import
  importBatchId?: string;
  errorReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// BATCH D'IMPORT
// ============================================

export type BatchStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Configuration d'un batch d'import
 */
export interface ImportBatchConfig {
  sources: ImportSource[];
  cities: string[];
  categories?: ChrCategory[];
  keywords?: string[];
}

/**
 * Batch d'import
 */
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
  errorLog?: Record<string, unknown>;
  createdAt: string;
}

// ============================================
// CONFIGURATION CONNECTEUR
// ============================================

/**
 * Configuration d'un connecteur
 */
export interface ConnectorConfig {
  enabled: boolean;
  rateLimitPerSecond: number;
  maxRetries: number;
  timeoutMs: number;
  userAgent?: string;
  respectRobots?: boolean;
  apiKey?: string;
  extraConfig?: Record<string, unknown>;
}

/**
 * Source d'import configurée
 */
export interface ImportSourceConfig {
  slug: ImportSource;
  name: string;
  type: "api" | "scraper";
  baseUrl: string;
  config: ConnectorConfig;
  lastUsedAt?: string;
}

// ============================================
// RÉSULTATS CONNECTEUR
// ============================================

/**
 * Résultat d'une requête de connecteur
 */
export interface ConnectorResult {
  source: ImportSource;
  sourceUrl: string;
  success: boolean;
  statusCode?: number;
  durationMs: number;
  places: RawPlace[];
  error?: string;
  rateLimited?: boolean;
}

/**
 * Log d'import
 */
export interface ImportLog {
  id: string;
  batchId: string;
  source: ImportSource;
  sourceUrl?: string;
  status: "success" | "error" | "rate_limited" | "skipped" | "timeout";
  responseCode?: number;
  durationMs?: number;
  itemsFetched: number;
  errorMessage?: string;
  createdAt: string;
}

// ============================================
// ACTIONS UI
// ============================================

/**
 * Action de validation sur une entrée staging
 */
export interface StagingAction {
  stagingId: string;
  action: "approve" | "reject" | "review";
  notes?: string;
  reviewerId: string;
}

/**
 * Résultat d'import (staging -> establishments)
 */
export interface ImportResult {
  stagingId: string;
  success: boolean;
  establishmentId?: string;
  error?: string;
}

// ============================================
// FILTRES ET PAGINATION
// ============================================

/**
 * Filtres pour la liste staging
 */
export interface StagingFilters {
  status?: StagingStatus | StagingStatus[];
  city?: string;
  category?: ChrCategory;
  batchId?: string;
  minConfidence?: number;
  maxConfidence?: number;
  search?: string;
  hasDedupes?: boolean;
}

/**
 * Options de pagination
 */
export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * Résultat paginé
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
