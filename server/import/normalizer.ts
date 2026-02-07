/**
 * Normalizer - SAM Import CHR
 *
 * Normalise les données brutes des connecteurs en format standard
 * prêt pour l'insertion dans la table staging.
 */

import type {
  RawPlace,
  NormalizedPlace,
  NormalizedPhoto,
  SourceRef,
  ChrCategory,
  SocialLinks,
} from "./connectors/types";
import {
  normalizeEstablishmentName,
  normalizePhoneMaroc,
  normalizeUrl,
  normalizeEmail,
  extractSocialLinks,
  hashPhotoUrl,
  guessCategory,
  extractCity,
  normalizePriceRange,
  logImport,
} from "./utils";

// ============================================
// NORMALISATION PRINCIPALE
// ============================================

/**
 * Normalise un lieu brut en format standard
 */
export function normalizePlace(raw: RawPlace): NormalizedPlace {
  // Nom
  const name = cleanName(raw.name);
  const nameNormalized = normalizeEstablishmentName(name);

  // Catégorie
  const category = normalizeCategory(
    raw.category,
    raw.name,
    raw.description,
    raw.tags
  );

  // Ville
  const city = normalizeCity(raw.city, raw.address);

  // Téléphone
  const phoneE164 = normalizePhoneMaroc(raw.phone);

  // URLs
  const websiteUrl = normalizeUrl(raw.website);
  const googleMapsUrl = normalizeUrl(raw.googleMapsUrl);

  // Email
  const email = normalizeEmail(raw.email);

  // Liens sociaux
  const socialLinks = mergeSocialLinks(raw.socialLinks, websiteUrl);

  // Photos
  const photos = normalizePhotos(raw.photos, raw.source);

  // Tags
  const tags = normalizeTags(raw.tags, raw.amenities, raw.cuisineTypes);

  // Prix
  const priceRange = normalizePriceRange(raw.priceRange);

  // Description
  const descriptionShort = normalizeDescription(raw.description);

  // Source reference
  const sourceRef: SourceRef = {
    source: raw.source,
    sourceUrl: raw.sourceUrl,
    externalId: raw.externalId,
    fetchedAt: raw.fetchedAt,
  };

  // Adresse complète
  const addressFull = normalizeAddress(raw.address, raw.city, raw.postalCode);

  return {
    name,
    nameNormalized,
    category,
    subcategory: raw.subcategory,

    descriptionShort,

    addressFull,
    city,
    neighborhood: raw.neighborhood?.trim() || undefined,

    phoneE164: phoneE164 || undefined,
    websiteUrl: websiteUrl || undefined,
    email: email || undefined,
    googleMapsUrl: googleMapsUrl || undefined,

    latitude: raw.latitude,
    longitude: raw.longitude,

    openingHours: raw.openingHours,
    priceRange,

    tags,
    socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
    photos: photos.length > 0 ? photos : undefined,

    sources: [sourceRef],

    payloadRaw: raw.rawData,
  };
}

/**
 * Fusionne plusieurs lieux normalisés (même établissement, sources différentes)
 */
