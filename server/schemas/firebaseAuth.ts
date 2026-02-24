/**
 * Firebase Auth — Zod Validation Schemas
 */

import { z } from "../lib/validate";

// POST /api/consumer/auth/firebase
export const FirebaseAuthSchema = z.object({
  idToken: z.string().min(1),
  phoneNumber: z.string().optional(),
  referral_code: z.string().optional(),
});
