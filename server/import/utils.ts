/**
 * Utilitaires pour le système d'import CHR - SAM
 *
 * Rate limiting, helpers de normalisation, hashing, etc.
 */

import { createHash } from "crypto";

// ============================================
// RATE LIMITER
// ============================================

interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

const rateLimiters = new Map<string, RateLimiterState>();

/**
 * Rate limiter basé sur token bucket
 */
export function createRateLimiter(
  key: string,
  tokensPerSecond: number,
  maxTokens: number = tokensPerSecond * 2
) {
  return {
    async acquire(): Promise<void> {
      const now = Date.now();
      let state = rateLimiters.get(key);

      if (!state) {
        state = { tokens: maxTokens, lastRefill: now };
        rateLimiters.set(key, state);
      }

      // Refill tokens based on elapsed time
      const elapsed = (now - state.lastRefill) / 1000;
      state.tokens = Math.min(maxTokens, state.tokens + elapsed * tokensPerSecond);
      state.lastRefill = now;

      if (state.tokens < 1) {
        // Wait for token to become available
        const waitTime = ((1 - state.tokens) / tokensPerSecond) * 1000;
        await sleep(waitTime);
        state.tokens = 0;
      } else {
        state.tokens -= 1;
      }
    },

    reset(): void {
      rateLimiters.delete(key);
    },
  };
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// NORMALISATION TEXTE
// ============================================

/**
 * Normalise un nom d'établissement
 * - Lowercase
 * - Supprime les accents
 * - Trim et collapse espaces multiples
 */
export function normalizeEstablishmentName(name: string): string {
  if (!name) return "";

  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalise un numéro de téléphone marocain en E.164
 * @returns +212XXXXXXXXX ou null si invalide
 */
export function normalizePhoneMaroc(phone: string | undefined | null): string | null {
  if (!phone) return null;

  // Nettoyer le numéro
  let cleaned = phone
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/\./g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "");

  // Patterns marocains
  // +212XXXXXXXXX (déjà E.164)
  if (/^\+212[5-7]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // 00212XXXXXXXXX
  if (/^00212[5-7]\d{8}$/.test(cleaned)) {
    return "+" + cleaned.slice(2);
  }

  // 0XXXXXXXXX (format local)
  if (/^0[5-7]\d{8}$/.test(cleaned)) {
    return "+212" + cleaned.slice(1);
  }

  // XXXXXXXXX (sans préfixe, 9 chiffres)
  if (/^[5-7]\d{8}$/.test(cleaned)) {
    return "+212" + cleaned;
  }

  // Format invalide
  return null;
}

/**
 * Normalise une URL
 * - Force HTTPS
 * - Supprime les paramètres de tracking
 * - Nettoie le trailing slash
 */
export function normalizeUrl(url: string | undefined | null): string | null {
  if (!url) return null;

  try {
    let normalized = url.trim();

    // Ajouter protocole si manquant
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = "https://" + normalized;
    }

    const parsed = new URL(normalized);

    // Force HTTPS
    parsed.protocol = "https:";

    // Supprimer paramètres de tracking
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "fbclid",
      "gclid",
      "ref",
      "source",
    ];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));

    // Supprimer trailing slash (sauf si c'est la racine)
    let result = parsed.toString();
    if (result.endsWith("/") && parsed.pathname !== "/") {
      result = result.slice(0, -1);
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Normalise une adresse email
 */
export function normalizeEmail(email: string | undefined | null): string | null {
  if (!email) return null;

  const cleaned = email.toLowerCase().trim();

  // Validation basique
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

// ============================================
// EXTRACTION LIENS SOCIAUX
// ============================================

/**
 * Extrait les liens sociaux d'un texte ou liste d'URLs
 */
export function extractSocialLinks(
  urls: string | string[] | undefined | null
): Record<string, string> {
  if (!urls) return {};

  const urlList = Array.isArray(urls) ? urls : [urls];
  const social: Record<string, string> = {};

  for (const url of urlList) {
    if (!url) continue;

    const lower = url.toLowerCase();

    if (lower.includes("instagram.com") || lower.includes("instagr.am")) {
      social.instagram = normalizeUrl(url) || url;
    } else if (lower.includes("facebook.com") || lower.includes("fb.com")) {
      social.facebook = normalizeUrl(url) || url;
    } else if (lower.includes("tiktok.com")) {
      social.tiktok = normalizeUrl(url) || url;
    } else if (lower.includes("twitter.com") || lower.includes("x.com")) {
      social.twitter = normalizeUrl(url) || url;
    } else if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
      social.youtube = normalizeUrl(url) || url;
    } else if (lower.includes("linkedin.com")) {
      social.linkedin = normalizeUrl(url) || url;
    } else if (lower.includes("wa.me") || lower.includes("whatsapp.com")) {
      // Extraire le numéro WhatsApp
      const match = url.match(/wa\.me\/(\d+)/);
      if (match) {
        social.whatsapp = "+" + match[1];
      }
    }
  }

  return social;
}

// ============================================
// HASHING
// ============================================

/**
 * Génère un hash SHA256 d'une chaîne
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Génère un hash pour une URL de photo (pour déduplication)
 */
export function hashPhotoUrl(url: string): string {
  // Normaliser l'URL avant hashing
  const normalized = normalizeUrl(url) || url;
  return sha256(normalized);
}

// ============================================
// GÉOLOCALISATION
// ============================================

/**
 * Calcule la distance en mètres entre deux points GPS
 * (Formule de Haversine)
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Rayon de la Terre en mètres
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ============================================
// SIMILARITÉ DE TEXTE
// ============================================

/**
 * Calcule la similarité Jaro-Winkler entre deux chaînes
 * @returns Score entre 0 et 1
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  const str1 = s1.toLowerCase();
  const str2 = s2.toLowerCase();

  const len1 = str1.length;
  const len2 = str2.length;

  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Trouver les correspondances
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);

    for (let j = start; j < end; j++) {
      if (matches2[j] || str1[i] !== str2[j]) continue;
      matches1[i] = true;
      matches2[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Compter les transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!matches1[i]) continue;
    while (!matches2[k]) k++;
    if (str1[i] !== str2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) /
    3;

  // Bonus Winkler pour préfixe commun
  let prefixLength = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (str1[i] === str2[i]) prefixLength++;
    else break;
  }

  return jaro + prefixLength * 0.1 * (1 - jaro);
}

/**
 * Calcule la similarité entre deux noms d'établissement
 * Utilise les noms normalisés
 */
export function calculateNameSimilarity(name1: string, name2: string): number {
  const norm1 = normalizeEstablishmentName(name1);
  const norm2 = normalizeEstablishmentName(name2);

  return jaroWinklerSimilarity(norm1, norm2);
}

// ============================================
// CATÉGORISATION
// ============================================

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  restaurant: ["restaurant", "resto", "gastronomie", "table", "cuisine"],
  cafe: ["café", "cafe", "coffee", "expresso"],
  bar: ["bar", "pub", "taverne"],
  rooftop: ["rooftop", "toit", "terrasse panoramique"],
  lounge: ["lounge", "salon"],
  patisserie: ["pâtisserie", "patisserie", "gâteau", "gateau", "dessert"],
  tea_room: ["salon de thé", "the", "tea"],
  fast_food: ["fast food", "fast-food", "burger", "pizza", "sandwich"],
  brasserie: ["brasserie"],
  snack: ["snack", "casse-croûte"],
  glacier: ["glacier", "glace", "ice cream"],
  boulangerie: ["boulangerie", "pain", "bakery"],
  traiteur: ["traiteur", "catering"],
  food_truck: ["food truck", "camion", "street food"],
  club: ["club", "discothèque", "discotheque", "night club", "boîte de nuit"],
};

