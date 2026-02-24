/**
 * Partnership Pro Routes — PRO/Establishment endpoints
 *
 * View current agreement, accept/refuse proposal, toggle lines.
 * All endpoints require PRO Bearer token + establishment membership.
 */

import type { Express, Request } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { zBody, zParams } from "../lib/validate";
import {
  acceptPartnershipSchema,
  refusePartnershipSchema,
  requestModificationSchema,
  togglePartnershipLineSchema,
  LineIdParams,
} from "../schemas/partnershipPro";

const log = createModuleLogger("partnershipPro");
import {
  logAgreementHistory,
  syncEstablishmentPartnerFlag,
} from "../partnershipLogic";

// ============================================================================
// Auth Helper (PRO) — same pattern as cePro.ts
// ============================================================================

type ProUser = { id: string; email?: string | null };

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

async function getProUser(req: Request): Promise<ProUser | null> {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return null;

  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email };
  } catch (err) {
    log.warn({ err }, "Failed to verify pro user token");
    return null;
  }
}

async function ensureProRole(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: string } | { ok: false; status: number; error: string }> {
  const sb = getAdminSupabase();
  const { data: membership } = await sb
    .from("pro_establishment_memberships")
    .select("role")
    .eq("establishment_id", args.establishmentId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (!membership) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true, role: membership.role };
}

const supabase = () => getAdminSupabase();

// ============================================================================
// Route Registration
// ============================================================================

