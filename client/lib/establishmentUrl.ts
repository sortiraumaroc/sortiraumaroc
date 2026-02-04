/**
 * Utility functions for building establishment URLs with friendly slugs
 */

type UniverseType = string | null | undefined;

/**
 * Normalize universe to the URL path segment
 */
function normalizeUniverseToPath(universe: UniverseType): string {
  const u = (universe ?? "").toString().toLowerCase().trim();
  if (u === "wellness" || u === "bien-etre" || u === "bien-être") return "wellness";
  if (u === "loisir" || u === "loisirs") return "loisir";
  if (u === "culture") return "culture";
  if (u === "shopping") return "shopping";
  if (u === "hotel" || u === "hotels" || u === "hebergement" || u === "hébergement") return "hotel";
  return "restaurant";
}

/**
 * Generate a URL-friendly slug from a name
 * Used as fallback when no slug is provided
 */
function generateFallbackSlug(name: string): string {
  return name
    .toLowerCase()
    // Remove accents
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Replace spaces and special chars with hyphens
    .replace(/[^a-z0-9]+/g, "-")
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, "")
    // Remove multiple consecutive hyphens
    .replace(/-+/g, "-");
}

/**
 * Build a public URL for an establishment
 * Uses slug if available, generates one from name, or falls back to ID
 *
 * @example
 * buildEstablishmentUrl({ id: "abc-123", slug: "atlas-lodge-agadir", universe: "restaurant" })
 * // Returns: "/restaurant/atlas-lodge-agadir"
 *
 * buildEstablishmentUrl({ id: "abc-123", slug: null, name: "Riad Atlas", universe: "wellness" })
 * // Returns: "/wellness/riad-atlas"
 *
 * buildEstablishmentUrl({ id: "abc-123", slug: null, universe: "wellness" })
 * // Returns: "/wellness/abc-123"
 */
export function buildEstablishmentUrl(establishment: {
  id: string;
  slug?: string | null;
  name?: string | null;
  universe?: UniverseType;
}): string {
  const path = normalizeUniverseToPath(establishment.universe);

  // Priority: slug > generated from name > id
  let identifier = establishment.slug;
  if (!identifier && establishment.name) {
    identifier = generateFallbackSlug(establishment.name);
  }
  if (!identifier) {
    identifier = establishment.id;
  }

  return `/${path}/${encodeURIComponent(identifier)}`;
}

/**
 * Build an absolute URL for an establishment (useful for sharing)
 */
export function buildEstablishmentAbsoluteUrl(
  establishment: {
    id: string;
    slug?: string | null;
    name?: string | null;
    universe?: UniverseType;
  },
  baseUrl?: string
): string {
  const base = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
  const relativePath = buildEstablishmentUrl(establishment);
  return `${base}${relativePath}`;
}
