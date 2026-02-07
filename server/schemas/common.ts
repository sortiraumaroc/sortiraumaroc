/**
 * Common Zod Schemas - SAM
 *
 * Schémas réutilisables pour les validations communes.
 * Ces schémas sont utilisés comme base pour les validations plus spécifiques.
 */

import { z } from "zod";

// ============================================
// PRIMITIVES
// ============================================

/**
 * UUID v4 valide
 */
export const uuidSchema = z
  .string()
  .uuid({ message: "Format UUID invalide" })
  .describe("UUID v4");

/**
 * Email valide et normalisé
 */
export const emailSchema = z
  .string()
  .email({ message: "Format email invalide" })
  .transform((v) => v.toLowerCase().trim())
  .describe("Adresse email");

/**
 * Numéro de téléphone marocain
 * Formats acceptés: +212XXXXXXXXX, 0XXXXXXXXX, 06XXXXXXXX, 07XXXXXXXX, 05XXXXXXXX
 */
export const phoneMarocSchema = z
  .string()
  .regex(
    /^(\+212|0)[5-7]\d{8}$/,
    { message: "Format téléphone invalide (ex: +212612345678 ou 0612345678)" }
  )
  .describe("Numéro de téléphone marocain");

/**
 * Numéro de téléphone international (plus permissif)
 */
export const phoneInternationalSchema = z
  .string()
  .min(8, { message: "Numéro trop court" })
  .max(20, { message: "Numéro trop long" })
  .regex(/^[+]?[\d\s-()]+$/, { message: "Format téléphone invalide" })
  .describe("Numéro de téléphone international");

/**
 * Date au format ISO (YYYY-MM-DD)
 */
export const dateIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format date invalide (YYYY-MM-DD)" })
  .refine(
    (v) => {
      const d = new Date(v);
      return !isNaN(d.getTime());
    },
    { message: "Date invalide" }
  )
  .describe("Date au format YYYY-MM-DD");

/**
 * Date-time ISO 8601
 */
export const dateTimeIsoSchema = z
  .string()
  .datetime({ message: "Format date-time invalide (ISO 8601)" })
  .describe("Date-time au format ISO 8601");

/**
 * Heure au format HH:MM
 */
export const timeSchema = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, { message: "Format heure invalide (HH:MM)" })
  .describe("Heure au format HH:MM");

/**
 * Créneau horaire (ex: "12:00-14:00")
 */
export const timeSlotSchema = z
  .string()
  .regex(
    /^([01]?\d|2[0-3]):[0-5]\d-([01]?\d|2[0-3]):[0-5]\d$/,
    { message: "Format créneau invalide (HH:MM-HH:MM)" }
  )
  .describe("Créneau horaire");

// ============================================
// STRINGS AVEC CONTRAINTES
// ============================================

/**
 * Nom (prénom, nom de famille, etc.)
 */
export const nameSchema = z
  .string()
  .min(2, { message: "Minimum 2 caractères" })
  .max(100, { message: "Maximum 100 caractères" })
  .transform((v) => v.trim())
  .describe("Nom");

/**
 * Titre (titre de pack, d'établissement, etc.)
 */
export const titleSchema = z
  .string()
  .min(3, { message: "Minimum 3 caractères" })
  .max(200, { message: "Maximum 200 caractères" })
  .transform((v) => v.trim())
  .describe("Titre");

/**
 * Description courte
 */
export const shortDescriptionSchema = z
  .string()
  .min(10, { message: "Minimum 10 caractères" })
  .max(500, { message: "Maximum 500 caractères" })
  .transform((v) => v.trim())
  .describe("Description courte");

/**
 * Description longue
 */
export const longDescriptionSchema = z
  .string()
  .min(10, { message: "Minimum 10 caractères" })
  .max(5000, { message: "Maximum 5000 caractères" })
  .transform((v) => v.trim())
  .describe("Description longue");

/**
 * Slug URL (lowercase, tirets, pas d'espaces)
 */
export const slugSchema = z
  .string()
  .min(3, { message: "Minimum 3 caractères" })
  .max(100, { message: "Maximum 100 caractères" })
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Format slug invalide (lettres minuscules, chiffres et tirets)",
  })
  .describe("Slug URL");

/**
 * URL valide
 */
export const urlSchema = z
  .string()
  .url({ message: "Format URL invalide" })
  .describe("URL");

/**
 * URL d'image (avec extensions valides)
 */
export const imageUrlSchema = z
  .string()
  .url({ message: "Format URL invalide" })
  .refine(
    (url) => {
      const path = url.toLowerCase().split("?")[0];
      return (
        path.endsWith(".jpg") ||
        path.endsWith(".jpeg") ||
        path.endsWith(".png") ||
        path.endsWith(".gif") ||
        path.endsWith(".webp") ||
        path.endsWith(".svg") ||
        path.includes("/storage/") // Supabase storage
      );
    },
    { message: "URL d'image invalide" }
  )
  .describe("URL d'image");

