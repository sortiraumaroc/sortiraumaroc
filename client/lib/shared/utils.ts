/**
 * Utilitaires partagés - SAM
 * Centralise les fonctions dupliquées dans le codebase
 */

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Vérifie si une valeur est un objet Record (exclut les arrays)
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Vérifie si une valeur est un objet (version permissive)
 */
export function isObject(v: unknown): v is object {
  return !!v && typeof v === "object";
}

// ============================================
// ERROR HANDLING
// ============================================

/**
 * Extrait le message d'erreur d'un payload API
 */
export function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const msg = typeof payload.error === "string" ? payload.error : null;
  return msg?.trim() || null;
}

/**
 * Messages d'erreur centralisés (français)
 */
export const ERROR_MESSAGES = {
  // Authentification
  NOT_AUTHENTICATED: "Non authentifié",
  NOT_AUTHENTICATED_EN: "Not authenticated",
  SESSION_EXPIRED_PRO: "Session Pro expirée. Veuillez vous reconnecter.",
  SESSION_EXPIRED_CONSUMER: "Session expirée. Veuillez vous reconnecter.",
  SESSION_EXPIRED_ADMIN: "Session admin expirée. Veuillez vous reconnecter.",

  // Réseau
  NETWORK_ERROR: "Impossible de contacter le serveur. Vérifiez votre connexion.",
  SERVICE_UNAVAILABLE: "Service temporairement indisponible. Réessayez dans un instant.",
  TIMEOUT: "La requête a pris trop de temps. Réessayez.",

  // Validation
  INVALID_DATA: "Données invalides",
  MISSING_REQUIRED_FIELD: "Champ requis manquant",
  INVALID_EMAIL: "Email invalide",
  INVALID_PHONE: "Numéro de téléphone invalide",

  // Rate limiting
  TOO_MANY_REQUESTS: "Trop de requêtes. Veuillez patienter.",

  // Générique
  UNKNOWN_ERROR: "Une erreur inattendue s'est produite.",
  FORBIDDEN: "Accès refusé",
  NOT_FOUND: "Ressource non trouvée",
} as const;

// ============================================
// STRING UTILITIES
// ============================================

/**
 * Convertit une valeur en string sécurisé (trimmed)
 */
export function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Convertit une valeur en string optionnel (null si vide)
 */
export function asOptionalString(v: unknown): string | null {
  const s = asString(v);
  return s || null;
}

/**
 * Convertit une valeur en entier
 */
export function asInt(v: unknown, defaultValue = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === "string") {
    const parsed = parseInt(v, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  return defaultValue;
}

/**
 * Convertit une valeur en nombre flottant
 */
export function asFloat(v: unknown, defaultValue = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  return defaultValue;
}

/**
 * Convertit une valeur en booléen
 */
export function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    return lower === "true" || lower === "1" || lower === "yes";
  }
  return !!v;
}

/**
 * Tronque une string à une longueur maximale
 */
export function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Vérifie si une string est un email valide
 */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Vérifie si une string est un numéro de téléphone valide (format basique)
 */
export function isPhone(value: string): boolean {
  // Au moins 6 chiffres, peut contenir +, espaces, tirets, parenthèses
  const digits = value.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

/**
 * Vérifie si une string est un UUID valide
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ============================================
// PAGINATION
// ============================================

export const PAGINATION = {
  MIN_LIMIT: 1,
  MAX_LIMIT: 500,
  DEFAULT_LIMIT: 50,
  DEFAULT_OFFSET: 0,
} as const;

/**
 * Normalise une limite de pagination
 */
export function normalizeLimit(limit: unknown): number {
  const n = asInt(limit, PAGINATION.DEFAULT_LIMIT);
  return Math.min(PAGINATION.MAX_LIMIT, Math.max(PAGINATION.MIN_LIMIT, n));
}

/**
 * Normalise un offset de pagination
 */
export function normalizeOffset(offset: unknown): number {
  return Math.max(0, asInt(offset, PAGINATION.DEFAULT_OFFSET));
}

// ============================================
// HTTP STATUS CODES
// ============================================

export const HTTP_STATUS = {
  // Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // Client errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // Server errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// ============================================
// CURRENCY & LOCALE
// ============================================

export const DEFAULTS = {
  CURRENCY: "MAD" as const,
  LOCALE: "fr-MA" as const,
  LOCALE_FALLBACK: "fr-FR" as const,
  TIMEZONE: "Africa/Casablanca" as const,
} as const;

export type SupportedCurrency = "MAD" | "EUR" | "USD";
export type SupportedLocale = "fr-MA" | "fr-FR" | "en-US" | "en-GB";

// ============================================
// DATE UTILITIES
// ============================================

/**
 * Formate une date ISO en string lisible
 */
export function formatDateFr(isoDate: string | Date): string {
  const date = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  return date.toLocaleDateString(DEFAULTS.LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Formate une date ISO en format court
 */
export function formatDateShortFr(isoDate: string | Date): string {
  const date = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  return date.toLocaleDateString(DEFAULTS.LOCALE, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
