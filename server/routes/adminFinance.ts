/**
 * Admin Finance handlers — Extracted from admin.ts
 *
 * Covers: commission overrides, pro terms, payout requests,
 * bank details (RIB), bank documents, establishment contracts,
 * and booking policies.
 */

import type { RequestHandler } from "express";
import { randomBytes } from "crypto";

import {
  requireAdminKey,
  requireSuperadmin,
  isRecord,
  asString,
  asNumber,
  getAdminSupabase,
  getAuditActorInfo,
  getAdminSessionSub,
} from "./adminHelpers";
import { emitAdminNotification } from "../adminNotifications";
import { createModuleLogger } from "../lib/logger";
import {
  buildRib24FromParts,
  detectMoroccanBankName,
  digitsOnly,
  type RibParts,
} from "../../shared/rib";

const log = createModuleLogger("adminFinance");

// =============================================================================
// Local types
// =============================================================================

type EstablishmentCommissionOverride = {
  establishment_id: string;
  active: boolean;
  commission_percent: number | null;
  commission_amount_cents: bigint | null;
  pack_commission_percent: number | null;
  pack_commission_amount_cents: bigint | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ProTermsRow = {
  id: number;
  version: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type PayoutRequestRow = {
  id: string;
  payout_id: string;
  establishment_id: string;
  status: string;
  created_by_user_id: string | null;
  pro_comment: string | null;
  admin_comment: string | null;
  paid_reference: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProBankDetailsRow = {
  id: string;
  establishment_id: string;
  bank_code: string;
  locality_code: string;
  branch_code: string;
  account_number: string;
  rib_key: string;
  bank_name: string;
  bank_address: string | null;
  holder_name: string;
  holder_address: string | null;
  rib_24: string;
  is_validated: boolean;
  validated_at: string | null;
  validated_by: string | null;
  created_at: string;
  updated_at: string;
};

type ProBankDetailsHistoryRow = {
  id: string;
  pro_bank_id: string;
  changed_by: string | null;
  changed_at: string;
  old_data: unknown;
  new_data: unknown;
};

type ProBankDocumentRow = {
  id: string;
  pro_bank_id: string;
  file_path: string;
  file_name: string | null;
  mime_type: string;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

type ContractRow = {
  id: string;
  establishment_id: string;
  contract_type: string;
  contract_reference: string | null;
  file_path: string;
  file_name: string | null;
  mime_type: string;
  size_bytes: number | null;
  signed_at: string | null;
  starts_at: string | null;
  expires_at: string | null;
  status: string;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  updated_at: string;
};

// =============================================================================
// Local helpers
// =============================================================================

const PRO_BANK_DOCS_BUCKET = "pro-bank-documents";
const MAX_PRO_BANK_DOC_PDF_BYTES = 10 * 1024 * 1024; // 10MB

const CONTRACTS_BUCKET = "establishment-contracts";
const MAX_CONTRACT_PDF_BYTES = 10 * 1024 * 1024; // 10MB

function looksLikePdf(buffer: Buffer): boolean {
  // Quick signature check: PDF files start with "%PDF-"
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function sanitizeFileName(input: string): string {
  const v = String(input || "").trim();
  if (!v) return "document.pdf";
  const normalized = v.replace(/[^a-zA-Z0-9._\- ]+/g, "").trim();
  if (!normalized) return "document.pdf";
  return normalized.toLowerCase().endsWith(".pdf")
    ? normalized
    : `${normalized}.pdf`;
}

function parseRibBody(body: Record<string, unknown>):
  | {
      ok: true;
      parts: RibParts;
      rib24: string;
      bankName: string;
      bankAddress: string | null;
      holderName: string;
      holderAddress: string | null;
    }
  | { ok: false; error: string } {
  const bank_code = digitsOnly(asString(body.bank_code) ?? "");
  const locality_code = digitsOnly(asString(body.locality_code) ?? "");
  const branch_code = digitsOnly(asString(body.branch_code) ?? "");
  const account_number = digitsOnly(asString(body.account_number) ?? "");
  const rib_key = digitsOnly(asString(body.rib_key) ?? "");

  const holderName = asString(body.holder_name) ?? "";
  const holderAddress = asString(body.holder_address);
  const bankAddress = asString(body.bank_address);

  if (!holderName.trim())
    return { ok: false, error: "Nom du titulaire requis" };

  const rib24 = buildRib24FromParts({
    bank_code,
    locality_code,
    branch_code,
    account_number,
    rib_key,
  });
  if (!rib24) {
    return {
      ok: false,
      error:
        "RIB invalide : attendu banque/localité/agence=3 chiffres, numéro de compte=12 chiffres, clé RIB=3 chiffres (24 au total)",
    };
  }

  const bankName = detectMoroccanBankName(bank_code) ?? "Banque inconnue";

  return {
    ok: true,
    parts: { bank_code, locality_code, branch_code, account_number, rib_key },
    rib24,
    bankName,
    bankAddress: bankAddress?.trim() ? bankAddress.trim() : null,
    holderName: holderName.trim(),
    holderAddress: holderAddress?.trim() ? holderAddress.trim() : null,
  };
}

/** Broadcast a notification to all pro users. Best-effort, ignores errors. */
async function broadcastProNotification(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  title: string;
  body: string;
  category: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const { supabase, title, body, category, data } = args;

  const { data: memberships } = await supabase
    .from("pro_establishment_memberships")
    .select("user_id")
    .limit(5000);

  const userIds = new Set<string>();
  for (const row of memberships ?? []) {
    const id = isRecord(row) ? asString(row.user_id) : undefined;
    if (id) userIds.add(id);
  }

  const payload = Array.from(userIds).map((user_id) => ({
    user_id,
    establishment_id: null,
    category,
    title,
    body,
    data: data ?? {},
  }));

  if (!payload.length) return;
  // Best-effort: ignore notification errors (audit log is the source of truth).
  await supabase.from("pro_notifications").insert(payload);
}

function defaultBookingPolicy(establishmentId: string) {
  return {
    establishment_id: establishmentId,
    cancellation_enabled: false,
    free_cancellation_hours: 24,
    cancellation_penalty_percent: 50,
    no_show_penalty_percent: 100,
    no_show_always_100_guaranteed: true,
    cancellation_text_fr: "",
    cancellation_text_en: "",
    modification_enabled: true,
    modification_deadline_hours: 2,
    require_guarantee_below_score: null as number | null,
    modification_text_fr: "",
    modification_text_en: "",
  };
}

function asBookingPolicyBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1" || v === 1) return true;
  if (v === "false" || v === "0" || v === 0) return false;
  return undefined;
}

function asBookingPolicyNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// =============================================================================
// Commission Overrides (per-establishment custom commissions)
// =============================================================================

export const listAdminCommissionOverrides: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const activeOnly = req.query.active_only === "true";
  const supabase = getAdminSupabase();

  let q = supabase
    .from("establishment_commission_overrides")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (activeOnly) q = q.eq("active", true);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    ok: true,
    items: (data ?? []) as EstablishmentCommissionOverride[],
  });
};

export const createAdminCommissionOverride: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const establishmentId = asString(req.body.establishment_id);
  const active = typeof req.body.active === "boolean" ? req.body.active : true;
  const commissionPct =
    typeof req.body.commission_percent === "number" &&
    Number.isFinite(req.body.commission_percent)
      ? req.body.commission_percent
      : null;
  const commissionAmount =
    typeof req.body.commission_amount_cents === "number" &&
    Number.isFinite(req.body.commission_amount_cents)
      ? Math.max(0, Math.round(req.body.commission_amount_cents))
      : null;
  const packCommissionPct =
    typeof req.body.pack_commission_percent === "number" &&
    Number.isFinite(req.body.pack_commission_percent)
      ? req.body.pack_commission_percent
      : null;
  const packCommissionAmount =
    typeof req.body.pack_commission_amount_cents === "number" &&
    Number.isFinite(req.body.pack_commission_amount_cents)
      ? Math.max(0, Math.round(req.body.pack_commission_amount_cents))
      : null;
  const notes = asString(req.body.notes);

  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant d'établissement requis" });
  // Au moins une commission (réservation OU pack) doit être définie
  const hasReservationCommission = commissionPct != null || commissionAmount != null;
  const hasPackCommission = packCommissionPct != null || packCommissionAmount != null;
  if (!hasReservationCommission && !hasPackCommission)
    return res.status(400).json({
      error: "Au moins une commission (réservation ou pack) est requise",
    });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("establishment_commission_overrides")
    .upsert(
      {
        establishment_id: establishmentId,
        active,
        commission_percent: commissionPct,
        commission_amount_cents: commissionAmount,
        pack_commission_percent: packCommissionPct,
        pack_commission_amount_cents: packCommissionAmount,
        notes: notes ?? null,
      },
      { onConflict: "establishment_id" },
    )
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "commission.override.create",
    entity_type: "establishment_commission_overrides",
    entity_id: establishmentId,
    metadata: { after: data, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true, item: data as EstablishmentCommissionOverride });
};

