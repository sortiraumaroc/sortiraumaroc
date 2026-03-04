/**
 * Newsletter — Zod Validation Schemas
 */

import { z } from "../lib/validate";

// POST /api/newsletter/subscribe
export const NewsletterSubscribeSchema = z.object({
  email: z.string().min(1),
  source: z.string().optional(),
});

// POST /api/newsletter/unsubscribe
export const NewsletterUnsubscribeSchema = z.object({
  email: z.string().min(1),
});
