/**
 * Admin Auth — Zod Validation Schemas
 */

import { z } from "../lib/validate";

// POST /api/admin/auth/login
export const AdminLoginSchema = z.object({
  username: z.string().optional(),
  password: z.string().min(1),
});