export const updateAdminCommissionOverride: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant d'établissement requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("establishment_commission_overrides")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (typeof req.body.active === "boolean") patch.active = req.body.active;
  if (req.body.commission_percent === null) patch.commission_percent = null;
  if (
    typeof req.body.commission_percent === "number" &&
    Number.isFinite(req.body.commission_percent)
  )
    patch.commission_percent = req.body.commission_percent;
  if (req.body.commission_amount_cents === null)
    patch.commission_amount_cents = null;
  if (
    typeof req.body.commission_amount_cents === "number" &&
    Number.isFinite(req.body.commission_amount_cents)
  ) {
    patch.commission_amount_cents = Math.max(
      0,
      Math.round(req.body.commission_amount_cents),
    );
  }
  // Pack commission fields
  if (req.body.pack_commission_percent === null) patch.pack_commission_percent = null;
  if (
    typeof req.body.pack_commission_percent === "number" &&
    Number.isFinite(req.body.pack_commission_percent)
  )
    patch.pack_commission_percent = req.body.pack_commission_percent;
  if (req.body.pack_commission_amount_cents === null)
    patch.pack_commission_amount_cents = null;
  if (
    typeof req.body.pack_commission_amount_cents === "number" &&
    Number.isFinite(req.body.pack_commission_amount_cents)
  ) {
    patch.pack_commission_amount_cents = Math.max(
      0,
      Math.round(req.body.pack_commission_amount_cents),
    );
  }
  if (req.body.notes !== undefined)
    patch.notes = asString(req.body.notes) ?? null;

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const { data, error } = await supabase
    .from("establishment_commission_overrides")
    .update(patch)
    .eq("establishment_id", establishmentId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "commission.override.update",
    entity_type: "establishment_commission_overrides",
    entity_id: establishmentId,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  res.json({ ok: true, item: data as EstablishmentCommissionOverride });
};

