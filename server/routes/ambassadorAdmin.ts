/**
 * Ambassador Program — Admin Routes
 *
 * 6 endpoints admin :
 * - Stats globales
 * - Liste programmes
 * - Liste conversions (all + suspicious)
 * - Flag conversion
 * - Force confirm conversion (dispute resolution)
 */

import type { Router, RequestHandler } from "express";
import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./admin";
import { zBody, zQuery, zParams } from "../lib/validate";
import {
  ListAdminProgramsQuery,
  ListAdminConversionsQuery,
  AmbassadorConversionIdParams,
  FlagConversionSchema,
} from "../schemas/ambassadorProgram";

const log = createModuleLogger("ambassadorAdmin");

// =============================================================================
// 1. GET /api/admin/ambassador/stats — KPIs globaux
// =============================================================================

const getAdminStats: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    const { count: activePrograms } = await supabase
      .from("ambassador_programs")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    const { count: totalPrograms } = await supabase
      .from("ambassador_programs")
      .select("id", { count: "exact", head: true });

    const { count: totalAmbassadors } = await supabase
      .from("ambassador_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "accepted");

    const { count: totalConversions } = await supabase
      .from("post_conversions")
      .select("id", { count: "exact", head: true });

    const { count: confirmedConversions } = await supabase
      .from("post_conversions")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmed");

    const { count: totalRewards } = await supabase
      .from("ambassador_rewards")
      .select("id", { count: "exact", head: true });

    const { count: claimedRewards } = await supabase
      .from("ambassador_rewards")
      .select("id", { count: "exact", head: true })
      .eq("status", "claimed");

    const { count: suspiciousConversions } = await supabase
      .from("post_conversions")
      .select("id", { count: "exact", head: true })
      .eq("is_suspicious", true);

    res.json({
      ok: true,
      stats: {
        active_programs: activePrograms ?? 0,
        total_programs: totalPrograms ?? 0,
        total_ambassadors: totalAmbassadors ?? 0,
        total_conversions: totalConversions ?? 0,
        confirmed_conversions: confirmedConversions ?? 0,
        total_rewards: totalRewards ?? 0,
        claimed_rewards: claimedRewards ?? 0,
        suspicious_conversions: suspiciousConversions ?? 0,
      },
    });
  } catch (err) {
    log.error({ err }, "getAdminStats error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 2. GET /api/admin/ambassador/programs — Liste de tous les programmes
// =============================================================================

const listAdminPrograms: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const isActive = req.query.is_active as string | undefined;
    const page = Number(req.query.page ?? 1);
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const offset = (page - 1) * limit;

    let query = supabase
      .from("ambassador_programs")
      .select(
        "*, establishment:establishments(id, name, slug, city, logo_url)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (isActive === "true") query = query.eq("is_active", true);
    if (isActive === "false") query = query.eq("is_active", false);

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.json({
      ok: true,
      programs: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    log.error({ err }, "listAdminPrograms error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 3. GET /api/admin/ambassador/conversions — Toutes les conversions
// =============================================================================

const listAdminConversions: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const status = req.query.status as string | undefined;
    const isSuspicious = req.query.is_suspicious as string | undefined;
    const establishmentId = req.query.establishment_id as string | undefined;
    const page = Number(req.query.page ?? 1);
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const offset = (page - 1) * limit;

    let query = supabase
      .from("post_conversions")
      .select(
        "*, ambassador:profiles!post_conversions_ambassador_id_fkey(id, username, full_name), converted_user:profiles!post_conversions_converted_user_id_fkey(id, username, full_name), establishment:establishments(id, name, slug)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (isSuspicious === "true") query = query.eq("is_suspicious", true);
    if (isSuspicious === "false") query = query.eq("is_suspicious", false);
    if (establishmentId) query = query.eq("establishment_id", establishmentId);

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.json({
      ok: true,
      conversions: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    log.error({ err }, "listAdminConversions error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 4. GET /api/admin/ambassador/conversions/suspicious — Conversions suspectes
// =============================================================================

const listSuspiciousConversions: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    const { data, error, count } = await supabase
      .from("post_conversions")
      .select(
        "*, ambassador:profiles!post_conversions_ambassador_id_fkey(id, username, full_name), converted_user:profiles!post_conversions_converted_user_id_fkey(id, username, full_name), establishment:establishments(id, name, slug)",
        { count: "exact" }
      )
      .eq("is_suspicious", true)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    res.json({
      ok: true,
      conversions: data ?? [],
      total: count ?? 0,
    });
  } catch (err) {
    log.error({ err }, "listSuspiciousConversions error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 5. PATCH /api/admin/ambassador/conversions/:conversionId/flag — Flaguer
// =============================================================================

const flagConversion: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const conversionId = req.params.conversionId;
    const supabase = getAdminSupabase();
    const body = req.body as { is_suspicious: boolean; suspicious_reason?: string };

    const { data, error } = await supabase
      .from("post_conversions")
      .update({
        is_suspicious: body.is_suspicious,
        suspicious_reason: body.suspicious_reason ?? null,
      })
      .eq("id", conversionId)
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Conversion non trouvée" });

    log.info({ conversionId, is_suspicious: body.is_suspicious }, "Conversion flagged");

    res.json({ ok: true, conversion: data });
  } catch (err) {
    log.error({ err }, "flagConversion error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 6. POST /api/admin/ambassador/conversions/:conversionId/force-confirm
//    Confirmation admin (résolution de litige)
// =============================================================================

const forceConfirmConversion: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const conversionId = req.params.conversionId;
    const supabase = getAdminSupabase();

    // Récupérer la conversion
    const { data: conversion, error: fetchErr } = await supabase
      .from("post_conversions")
      .select("*")
      .eq("id", conversionId)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!conversion) return res.status(404).json({ error: "Conversion non trouvée" });

    if (conversion.status === "confirmed") {
      return res.json({ ok: true, conversion, reward_unlocked: false, message: "Déjà confirmée" });
    }

    // Force confirm
    const { data: updated, error: updateErr } = await supabase
      .from("post_conversions")
      .update({
        status: "confirmed",
        confirmed_by: "admin",
        confirmation_mode: "admin_force",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", conversionId)
      .select()
      .maybeSingle();

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Vérifier si la récompense doit être débloquée
    let rewardUnlocked = false;

    if (conversion.ambassador_id && conversion.program_id) {
      // Compter les conversions confirmées pour cet ambassadeur dans ce programme
      const { count: confirmedCount } = await supabase
        .from("post_conversions")
        .select("id", { count: "exact", head: true })
        .eq("ambassador_id", conversion.ambassador_id)
        .eq("program_id", conversion.program_id)
        .eq("status", "confirmed");

      // Récupérer le seuil du programme
      const { data: program } = await supabase
        .from("ambassador_programs")
        .select("conversions_required, reward_description, validity_days")
        .eq("id", conversion.program_id)
        .maybeSingle();

      if (
        program &&
        confirmedCount !== null &&
        confirmedCount >= program.conversions_required
      ) {
        // Vérifier qu'une récompense n'existe pas déjà pour ce cycle
        const { count: existingRewards } = await supabase
          .from("ambassador_rewards")
          .select("id", { count: "exact", head: true })
          .eq("ambassador_id", conversion.ambassador_id)
          .eq("program_id", conversion.program_id)
          .in("status", ["active", "claimed"]);

        if (existingRewards === 0) {
          // Créer la récompense
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + (program.validity_days ?? 30));

          await supabase.from("ambassador_rewards").insert({
            ambassador_id: conversion.ambassador_id,
            program_id: conversion.program_id,
            establishment_id: conversion.establishment_id,
            reward_description: program.reward_description,
            status: "active",
            expires_at: expiresAt.toISOString(),
          });

          rewardUnlocked = true;
        }
      }
    }

    log.info(
      { conversionId, rewardUnlocked },
      "Conversion force-confirmed by admin"
    );

    res.json({ ok: true, conversion: updated, reward_unlocked: rewardUnlocked });
  } catch (err) {
    log.error({ err }, "forceConfirmConversion error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerAmbassadorAdminRoutes(app: Router): void {
  app.get("/api/admin/ambassador/stats", getAdminStats);
  app.get(
    "/api/admin/ambassador/programs",
    zQuery(ListAdminProgramsQuery),
    listAdminPrograms
  );
  app.get(
    "/api/admin/ambassador/conversions",
    zQuery(ListAdminConversionsQuery),
    listAdminConversions
  );
  app.get(
    "/api/admin/ambassador/conversions/suspicious",
    listSuspiciousConversions
  );
  app.patch(
    "/api/admin/ambassador/conversions/:conversionId/flag",
    zParams(AmbassadorConversionIdParams),
    zBody(FlagConversionSchema),
    flagConversion
  );
  app.post(
    "/api/admin/ambassador/conversions/:conversionId/force-confirm",
    zParams(AmbassadorConversionIdParams),
    forceConfirmConversion
  );
}