export function mergePlaces(places: NormalizedPlace[]): NormalizedPlace {
  if (places.length === 0) {
    throw new Error("Cannot merge empty array of places");
  }
  if (places.length === 1) {
    return places[0];
  }

  // Priorité: Google > autres (pour la géolocalisation et téléphone)
  const sorted = [...places].sort((a, b) => {
    const aIsGoogle = a.sources.some((s) => s.source === "google");
    const bIsGoogle = b.sources.some((s) => s.source === "google");
    if (aIsGoogle && !bIsGoogle) return -1;
    if (!aIsGoogle && bIsGoogle) return 1;
    return 0;
  });

  const primary = sorted[0];
  const others = sorted.slice(1);

  // Fusionner les sources
  const allSources = places.flatMap((p) => p.sources);
  const uniqueSources = allSources.filter(
    (s, i, arr) => arr.findIndex((x) => x.source === s.source && x.externalId === s.externalId) === i
  );

  // Fusionner les photos (dédupliquer par hash)
  const allPhotos = places.flatMap((p) => p.photos || []);
  const seenHashes = new Set<string>();
  const uniquePhotos = allPhotos.filter((photo) => {
    if (seenHashes.has(photo.hash)) return false;
    seenHashes.add(photo.hash);
    return true;
  });

  // Fusionner les tags
  const allTags = places.flatMap((p) => p.tags || []);
  const uniqueTags = [...new Set(allTags)];

  // Fusionner les liens sociaux
  const mergedSocial: SocialLinks = {};
  for (const place of places) {
    if (place.socialLinks) {
      Object.assign(mergedSocial, place.socialLinks);
    }
  }

  return {
    // Données principales (de la source prioritaire)
    name: primary.name,
    nameNormalized: primary.nameNormalized,
    category: primary.category,
    subcategory: primary.subcategory || others.find((p) => p.subcategory)?.subcategory,

    descriptionShort: primary.descriptionShort || others.find((p) => p.descriptionShort)?.descriptionShort,

    addressFull: primary.addressFull || others.find((p) => p.addressFull)?.addressFull,
    city: primary.city,
    neighborhood: primary.neighborhood || others.find((p) => p.neighborhood)?.neighborhood,

    // Contact (priorité Google)
    phoneE164: primary.phoneE164 || others.find((p) => p.phoneE164)?.phoneE164,
    websiteUrl: primary.websiteUrl || others.find((p) => p.websiteUrl)?.websiteUrl,
    email: primary.email || others.find((p) => p.email)?.email,
    googleMapsUrl: primary.googleMapsUrl || others.find((p) => p.googleMapsUrl)?.googleMapsUrl,

    // Géolocalisation (priorité Google)
    latitude: primary.latitude ?? others.find((p) => p.latitude != null)?.latitude,
    longitude: primary.longitude ?? others.find((p) => p.longitude != null)?.longitude,

    // Horaires (priorité Google)
    openingHours: primary.openingHours || others.find((p) => p.openingHours)?.openingHours,
    priceRange: primary.priceRange || others.find((p) => p.priceRange)?.priceRange,

    // Données fusionnées
    tags: uniqueTags.length > 0 ? uniqueTags : undefined,
    socialLinks: Object.keys(mergedSocial).length > 0 ? mergedSocial as SocialLinks : undefined,
    photos: uniquePhotos.length > 0 ? uniquePhotos : undefined,

    // Toutes les sources
    sources: uniqueSources,

    payloadRaw: primary.payloadRaw,
  };
}

// ============================================
// HELPERS DE NORMALISATION
// ============================================

/**
 * Nettoie un nom d'établissement et applique le Title Case
 * Ex: "THE CLOUD COFFEE LAB" -> "The Cloud Coffee Lab"
 */