export const deleteAdminCommissionOverride: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const establishmentId =
    typeof req.params.establishmentId === "string"
      ? req.params.establishmentId
      : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant d'établissement requis" });

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("establishment_commission_overrides")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  const { error } = await supabase
    .from("establishment_commission_overrides")
    .delete()
    .eq("establishment_id", establishmentId);
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "commission.override.delete",
    entity_type: "establishment_commission_overrides",
    entity_id: establishmentId,
    metadata: { before: beforeRow ?? null, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

// =============================================================================
// Pro Terms (admin-managed legal terms)
// =============================================================================

export const getAdminProTerms: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("finance_pro_terms")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, item: data as ProTermsRow });
};

export const updateAdminProTerms: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const version = asString(req.body.version);
  const title = asString(req.body.title);
  const body = asString(req.body.body);

  if (!version) return res.status(400).json({ error: "Version requise" });
  if (!title) return res.status(400).json({ error: "Titre requis" });

  const patch: Record<string, unknown> = {};
  if (version !== undefined) patch.version = version;
  if (title !== undefined) patch.title = title;
  if (body !== undefined) patch.body = body ?? "";

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("finance_pro_terms")
    .select("*")
    .eq("id", 1)
    .single();

  const { data, error } = await supabase
    .from("finance_pro_terms")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "pro_terms.update",
    entity_type: "finance.pro_terms",
    entity_id: null,
    metadata: {
      before: beforeRow,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
      version,
    },
  });

  await broadcastProNotification({
    supabase,
    category: "admin",
    title: "Conditions Pro mises à jour",
    body: "Les conditions Pro ont été mises à jour. Veuillez accepter les nouvelles conditions.",
    data: { kind: "pro_terms_updated", version },
  });

  res.json({ ok: true, item: data as ProTermsRow });
};