/**
 * Devine la catégorie CHR à partir du nom/description
 */
export function guessCategory(
  name: string,
  description?: string,
  tags?: string[]
): string | undefined {
  const text = [name, description, ...(tags || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return category;
    }
  }

  return undefined;
}

// ============================================
// EXTRACTION VILLE
// ============================================

const CITY_PATTERNS: Record<string, RegExp[]> = {
  casablanca: [/casablanca/i, /casa/i],
  marrakech: [/marrakech/i, /marrakesh/i],
  rabat: [/rabat/i],
  fes: [/f[eè]s/i, /fez/i],
  tanger: [/tanger/i, /tangier/i],
  agadir: [/agadir/i],
  meknes: [/mekn[eè]s/i],
  oujda: [/oujda/i],
  kenitra: [/k[eé]nitra/i],
  tetouan: [/t[eé]touan/i],
  essaouira: [/essaouira/i, /mogador/i],
  el_jadida: [/el jadida/i, /el-jadida/i],
  mohammedia: [/mohammedia/i],
};

/**
 * Extrait la ville d'une adresse
 */
export function extractCity(address: string): string | undefined {
  if (!address) return undefined;

  const lower = address.toLowerCase();

  for (const [city, patterns] of Object.entries(CITY_PATTERNS)) {
    if (patterns.some((p) => p.test(lower))) {
      return city.replace("_", " ");
    }
  }

  return undefined;
}

// ============================================
// PRICE RANGE
// ============================================

/**
 * Normalise le price range
 */
export function normalizePriceRange(
  priceLevel: number | string | undefined | null
): string | undefined {
  if (priceLevel === undefined || priceLevel === null) return undefined;

  if (typeof priceLevel === "number") {
    // Google Places API style (0-4)
    switch (priceLevel) {
      case 0:
        return "€";
      case 1:
        return "€";
      case 2:
        return "€€";
      case 3:
        return "€€€";
      case 4:
        return "€€€€";
      default:
        return undefined;
    }
  }

  // String style
  const str = String(priceLevel).trim();
  if (/^[€$£]{1,4}$/.test(str)) {
    return str.replace(/[$£]/g, "€");
  }
  if (/cheap|budget|bon marché/i.test(str)) return "€";
  if (/moderate|modéré|moyen/i.test(str)) return "€€";
  if (/expensive|cher|haut de gamme/i.test(str)) return "€€€";
  if (/very expensive|très cher|luxe/i.test(str)) return "€€€€";

  return undefined;
}

// ============================================
// RETRY AVEC BACKOFF
// ============================================

interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Exécute une fonction avec retry et backoff exponentiel
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < opts.maxRetries) {
        console.warn(
          `[Retry] Attempt ${attempt + 1}/${opts.maxRetries + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
      }
    }
  }

  throw lastError;
}

// ============================================
// LOGGING
// ============================================

export interface ImportLogEntry {
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

const importLogs: ImportLogEntry[] = [];

export function logImport(
  level: "info" | "warn" | "error",
  source: string,
  message: string,
  data?: Record<string, unknown>
): void {
  const entry: ImportLogEntry = {
    level,
    source,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  importLogs.push(entry);

  // Garder seulement les 1000 derniers logs en mémoire
  if (importLogs.length > 1000) {
    importLogs.shift();
  }

  // Log console aussi
  const prefix = `[Import:${source}]`;
  if (level === "error") {
    console.error(prefix, message, data || "");
  } else if (level === "warn") {
    console.warn(prefix, message, data || "");
  } else {
    console.log(prefix, message, data || "");
  }
}

export function getImportLogs(limit: number = 100): ImportLogEntry[] {
  return importLogs.slice(-limit);
}

export function clearImportLogs(): void {
  importLogs.length = 0;
}
