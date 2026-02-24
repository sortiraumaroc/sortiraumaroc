/**
 * Onboarding Ramadan Routes — Zod Validation Schemas
 */

import { z } from "zod";

/** POST /send-code */
export const ramadanSendCodeSchema = z.object({
  email: z.string().min(1),
});

/** POST /verify-code */
export const ramadanVerifyCodeSchema = z.object({
  email: z.string().min(1),
  code: z.string().min(1),
});

/** POST /submit */
export const ramadanSubmitSchema = z.object({
  establishment_id: z.string().optional(),
  new_establishment: z.boolean().optional(),
  new_establishment_name: z.string().optional(),
  new_establishment_specialty: z.string().optional(),
  new_establishment_google_maps: z.string().optional(),
  new_establishment_instagram: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  offer_title: z.string().optional(),
  offer_description: z.string().optional(),
  offer_type: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  slot_interval: z.number().optional(),
  price: z.number().optional(),
  capacity: z.number().optional(),
  promotion_type: z.string().optional(),
  promotion_value: z.any().optional(),
  want_commercial: z.boolean().optional(),
  commercial_slot: z.string().optional(),
});

/** POST /commercial-callback */
export const ramadanCommercialCallbackSchema = z.object({
  establishment_id: z.string().min(1),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().min(1),
  preferred_slot: z.string().min(1),
});
