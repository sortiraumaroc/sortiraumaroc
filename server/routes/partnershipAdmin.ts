/**
 * Partnership Admin Routes — Back Office
 *
 * CRUD for partner agreements, agreement lines, dashboard, CSV exports.
 * All endpoints require admin session.
 */

import crypto from "node:crypto";
import type { Express, RequestHandler } from "express";
import { parseCookies, getSessionCookieName, verifyAdminSessionToken, type AdminSessionPayload } from "../adminSession";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  createAgreementSchema,
  updateAgreementSchema,
  createAgreementLineSchema,
  updateAgreementLineSchema,
  partnershipListQuerySchema,
} from "../schemas/partnership";
import {
  logAgreementHistory,
  syncEstablishmentPartnerFlag,
  countAgreementLines,
  getAgreementLines,
  getAgreementHistory,
} from "../partnershipLogic";
import { zBody, zParams, zIdParam } from "../lib/validate";
import {
  PartnershipAdminCreateSchema,
  PartnershipAdminUpdateSchema,
  PartnershipAdminCreateLineSchema,
  PartnershipAdminUpdateLineSchema,
  AgreementLineParams,
} from "../schemas/partnershipAdmin";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("partnershipAdmin");

// ============================================================================
// Admin Session Helper (same pattern as ceAdmin.ts)
// ============================================================================

function getAdminSessionToken(req: Parameters<RequestHandler>[0]): string | null {
  const cookies = parseCookies(req.header("cookie") ?? undefined);
  const cookieToken = cookies[getSessionCookieName()];
  if (cookieToken) return cookieToken;
  const headerToken = req.header("x-admin-session") ?? undefined;
  if (headerToken) return headerToken;
  const apiKey = req.header("x-api-key") ?? undefined;
  if (apiKey && process.env.ADMIN_API_KEY) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(process.env.ADMIN_API_KEY))) return apiKey;
    } catch { /* intentional: timingSafeEqual throws on length mismatch */ }
  }
  return null;
}

function requireAdminSession(req: Parameters<RequestHandler>[0]): AdminSessionPayload | null {
  const token = getAdminSessionToken(req);
  if (!token) return null;
  const session = verifyAdminSessionToken(token);
  if (!session) return null;
  return session;
}

const supabase = () => getAdminSupabase();