// =============================================================================
// Payout Requests (Pro reversements workflow)
// =============================================================================

export const listAdminPayoutRequests: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "submitted";
  const establishmentId =
    typeof req.query.establishment_id === "string"
      ? req.query.establishment_id.trim()
      : "";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("finance_payout_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") q = q.eq("status", status);
  if (establishmentId) q = q.eq("establishment_id", establishmentId);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: (data ?? []) as PayoutRequestRow[] });
};

export const updateAdminPayoutRequest: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const requestId = typeof req.params.id === "string" ? req.params.id : "";
  if (!requestId) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const nextStatus = asString(req.body.status);
  const adminComment = asString(req.body.admin_comment);
  const paidReference = asString(req.body.paid_reference);

  const allowedStatus = new Set(["submitted", "approved", "rejected", "paid"]);
  if (nextStatus && !allowedStatus.has(nextStatus))
    return res.status(400).json({ error: "invalid status" });

  const patch: Record<string, unknown> = {};
  if (nextStatus) patch.status = nextStatus;
  if (adminComment !== undefined) patch.admin_comment = adminComment ?? null;
  if (paidReference !== undefined) patch.paid_reference = paidReference ?? null;

  if (nextStatus === "approved") patch.approved_at = new Date().toISOString();
  if (nextStatus === "paid") patch.paid_at = new Date().toISOString();

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const supabase = getAdminSupabase();
  const { data: beforeRow } = await supabase
    .from("finance_payout_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("finance_payout_requests")
    .update(patch)
    .eq("id", requestId)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "payout_request.update",
    entity_type: "finance.payout_requests",
    entity_id: requestId,
    metadata: {
      before: beforeRow ?? null,
      after: data,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
      status: nextStatus,
    },
  });

  res.json({ ok: true, item: data as PayoutRequestRow });
};

// =============================================================================
// Pro Bank details (RIB) — Superadmin-only write, traceable
// =============================================================================

export const getAdminEstablishmentBankDetails: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("finance_pro_bank_details")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, item: (data as ProBankDetailsRow | null) ?? null });
};