// ============================================
// NOMBRES
// ============================================

/**
 * Prix en centimes (entier positif)
 */
export const priceCentsSchema = z
  .number()
  .int({ message: "Le prix doit être un entier" })
  .min(0, { message: "Le prix ne peut pas être négatif" })
  .max(100000000, { message: "Prix trop élevé" }) // Max 1M MAD
  .describe("Prix en centimes");

/**
 * Prix en MAD (nombre décimal)
 */
export const priceMadSchema = z
  .number()
  .min(0, { message: "Le prix ne peut pas être négatif" })
  .max(1000000, { message: "Prix trop élevé" })
  .describe("Prix en MAD");

/**
 * Quantité (entier positif)
 */
export const quantitySchema = z
  .number()
  .int({ message: "La quantité doit être un entier" })
  .min(1, { message: "Minimum 1" })
  .max(10000, { message: "Quantité trop élevée" })
  .describe("Quantité");

/**
 * Nombre de personnes
 */
export const guestsSchema = z
  .number()
  .int({ message: "Le nombre de personnes doit être un entier" })
  .min(1, { message: "Minimum 1 personne" })
  .max(500, { message: "Maximum 500 personnes" })
  .describe("Nombre de personnes");

/**
 * Pourcentage (0-100)
 */
export const percentageSchema = z
  .number()
  .min(0, { message: "Minimum 0%" })
  .max(100, { message: "Maximum 100%" })
  .describe("Pourcentage");

/**
 * Note (1-5)
 */
export const ratingSchema = z
  .number()
  .min(1, { message: "Note minimum 1" })
  .max(5, { message: "Note maximum 5" })
  .describe("Note");

// ============================================
// COORDONNÉES GPS
// ============================================

/**
 * Latitude
 */
export const latitudeSchema = z
  .number()
  .min(-90, { message: "Latitude invalide" })
  .max(90, { message: "Latitude invalide" })
  .describe("Latitude");

/**
 * Longitude
 */
export const longitudeSchema = z
  .number()
  .min(-180, { message: "Longitude invalide" })
  .max(180, { message: "Longitude invalide" })
  .describe("Longitude");

/**
 * Coordonnées GPS
 */
export const coordinatesSchema = z.object({
  lat: latitudeSchema,
  lng: longitudeSchema,
});

// ============================================
// ENUMS COMMUNS
// ============================================

/**
 * Univers d'établissement
 */
export const universeSchema = z.enum(
  ["restaurant", "hotel", "wellness", "loisir", "evenement"],
  { message: "Univers invalide" }
);
export type Universe = z.infer<typeof universeSchema>;

/**
 * Statut de réservation
 */
export const reservationStatusSchema = z.enum(
  ["pending", "confirmed", "cancelled", "completed", "no_show"],
  { message: "Statut de réservation invalide" }
);
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

/**
 * Rôle Pro
 */
export const proRoleSchema = z.enum(
  ["owner", "manager", "reception", "accounting", "marketing"],
  { message: "Rôle invalide" }
);
export type ProRole = z.infer<typeof proRoleSchema>;

/**
 * Langue
 */
export const languageSchema = z.enum(["fr", "ar", "en"], {
  message: "Langue invalide",
});
export type Language = z.infer<typeof languageSchema>;

// ============================================
// PAGINATION
// ============================================

/**
 * Paramètres de pagination
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).optional(),
});
export type PaginationParams = z.infer<typeof paginationSchema>;

// ============================================
// UTILITAIRES
// ============================================

/**
 * Rend tous les champs optionnels sauf ceux spécifiés
 */
export function makePartialExcept<T extends z.ZodRawShape, K extends keyof T>(
  schema: z.ZodObject<T>,
  requiredKeys: K[]
): z.ZodObject<{
  [P in keyof T]: P extends K ? T[P] : z.ZodOptional<T[P]>;
}> {
  const shape = schema.shape;
  const newShape: Record<string, z.ZodTypeAny> = {};

  for (const key in shape) {
    if ((requiredKeys as readonly string[]).includes(key)) {
      newShape[key] = shape[key];
    } else {
      newShape[key] = shape[key].optional();
    }
  }

  return z.object(newShape) as z.ZodObject<{
    [P in keyof T]: P extends K ? T[P] : z.ZodOptional<T[P]>;
  }>;
}

/**
 * Convertit les strings vides en undefined
 */
export const emptyStringToUndefined = z
  .string()
  .transform((v) => (v.trim() === "" ? undefined : v.trim()));

/**
 * String qui peut être vide ou undefined
 */
export const optionalStringSchema = z
  .string()
  .optional()
  .transform((v) => (v?.trim() === "" ? undefined : v?.trim()));