export function registerPartnershipProRoutes(app: Express): void {

  // --------------------------------------------------
  // GET /api/pro/partnership — Current agreement for an establishment
  // --------------------------------------------------
  app.get("/api/pro/partnership", async (req, res) => {
    try {
      const user = await getProUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const establishmentId = req.query.establishment_id as string;
      if (!establishmentId) return res.status(400).json({ error: "establishment_id required" });

      const roleCheck = await ensureProRole({ establishmentId, userId: user.id });
      if (!roleCheck.ok) return res.status(roleCheck.status).json({ error: roleCheck.error });

      const sb = supabase();

      // Fetch agreement (excluding sensitive admin fields)
      const { data: agreement, error } = await sb
        .from("partner_agreements")
        .select("id, establishment_id, status, contact_name, contact_email, contact_phone, start_date, end_date, signed_at, signed_by, created_at, updated_at")
        .eq("establishment_id", establishmentId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) return res.status(500).json({ error: "Erreur serveur" });
      if (!agreement) return res.json({ ok: true, data: null });

      // Fetch lines (excluding commission fields)
      const { data: lines } = await sb
        .from("agreement_lines")
        .select("id, agreement_id, establishment_id, module, advantage_type, advantage_value, description, conditions, start_date, end_date, max_uses_per_employee, max_uses_total, is_active, toggled_by_pro, toggled_by_pro_at, sort_order, created_at, updated_at")
        .eq("agreement_id", agreement.id)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      // Fetch establishment name
      const { data: est } = await sb
        .from("establishments")
        .select("name")
        .eq("id", establishmentId)
        .maybeSingle();

      return res.json({
        ok: true,
        data: {
          ...agreement,
          establishment_name: est?.name ?? null,
          lines: lines ?? [],
        },
      });
    } catch (err) {
      log.error({ err }, "GET /api/pro/partnership error");
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // --------------------------------------------------
  // GET /api/pro/partnership/lines — Lines only
  // --------------------------------------------------
  app.get("/api/pro/partnership/lines", async (req, res) => {
    try {
      const user = await getProUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const establishmentId = req.query.establishment_id as string;
      if (!establishmentId) return res.status(400).json({ error: "establishment_id required" });

      const roleCheck = await ensureProRole({ establishmentId, userId: user.id });
      if (!roleCheck.ok) return res.status(roleCheck.status).json({ error: roleCheck.error });

      const sb = supabase();

      // Find agreement
      const { data: agreement } = await sb
        .from("partner_agreements")
        .select("id, status")
        .eq("establishment_id", establishmentId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!agreement) return res.json({ ok: true, data: [] });

      // Fetch lines (no commission fields)
      const { data: lines } = await sb
        .from("agreement_lines")
        .select("id, agreement_id, establishment_id, module, advantage_type, advantage_value, description, conditions, start_date, end_date, max_uses_per_employee, max_uses_total, is_active, toggled_by_pro, toggled_by_pro_at, sort_order, created_at, updated_at")
        .eq("agreement_id", agreement.id)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });

      return res.json({ ok: true, data: lines ?? [] });
    } catch (err) {
      log.error({ err }, "GET /api/pro/partnership/lines error");
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // --------------------------------------------------
  // POST /api/pro/partnership/accept — Accept a proposal
  // --------------------------------------------------
  app.post("/api/pro/partnership/accept", zBody(acceptPartnershipSchema), async (req, res) => {
    try {
      const user = await getProUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const { establishment_id } = req.body;
      if (!establishment_id) return res.status(400).json({ error: "establishment_id required" });

      const roleCheck = await ensureProRole({ establishmentId: establishment_id, userId: user.id });
      if (!roleCheck.ok) return res.status(roleCheck.status).json({ error: roleCheck.error });

      // Only owner/manager can accept
      if (!["owner", "manager"].includes(roleCheck.role)) {
        return res.status(403).json({ error: "Seuls les responsables peuvent accepter un partenariat" });
      }

      const sb = supabase();

      // Fetch agreement
      const { data: agreement, error: fetchErr } = await sb
        .from("partner_agreements")
        .select("*")
        .eq("establishment_id", establishment_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (fetchErr || !agreement) return res.status(404).json({ error: "Accord non trouvé" });

      // Can only accept proposal_sent or in_negotiation
      if (!["proposal_sent", "in_negotiation"].includes(agreement.status)) {
        return res.status(400).json({ error: "L'accord n'est pas en attente d'acceptation" });
      }

      // Update status to active
      const { data: updated, error: updateErr } = await sb
        .from("partner_agreements")
        .update({
          status: "active",
          signed_at: new Date().toISOString(),
          signed_by: user.id,
        })
        .eq("id", agreement.id)
        .select()
        .single();

      if (updateErr) return res.status(500).json({ error: "Erreur lors de l'acceptation" });

      // Log history
      await logAgreementHistory(agreement.id, "pro", user.id, "accepted", {
        previous_status: agreement.status,
      });

      // Sync establishment flag
      await syncEstablishmentPartnerFlag(establishment_id);

      return res.json({ ok: true, data: updated });
    } catch (err) {
      log.error({ err }, "POST /api/pro/partnership/accept error");
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // --------------------------------------------------
  // POST /api/pro/partnership/refuse — Refuse a proposal
  // --------------------------------------------------
  app.post("/api/pro/partnership/refuse", zBody(refusePartnershipSchema), async (req, res) => {
    try {
      const user = await getProUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const { establishment_id, reason } = req.body;
      if (!establishment_id) return res.status(400).json({ error: "establishment_id required" });

      const roleCheck = await ensureProRole({ establishmentId: establishment_id, userId: user.id });
      if (!roleCheck.ok) return res.status(roleCheck.status).json({ error: roleCheck.error });

      if (!["owner", "manager"].includes(roleCheck.role)) {
        return res.status(403).json({ error: "Seuls les responsables peuvent refuser un partenariat" });
      }

      const sb = supabase();

      const { data: agreement } = await sb
        .from("partner_agreements")
        .select("*")
        .eq("establishment_id", establishment_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (!agreement) return res.status(404).json({ error: "Accord non trouvé" });

      if (!["proposal_sent", "in_negotiation"].includes(agreement.status)) {
        return res.status(400).json({ error: "L'accord n'est pas en attente" });
      }

      const { data: updated, error: updateErr } = await sb
        .from("partner_agreements")
        .update({ status: "refused" })
        .eq("id", agreement.id)
        .select()
        .single();

      if (updateErr) return res.status(500).json({ error: "Erreur lors du refus" });

      await logAgreementHistory(agreement.id, "pro", user.id, "refused", {
        previous_status: agreement.status,
        reason: reason ?? null,
      });

      return res.json({ ok: true, data: updated });
    } catch (err) {
      log.error({ err }, "POST /api/pro/partnership/refuse error");
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // --------------------------------------------------
  // POST /api/pro/partnership/request-modification — Request a change
  // --------------------------------------------------
  app.post("/api/pro/partnership/request-modification", zBody(requestModificationSchema), async (req, res) => {
    try {
      const user = await getProUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const { establishment_id, comment } = req.body;
      if (!establishment_id) return res.status(400).json({ error: "establishment_id required" });
      if (!comment || typeof comment !== "string" || comment.trim().length === 0) {
        return res.status(400).json({ error: "comment required" });
      }

      const roleCheck = await ensureProRole({ establishmentId: establishment_id, userId: user.id });
      if (!roleCheck.ok) return res.status(roleCheck.status).json({ error: roleCheck.error });

      const sb = supabase();

      const { data: agreement } = await sb
        .from("partner_agreements")
        .select("*")
        .eq("establishment_id", establishment_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (!agreement) return res.status(404).json({ error: "Accord non trouvé" });

      if (!["proposal_sent", "in_negotiation", "active"].includes(agreement.status)) {
        return res.status(400).json({ error: "L'accord ne permet pas de demander une modification" });
      }

      // Set status to in_negotiation if it was proposal_sent
      const newStatus = agreement.status === "proposal_sent" ? "in_negotiation" : agreement.status;

      const { data: updated, error: updateErr } = await sb
        .from("partner_agreements")
        .update({ status: newStatus })
        .eq("id", agreement.id)
        .select()
        .single();

      if (updateErr) return res.status(500).json({ error: "Erreur serveur" });

      await logAgreementHistory(agreement.id, "pro", user.id, "modification_requested", {
        comment: comment.trim(),
        previous_status: agreement.status,
      });

      return res.json({ ok: true, data: updated });
    } catch (err) {
      log.error({ err }, "POST /api/pro/partnership/request-modification error");
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // --------------------------------------------------
  // PUT /api/pro/partnership/lines/:lineId/toggle — Toggle line active/inactive
  // --------------------------------------------------
  app.put("/api/pro/partnership/lines/:lineId/toggle", zParams(LineIdParams), zBody(togglePartnershipLineSchema), async (req, res) => {
    try {
      const user = await getProUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const { lineId } = req.params;
      const { establishment_id } = req.body;
      if (!establishment_id) return res.status(400).json({ error: "establishment_id required" });

      const roleCheck = await ensureProRole({ establishmentId: establishment_id, userId: user.id });
      if (!roleCheck.ok) return res.status(roleCheck.status).json({ error: roleCheck.error });

      const sb = supabase();

      // Fetch the line
      const { data: line, error: fetchErr } = await sb
        .from("agreement_lines")
        .select("*")
        .eq("id", lineId)
        .eq("establishment_id", establishment_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (fetchErr || !line) return res.status(404).json({ error: "Ligne non trouvée" });

      // Check the parent agreement is active
      const { data: agreement } = await sb
        .from("partner_agreements")
        .select("id, status")
        .eq("id", line.agreement_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (!agreement || agreement.status !== "active") {
        return res.status(400).json({ error: "L'accord n'est pas actif" });
      }

      // Toggle
      const newActive = !line.is_active;
      const { data: updated, error: updateErr } = await sb
        .from("agreement_lines")
        .update({
          is_active: newActive,
          toggled_by_pro: true,
          toggled_by_pro_at: new Date().toISOString(),
        })
        .eq("id", lineId)
        .select()
        .single();

      if (updateErr) return res.status(500).json({ error: "Erreur lors de la mise à jour" });

      await logAgreementHistory(agreement.id, "pro", user.id, "line_toggled", {
        line_id: lineId,
        description: line.description,
        new_state: newActive ? "active" : "inactive",
      });

      return res.json({ ok: true, data: updated });
    } catch (err) {
      log.error({ err }, "PUT toggle error");
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
