/**
 * Pack Schemas - SAM
 *
 * Schémas Zod pour la validation des packs (offres commerciales).
 */

import { z } from "zod";
import {
  uuidSchema,
  titleSchema,
  longDescriptionSchema,
  priceCentsSchema,
  quantitySchema,
  dateIsoSchema,
  urlSchema,
} from "./common";

// ============================================
// PACK ITEM
// ============================================

/**
 * Élément d'un pack
 */
export const packItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  quantity: z.number().int().min(1).default(1),
  unit: z.string().max(50).optional(),
});

export type PackItem = z.infer<typeof packItemSchema>;

// ============================================
// CREATE PACK
// ============================================

/**
 * Schéma pour créer un pack (Pro)
 */
export const createPackSchema = z.object({
  // Requis
  title: z
    .string()
    .min(3, { message: "Le titre doit contenir au moins 3 caractères" })
    .max(200, { message: "Le titre ne peut pas dépasser 200 caractères" })
    .transform((v) => v.trim()),
  price: z
    .number()
    .positive({ message: "Le prix doit être supérieur à 0" })
    .max(10000000, { message: "Prix trop élevé" }), // Max 100 000 MAD en centimes

  // Optionnels
  description: z
    .string()
    .max(2000, { message: "Description trop longue (max 2000 caractères)" })
    .transform((v) => v.trim())
    .nullable()
    .optional(),
  label: z
    .string()
    .max(50, { message: "Label trop long (max 50 caractères)" })
    .transform((v) => v.trim())
    .nullable()
    .optional(),
  items: z.array(packItemSchema).default([]),
  original_price: z
    .number()
    .positive()
    .nullable()
    .optional(),
  is_limited: z.boolean().default(false),
  stock: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional(),
  availability: z
    .enum(["permanent", "limited", "seasonal"])
    .default("permanent"),
  max_reservations: z
    .number()
    .int()
    .min(1)
    .nullable()
    .optional(),
  active: z.boolean().default(true),
  valid_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format date invalide (YYYY-MM-DD)" })
    .nullable()
    .optional(),
  valid_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format date invalide (YYYY-MM-DD)" })
    .nullable()
    .optional(),
  conditions: z
    .string()
    .max(1000, { message: "Conditions trop longues (max 1000 caractères)" })
    .nullable()
    .optional(),
  cover_url: z
    .string()
    .url({ message: "URL de couverture invalide" })
    .nullable()
    .optional(),
});

export type CreatePackInput = z.infer<typeof createPackSchema>;

// ============================================
// UPDATE PACK
// ============================================

/**
 * Schéma pour mettre à jour un pack (Pro)
 * Tous les champs sont optionnels
 */
export const updatePackSchema = z.object({
  title: z
    .string()
    .min(3, { message: "Le titre doit contenir au moins 3 caractères" })
    .max(200, { message: "Le titre ne peut pas dépasser 200 caractères" })
    .transform((v) => v.trim())
    .optional(),
  price: z
    .number()
    .positive({ message: "Le prix doit être supérieur à 0" })
    .max(10000000, { message: "Prix trop élevé" })
    .optional(),
  description: z
    .string()
    .max(2000)
    .transform((v) => v.trim())
    .nullable()
    .optional(),
  label: z
    .string()
    .max(50)
    .transform((v) => v.trim())
    .nullable()
    .optional(),
  items: z.array(packItemSchema).optional(),
  original_price: z.number().positive().nullable().optional(),
  is_limited: z.boolean().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  availability: z.enum(["permanent", "limited", "seasonal"]).optional(),
  max_reservations: z.number().int().min(1).nullable().optional(),
  active: z.boolean().optional(),
  valid_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  valid_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  conditions: z.string().max(1000).nullable().optional(),
  cover_url: z.string().url().nullable().optional(),
});

export type UpdatePackInput = z.infer<typeof updatePackSchema>;

// ============================================
// PACK CHECKOUT
// ============================================

/**
 * Schéma pour l'achat d'un pack (Consumer)
 */
export const checkoutPackSchema = z.object({
  pack_id: uuidSchema,
  packId: uuidSchema.optional(),
  quantity: z.number().int().min(1).max(10).default(1),

  // Informations de réservation optionnelles
  reservation_date: z.string().optional(),
  reservationDate: z.string().optional(),
  party_size: z.number().int().min(1).max(500).optional(),
  partySize: z.number().int().min(1).max(500).optional(),
  special_requests: z.string().max(500).optional(),
  specialRequests: z.string().max(500).optional(),

  // Métadonnées
  meta: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.pack_id || data.packId,
  { message: "pack_id est requis", path: ["pack_id"] }
);

export type CheckoutPackInput = z.infer<typeof checkoutPackSchema>;

// ============================================
// PATH PARAMS
// ============================================

/**
 * Paramètres de route pour les packs
 */
export const packPathParamsSchema = z.object({
  establishmentId: uuidSchema,
  packId: uuidSchema.optional(),
});

export type PackPathParams = z.infer<typeof packPathParamsSchema>;

/**
 * Paramètres de route pour un pack spécifique
 */
export const packIdParamsSchema = z.object({
  establishmentId: uuidSchema,
  packId: uuidSchema,
});

export type PackIdParams = z.infer<typeof packIdParamsSchema>;

// ============================================
// QUERY PARAMS
// ============================================

/**
 * Paramètres de filtrage des packs
 */
export const packFiltersSchema = z.object({
  active: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  availability: z.enum(["permanent", "limited", "seasonal"]).optional(),
  min_price: z.coerce.number().min(0).optional(),
  max_price: z.coerce.number().min(0).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PackFilters = z.infer<typeof packFiltersSchema>;
