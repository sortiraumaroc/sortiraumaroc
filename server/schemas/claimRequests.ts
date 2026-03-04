/**
 * Claim Requests — Zod Validation Schemas
 */

import { z } from "../lib/validate";

// POST /api/public/claim-request
export const SubmitClaimRequestSchema = z.object({
  establishmentId: z.string().min(1),
  establishmentName: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().min(1),
  preferredDay: z.string().min(1),
  preferredTime: z.string().min(1),
});
