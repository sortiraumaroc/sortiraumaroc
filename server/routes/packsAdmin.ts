/**
 * Packs Admin Routes — Phase 4 (Admin-facing)
 *
 * Moderation (6):
 *  - GET  /api/admin/packs/moderation         — moderation queue
 *  - POST /api/admin/packs/:id/approve         — approve pack
 *  - POST /api/admin/packs/:id/reject          — reject pack
 *  - POST /api/admin/packs/:id/request-modification — request modification
 *  - POST /api/admin/packs/:id/feature         — feature on homepage
 *  - POST /api/admin/packs/:id/unfeature       — unfeature
 *
 * Modules (3):
 *  - GET  /api/admin/modules                   — all module statuses
 *  - POST /api/admin/modules/:module/toggle-global       — toggle globally
 *  - POST /api/admin/modules/:module/toggle-establishment/:id — toggle per-establishment
 *
 * Commissions (5):
 *  - GET    /api/admin/commissions              — commission config
 *  - PUT    /api/admin/commissions/:id          — update default/category rate
 *  - POST   /api/admin/commissions/establishment — set custom establishment rate
 *  - PUT    /api/admin/commissions/establishment/:id — update
 *  - DELETE /api/admin/commissions/establishment/:id — delete (revert to default)
 *
 * Billing (9):
 *  - GET  /api/admin/billing/invoices           — submitted invoices queue
 *  - POST /api/admin/billing/invoices/:id/validate — validate invoice
 *  - POST /api/admin/billing/invoices/:id/contest  — contest invoice
 *  - GET  /api/admin/billing/payments           — payments to execute
 *  - POST /api/admin/billing/payments/:id/execute  — confirm payment
 *  - POST /api/admin/billing/payments/batch-execute — batch confirm
 *  - GET  /api/admin/billing/disputes           — disputes
 *  - POST /api/admin/billing/disputes/:id/respond  — respond to dispute
 *  - GET  /api/admin/billing/reconciliation     — reconciliation report
 *
 * Platform promos (4):
 *  - POST   /api/admin/pack-promos              — create platform promo
 *  - GET    /api/admin/pack-promos              — list platform promos
 *  - PUT    /api/admin/pack-promos/:id          — update
 *  - DELETE /api/admin/pack-promos/:id          — delete
 *
 * Stats (3):
 *  - GET /api/admin/packs/stats                 — global pack stats
 *  - GET /api/admin/billing/stats               — global billing stats
 *  - GET /api/admin/billing/revenue             — revenue by source
 *
 * Refunds (3):
 *  - GET  /api/admin/refunds                    — pending refund requests
 *  - POST /api/admin/refunds/:id/approve        — approve
 *  - POST /api/admin/refunds/:id/reject         — reject
 */

