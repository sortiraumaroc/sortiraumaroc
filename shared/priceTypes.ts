/**
 * Types et helpers pour le type de tarification (prix).
 *
 * Utilisé côté client et serveur pour :
 * - pro_slots (créneaux ftour, slots pro)
 * - packs
 * - ramadan_offers
 */

export const PRICE_TYPES = ["fixed", "free", "a_la_carte", "nc"] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

/** Labels d'affichage dans les formulaires (Select) */
export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  fixed: "Prix fixe",
  free: "Gratuit",
  a_la_carte: "À la carte",
  nc: "NC",
};

/**
 * Formate l'affichage du prix selon le price_type.
 * @param priceType - Le type de prix
 * @param priceCents - Le prix en centimes (pour 'fixed')
 * @returns Chaîne formatée pour l'affichage
 */
export function formatPriceByType(
  priceType: PriceType | string | null | undefined,
  priceCents: number | null | undefined,
): string {
  const effectiveType = (priceType as PriceType) ?? inferPriceType(priceCents);
  switch (effectiveType) {
    case "fixed":
      if (priceCents && priceCents > 0) {
        return `${Math.round(priceCents / 100)} MAD`;
      }
      return "Gratuit";
    case "free":
      return "Gratuit";
    case "a_la_carte":
      return "À la carte";
    case "nc":
      return "NC";
    default:
      return "Gratuit";
  }
}

/**
 * Infère le price_type depuis un prix numérique (pour rétrocompatibilité).
 */
export function inferPriceType(priceCents: number | null | undefined): PriceType {
  if (priceCents === null || priceCents === undefined || priceCents === 0) return "free";
  return "fixed";
}
