/**
 * Zod Schemas for Admin Reviews Routes (V1)
 */
import { z } from "zod";

// POST /api/admin/reviews/:id/reject
export const AdminRejectReviewSchema = z.object({
  reason: z.string().min(1, "Raison de rejet requise"),
});

// POST /api/admin/reports/:id/resolve
export const AdminResolveReportSchema = z.object({
  status: z.enum(["resolved", "dismissed"], { message: "Statut invalide" }),
  notes: z.string().optional(),
  action_taken: z.string().optional(),
});
