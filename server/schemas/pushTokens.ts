/**
 * Push Tokens — Zod Validation Schemas
 */

import { z } from "../lib/validate";

// POST /api/consumer/push/register
export const RegisterPushTokenSchema = z.object({
  token: z.string().min(10),
  device_type: z.enum(["web", "ios", "android"]).optional(),
  device_name: z.string().optional(),
});

// POST /api/consumer/push/unregister
export const UnregisterPushTokenSchema = z.object({
  token: z.string().min(1),
});

// POST /api/consumer/push/preferences
export const UpdatePushPreferencesSchema = z.object({
  push_notifications_enabled: z.boolean().optional(),
  push_waitlist_enabled: z.boolean().optional(),
  push_bookings_enabled: z.boolean().optional(),
  push_marketing_enabled: z.boolean().optional(),
});