function cleanName(name: string | undefined): string {
  if (!name) return "";

  const cleaned = name
    .replace(/\s+/g, " ")
    .replace(/^["']|["']$/g, "") // Enlever quotes
    .replace(/\s*[-–—]\s*(?:Restaurant|Café|Bar|Lounge)$/i, "") // Enlever suffixes
    .trim();

  // Appliquer le Title Case: première lettre de chaque mot en majuscule
  return toTitleCase(cleaned);
}

/**
 * Convertit une chaîne en Title Case
 * Ex: "THE CLOUD COFFEE LAB" -> "The Cloud Coffee Lab"
 * Gère les mots courts (de, du, la, le, etc.) qu'on laisse en minuscule sauf en début
 */
function toTitleCase(str: string): string {
  // Mots qu'on garde en minuscule (sauf en début de phrase)
  const minorWords = new Set(["de", "du", "la", "le", "les", "des", "et", "ou", "à", "au", "aux", "en", "par", "pour", "sur", "avec", "sans", "sous", "chez"]);

  return str
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (!word) return word;

      // Premier mot toujours capitalisé, ou si le mot n'est pas un mot mineur
      if (index === 0 || !minorWords.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(" ");
}

/**
 * Normalise la catégorie
 */
function normalizeCategory(
  category: string | undefined,
  name: string,
  description?: string,
  tags?: string[]
): ChrCategory | string {
  // Si catégorie fournie et valide
  if (category) {
    const lower = category.toLowerCase().replace(/\s+/g, "_");
    if (isValidCategory(lower)) {
      return lower as ChrCategory;
    }
  }

  // Deviner depuis le contenu
  const guessed = guessCategory(name, description, tags);
  if (guessed && isValidCategory(guessed)) {
    return guessed as ChrCategory;
  }

  // Défaut
  return "restaurant";
}

/**
 * Vérifie si une catégorie est valide
 */
function isValidCategory(cat: string): boolean {
  const validCategories = [
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
  return validCategories.includes(cat);
}

/**
 * Normalise la ville
 */
function normalizeCity(city: string | undefined, address?: string): string {
  if (city) {
    return city.toLowerCase().trim().replace(/\s+/g, " ");
  }

  if (address) {
    const extracted = extractCity(address);
    if (extracted) {
      return extracted.toLowerCase();
    }
  }

  return "";
}

/**
 * Normalise l'adresse complète
 */
function normalizeAddress(
  address?: string,
  city?: string,
  postalCode?: string
): string | undefined {
  if (!address) return undefined;

  let full = address.trim();

  // Ajouter code postal si pas déjà présent
  if (postalCode && !full.includes(postalCode)) {
    full = `${full}, ${postalCode}`;
  }

  // Ajouter ville si pas déjà présente
  if (city && !full.toLowerCase().includes(city.toLowerCase())) {
    full = `${full}, ${city}`;
  }

  return full;
}

/**
 * Fusionne les liens sociaux
 */
function mergeSocialLinks(
  socialLinks?: SocialLinks,
  websiteUrl?: string | null
): SocialLinks {
  const merged: SocialLinks = {};

  if (socialLinks) {
    Object.assign(merged, socialLinks);
  }

  // Essayer d'extraire des sociaux depuis le site web (pattern)
  // Ceci serait plus sophistiqué en production (scraping du site)

  return merged;
}

/**
 * Normalise les photos
 */
function normalizePhotos(
  photos: RawPlace["photos"],
  source: string
): NormalizedPhoto[] {
  if (!photos || photos.length === 0) return [];

  return photos
    .filter((p) => p.url && isValidPhotoUrl(p.url))
    .map((p) => ({
      url: p.url,
      source: source as any,
      credit: p.credit,
      hash: hashPhotoUrl(p.url),
    }))
    .slice(0, 10); // Max 10 photos
}

/**
 * Vérifie si une URL de photo est valide
 */
function isValidPhotoUrl(url: string): boolean {
  if (!url) return false;

  // Filtrer les images invalides
  const blacklist = [
    "placeholder",
    "default",
    "no-image",
    "avatar",
    "icon",
    "logo",
    "blank",
    "empty",
    "1x1",
    "spacer",
  ];

  const lower = url.toLowerCase();
  return !blacklist.some((term) => lower.includes(term));
}

/**
 * Normalise les tags
 */
function normalizeTags(
  tags?: string[],
  amenities?: string[],
  cuisineTypes?: string[]
): string[] | undefined {
  const allTags: string[] = [];

  const addTags = (items: string[] | undefined) => {
    if (items) {
      for (const item of items) {
        const cleaned = item.toLowerCase().trim();
        if (cleaned && cleaned.length < 50 && !allTags.includes(cleaned)) {
          allTags.push(cleaned);
        }
      }
    }
  };

  addTags(tags);
  addTags(amenities);
  addTags(cuisineTypes);

  // Filtrer les tags non pertinents
  const filtered = allTags.filter(
    (tag) =>
      !tag.includes("point_of_interest") &&
      !tag.includes("establishment") &&
      tag !== "restaurant" &&
      tag !== "cafe" &&
      tag !== "bar"
  );

  return filtered.length > 0 ? filtered.slice(0, 15) : undefined;
}

/**
 * Normalise la description
 */
function normalizeDescription(description?: string): string | undefined {
  if (!description) return undefined;

  let cleaned = description
    .replace(/<[^>]*>/g, " ") // Supprimer HTML
    .replace(/\s+/g, " ")
    .trim();

  // Limiter la longueur
  if (cleaned.length > 500) {
    cleaned = cleaned.slice(0, 497) + "...";
  }

  return cleaned.length > 20 ? cleaned : undefined;
}

// ============================================
// BATCH NORMALIZATION
// ============================================

/**
 * Normalise un batch de lieux bruts
 */
export function normalizeBatch(rawPlaces: RawPlace[]): NormalizedPlace[] {
  const normalized: NormalizedPlace[] = [];
  let errors = 0;

  for (const raw of rawPlaces) {
    try {
      const place = normalizePlace(raw);

      // Validation minimale
      if (!place.name || !place.city) {
        logImport("warn", "normalizer", "Skipped place with missing name or city", {
          source: raw.source,
          externalId: raw.externalId,
        });
        continue;
      }

      normalized.push(place);
    } catch (error) {
      errors++;
      logImport("error", "normalizer", "Failed to normalize place", {
        source: raw.source,
        externalId: raw.externalId,
        error: (error as Error).message,
      });
    }
  }

  logImport("info", "normalizer", `Normalized ${normalized.length}/${rawPlaces.length} places (${errors} errors)`);

  return normalized;
}