export const upsertAdminEstablishmentBankDetails: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const parsed = parseRibBody(req.body);
  if (parsed.ok === false) return res.status(400).json({ error: parsed.error });

  const actor = getAdminSessionSub(req);
  const supabase = getAdminSupabase();

  const { data: before, error: beforeErr } = await supabase
    .from("finance_pro_bank_details")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });

  const patch: Record<string, unknown> = {
    establishment_id: establishmentId,
    bank_code: parsed.parts.bank_code,
    locality_code: parsed.parts.locality_code,
    branch_code: parsed.parts.branch_code,
    account_number: parsed.parts.account_number,
    rib_key: parsed.parts.rib_key,
    bank_name: parsed.bankName,
    bank_address: parsed.bankAddress,
    holder_name: parsed.holderName,
    holder_address: parsed.holderAddress,
    rib_24: parsed.rib24,

    // Any change resets validation, compta must validate again.
    is_validated: false,
    validated_at: null,
    validated_by: null,
  };

  const { data: after, error: upsertErr } = await supabase
    .from("finance_pro_bank_details")
    .upsert(patch, { onConflict: "establishment_id" })
    .select("*")
    .single();

  if (upsertErr) return res.status(500).json({ error: upsertErr.message });

  // History row
  await supabase.from("finance_pro_bank_details_history").insert({
    pro_bank_id: String((after as any).id ?? ""),
    changed_by: actor,
    old_data: before ?? null,
    new_data: after,
  });

  // Admin audit log (extra)
  const auditActor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: auditActor.actor_id,
    action: "pro_bank_details.upsert",
    entity_type: "finance.pro_bank_details",
    entity_id: String((after as any).id ?? ""),
    metadata: {
      before: before ?? null,
      after,
      actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role,
      establishment_id: establishmentId,
    },
  });

  res.json({ ok: true, item: after as ProBankDetailsRow });
};

export const validateAdminEstablishmentBankDetails: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const actor = getAdminSessionSub(req);
  const supabase = getAdminSupabase();

  const { data: before, error: beforeErr } = await supabase
    .from("finance_pro_bank_details")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "bank_details_not_found" });

  const rib24 =
    typeof (before as any)?.rib_24 === "string"
      ? String((before as any).rib_24)
      : "";
  if (!rib24 || digitsOnly(rib24).length !== 24) {
    return res.status(400).json({ error: "invalid_rib_24" });
  }

  const { data: after, error: updErr } = await supabase
    .from("finance_pro_bank_details")
    .update({
      is_validated: true,
      validated_at: new Date().toISOString(),
      validated_by: actor,
    })
    .eq("id", String((before as any).id ?? ""))
    .select("*")
    .single();

  if (updErr) return res.status(500).json({ error: updErr.message });

  await supabase.from("finance_pro_bank_details_history").insert({
    pro_bank_id: String((after as any).id ?? ""),
    changed_by: actor,
    old_data: before,
    new_data: after,
  });

  const auditActor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: auditActor.actor_id,
    action: "pro_bank_details.validate",
    entity_type: "finance.pro_bank_details",
    entity_id: String((after as any).id ?? ""),
    metadata: { before, after, actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role, establishment_id: establishmentId },
  });

  res.json({ ok: true, item: after as ProBankDetailsRow });
};

export const listAdminEstablishmentBankDetailsHistory: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: bankRow, error: bankErr } = await supabase
    .from("finance_pro_bank_details")
    .select("id")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (bankErr) return res.status(500).json({ error: bankErr.message });
  if (!bankRow)
    return res.json({ ok: true, items: [] as ProBankDetailsHistoryRow[] });

  const bankId = String((bankRow as any).id ?? "");

  const { data, error } = await supabase
    .from("finance_pro_bank_details_history")
    .select("*")
    .eq("pro_bank_id", bankId)
    .order("changed_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: (data ?? []) as ProBankDetailsHistoryRow[] });
};

