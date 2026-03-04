/**
 * Types et helpers pour le type de tarification (prix).
 *
 * Utilisé côté client et serveur pour :
 * - pro_slots (créneaux ftour, slots pro)
 * - packs
 * - ramadan_offers
 */

export const PRICE_TYPES = ["fixed", "starting_from", "a_la_carte", "nc"] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

/** Labels d'affichage dans les formulaires (Select) */
export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  fixed: "Prix",
  starting_from: "À partir de",
  a_la_carte: "À la carte",
  nc: "NC",
};

/** Types qui affichent un champ prix (input numérique) */
export const PRICE_TYPES_WITH_INPUT: readonly PriceType[] = ["fixed", "starting_from"];

/**
 * Formate l'affichage du prix selon le price_type.
 * @param priceType - Le type de prix
 * @param priceCents - Le prix en centimes (pour 'fixed' et 'starting_from')
 * @returns Chaîne formatée pour l'affichage
 */
export function formatPriceByType(
  priceType: PriceType | string | null | undefined,
  priceCents: number | null | undefined,
): string {
  // Rétrocompatibilité : "free" est un ancien default — inférer depuis le prix
  const effectiveType = (!priceType || priceType === "free")
    ? inferPriceType(priceCents)
    : (priceType as PriceType);
  switch (effectiveType) {
    case "fixed":
      if (priceCents && priceCents > 0) {
        return `${Math.round(priceCents / 100)} MAD`;
      }
      return "NC";
    case "starting_from":
      if (priceCents && priceCents > 0) {
        return `À p. de ${Math.round(priceCents / 100)} MAD`;
      }
      return "NC";
    case "a_la_carte":
      return "À la carte";
    case "nc":
      return "NC";
    default:
      return "NC";
  }
}

/**
 * Infère le price_type depuis un prix numérique (pour rétrocompatibilité).
 */
export function inferPriceType(priceCents: number | null | undefined): PriceType {
  if (priceCents === null || priceCents === undefined || priceCents === 0) return "nc";
  return "fixed";
}