import type { Router, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { notifyProMembers } from "../proNotifications";
import { requireAdminKey } from "./admin";
import { zBody, zParams, zIdParam } from "../lib/validate";
import {
  RejectPackSchema,
  RequestPackModificationSchema,
  ToggleModuleSchema,
  UpdateCommissionSchema,
  CreateCustomCommissionSchema,
  UpdateCustomCommissionSchema,
  ContestInvoiceSchema,
  BatchExecutePaymentsSchema,
  RespondToDisputeSchema,
  CreatePlatformPromoSchema,
  UpdatePlatformPromoSchema,
  RejectRefundSchema,
  ModuleToggleParams,
  ModuleParams,
} from "../schemas/packsAdmin";
import {
  approvePack,
  rejectPack,
  requestPackModification,
  featurePack,
} from "../packLifecycleLogic";
import { processRefund } from "../packRefundLogic";
import { validateInvoice, executePayment, respondToDispute } from "../billingPeriodLogic";
import {
  toggleGlobalModule,
  toggleEstablishmentModule,
  getGlobalModuleInfos,
} from "../moduleActivationLogic";
import type { PlatformModule } from "../../shared/packsBillingTypes";
import { sanitizeText, sanitizePlain, isValidUUID } from "../sanitizeV2";
import { auditAdminAction } from "../auditLogV2";
import { getClientIp } from "../middleware/rateLimiter";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("packsAdmin");

// =============================================================================
// Helpers
// =============================================================================

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function getAdminUserId(req: Parameters<RequestHandler>[0]): string | null {
  return (req as any).adminSession?.sub ?? null;
}

// =============================================================================
// PACK MODERATION
// =============================================================================

// GET /api/admin/packs/moderation
const getModerationQueue: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const statusFilter = asString(req.query.status) || "";

    let q = supabase
      .from("packs")
      .select(`
        id, title, short_description, cover_url, price, original_price,
        discount_percentage, stock, moderation_status, rejection_reason,
        moderation_note, created_at, updated_at, establishment_id,
        establishments (id, name, slug, city)
      `)
      .order("created_at", { ascending: true });

    // If a specific status is requested, filter; otherwise return all packs.
    // Default to "pending_moderation" only when no status param is provided.
    if (statusFilter && statusFilter !== "all") {
      q = q.eq("moderation_status", statusFilter);
    } else if (!statusFilter) {
      q = q.eq("moderation_status", "pending_moderation");
    }
    // When statusFilter === "all", no status filter is applied → returns all packs.

    const { data, error } = await q;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ packs: data ?? [] });
  } catch (err) {
    log.error({ err }, "getModerationQueue error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/packs/:id/approve
const approvePackRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const packId = req.params.id;
    const adminUserId = getAdminUserId(req);
    const result = await approvePack(packId, adminUserId);

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.pack.approve", {
      targetType: "pack",
      targetId: req.params.id,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "approvePack error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/packs/:id/reject
const rejectPackRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const packId = req.params.id;
    const rawReason = req.body?.reason;

    if (!rawReason || typeof rawReason !== "string" || rawReason.trim().length < 5) {
      res.status(400).json({ error: "Le motif de rejet est obligatoire (min 5 caracteres)." });
      return;
    }

    const reason = sanitizeText(String(rawReason), 1000);
    const adminUserId = getAdminUserId(req);
    const result = await rejectPack(packId, adminUserId, reason);

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.pack.reject", {
      targetType: "pack",
      targetId: req.params.id,
      details: { reason: sanitizePlain(String(req.body?.reason ?? ""), 500) },
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "rejectPack error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/packs/:id/request-modification
const requestModificationRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const packId = req.params.id;
    const rawNote = req.body?.note;

    if (!rawNote || typeof rawNote !== "string" || rawNote.trim().length < 5) {
      res.status(400).json({ error: "La note de modification est obligatoire (min 5 caracteres)." });
      return;
    }

    const note = sanitizeText(String(rawNote), 1000);
    const adminUserId = getAdminUserId(req);
    const result = await requestPackModification(packId, adminUserId, note);

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.pack.request_modification", {
      targetType: "pack",
      targetId: req.params.id,
      details: { reason: sanitizePlain(String(req.body?.reason ?? ""), 500) },
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "requestModification error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/packs/:id/feature
const featurePackRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const packId = req.params.id;
    const result = await featurePack(packId, true);

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.pack.feature", {
      targetType: "pack",
      targetId: req.params.id,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "featurePack error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/packs/:id/unfeature
const unfeaturePackRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const packId = req.params.id;
    const result = await featurePack(packId, false);

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.pack.feature", {
      targetType: "pack",
      targetId: req.params.id,
      details: { action: "unfeature" },
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "unfeaturePack error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// MODULES
// =============================================================================

// GET /api/admin/modules
const listModules: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const modules = await getGlobalModuleInfos();
    res.json({ modules });
  } catch (err) {
    log.error({ err }, "listModules error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/modules/:module/toggle-global
const toggleGlobalModuleRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const moduleName = req.params.module as PlatformModule;
    const { activate } = req.body ?? {};

    if (typeof activate !== "boolean") {
      res.status(400).json({ error: "missing_activate_boolean" });
      return;
    }

    const adminUserId = getAdminUserId(req);
    const result = await toggleGlobalModule(moduleName, activate, adminUserId);

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.module.toggle", {
      targetType: "module",
      targetId: req.params.module,
      details: { action: "toggle_global" },
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "toggleGlobalModule error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/modules/:module/toggle-establishment/:id
const toggleEstablishmentModuleRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const moduleName = req.params.module as PlatformModule;
    const establishmentId = req.params.id;
    const { activate } = req.body ?? {};

    if (typeof activate !== "boolean") {
      res.status(400).json({ error: "missing_activate_boolean" });
      return;
    }

    const adminUserId = getAdminUserId(req);
    const result = await toggleEstablishmentModule(moduleName, establishmentId, activate, adminUserId);

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.module.toggle", {
      targetType: "module",
      targetId: req.params.module,
      details: { action: "toggle_establishment", establishmentId: req.params.id },
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "toggleEstablishmentModule error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// COMMISSIONS
// =============================================================================

// GET /api/admin/commissions
const listCommissions: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    const [defaultRes, categoryRes, customRes] = await Promise.all([
      supabase.from("commissions").select("*").eq("scope", "default"),
      supabase.from("commissions").select("*").eq("scope", "category"),
      supabase.from("establishment_commissions").select(`
        *, establishments (id, name, slug, city)
      `),
    ]);

    res.json({
      defaults: defaultRes.data ?? [],
      categories: categoryRes.data ?? [],
      custom: customRes.data ?? [],
    });
  } catch (err) {
    log.error({ err }, "listCommissions error");
    res.status(500).json({ error: "internal_error" });
  }
};

// PUT /api/admin/commissions/:id
const updateCommission: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const commissionId = req.params.id;
    const { rate, min_fee, max_fee } = req.body ?? {};

    const supabase = getAdminSupabase();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (rate !== undefined) updates.rate = rate;
    if (min_fee !== undefined) updates.min_fee = min_fee;
    if (max_fee !== undefined) updates.max_fee = max_fee;

    const { data, error } = await supabase
      .from("commissions")
      .update(updates)
      .eq("id", commissionId)
      .select("*")
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
    void auditAdminAction("admin.commission.update", {
      targetType: "commission",
      targetId: req.params.id,
      details: { rate_bps: req.body?.rate_bps },
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "updateCommission error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/commissions/establishment
const createCustomCommission: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const { establishment_id, rate, min_fee, max_fee, type } = req.body ?? {};

    if (!establishment_id || rate === undefined) {
      res.status(400).json({ error: "missing_establishment_id_or_rate" });
      return;
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("establishment_commissions")
      .insert({
        establishment_id,
        type: type || "pack_sale",
        rate,
        min_fee: min_fee || null,
        max_fee: max_fee || null,
      })
      .select("*")
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  } catch (err) {
    log.error({ err }, "createCustomCommission error");
    res.status(500).json({ error: "internal_error" });
  }
};

// PUT /api/admin/commissions/establishment/:id
const updateCustomCommission: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const commissionId = req.params.id;
    const { rate, min_fee, max_fee } = req.body ?? {};

    const supabase = getAdminSupabase();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (rate !== undefined) updates.rate = rate;
    if (min_fee !== undefined) updates.min_fee = min_fee;
    if (max_fee !== undefined) updates.max_fee = max_fee;

    const { data, error } = await supabase
      .from("establishment_commissions")
      .update(updates)
      .eq("id", commissionId)
      .select("*")
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  } catch (err) {
    log.error({ err }, "updateCustomCommission error");
    res.status(500).json({ error: "internal_error" });
  }
};

