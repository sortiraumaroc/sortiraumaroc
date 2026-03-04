/**
 * Zod Schemas for Admin Import CHR Routes
 */

import { z } from "zod";

const zUuid = z.string().uuid("ID invalide");

// =============================================================================
// Param Schemas (URL params)
// =============================================================================

/** :batchId — import batch */
export const ImportBatchParams = z.object({
  batchId: zUuid,
});

/** :stagingId — staging entry */
export const ImportStagingParams = z.object({
  stagingId: zUuid,
});

// POST /api/admin/import-chr/batches
export const CreateImportBatchSchema = z.object({
  sources: z.array(z.string()).min(1),
  cities: z.array(z.string()).min(1),
  categories: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});

// POST /api/admin/import-chr/staging/:stagingId/approve
export const ApproveStagingSchema = z.object({
  notes: z.string().optional(),
});

// POST /api/admin/import-chr/staging/:stagingId/reject
export const RejectStagingSchema = z.object({
  notes: z.string().optional(),
});

// POST /api/admin/import-chr/staging/bulk-approve
export const BulkApproveStagingSchema = z.object({
  stagingIds: z.array(z.string()).min(1),
});

// POST /api/admin/import-chr/staging/bulk-reject
export const BulkRejectStagingSchema = z.object({
  stagingIds: z.array(z.string()).min(1),
  notes: z.string().optional(),
});

// POST /api/admin/import-chr/staging/merge
export const MergeStagingSchema = z.object({
  stagingIds: z.array(z.string()).min(2),
});

// POST /api/admin/import-chr/staging/bulk-delete
export const BulkDeleteStagingSchema = z.object({
  stagingIds: z.array(z.string()).min(1),
});

// =============================================================================
// Query Schemas (GET routes)
// =============================================================================

/** GET /api/admin/import-chr/batches */
export const ListBatchesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/** GET /api/admin/import-chr/staging */
export const ListStagingQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  batchId: z.string().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  maxConfidence: z.coerce.number().min(0).max(1).optional(),
  search: z.string().optional(),
});

/** GET /api/admin/import-chr/staging/export */
export const ExportStagingCsvQuery = z.object({
  status: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  batchId: z.string().optional(),
});

/** GET /api/admin/import-chr/logs */
export const ListImportLogsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});