export const uploadAdminEstablishmentBankDocument: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const contentType = (req.header("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/pdf")) {
    return res
      .status(400)
      .json({ error: "content_type_must_be_application_pdf" });
  }

  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ error: "pdf_body_required" });
  }

  if (body.length > MAX_PRO_BANK_DOC_PDF_BYTES) {
    return res
      .status(413)
      .json({ error: "pdf_too_large", max_bytes: MAX_PRO_BANK_DOC_PDF_BYTES });
  }

  if (!looksLikePdf(body)) {
    return res.status(400).json({ error: "invalid_pdf_signature" });
  }

  const actor = getAdminSessionSub(req);
  const supabase = getAdminSupabase();

  const { data: bankRow, error: bankErr } = await supabase
    .from("finance_pro_bank_details")
    .select("id")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (bankErr) return res.status(500).json({ error: bankErr.message });
  if (!bankRow)
    return res.status(404).json({ error: "bank_details_not_found" });

  const bankId = String((bankRow as any).id ?? "");

  const fileNameHeader = req.header("x-file-name") ?? "";
  const fileName = sanitizeFileName(fileNameHeader);

  const docId = randomBytes(12).toString("hex");
  const storagePath = `${establishmentId}/${bankId}/${docId}.pdf`;

  const up = await supabase.storage
    .from(PRO_BANK_DOCS_BUCKET)
    .upload(storagePath, body, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (up.error) return res.status(500).json({ error: up.error.message });

  const { data: created, error: insErr } = await supabase
    .from("finance_pro_bank_documents")
    .insert({
      pro_bank_id: bankId,
      file_path: storagePath,
      file_name: fileName,
      mime_type: "application/pdf",
      size_bytes: body.length,
      uploaded_by: actor,
      uploaded_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insErr) return res.status(500).json({ error: insErr.message });

  res.json({ ok: true, item: created as ProBankDocumentRow });
};

export const listAdminEstablishmentBankDocuments: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: bankRow, error: bankErr } = await supabase
    .from("finance_pro_bank_details")
    .select("id")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (bankErr) return res.status(500).json({ error: bankErr.message });
  if (!bankRow) return res.json({ ok: true, items: [] });

  const bankId = String((bankRow as any).id ?? "");

  const { data, error } = await supabase
    .from("finance_pro_bank_documents")
    .select("*")
    .eq("pro_bank_id", bankId)
    .order("uploaded_at", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  // Provide short-lived signed URLs (10 minutes)
  const items = await Promise.all(
    (data ?? []).map(async (d: any) => {
      const path = String(d.file_path ?? "");
      const signed = path
        ? await supabase.storage
            .from(PRO_BANK_DOCS_BUCKET)
            .createSignedUrl(path, 60 * 10)
        : null;

      return {
        ...(d as ProBankDocumentRow),
        signed_url: signed?.data?.signedUrl ?? null,
      };
    }),
  );

  res.json({ ok: true, items });
};

// =============================================================================
// Establishment Contracts (PDF documents — Superadmin only)
// =============================================================================

export const listAdminEstablishmentContracts: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("establishment_contracts")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("uploaded_at", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  // Provide short-lived signed URLs (10 minutes)
  const items = await Promise.all(
    (data ?? []).map(async (d: any) => {
      const path = String(d.file_path ?? "");
      const signed = path
        ? await supabase.storage
            .from(CONTRACTS_BUCKET)
            .createSignedUrl(path, 60 * 10)
        : null;

      return {
        ...(d as ContractRow),
        signed_url: signed?.data?.signedUrl ?? null,
      };
    }),
  );

  res.json({ ok: true, items });
};