// DELETE /api/admin/commissions/establishment/:id
const deleteCustomCommission: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const commissionId = req.params.id;
    const supabase = getAdminSupabase();

    const { error } = await supabase
      .from("establishment_commissions")
      .delete()
      .eq("id", commissionId);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "deleteCustomCommission error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// BILLING
// =============================================================================

// GET /api/admin/billing/invoices
const listAdminInvoices: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const statusFilter = asString(req.query.status) || "invoice_submitted";

    const { data, error } = await supabase
      .from("billing_periods")
      .select(`
        *,
        establishments (id, name, slug, city)
      `)
      .eq("status", statusFilter)
      .order("invoice_submitted_at", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ invoices: data ?? [] });
  } catch (err) {
    log.error({ err }, "listAdminInvoices error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/billing/invoices/:id/validate
const validateInvoiceRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const periodId = req.params.id;
    const adminUserId = getAdminUserId(req);
    const result = await validateInvoice(periodId, adminUserId);

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.billing.validate_invoice", {
      targetType: "billing_period",
      targetId: req.params.id,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "validateInvoice error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/billing/invoices/:id/contest
const contestInvoiceRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const periodId = req.params.id;
    const { message } = req.body ?? {};

    const supabase = getAdminSupabase();
    await supabase
      .from("billing_periods")
      .update({
        status: "disputed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", periodId);

    // Optionally store the contest message as a notification
    if (message) {
      const { data: period } = await supabase
        .from("billing_periods")
        .select("establishment_id")
        .eq("id", periodId)
        .maybeSingle();

      if (period) {
        void notifyProMembers({
          supabase,
          establishmentId: (period as any).establishment_id,
          category: "billing",
          title: "Facture contestee par l'admin",
          body: message,
          data: { billing_period_id: periodId },
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "contestInvoice error");
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/admin/billing/payments
const listPayments: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const status = asString(req.query.status) || "payment_scheduled";

    const { data, error } = await supabase
      .from("billing_periods")
      .select(`
        *,
        establishments (id, name, slug, city)
      `)
      .eq("status", status)
      .order("payment_due_date", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ payments: data ?? [] });
  } catch (err) {
    log.error({ err }, "listPayments error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/billing/payments/:id/execute
const executePaymentRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const periodId = req.params.id;
    const adminUserId = getAdminUserId(req);
    const result = await executePayment(periodId, adminUserId);

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.billing.execute_payment", {
      targetType: "billing_period",
      targetId: req.params.id,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "executePayment error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/billing/payments/batch-execute
const batchExecutePayments: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const { period_ids } = req.body ?? {};
    if (!Array.isArray(period_ids) || period_ids.length === 0) {
      res.status(400).json({ error: "missing_period_ids" });
      return;
    }

    const adminUserId = getAdminUserId(req);
    let succeeded = 0;
    let failed = 0;

    for (const periodId of period_ids) {
      const result = await executePayment(periodId, adminUserId);
      if (result.ok) succeeded++;
      else failed++;
    }

    res.json({ succeeded, failed, total: period_ids.length });
  } catch (err) {
    log.error({ err }, "batchExecutePayments error");
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/admin/billing/disputes
const listAdminDisputes: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const statusFilter = asString(req.query.status);

    let query = supabase
      .from("billing_disputes")
      .select(`
        *,
        billing_periods (id, period_code, establishment_id,
          establishments (id, name, slug, city))
      `)
      .order("created_at", { ascending: true });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    } else {
      query = query.in("status", ["open", "under_review", "escalated"]);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ disputes: data ?? [] });
  } catch (err) {
    log.error({ err }, "listAdminDisputes error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/billing/disputes/:id/respond
const respondToDisputeRoute: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const disputeId = req.params.id;
    const { accepted, response, correction_amount } = req.body ?? {};

    if (typeof accepted !== "boolean" || !response) {
      res.status(400).json({ error: "missing_accepted_or_response" });
      return;
    }

    const adminReason = sanitizeText(String(response ?? ""), 2000);
    const adminUserId = getAdminUserId(req);
    const result = await respondToDispute(
      disputeId,
      adminUserId,
      accepted ? "accept" : "reject",
      adminReason,
      asNumber(correction_amount),
    );

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.billing.respond_dispute", {
      targetType: "billing_dispute",
      targetId: req.params.id,
      details: { decision: String(req.body?.accepted ? "accept" : "reject"), reason: sanitizePlain(String(req.body?.response ?? ""), 500) },
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "respondToDispute error");
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/admin/billing/reconciliation
const getReconciliation: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const periodCode = asString(req.query.period);

    // Aggregate data
    let query = supabase
      .from("billing_periods")
      .select("status, total_gross, total_commission, total_net, total_refunds");

    if (periodCode) {
      query = query.eq("period_code", periodCode);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const periods = (data as any[]) || [];
    const summary = {
      totalGross: periods.reduce((s, p) => s + (p.total_gross || 0), 0),
      totalCommission: periods.reduce((s, p) => s + (p.total_commission || 0), 0),
      totalNet: periods.reduce((s, p) => s + (p.total_net || 0), 0),
      totalRefunds: periods.reduce((s, p) => s + (p.total_refunds || 0), 0),
      periodCount: periods.length,
      byStatus: periods.reduce((acc: Record<string, number>, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {}),
    };

    res.json(summary);
  } catch (err) {
    log.error({ err }, "getReconciliation error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// PLATFORM PROMOS
// =============================================================================

// GET /api/admin/pack-promos
const listPlatformPromos: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("pack_promo_codes")
      .select("*")
      .eq("scope", "platform")
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ promos: data ?? [] });
  } catch (err) {
    log.error({ err }, "listPlatformPromos error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/pack-promos
const createPlatformPromo: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const body = req.body ?? {};
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("pack_promo_codes")
      .insert({
        establishment_id: null,
        code: (body.code || "").toUpperCase().trim(),
        discount_type: body.discount_type || "percentage",
        discount_value: body.discount_value,
        scope: "platform",
        pack_ids: body.pack_ids || null,
        max_uses: body.max_uses || null,
        max_uses_per_user: body.max_uses_per_user || 1,
        valid_from: body.valid_from || null,
        valid_to: body.valid_to || null,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
  } catch (err) {
    log.error({ err }, "createPlatformPromo error");
    res.status(500).json({ error: "internal_error" });
  }
};

// PUT /api/admin/pack-promos/:id
const updatePlatformPromo: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const promoId = req.params.id;
    const body = req.body ?? {};
    const supabase = getAdminSupabase();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.code !== undefined) updates.code = (body.code || "").toUpperCase().trim();
    if (body.discount_type !== undefined) updates.discount_type = body.discount_type;
    if (body.discount_value !== undefined) updates.discount_value = body.discount_value;
    if (body.pack_ids !== undefined) updates.pack_ids = body.pack_ids;
    if (body.max_uses !== undefined) updates.max_uses = body.max_uses;
    if (body.max_uses_per_user !== undefined) updates.max_uses_per_user = body.max_uses_per_user;
    if (body.valid_from !== undefined) updates.valid_from = body.valid_from;
    if (body.valid_to !== undefined) updates.valid_to = body.valid_to;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const { data, error } = await supabase
      .from("pack_promo_codes")
      .update(updates)
      .eq("id", promoId)
      .eq("scope", "platform")
      .select("*")
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json(data);
  } catch (err) {
    log.error({ err }, "updatePlatformPromo error");
    res.status(500).json({ error: "internal_error" });
  }
};

// DELETE /api/admin/pack-promos/:id
const deletePlatformPromo: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const promoId = req.params.id;
    const supabase = getAdminSupabase();

    const { error } = await supabase
      .from("pack_promo_codes")
      .delete()
      .eq("id", promoId)
      .eq("scope", "platform");

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "deletePlatformPromo error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// STATS
// =============================================================================

// GET /api/admin/packs/stats
const getPacksStats: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    const [packsRes, purchasesRes, refundsRes] = await Promise.all([
      supabase.from("packs").select("id, moderation_status, sold_count, consumed_count, price"),
      supabase.from("pack_purchases").select("id, final_price, payment_status, status"),
      supabase.from("pack_refunds").select("id, refund_amount, credit_amount, status"),
    ]);

    const packs = (packsRes.data as any[]) || [];
    const purchases = (purchasesRes.data as any[]) || [];
    const refunds = (refundsRes.data as any[]) || [];

    const activePacks = packs.filter((p) => p.moderation_status === "active").length;
    const totalSold = packs.reduce((s, p) => s + (p.sold_count || 0), 0);
    const totalConsumed = packs.reduce((s, p) => s + (p.consumed_count || 0), 0);
    const totalRevenue = purchases
      .filter((p) => ["completed", "paid"].includes(p.payment_status))
      .reduce((s, p) => s + (p.final_price || 0), 0);
    const totalRefunded = refunds
      .filter((r) => r.status === "processed")
      .reduce((s, r) => s + (r.refund_amount || 0) + (r.credit_amount || 0), 0);

    res.json({
      activePacks,
      totalPacks: packs.length,
      totalSold,
      totalConsumed,
      totalRevenue,
      totalRefunded,
      totalPurchases: purchases.length,
      totalRefunds: refunds.length,
    });
  } catch (err) {
    log.error({ err }, "getPacksStats error");
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/admin/billing/stats
const getBillingStats: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    const { data: periods } = await supabase
      .from("billing_periods")
      .select("status, total_gross, total_commission, total_net, total_refunds");

    const all = (periods as any[]) || [];
    const paid = all.filter((p) => p.status === "paid");

    res.json({
      totalPeriods: all.length,
      paidPeriods: paid.length,
      totalGross: all.reduce((s, p) => s + (p.total_gross || 0), 0),
      totalCommission: all.reduce((s, p) => s + (p.total_commission || 0), 0),
      totalNet: all.reduce((s, p) => s + (p.total_net || 0), 0),
      totalRefunds: all.reduce((s, p) => s + (p.total_refunds || 0), 0),
      paidGross: paid.reduce((s, p) => s + (p.total_gross || 0), 0),
      paidCommission: paid.reduce((s, p) => s + (p.total_commission || 0), 0),
    });
  } catch (err) {
    log.error({ err }, "getBillingStats error");
    res.status(500).json({ error: "internal_error" });
  }
};

// GET /api/admin/billing/revenue
const getRevenueBySource: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    const { data: transactions } = await supabase
      .from("transactions")
      .select("type, gross_amount, commission_amount, net_amount")
      .eq("status", "completed");

    const txns = (transactions as any[]) || [];

    // Group by type
    const byType: Record<string, { count: number; gross: number; commission: number; net: number }> = {};
    for (const t of txns) {
      if (!byType[t.type]) {
        byType[t.type] = { count: 0, gross: 0, commission: 0, net: 0 };
      }
      byType[t.type].count++;
      byType[t.type].gross += t.gross_amount || 0;
      byType[t.type].commission += t.commission_amount || 0;
      byType[t.type].net += t.net_amount || 0;
    }

    res.json({ revenueBySource: byType });
  } catch (err) {
    log.error({ err }, "getRevenueBySource error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// REFUNDS
// =============================================================================

// GET /api/admin/refunds
const listRefunds: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const statusFilter = asString(req.query.status) || "requested";

    const { data, error } = await supabase
      .from("pack_refunds")
      .select(`
        *,
        pack_purchases (id, total_price, final_price, pack_id, user_id,
          packs (id, title, establishment_id,
            establishments (id, name, slug, city)))
      `)
      .eq("status", statusFilter)
      .order("created_at", { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ refunds: data ?? [] });
  } catch (err) {
    log.error({ err }, "listRefunds error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/refunds/:id/approve
const approveRefund: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const refundId = req.params.id;
    const adminUserId = getAdminUserId(req);

    // First approve
    const supabase = getAdminSupabase();
    await supabase
      .from("pack_refunds")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", refundId)
      .eq("status", "requested");

    // Then process
    const result = await processRefund(refundId, adminUserId);

    if (!result.ok) {
      const err = result as { ok: false; error: string; errorCode?: string };
      res.status(400).json({ error: err.error, errorCode: err.errorCode });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.billing.approve_refund", {
      targetType: "refund",
      targetId: req.params.id,
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "approveRefund error");
    res.status(500).json({ error: "internal_error" });
  }
};

// POST /api/admin/refunds/:id/reject
const rejectRefund: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const refundId = req.params.id;
    const reason = sanitizeText(String(req.body?.reason ?? ""), 1000);

    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("pack_refunds")
      .update({
        status: "rejected",
        reason: reason ? `Rejet: ${reason}` : "Rejet par l'admin",
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundId)
      .eq("status", "requested");

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
    void auditAdminAction("admin.billing.reject_refund", {
      targetType: "refund",
      targetId: req.params.id,
      details: { reason: sanitizePlain(String(req.body?.reason ?? ""), 500) },
      ip: getClientIp(req),
    });
  } catch (err) {
    log.error({ err }, "rejectRefund error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerPacksAdminRoutes(app: Router): void {
  // Pack moderation
  app.get("/api/admin/packs/moderation", getModerationQueue);
  app.post("/api/admin/packs/:id/approve", zParams(zIdParam), approvePackRoute);
  app.post("/api/admin/packs/:id/reject", zParams(zIdParam), zBody(RejectPackSchema), rejectPackRoute);
  app.post("/api/admin/packs/:id/request-modification", zParams(zIdParam), zBody(RequestPackModificationSchema), requestModificationRoute);
  app.post("/api/admin/packs/:id/feature", zParams(zIdParam), featurePackRoute);
  app.post("/api/admin/packs/:id/unfeature", zParams(zIdParam), unfeaturePackRoute);

  // Modules
  app.get("/api/admin/modules", listModules);
  app.post("/api/admin/modules/:module/toggle-global", zParams(ModuleParams), zBody(ToggleModuleSchema), toggleGlobalModuleRoute);
  app.post("/api/admin/modules/:module/toggle-establishment/:id", zParams(ModuleToggleParams), zBody(ToggleModuleSchema), toggleEstablishmentModuleRoute);

  // Commissions
  app.get("/api/admin/commissions", listCommissions);
  app.put("/api/admin/commissions/:id", zParams(zIdParam), zBody(UpdateCommissionSchema), updateCommission);
  app.post("/api/admin/commissions/establishment", zBody(CreateCustomCommissionSchema), createCustomCommission);
  app.put("/api/admin/commissions/establishment/:id", zParams(zIdParam), zBody(UpdateCustomCommissionSchema), updateCustomCommission);
  app.delete("/api/admin/commissions/establishment/:id", zParams(zIdParam), deleteCustomCommission);

  // Billing
  app.get("/api/admin/billing/invoices", listAdminInvoices);
  app.post("/api/admin/billing/invoices/:id/validate", zParams(zIdParam), validateInvoiceRoute);
  app.post("/api/admin/billing/invoices/:id/contest", zParams(zIdParam), zBody(ContestInvoiceSchema), contestInvoiceRoute);
  app.get("/api/admin/billing/payments", listPayments);
  app.post("/api/admin/billing/payments/:id/execute", zParams(zIdParam), executePaymentRoute);
  app.post("/api/admin/billing/payments/batch-execute", zBody(BatchExecutePaymentsSchema), batchExecutePayments);
  app.get("/api/admin/billing/disputes", listAdminDisputes);
  app.post("/api/admin/billing/disputes/:id/respond", zParams(zIdParam), zBody(RespondToDisputeSchema), respondToDisputeRoute);
  app.get("/api/admin/billing/reconciliation", getReconciliation);

  // Platform promos
  app.get("/api/admin/pack-promos", listPlatformPromos);
  app.post("/api/admin/pack-promos", zBody(CreatePlatformPromoSchema), createPlatformPromo);
  app.put("/api/admin/pack-promos/:id", zParams(zIdParam), zBody(UpdatePlatformPromoSchema), updatePlatformPromo);
  app.delete("/api/admin/pack-promos/:id", zParams(zIdParam), deletePlatformPromo);

  // Stats
  app.get("/api/admin/packs/stats", getPacksStats);
  app.get("/api/admin/billing/stats", getBillingStats);
  app.get("/api/admin/billing/revenue", getRevenueBySource);

  // Refunds
  app.get("/api/admin/refunds", listRefunds);
  app.post("/api/admin/refunds/:id/approve", zParams(zIdParam), approveRefund);
  app.post("/api/admin/refunds/:id/reject", zParams(zIdParam), zBody(RejectRefundSchema), rejectRefund);
}
