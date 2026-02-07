/**
 * Admin Import CHR Routes - SAM
 *
 * Routes API pour le système d'import d'établissements CHR.
 */

import type { Express, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  createImportBatch,
  runImportBatch,
  updateBatchStatus,
  approveAndImport,
  rejectStaging,
  bulkApprove,
  listBatches,
  listStagingEntries,
  initializeConnectors,
  cleanupStagingDuplicates,
  mergeStagingDuplicates,
} from "../import/importer";
import {
  getAvailableSources,
  getAvailableConnectors,
} from "../import/connectors/base";
import { getImportLogs, clearImportLogs } from "../import/utils";
import type {
  ImportSource,
  ChrCategory,
  StagingStatus,
} from "../import/connectors/types";

// ============================================
// HELPERS
// ============================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    return v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
  }
  if (typeof v === "string" && v.trim()) {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

// Admin auth check - à adapter selon votre système d'auth
function requireAdminAuth(req: unknown): { adminId: string } | null {
  // Récupérer l'admin depuis la session/cookie
  // Pour l'exemple, on utilise un header
  const r = req as { headers?: Record<string, string | undefined> };
  const adminSession = r.headers?.["x-admin-session"];

  if (!adminSession) {
    return null;
  }

  // Valider la session (à implémenter selon votre système)
  return { adminId: adminSession };
}

// ============================================
// HANDLERS
// ============================================

/**
 * GET /api/admin/import-chr/sources
 * Liste les sources d'import disponibles
 */
const listSources: RequestHandler = async (_req, res) => {
  try {
    initializeConnectors();

    const connectors = getAvailableConnectors();
    const sources = connectors.map((c) => ({
      slug: c.source,
      name: getSourceName(c.source),
      type: c.source === "google" ? "api" : "scraper",
      enabled: c.config.enabled,
    }));

    res.json({ ok: true, sources });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * GET /api/admin/import-chr/categories
 * Liste les catégories CHR
 */
const listCategories: RequestHandler = async (_req, res) => {
  try {
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("chr_categories")
      .select("*")
      .eq("active", true)
      .order("sort_order");

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ ok: true, categories: data || [] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * GET /api/admin/import-chr/batches
 * Liste les batches d'import
 */
const getBatches: RequestHandler = async (req, res) => {
  try {
    const limit = asNumber(req.query.limit) || 20;
    const offset = asNumber(req.query.offset) || 0;

    const { batches, total } = await listBatches(limit, offset);

    res.json({ ok: true, batches, total });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * POST /api/admin/import-chr/batches
 * Crée un nouveau batch d'import
 */
const createBatch: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const sources = asStringArray(req.body.sources);
  const cities = asStringArray(req.body.cities);
  const categories = asStringArray(req.body.categories) as ChrCategory[] | undefined;
  const keywords = asStringArray(req.body.keywords);

  if (!sources || sources.length === 0) {
    return res.status(400).json({ error: "sources is required" });
  }

  if (!cities || cities.length === 0) {
    return res.status(400).json({ error: "cities is required" });
  }

  try {
    const batch = await createImportBatch(
      {
        sources: sources as ImportSource[],
        cities,
        categories,
        keywords,
      },
      admin.adminId
    );

    res.json({ ok: true, batch });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * POST /api/admin/import-chr/batches/:batchId/run
 * Lance l'exécution d'un batch
 */
const runBatch: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const batchId = asString(req.params.batchId);
  if (!batchId) {
    return res.status(400).json({ error: "batchId is required" });
  }

  try {
    // Lancer en arrière-plan
    runImportBatch(batchId).catch((error) => {
      console.error(`[ImportCHR] Batch ${batchId} failed:`, error);
    });

    res.json({ ok: true, message: "Batch started" });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * POST /api/admin/import-chr/batches/:batchId/cancel
 * Annule un batch en cours
 */
const cancelBatch: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const batchId = asString(req.params.batchId);
  if (!batchId) {
    return res.status(400).json({ error: "batchId is required" });
  }

  try {
    await updateBatchStatus(batchId, "cancelled");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * DELETE /api/admin/import-chr/batches/:batchId
 * Supprime un batch et ses données associées
 */
const deleteBatch: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const batchId = asString(req.params.batchId);
  if (!batchId) {
    return res.status(400).json({ error: "batchId is required" });
  }

  try {
    const supabase = getAdminSupabase();

    // Vérifier que le batch n'est pas en cours d'exécution
    const { data: batch } = await supabase
      .from("establishment_import_batches")
      .select("status")
      .eq("id", batchId)
      .single();

    if (batch?.status === "running") {
      return res.status(400).json({ error: "Cannot delete a running batch" });
    }

    // Supprimer les entrées staging liées SAUF celles déjà importées
    // Les entrées "imported" sont conservées pour l'historique
    await supabase
      .from("establishment_import_staging")
      .delete()
      .eq("import_batch_id", batchId)
      .neq("status", "imported");

    // Supprimer les logs liés
    await supabase
      .from("establishment_import_logs")
      .delete()
      .eq("batch_id", batchId);

    // Supprimer le batch
    const { error } = await supabase
      .from("establishment_import_batches")
      .delete()
      .eq("id", batchId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * GET /api/admin/import-chr/staging
 * Liste les entrées staging
 */
const getStagingEntries: RequestHandler = async (req, res) => {
  try {
    const limit = asNumber(req.query.limit) || 20;
    const offset = asNumber(req.query.offset) || 0;

    const filters = {
      status: asStringArray(req.query.status) || asString(req.query.status),
      city: asString(req.query.city),
      category: asString(req.query.category),
      batchId: asString(req.query.batchId),
      minConfidence: asNumber(req.query.minConfidence),
      maxConfidence: asNumber(req.query.maxConfidence),
      search: asString(req.query.search),
    };

    const { entries, total } = await listStagingEntries(filters, limit, offset);

    res.json({ ok: true, entries, total });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * GET /api/admin/import-chr/staging/:stagingId
 * Détail d'une entrée staging
 */
const getStagingEntry: RequestHandler = async (req, res) => {
  const stagingId = asString(req.params.stagingId);
  if (!stagingId) {
    return res.status(400).json({ error: "stagingId is required" });
  }

  try {
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("establishment_import_staging")
      .select("*")
      .eq("id", stagingId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Entry not found" });
    }

    res.json({ ok: true, entry: data });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * POST /api/admin/import-chr/staging/:stagingId/approve
 * Valide une entrée et crée l'établissement en DRAFT
 */
const approveStagingEntry: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stagingId = asString(req.params.stagingId);
  if (!stagingId) {
    return res.status(400).json({ error: "stagingId is required" });
  }

  const notes = isRecord(req.body) ? asString(req.body.notes) : undefined;

  try {
    const result = await approveAndImport(stagingId, admin.adminId, notes);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ ok: true, establishmentId: result.establishmentId });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * POST /api/admin/import-chr/staging/:stagingId/reject
 * Rejette une entrée
 */
const rejectStagingEntry: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stagingId = asString(req.params.stagingId);
  if (!stagingId) {
    return res.status(400).json({ error: "stagingId is required" });
  }

  const notes = isRecord(req.body) ? asString(req.body.notes) : undefined;

  try {
    await rejectStaging(stagingId, admin.adminId, notes);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * POST /api/admin/import-chr/staging/bulk-approve
 * Valide plusieurs entrées en masse
 */
const bulkApproveStagingEntries: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const stagingIds = asStringArray(req.body.stagingIds);
  if (!stagingIds || stagingIds.length === 0) {
    return res.status(400).json({ error: "stagingIds is required" });
  }

  try {
    const result = await bulkApprove(stagingIds, admin.adminId);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * POST /api/admin/import-chr/staging/bulk-reject
 * Rejette plusieurs entrées en masse
 */
const bulkRejectStagingEntries: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const stagingIds = asStringArray(req.body.stagingIds);
  const notes = asString(req.body.notes);

  if (!stagingIds || stagingIds.length === 0) {
    return res.status(400).json({ error: "stagingIds is required" });
  }

  try {
    for (const stagingId of stagingIds) {
      await rejectStaging(stagingId, admin.adminId, notes);
    }
    res.json({ ok: true, count: stagingIds.length });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * GET /api/admin/import-chr/logs
 * Récupère les logs d'import récents
 */
const getLogs: RequestHandler = async (req, res) => {
  try {
    const limit = asNumber(req.query.limit) || 100;
    const logs = getImportLogs(limit);
    res.json({ ok: true, logs });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * DELETE /api/admin/import-chr/logs
 * Efface les logs en mémoire
 */
const clearLogs: RequestHandler = async (_req, res) => {
  try {
    clearImportLogs();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * GET /api/admin/import-chr/stats
 * Statistiques d'import
 */
const getStats: RequestHandler = async (_req, res) => {
  try {
    const supabase = getAdminSupabase();

    // Stats staging
    const { data: stagingStats } = await supabase
      .from("v_import_staging_summary")
      .select("*");

    // Stats batches
    const { data: batchStats } = await supabase
      .from("establishment_import_batches")
      .select("status")
      .order("created_at", { ascending: false })
      .limit(100);

    // Compter par status
    const batchCountByStatus: Record<string, number> = {};
    for (const batch of batchStats || []) {
      batchCountByStatus[batch.status] = (batchCountByStatus[batch.status] || 0) + 1;
    }

    // Total en staging par status
    const { data: stagingTotals } = await supabase
      .from("establishment_import_staging")
      .select("status");

    const stagingCountByStatus: Record<string, number> = {};
    for (const entry of stagingTotals || []) {
      stagingCountByStatus[entry.status] = (stagingCountByStatus[entry.status] || 0) + 1;
    }

    res.json({
      ok: true,
      stats: {
        staging: {
          byCity: groupBy(stagingStats || [], "city"),
          byStatus: stagingCountByStatus,
          total: stagingTotals?.length || 0,
        },
        batches: {
          byStatus: batchCountByStatus,
          recent: batchStats?.length || 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * POST /api/admin/import-chr/staging/cleanup-duplicates
 * Nettoie automatiquement les doublons dans le staging
 */
const cleanupDuplicates: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await cleanupStagingDuplicates();
    res.json({ ok: true, deleted: result.deleted, errors: result.errors });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * POST /api/admin/import-chr/staging/merge
 * Fusionne plusieurs entrées staging en une seule
 */
const mergeDuplicates: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const stagingIds = asStringArray(req.body.stagingIds);
  if (!stagingIds || stagingIds.length < 2) {
    return res.status(400).json({ error: "stagingIds must contain at least 2 IDs" });
  }

  try {
    const result = await mergeStagingDuplicates(stagingIds);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true, keptId: result.keptId });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * DELETE /api/admin/import-chr/staging/:stagingId
 * Supprime une entrée staging
 */
const deleteStagingEntry: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stagingId = asString(req.params.stagingId);
  if (!stagingId) {
    return res.status(400).json({ error: "stagingId is required" });
  }

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("establishment_import_staging")
      .delete()
      .eq("id", stagingId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * POST /api/admin/import-chr/staging/bulk-delete
 * Supprime plusieurs entrées staging
 */
const bulkDeleteStagingEntries: RequestHandler = async (req, res) => {
  const admin = requireAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const stagingIds = asStringArray(req.body.stagingIds);
  if (!stagingIds || stagingIds.length === 0) {
    return res.status(400).json({ error: "stagingIds is required" });
  }

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("establishment_import_staging")
      .delete()
      .in("id", stagingIds);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ ok: true, count: stagingIds.length });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * GET /api/admin/import-chr/staging/export
 * Exporte le staging en CSV
 */
const exportStagingCsv: RequestHandler = async (req, res) => {
  try {
    const filters = {
      status: asStringArray(req.query.status) || asString(req.query.status),
      city: asString(req.query.city),
      category: asString(req.query.category),
      batchId: asString(req.query.batchId),
    };

    const { entries } = await listStagingEntries(filters, 10000, 0);

    // Construire le CSV
    const headers = [
      "id",
      "name",
      "category",
      "city",
      "address",
      "phone",
      "website",
      "latitude",
      "longitude",
      "status",
      "confidence_score",
      "sources",
    ];

    const rows = entries.map((e) => [
      e.id,
      escapeCSV(e.name),
      e.category || "",
      e.city,
      escapeCSV(e.addressFull || ""),
      e.phoneE164 || "",
      e.websiteUrl || "",
      e.latitude?.toString() || "",
      e.longitude?.toString() || "",
      e.status,
      e.confidenceScore.toString(),
      e.sources.map((s) => s.source).join(";"),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="staging-export-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

// ============================================
// HELPERS
// ============================================

function getSourceName(source: ImportSource | string): string {
  const names: Record<string, string> = {
    google: "Google Places API",
    sortiraumaroc: "Sortir au Maroc",
    bestrestaurantsmaroc: "Best Restaurants Maroc",
    madeincity: "Made In City",
    marrakechbestof: "Marrakech Best Of",
  };
  return names[source] || source;
}

function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {
  return items.reduce(
    (acc, item) => {
      const k = String(item[key] || "unknown");
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ============================================
// REGISTER ROUTES
// ============================================

export function registerAdminImportChrRoutes(app: Express): void {
  // Sources et catégories
  app.get("/api/admin/import-chr/sources", listSources);
  app.get("/api/admin/import-chr/categories", listCategories);

  // Batches
  app.get("/api/admin/import-chr/batches", getBatches);
  app.post("/api/admin/import-chr/batches", createBatch);
  app.post("/api/admin/import-chr/batches/:batchId/run", runBatch);
  app.post("/api/admin/import-chr/batches/:batchId/cancel", cancelBatch);
  app.delete("/api/admin/import-chr/batches/:batchId", deleteBatch);

  // Staging
  app.get("/api/admin/import-chr/staging", getStagingEntries);
  app.get("/api/admin/import-chr/staging/export", exportStagingCsv);
  app.post("/api/admin/import-chr/staging/cleanup-duplicates", cleanupDuplicates);
  app.post("/api/admin/import-chr/staging/merge", mergeDuplicates);
  app.post("/api/admin/import-chr/staging/bulk-approve", bulkApproveStagingEntries);
  app.post("/api/admin/import-chr/staging/bulk-reject", bulkRejectStagingEntries);
  app.post("/api/admin/import-chr/staging/bulk-delete", bulkDeleteStagingEntries);
  app.get("/api/admin/import-chr/staging/:stagingId", getStagingEntry);
  app.post("/api/admin/import-chr/staging/:stagingId/approve", approveStagingEntry);
  app.post("/api/admin/import-chr/staging/:stagingId/reject", rejectStagingEntry);
  app.delete("/api/admin/import-chr/staging/:stagingId", deleteStagingEntry);

  // Logs et stats
  app.get("/api/admin/import-chr/logs", getLogs);
  app.delete("/api/admin/import-chr/logs", clearLogs);
  app.get("/api/admin/import-chr/stats", getStats);

  console.log("[Routes] Admin Import CHR routes registered");
}
