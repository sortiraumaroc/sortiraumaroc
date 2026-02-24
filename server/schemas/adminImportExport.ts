/**
 * Zod Schemas for Admin Import/Export Routes
 */
import { z } from "zod";

// POST /api/admin/import-export/preview
export const ImportExportPreviewSchema = z.object({
  content: z.string().min(1, "Contenu requis"),
  format: z.enum(["csv", "json"]).optional(),
});

// POST /api/admin/import-export/import
export const ImportExportImportSchema = z.object({
  content: z.string().min(1, "Contenu requis"),
  format: z.enum(["csv", "json"]).optional(),
  sendEmails: z.boolean().optional(),
});