export const uploadAdminEstablishmentContract: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const contentType = (req.header("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/pdf")) {
    return res
      .status(400)
      .json({ error: "content_type_must_be_application_pdf" });
  }

  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ error: "pdf_body_required" });
  }

  if (body.length > MAX_CONTRACT_PDF_BYTES) {
    return res
      .status(413)
      .json({ error: "pdf_too_large", max_bytes: MAX_CONTRACT_PDF_BYTES });
  }

  if (!looksLikePdf(body)) {
    return res.status(400).json({ error: "invalid_pdf_signature" });
  }

  const actor = getAdminSessionSub(req);
  const supabase = getAdminSupabase();

  // Parse optional metadata from headers
  const fileNameHeader = req.header("x-file-name") ?? "";
  const fileName = sanitizeFileName(fileNameHeader);
  const contractType = req.header("x-contract-type") || "partnership";
  const contractReference = req.header("x-contract-reference") || null;
  const signedAt = req.header("x-signed-at") || null;
  const startsAt = req.header("x-starts-at") || null;
  const expiresAt = req.header("x-expires-at") || null;
  const notes = req.header("x-notes") || null;

  const docId = randomBytes(12).toString("hex");
  const storagePath = `${establishmentId}/${docId}.pdf`;

  const up = await supabase.storage
    .from(CONTRACTS_BUCKET)
    .upload(storagePath, body, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (up.error) return res.status(500).json({ error: up.error.message });

  const { data: created, error: insErr } = await supabase
    .from("establishment_contracts")
    .insert({
      establishment_id: establishmentId,
      contract_type: contractType,
      contract_reference: contractReference,
      file_path: storagePath,
      file_name: fileName,
      mime_type: "application/pdf",
      size_bytes: body.length,
      signed_at: signedAt,
      starts_at: startsAt,
      expires_at: expiresAt,
      status: "active",
      notes: notes,
      uploaded_by: actor,
      uploaded_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insErr) return res.status(500).json({ error: insErr.message });

  res.json({ ok: true, item: created as ContractRow });
};

export const updateAdminEstablishmentContract: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  const contractId =
    typeof req.params.contractId === "string" ? req.params.contractId : "";

  if (!establishmentId || !contractId)
    return res.status(400).json({ error: "Identifiants requis" });

  const supabase = getAdminSupabase();
  const body = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};

  if (typeof body.contract_type === "string") updates.contract_type = body.contract_type;
  if (typeof body.contract_reference === "string" || body.contract_reference === null) updates.contract_reference = body.contract_reference;
  if (typeof body.signed_at === "string" || body.signed_at === null) updates.signed_at = body.signed_at;
  if (typeof body.starts_at === "string" || body.starts_at === null) updates.starts_at = body.starts_at;
  if (typeof body.expires_at === "string" || body.expires_at === null) updates.expires_at = body.expires_at;
  if (typeof body.status === "string") updates.status = body.status;
  if (typeof body.notes === "string" || body.notes === null) updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Aucune modification" });
  }

  const { data, error } = await supabase
    .from("establishment_contracts")
    .update(updates)
    .eq("id", contractId)
    .eq("establishment_id", establishmentId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, item: data as ContractRow });
};

export const deleteAdminEstablishmentContract: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  const contractId =
    typeof req.params.contractId === "string" ? req.params.contractId : "";

  if (!establishmentId || !contractId)
    return res.status(400).json({ error: "Identifiants requis" });

  const supabase = getAdminSupabase();

  // Get contract to find file_path
  const { data: contract, error: fetchErr } = await supabase
    .from("establishment_contracts")
    .select("file_path")
    .eq("id", contractId)
    .eq("establishment_id", establishmentId)
    .single();

  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!contract) return res.status(404).json({ error: "Contrat non trouvé" });

  // Delete from storage
  const filePath = String((contract as any).file_path ?? "");
  if (filePath) {
    await supabase.storage.from(CONTRACTS_BUCKET).remove([filePath]);
  }

  // Delete from database
  const { error: delErr } = await supabase
    .from("establishment_contracts")
    .delete()
    .eq("id", contractId)
    .eq("establishment_id", establishmentId);

  if (delErr) return res.status(500).json({ error: delErr.message });

  res.json({ ok: true });
};

// =============================================================================
// Booking Policy (per-establishment)
// =============================================================================

export const getAdminEstablishmentBookingPolicy: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("booking_policies")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  // Return null if no custom policy exists (defaults apply)
  res.json({ ok: true, policy: data ?? null });
};