// ============================================================================
// CSV Helper
// ============================================================================

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines: string[] = [headers.join(";")];
  for (const row of rows) {
    const values = headers.map((h) => {
      const val = String((row as any)[h] ?? "");
      if (val.includes(";") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    lines.push(values.join(";"));
  }
  return lines.join("\n");
}

// ============================================================================
// Route Registration
// ============================================================================

export function registerPartnershipAdminRoutes(app: Express): void {
  // --------------------------------------------------
  // Dashboard
  // --------------------------------------------------

  app.get("/api/admin/partnerships/dashboard", async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const sb = supabase();
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const nowISO = now.toISOString();

      // Count agreements by status in parallel
      const [
        totalAgreements,
        activeAgreements,
        draftAgreements,
        proposalSent,
        inNegotiation,
        suspended,
        expiring30d,
        refused,
        totalLines,
        activeLines,
        ceLines,
        conciergerieLines,
        bothLines,
      ] = await Promise.all([
        sb.from("partner_agreements").select("id", { count: "exact", head: true }).is("deleted_at", null),
        sb.from("partner_agreements").select("id", { count: "exact", head: true }).eq("status", "active").is("deleted_at", null),
        sb.from("partner_agreements").select("id", { count: "exact", head: true }).eq("status", "draft").is("deleted_at", null),
        sb.from("partner_agreements").select("id", { count: "exact", head: true }).eq("status", "proposal_sent").is("deleted_at", null),
        sb.from("partner_agreements").select("id", { count: "exact", head: true }).eq("status", "in_negotiation").is("deleted_at", null),
        sb.from("partner_agreements").select("id", { count: "exact", head: true }).eq("status", "suspended").is("deleted_at", null),
        sb.from("partner_agreements").select("id", { count: "exact", head: true }).eq("status", "active").is("deleted_at", null).lte("end_date", in30Days).gte("end_date", nowISO),
        sb.from("partner_agreements").select("id", { count: "exact", head: true }).eq("status", "refused").is("deleted_at", null),
        sb.from("agreement_lines").select("id", { count: "exact", head: true }).is("deleted_at", null),
        sb.from("agreement_lines").select("id", { count: "exact", head: true }).eq("status", "active").is("deleted_at", null),
        sb.from("agreement_lines").select("id", { count: "exact", head: true }).eq("module", "ce").is("deleted_at", null),
        sb.from("agreement_lines").select("id", { count: "exact", head: true }).eq("module", "conciergerie").is("deleted_at", null),
        sb.from("agreement_lines").select("id", { count: "exact", head: true }).eq("module", "both").is("deleted_at", null),
      ]);

      res.json({
        ok: true,
        data: {
          total_agreements: totalAgreements.count ?? 0,
          active_agreements: activeAgreements.count ?? 0,
          draft_agreements: draftAgreements.count ?? 0,
          proposal_sent_count: proposalSent.count ?? 0,
          in_negotiation_count: inNegotiation.count ?? 0,
          suspended_count: suspended.count ?? 0,
          expiring_30d: expiring30d.count ?? 0,
          refused_count: refused.count ?? 0,
          total_lines: totalLines.count ?? 0,
          active_lines: activeLines.count ?? 0,
          lines_by_module: {
            ce: ceLines.count ?? 0,
            conciergerie: conciergerieLines.count ?? 0,
            both: bothLines.count ?? 0,
          },
        },
      });
    } catch (err: any) {
      log.error({ err }, "dashboard error");
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });

  // --------------------------------------------------
  // List Agreements
  // --------------------------------------------------

  app.get("/api/admin/partnerships", async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const parsed = partnershipListQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
      const { page, limit, search, status, order } = parsed.data;
      const offset = (page - 1) * limit;

      const sb = supabase();
      let query = sb
        .from("partner_agreements")
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: order === "asc" })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq("status", status);

      const { data: agreements, count, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      // Enrich with establishment info and line counts
      const enriched = await Promise.all(
        (agreements ?? []).map(async (ag: any) => {
          const { data: est } = await sb
            .from("establishments")
            .select("name, slug, city, universe, category, cover_url")
            .eq("id", ag.establishment_id)
            .maybeSingle();

          const lineCount = await countAgreementLines(ag.id);

          return {
            ...ag,
            establishment_name: est?.name ?? null,
            establishment_slug: est?.slug ?? null,
            establishment_city: est?.city ?? null,
            establishment_universe: est?.universe ?? null,
            establishment_category: est?.category ?? null,
            establishment_cover_url: est?.cover_url ?? null,
            lines_count: lineCount,
          };
        }),
      );

      // Post-fetch search filtering on establishment name
      let filtered = enriched;
      if (search) {
        const lower = search.toLowerCase();
        filtered = enriched.filter(
          (ag) =>
            (ag.establishment_name && ag.establishment_name.toLowerCase().includes(lower)) ||
            (ag.notes && ag.notes.toLowerCase().includes(lower)),
        );
      }

      res.json({ ok: true, data: filtered, total: search ? filtered.length : (count ?? 0), page, limit });
    } catch (err: any) {
      log.error({ err }, "list error");
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });

  // --------------------------------------------------
  // Create Agreement
  // --------------------------------------------------

  app.post("/api/admin/partnerships", zBody(PartnershipAdminCreateSchema), async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const parsed = createAgreementSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

      const { lines, ...agreementData } = parsed.data;
      const sb = supabase();

      // Check no existing non-deleted agreement for this establishment
      const { data: existing } = await sb
        .from("partner_agreements")
        .select("id")
        .eq("establishment_id", agreementData.establishment_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ error: "Un accord existe déjà pour cet établissement" });
      }

      // Insert agreement
      const { data: agreement, error: insertError } = await sb
        .from("partner_agreements")
        .insert({
          ...agreementData,
          status: "draft",
          created_by: session.sub ?? "admin",
        })
        .select()
        .single();

      if (insertError) return res.status(500).json({ error: insertError.message });

      // Insert lines if provided
      if (lines && lines.length > 0) {
        const lineRows = lines.map((line: any) => ({
          ...line,
          agreement_id: agreement.id,
          establishment_id: agreementData.establishment_id,
        }));
        const { error: linesError } = await sb.from("agreement_lines").insert(lineRows);
        if (linesError) {
          log.error({ err: linesError }, "error inserting lines");
        }
      }

      // Log history
      await logAgreementHistory(agreement.id, "created", session.sub ?? "admin", {
        establishment_id: agreementData.establishment_id,
      });

      res.json({ ok: true, data: agreement });
    } catch (err: any) {
      log.error({ err }, "create error");
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });

  // --------------------------------------------------
  // Get Agreement Detail
  // --------------------------------------------------

  app.get("/api/admin/partnerships/:id", zParams(zIdParam), async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const sb = supabase();
      const { data: agreement, error } = await sb
        .from("partner_agreements")
        .select("*")
        .eq("id", req.params.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) return res.status(500).json({ error: error.message });
      if (!agreement) return res.status(404).json({ error: "Accord introuvable" });

      // Enrich with establishment info
      const { data: est } = await sb
        .from("establishments")
        .select("name, slug, city, universe, category, cover_url")
        .eq("id", agreement.establishment_id)
        .maybeSingle();

      // Fetch lines and history
      const [lines, history] = await Promise.all([
        getAgreementLines(agreement.id),
        getAgreementHistory(agreement.id),
      ]);

      res.json({
        ok: true,
        data: {
          ...agreement,
          establishment_name: est?.name ?? null,
          establishment_slug: est?.slug ?? null,
          establishment_city: est?.city ?? null,
          establishment_universe: est?.universe ?? null,
          establishment_category: est?.category ?? null,
          establishment_cover_url: est?.cover_url ?? null,
          lines,
          history,
        },
      });
    } catch (err: any) {
      log.error({ err }, "get detail error");
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });

  // --------------------------------------------------
  // Update Agreement
  // --------------------------------------------------

  app.put("/api/admin/partnerships/:id", zParams(zIdParam), zBody(PartnershipAdminUpdateSchema), async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const parsed = updateAgreementSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

      const sb = supabase();

      // Get current agreement for status change detection
      const { data: current } = await sb
        .from("partner_agreements")
        .select("status, establishment_id")
        .eq("id", req.params.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (!current) return res.status(404).json({ error: "Accord introuvable" });

      const { data: updated, error } = await sb
        .from("partner_agreements")
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .is("deleted_at", null)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      // Log status change if applicable
      if (parsed.data.status && parsed.data.status !== current.status) {
        await logAgreementHistory(req.params.id, "status_changed", session.sub ?? "admin", {
          old_status: current.status,
          new_status: parsed.data.status,
        });
      }

      // Sync establishment partner flag if status changed to active
      if (parsed.data.status === "active") {
        await syncEstablishmentPartnerFlag(current.establishment_id);
      }

      res.json({ ok: true, data: updated });
    } catch (err: any) {
      log.error({ err }, "update error");
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });

  // --------------------------------------------------
  // Delete Agreement (soft delete)
  // --------------------------------------------------

  app.delete("/api/admin/partnerships/:id", zParams(zIdParam), async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const sb = supabase();
      const nowISO = new Date().toISOString();

      // Get establishment_id before soft delete
      const { data: agreement } = await sb
        .from("partner_agreements")
        .select("establishment_id")
        .eq("id", req.params.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (!agreement) return res.status(404).json({ error: "Accord introuvable" });

      // Soft delete agreement
      const { error: agError } = await sb
        .from("partner_agreements")
        .update({ deleted_at: nowISO })
        .eq("id", req.params.id);

      if (agError) return res.status(500).json({ error: agError.message });

      // Soft delete all lines for this agreement
      const { error: linesError } = await sb
        .from("agreement_lines")
        .update({ deleted_at: nowISO })
        .eq("agreement_id", req.params.id);

      if (linesError) {
        log.error({ err: linesError }, "error soft-deleting lines");
      }

      // Sync establishment partner flag
      await syncEstablishmentPartnerFlag(agreement.establishment_id);

      // Log history
      await logAgreementHistory(req.params.id, "deleted", session.sub ?? "admin", {
        establishment_id: agreement.establishment_id,
      });

      res.json({ ok: true });
    } catch (err: any) {
      log.error({ err }, "delete error");
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });

  // --------------------------------------------------
  // Agreement Lines — Add
  // --------------------------------------------------

  app.post("/api/admin/partnerships/:id/lines", zParams(zIdParam), zBody(PartnershipAdminCreateLineSchema), async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const parsed = createAgreementLineSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

      const sb = supabase();

      // Fetch parent agreement to get establishment_id
      const { data: agreement } = await sb
        .from("partner_agreements")
        .select("establishment_id")
        .eq("id", req.params.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (!agreement) return res.status(404).json({ error: "Accord introuvable" });

      const { data: line, error } = await sb
        .from("agreement_lines")
        .insert({
          ...parsed.data,
          agreement_id: req.params.id,
          establishment_id: agreement.establishment_id,
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      // Log history
      await logAgreementHistory(req.params.id, "line_added", session.sub ?? "admin", {
        line_id: line.id,
        description: parsed.data.description ?? null,
      });

      res.json({ ok: true, data: line });
    } catch (err: any) {
      log.error({ err }, "add line error");
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });

  // --------------------------------------------------
  // Agreement Lines — Update
  // --------------------------------------------------

  app.put("/api/admin/partnerships/:id/lines/:lineId", zParams(AgreementLineParams), zBody(PartnershipAdminUpdateLineSchema), async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const parsed = updateAgreementLineSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.issues });

      const sb = supabase();
      const { data: updated, error } = await sb
        .from("agreement_lines")
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq("id", req.params.lineId)
        .eq("agreement_id", req.params.id)
        .is("deleted_at", null)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      // Log history
      await logAgreementHistory(req.params.id, "line_modified", session.sub ?? "admin", {
        line_id: req.params.lineId,
      });

      res.json({ ok: true, data: updated });
    } catch (err: any) {
      log.error({ err }, "update line error");
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });

  // --------------------------------------------------
  // Agreement Lines — Delete (soft delete)
  // --------------------------------------------------

  app.delete("/api/admin/partnerships/:id/lines/:lineId", zParams(AgreementLineParams), async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const sb = supabase();
      const { error } = await sb
        .from("agreement_lines")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", req.params.lineId)
        .eq("agreement_id", req.params.id);

      if (error) return res.status(500).json({ error: error.message });

      // Log history
      await logAgreementHistory(req.params.id, "line_removed", session.sub ?? "admin", {
        line_id: req.params.lineId,
      });

      res.json({ ok: true });
    } catch (err: any) {
      log.error({ err }, "delete line error");
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });

  // --------------------------------------------------
  // Send Proposal
  // --------------------------------------------------

  app.post("/api/admin/partnerships/:id/send-proposal", zParams(zIdParam), async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const sb = supabase();

      // Verify agreement exists
      const { data: agreement } = await sb
        .from("partner_agreements")
        .select("id, status")
        .eq("id", req.params.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (!agreement) return res.status(404).json({ error: "Accord introuvable" });

      const { data: updated, error } = await sb
        .from("partner_agreements")
        .update({ status: "proposal_sent", updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });

      // Log history
      await logAgreementHistory(req.params.id, "proposal_sent", session.sub ?? "admin", {
        previous_status: agreement.status,
      });

      res.json({ ok: true, data: updated });
    } catch (err: any) {
      log.error({ err }, "send proposal error");
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });

  // --------------------------------------------------
  // CSV Export
  // --------------------------------------------------

  app.get("/api/admin/partnerships/export", async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const sb = supabase();
      const { data: agreements } = await sb
        .from("partner_agreements")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      const rows = await Promise.all(
        (agreements ?? []).map(async (ag: any) => {
          const { data: est } = await sb
            .from("establishments")
            .select("name, city, universe, category")
            .eq("id", ag.establishment_id)
            .maybeSingle();

          const lineCount = await countAgreementLines(ag.id);

          return {
            id: ag.id,
            etablissement: est?.name ?? "",
            ville: est?.city ?? "",
            univers: est?.universe ?? "",
            categorie: est?.category ?? "",
            statut: ag.status,
            date_debut: ag.start_date ?? "",
            date_fin: ag.end_date ?? "",
            nombre_lignes: lineCount,
            notes: ag.notes ?? "",
            cree_par: ag.created_by ?? "",
            cree_le: ag.created_at,
            mis_a_jour_le: ag.updated_at ?? "",
          };
        }),
      );

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=partenariats.csv");
      res.send("\uFEFF" + toCSV(rows));
    } catch (err: any) {
      log.error({ err }, "export error");
      res.status(500).json({ error: err.message || "Erreur serveur" });
    }
  });
}
