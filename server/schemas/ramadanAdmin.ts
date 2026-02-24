/**
 * Zod Schemas for Ramadan Admin Routes
 */

import { z } from "zod";

// POST /api/admin/ramadan/:id/approve
export const ApproveRamadanOfferSchema = z.object({
  note: z.string().optional(),
});

// POST /api/admin/ramadan/:id/reject
export const RejectRamadanOfferSchema = z.object({
  reason: z.string().min(1),
});

// POST /api/admin/ramadan/:id/request-modification
export const RequestModificationSchema = z.object({
  note: z.string().min(1),
});
