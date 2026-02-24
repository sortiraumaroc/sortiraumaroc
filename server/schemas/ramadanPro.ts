/**
 * Ramadan Pro Routes — Zod Validation Schemas
 */

import { z } from "zod";

/** POST / (create ramadan offer) */
export const createRamadanOfferSchema = z.object({
  establishment_id: z.string().min(1),
  title: z.string().min(1),
  type: z.string().min(1),
  price: z.number(),
  valid_from: z.string().min(1),
  valid_to: z.string().min(1),
  time_slots: z.array(z.string()).optional(),
  description_fr: z.string().optional(),
  description_ar: z.string().optional(),
  original_price: z.number().optional(),
  capacity_per_slot: z.number().optional(),
  photos: z.array(z.string()).optional(),
  cover_url: z.string().optional(),
  conditions_fr: z.string().optional(),
  conditions_ar: z.string().optional(),
});

/** PUT /:id (update ramadan offer) */
export const updateRamadanOfferSchema = z.object({
  establishment_id: z.string().min(1),
  title: z.string().optional(),
  type: z.string().optional(),
  price: z.number().optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  time_slots: z.array(z.string()).optional(),
  description_fr: z.string().optional(),
  description_ar: z.string().optional(),
  original_price: z.number().optional(),
  capacity_per_slot: z.number().optional(),
  photos: z.array(z.string()).optional(),
  cover_url: z.string().optional(),
  conditions_fr: z.string().optional(),
  conditions_ar: z.string().optional(),
});

/** POST /:id/submit, POST /:id/suspend, POST /:id/resume */
export const ramadanOfferEstablishmentSchema = z.object({
  establishment_id: z.string().min(1),
});