export const updateAdminEstablishmentBookingPolicy: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  if (typeof req.body !== "object" || req.body === null)
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {};

  const cancellation_enabled = asBookingPolicyBoolean(req.body.cancellation_enabled);
  if (cancellation_enabled !== undefined)
    patch.cancellation_enabled = cancellation_enabled;

  const free_cancellation_hours = asBookingPolicyNumber(req.body.free_cancellation_hours);
  if (free_cancellation_hours !== undefined)
    patch.free_cancellation_hours = Math.max(
      0,
      Math.round(free_cancellation_hours),
    );

  const cancellation_penalty_percent = asBookingPolicyNumber(
    req.body.cancellation_penalty_percent,
  );
  if (cancellation_penalty_percent !== undefined)
    patch.cancellation_penalty_percent = Math.min(
      100,
      Math.max(0, Math.round(cancellation_penalty_percent)),
    );

  const no_show_penalty_percent = asBookingPolicyNumber(req.body.no_show_penalty_percent);
  if (no_show_penalty_percent !== undefined)
    patch.no_show_penalty_percent = Math.min(
      100,
      Math.max(0, Math.round(no_show_penalty_percent)),
    );

  const no_show_always_100_guaranteed = asBookingPolicyBoolean(
    req.body.no_show_always_100_guaranteed,
  );
  if (no_show_always_100_guaranteed !== undefined)
    patch.no_show_always_100_guaranteed = no_show_always_100_guaranteed;

  if (typeof req.body.cancellation_text_fr === "string")
    patch.cancellation_text_fr = req.body.cancellation_text_fr;
  if (typeof req.body.cancellation_text_en === "string")
    patch.cancellation_text_en = req.body.cancellation_text_en;

  const modification_enabled = asBookingPolicyBoolean(req.body.modification_enabled);
  if (modification_enabled !== undefined)
    patch.modification_enabled = modification_enabled;

  const modification_deadline_hours = asBookingPolicyNumber(
    req.body.modification_deadline_hours,
  );
  if (modification_deadline_hours !== undefined)
    patch.modification_deadline_hours = Math.max(
      0,
      Math.round(modification_deadline_hours),
    );

  const requireScoreRaw = req.body.require_guarantee_below_score;
  if (requireScoreRaw === null) {
    patch.require_guarantee_below_score = null;
  } else {
    const requireScore = asBookingPolicyNumber(requireScoreRaw);
    if (requireScore !== undefined)
      patch.require_guarantee_below_score = Math.min(
        100,
        Math.max(0, Math.round(requireScore)),
      );
  }

  if (typeof req.body.modification_text_fr === "string")
    patch.modification_text_fr = req.body.modification_text_fr;
  if (typeof req.body.modification_text_en === "string")
    patch.modification_text_en = req.body.modification_text_en;

  // Protection window: hours before reservation during which free reservations
  // cannot be cancelled/refused by the PRO (protects customers already on their way)
  const protection_window_hours = asBookingPolicyNumber(req.body.protection_window_hours);
  if (protection_window_hours !== undefined)
    patch.protection_window_hours = Math.max(0, Math.round(protection_window_hours));

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  patch.updated_at = new Date().toISOString();

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("booking_policies")
    .upsert(
      { establishment_id: establishmentId, ...patch },
      { onConflict: "establishment_id" },
    );

  if (error) return res.status(500).json({ error: error.message });

  const { data, error: getErr } = await supabase
    .from("booking_policies")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (getErr) return res.status(500).json({ error: getErr.message });

  const defaults = defaultBookingPolicy(establishmentId);
  const row = data
    ? ({ ...defaults, ...(data as Record<string, unknown>) } as Record<
        string,
        unknown
      >)
    : (defaults as Record<string, unknown>);

  res.json({ ok: true, policy: row });
};

export const resetAdminEstablishmentBookingPolicy: RequestHandler = async (
  req,
  res,
) => {
  if (!requireSuperadmin(req, res)) return;

  const establishmentId =
    typeof req.params.id === "string" ? req.params.id : "";
  if (!establishmentId)
    return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("booking_policies")
    .delete()
    .eq("establishment_id", establishmentId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, policy: null });
};
