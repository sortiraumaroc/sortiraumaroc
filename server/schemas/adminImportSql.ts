/**
 * Zod Schemas for Admin Import SQL Routes
 */
import { z } from "zod";

// POST /api/admin/import-sql/parse
export const ImportSqlParseSchema = z.object({
  content: z.string().min(1, "Contenu SQL requis"),
});

// POST /api/admin/import-sql/preview
export const ImportSqlPreviewSchema = z.object({
  rows: z.array(z.record(z.unknown())).default([]),
});

// POST /api/admin/import-sql/execute
export const ImportSqlExecuteSchema = z.object({
  imports: z.array(z.record(z.unknown())).default([]),
  deleteIds: z.array(z.string()).default([]),
});
