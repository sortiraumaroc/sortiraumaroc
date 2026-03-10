/**
 * Ambassador Program — Pro Routes
 *
 * 12 endpoints pro :
 * - Programme ambassadeur : config, stats, activate/deactivate
 * - Candidatures : liste, review (accept/reject)
 * - Conversions : liste, confirm/reject (with auto-reward unlock)
 * - Récompenses : liste, claim (consommation)
 * - Stats détaillées : top ambassadeurs, taux de conversion
 */

import type { Router, RequestHandler } from "express";
import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  loyaltyProActionRateLimiter,
  loyaltyReadRateLimiter,
  getClientIp,
} from "../middleware/rateLimiter";
import { isValidUUID, sanitizeText, sanitizePlain } from "../sanitizeV2";
import { auditProAction } from "../auditLogV2";
import { zBody, zParams, zQuery } from "../lib/validate";
import {
  AmbassadorProgramIdParams,
  AmbassadorApplicationIdParams,
  AmbassadorConversionIdParams,
  AmbassadorRewardIdParams,
  CreateAmbassadorProgramSchema,
  UpdateAmbassadorProgramSchema,
  ReviewApplicationSchema,
  ConfirmConversionSchema,
  ClaimAmbassadorRewardSchema,
  ListApplicationsQuery,
  ListConversionsQuery,
  ListRewardsQuery,
} from "../schemas/ambassadorProgram";
import { sendPushToConsumerUser } from "../pushNotifications";

const log = createModuleLogger("ambassadorPro");

// =============================================================================
// Auth helpers (same pattern as loyaltyV2Pro.ts)
// =============================================================================

type ProUser = { id: string; email?: string | null };

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

async function getProUser(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): Promise<ProUser | null> {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return null;
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return { id: data.user.id, email: data.user.email };
}

async function ensureEstablishmentMember(
  userId: string,
  establishmentId: string,
): Promise<boolean> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("pro_establishment_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  return !!data;
}

function getEstablishmentId(req: Parameters<RequestHandler>[0]): string {
  return (
    String(req.params.establishmentId ?? "") ||
    String(req.query.establishment_id ?? "") ||
    String(req.headers["x-establishment-id"] ?? "") ||
    String((req.body as Record<string, unknown>)?.establishment_id ?? "")
  ).trim();
}

async function getStaffName(userId: string): Promise<string | null> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("consumer_users")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? null;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get establishment name for push notification messages.
 */
async function getEstablishmentName(estId: string): Promise<string> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("establishments")
    .select("name")
    .eq("id", estId)
    .maybeSingle();
  return data?.name ?? "l'établissement";
}

/**
 * Generate a unique claim code in format SAM-XXXX-XX (uppercase alphanumeric).
 * Retries up to 5 times in case of collision.
 */
async function generateUniqueClaimCode(): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const supabase = getAdminSupabase();

  for (let attempt = 0; attempt < 5; attempt++) {
    let part1 = "";
    for (let i = 0; i < 4; i++) {
      part1 += chars[Math.floor(Math.random() * chars.length)];
    }
    let part2 = "";
    for (let i = 0; i < 2; i++) {
      part2 += chars[Math.floor(Math.random() * chars.length)];
    }
    const code = `SAM-${part1}-${part2}`;

    // Check uniqueness
    const { data: existing } = await supabase
      .from("ambassador_rewards")
      .select("id")
      .eq("claim_code", code)
      .maybeSingle();

    if (!existing) return code;
  }

  // Fallback: add timestamp suffix for guaranteed uniqueness
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  let part2 = "";
  const chars2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 2; i++) {
    part2 += chars2[Math.floor(Math.random() * chars2.length)];
  }
  return `SAM-${ts}-${part2}`;
}

// =============================================================================
// 1. GET /api/pro/ambassador — Get program + quick stats
// =============================================================================

const getAmbassadorProgram: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const supabase = getAdminSupabase();

    // Fetch active program
    const { data: program } = await supabase
      .from("ambassador_programs")
      .select("*")
      .eq("establishment_id", estId)
      .eq("is_active", true)
      .maybeSingle();

    if (!program) {
      return res.json({
        ok: true,
        program: null,
        stats: {
          total_ambassadors: 0,
          pending_applications: 0,
          conversions_this_month: 0,
          active_rewards: 0,
        },
      });
    }

    // Count accepted applications (total ambassadors)
    const { count: totalAmbassadors } = await supabase
      .from("ambassador_applications")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("status", "accepted");

    // Count pending applications
    const { count: pendingApplications } = await supabase
      .from("ambassador_applications")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("status", "pending");

    // Count conversions this month (confirmed)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: conversionsThisMonth } = await supabase
      .from("post_conversions")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("status", "confirmed")
      .gte("confirmed_at", startOfMonth.toISOString());

    // Count active rewards
    const { count: activeRewards } = await supabase
      .from("ambassador_rewards")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("status", "active");

    res.json({
      ok: true,
      program,
      stats: {
        total_ambassadors: totalAmbassadors ?? 0,
        pending_applications: pendingApplications ?? 0,
        conversions_this_month: conversionsThisMonth ?? 0,
        active_rewards: activeRewards ?? 0,
      },
    });
  } catch (err) {
    log.error({ err }, "getAmbassadorProgram error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 2. POST /api/pro/ambassador — Create program
// =============================================================================

const createAmbassadorProgram: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const supabase = getAdminSupabase();
    const body = req.body as Record<string, unknown>;

    // Check no active program exists for this establishment
    const { data: existing } = await supabase
      .from("ambassador_programs")
      .select("id")
      .eq("establishment_id", estId)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "Un programme ambassadeur actif existe déjà pour cet établissement" });
    }

    const rewardDescription = sanitizeText(String(body.reward_description ?? ""), 2000);
    const conversionsRequired = Number(body.conversions_required ?? 5);
    const validityDays = Number(body.validity_days ?? 30);
    const maxBeneficiariesPerMonth = body.max_beneficiaries_per_month != null
      ? Number(body.max_beneficiaries_per_month)
      : null;
    const confirmationMode = sanitizePlain(String(body.confirmation_mode ?? "manual"), 10);
    const expiresAt = body.expires_at ? String(body.expires_at) : null;

    const programData = {
      establishment_id: estId,
      reward_description: rewardDescription,
      conversions_required: conversionsRequired,
      validity_days: validityDays,
      max_beneficiaries_per_month: maxBeneficiariesPerMonth,
      confirmation_mode: confirmationMode,
      expires_at: expiresAt,
      is_active: true,
      created_by: user.id,
    };

    const { data, error } = await supabase
      .from("ambassador_programs")
      .insert(programData)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    void auditProAction("pro.ambassador.create_program" as any, {
      proUserId: user.id,
      targetType: "loyalty_program" as any,
      targetId: data.id,
      details: {
        establishment_id: estId,
        conversions_required: conversionsRequired,
        validity_days: validityDays,
      },
      ip: getClientIp(req),
    });

    res.json({ ok: true, program: data });
  } catch (err) {
    log.error({ err }, "createAmbassadorProgram error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 3. PUT /api/pro/ambassador/:programId — Update program
// =============================================================================

const updateAmbassadorProgram: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const programId = req.params.programId;
    if (!programId || !isValidUUID(programId)) {
      return res.status(400).json({ error: "Invalid programId" });
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (body.reward_description !== undefined) {
      updates.reward_description = sanitizeText(String(body.reward_description), 2000);
    }
    if (body.conversions_required !== undefined) {
      updates.conversions_required = Number(body.conversions_required);
    }
    if (body.validity_days !== undefined) {
      updates.validity_days = Number(body.validity_days);
    }
    if (body.max_beneficiaries_per_month !== undefined) {
      updates.max_beneficiaries_per_month = body.max_beneficiaries_per_month != null
        ? Number(body.max_beneficiaries_per_month)
        : null;
    }
    if (body.confirmation_mode !== undefined) {
      updates.confirmation_mode = sanitizePlain(String(body.confirmation_mode), 10);
    }
    if (body.is_active !== undefined) {
      updates.is_active = body.is_active === true;
    }
    if (body.expires_at !== undefined) {
      updates.expires_at = body.expires_at ? String(body.expires_at) : null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.updated_at = new Date().toISOString();

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("ambassador_programs")
      .update(updates)
      .eq("id", programId)
      .eq("establishment_id", estId)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Program not found" });

    void auditProAction("pro.ambassador.update_program" as any, {
      proUserId: user.id,
      targetType: "loyalty_program" as any,
      targetId: programId,
      details: { establishment_id: estId, updated_fields: Object.keys(updates) },
      ip: getClientIp(req),
    });

    res.json({ ok: true, program: data });
  } catch (err) {
    log.error({ err }, "updateAmbassadorProgram error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 4. POST /api/pro/ambassador/:programId/activate — Activate program
// =============================================================================

const activateAmbassadorProgram: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const programId = req.params.programId;
    if (!programId || !isValidUUID(programId)) {
      return res.status(400).json({ error: "Invalid programId" });
    }

    const supabase = getAdminSupabase();

    // Check no other active program
    const { data: existingActive } = await supabase
      .from("ambassador_programs")
      .select("id")
      .eq("establishment_id", estId)
      .eq("is_active", true)
      .neq("id", programId)
      .maybeSingle();

    if (existingActive) {
      return res.status(409).json({ error: "Un autre programme ambassadeur est déjà actif" });
    }

    const { data, error } = await supabase
      .from("ambassador_programs")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", programId)
      .eq("establishment_id", estId)
      .select("id")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Program not found" });

    void auditProAction("pro.ambassador.activate_program" as any, {
      proUserId: user.id,
      targetType: "loyalty_program" as any,
      targetId: programId,
      details: { establishment_id: estId },
      ip: getClientIp(req),
    });

    res.json({ ok: true, message: "Programme ambassadeur activé" });
  } catch (err) {
    log.error({ err }, "activateAmbassadorProgram error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 5. POST /api/pro/ambassador/:programId/deactivate — Deactivate program
// =============================================================================

const deactivateAmbassadorProgram: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const programId = req.params.programId;
    if (!programId || !isValidUUID(programId)) {
      return res.status(400).json({ error: "Invalid programId" });
    }

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("ambassador_programs")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", programId)
      .eq("establishment_id", estId)
      .select("id")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Program not found" });

    void auditProAction("pro.ambassador.deactivate_program" as any, {
      proUserId: user.id,
      targetType: "loyalty_program" as any,
      targetId: programId,
      details: { establishment_id: estId },
      ip: getClientIp(req),
    });

    res.json({ ok: true, message: "Programme ambassadeur désactivé" });
  } catch (err) {
    log.error({ err }, "deactivateAmbassadorProgram error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 6. GET /api/pro/ambassador/applications — List applications
// =============================================================================

const listAmbassadorApplications: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const supabase = getAdminSupabase();
    const query = req.query as Record<string, unknown>;
    const status = query.status ? String(query.status) : undefined;
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(Math.max(1, Number(query.limit ?? 20)), 100);
    const offset = (page - 1) * limit;

    // Get the program for this establishment
    const { data: program } = await supabase
      .from("ambassador_programs")
      .select("id")
      .eq("establishment_id", estId)
      .eq("is_active", true)
      .maybeSingle();

    if (!program) {
      return res.json({ ok: true, applications: [], total: 0, page, limit });
    }

    // Build query
    let appQuery = supabase
      .from("ambassador_applications")
      .select("*", { count: "exact" })
      .eq("program_id", program.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      appQuery = appQuery.eq("status", status);
    }

    const { data: applications, count, error } = await appQuery;

    if (error) return res.status(500).json({ error: error.message });

    // Fetch user names for the applications
    const userIds = [...new Set((applications ?? []).map((a: any) => a.user_id).filter(Boolean))];
    const userMap = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("consumer_users")
        .select("id, full_name")
        .in("id", userIds);

      for (const u of users ?? []) {
        userMap.set(u.id, u.full_name ?? "Utilisateur");
      }
    }

    // Enrich applications with user names
    const enrichedApplications = (applications ?? []).map((app: any) => ({
      ...app,
      user_full_name: userMap.get(app.user_id) ?? "Utilisateur",
    }));

    res.json({
      ok: true,
      applications: enrichedApplications,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    log.error({ err }, "listAmbassadorApplications error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 7. PATCH /api/pro/ambassador/applications/:applicationId — Review application
// =============================================================================

const reviewAmbassadorApplication: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const applicationId = req.params.applicationId;
    if (!applicationId || !isValidUUID(applicationId)) {
      return res.status(400).json({ error: "Invalid applicationId" });
    }

    const body = req.body as Record<string, unknown>;
    const newStatus = String(body.status ?? "");
    const rejectionReason = body.rejection_reason
      ? sanitizeText(String(body.rejection_reason), 1000)
      : null;

    if (!["accepted", "rejected"].includes(newStatus)) {
      return res.status(400).json({ error: "status must be 'accepted' or 'rejected'" });
    }

    const supabase = getAdminSupabase();

    // Verify the application belongs to this establishment's program
    const { data: application } = await supabase
      .from("ambassador_applications")
      .select("*, program:ambassador_programs(id, establishment_id)")
      .eq("id", applicationId)
      .maybeSingle();

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    const appProgram = application.program as any;
    if (!appProgram || appProgram.establishment_id !== estId) {
      return res.status(403).json({ error: "Application does not belong to this establishment" });
    }

    // Update the application
    const updateData: Record<string, unknown> = {
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    };
    if (newStatus === "rejected" && rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    }

    const { data: updated, error } = await supabase
      .from("ambassador_applications")
      .update(updateData)
      .eq("id", applicationId)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Push notification to the user
    const establishmentName = await getEstablishmentName(estId);

    if (newStatus === "accepted") {
      void sendPushToConsumerUser({
        userId: application.user_id,
        title: "Candidature acceptée",
        body: `Votre candidature ambassadeur chez ${establishmentName} a été acceptée !`,
        data: {},
      });
    } else {
      void sendPushToConsumerUser({
        userId: application.user_id,
        title: "Candidature refusée",
        body: `Votre candidature ambassadeur chez ${establishmentName} a été refusée.`,
        data: {},
      });
    }

    void auditProAction("pro.ambassador.review_application" as any, {
      proUserId: user.id,
      targetType: "user" as any,
      targetId: application.user_id,
      details: {
        application_id: applicationId,
        establishment_id: estId,
        status: newStatus,
      },
      ip: getClientIp(req),
    });

    res.json({ ok: true, application: updated });
  } catch (err) {
    log.error({ err }, "reviewAmbassadorApplication error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 8. GET /api/pro/ambassador/conversions — List conversions
// =============================================================================

const listAmbassadorConversions: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const supabase = getAdminSupabase();
    const query = req.query as Record<string, unknown>;
    const status = query.status ? String(query.status) : undefined;
    const ambassadorId = query.ambassador_id ? String(query.ambassador_id) : undefined;
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(Math.max(1, Number(query.limit ?? 20)), 100);
    const offset = (page - 1) * limit;

    // Get program for this establishment
    const { data: program } = await supabase
      .from("ambassador_programs")
      .select("id")
      .eq("establishment_id", estId)
      .eq("is_active", true)
      .maybeSingle();

    if (!program) {
      return res.json({ ok: true, conversions: [], total: 0, page, limit });
    }

    // Build query
    let convQuery = supabase
      .from("post_conversions")
      .select("*", { count: "exact" })
      .eq("program_id", program.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      convQuery = convQuery.eq("status", status);
    }
    if (ambassadorId && isValidUUID(ambassadorId)) {
      convQuery = convQuery.eq("ambassador_id", ambassadorId);
    }

    const { data: conversions, count, error } = await convQuery;

    if (error) return res.status(500).json({ error: error.message });

    // Fetch user names for ambassadors and visitors
    const allUserIds = new Set<string>();
    for (const c of conversions ?? []) {
      const conv = c as any;
      if (conv.ambassador_id) allUserIds.add(conv.ambassador_id);
      if (conv.visitor_id) allUserIds.add(conv.visitor_id);
    }

    const userMap = new Map<string, string>();
    const userIdArray = [...allUserIds];

    if (userIdArray.length > 0) {
      const { data: users } = await supabase
        .from("consumer_users")
        .select("id, full_name")
        .in("id", userIdArray);

      for (const u of users ?? []) {
        userMap.set(u.id, u.full_name ?? "Utilisateur");
      }
    }

    // Enrich conversions with names
    const enrichedConversions = (conversions ?? []).map((c: any) => ({
      ...c,
      ambassador_name: userMap.get(c.ambassador_id) ?? "Utilisateur",
      visitor_name: userMap.get(c.visitor_id) ?? "Utilisateur",
    }));

    res.json({
      ok: true,
      conversions: enrichedConversions,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    log.error({ err }, "listAmbassadorConversions error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 9. PATCH /api/pro/ambassador/conversions/:conversionId — Confirm/reject
// =============================================================================

const confirmAmbassadorConversion: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const conversionId = req.params.conversionId;
    if (!conversionId || !isValidUUID(conversionId)) {
      return res.status(400).json({ error: "Invalid conversionId" });
    }

    const body = req.body as Record<string, unknown>;
    const newStatus = String(body.status ?? "");
    const confirmationMode = body.confirmation_mode
      ? sanitizePlain(String(body.confirmation_mode), 10)
      : "manual";

    if (!["confirmed", "rejected"].includes(newStatus)) {
      return res.status(400).json({ error: "status must be 'confirmed' or 'rejected'" });
    }

    const supabase = getAdminSupabase();

    // Verify the conversion belongs to this establishment
    const { data: conversion } = await supabase
      .from("post_conversions")
      .select("*, program:ambassador_programs(id, establishment_id, conversions_required, validity_days, max_beneficiaries_per_month, reward_description)")
      .eq("id", conversionId)
      .maybeSingle();

    if (!conversion) {
      return res.status(404).json({ error: "Conversion not found" });
    }

    const convProgram = conversion.program as any;
    if (!convProgram || convProgram.establishment_id !== estId) {
      return res.status(403).json({ error: "Conversion does not belong to this establishment" });
    }

    // Update conversion
    const updateData: Record<string, unknown> = {
      status: newStatus,
    };

    if (newStatus === "confirmed") {
      updateData.confirmed_at = new Date().toISOString();
      updateData.confirmed_by = user.id;
      updateData.confirmation_mode = confirmationMode;
    }

    const { data: updatedConversion, error } = await supabase
      .from("post_conversions")
      .update(updateData)
      .eq("id", conversionId)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    let rewardUnlocked = false;
    const establishmentName = await getEstablishmentName(estId);

    if (newStatus === "confirmed") {
      const ambassadorId = (conversion as any).ambassador_id;
      const programId = convProgram.id;
      const conversionsRequired = convProgram.conversions_required;

      // Count total confirmed conversions for this ambassador in this program
      const { count: confirmedCount } = await supabase
        .from("post_conversions")
        .select("id", { count: "exact", head: true })
        .eq("ambassador_id", ambassadorId)
        .eq("program_id", programId)
        .eq("status", "confirmed");

      const totalConfirmed = confirmedCount ?? 0;

      if (totalConfirmed >= conversionsRequired) {
        // Check max_beneficiaries_per_month limit
        let canCreateReward = true;

        if (convProgram.max_beneficiaries_per_month != null) {
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          const { count: rewardsThisMonth } = await supabase
            .from("ambassador_rewards")
            .select("id", { count: "exact", head: true })
            .eq("program_id", programId)
            .gte("created_at", startOfMonth.toISOString());

          if ((rewardsThisMonth ?? 0) >= convProgram.max_beneficiaries_per_month) {
            canCreateReward = false;
            log.info(
              { ambassadorId, programId, rewardsThisMonth, max: convProgram.max_beneficiaries_per_month },
              "Max beneficiaries per month reached — reward not created"
            );
          }
        }

        if (canCreateReward) {
          // Generate unique claim code
          const claimCode = await generateUniqueClaimCode();

          // Calculate expiration
          const validityDays = convProgram.validity_days ?? 30;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + validityDays);

          // Insert reward
          const { error: rewardError } = await supabase
            .from("ambassador_rewards")
            .insert({
              program_id: programId,
              ambassador_id: ambassadorId,
              establishment_id: estId,
              status: "active",
              claim_code: claimCode,
              reward_description: convProgram.reward_description,
              expires_at: expiresAt.toISOString(),
            });

          if (rewardError) {
            log.error({ err: rewardError }, "Failed to create ambassador reward");
          } else {
            rewardUnlocked = true;

            // Push notification: reward unlocked
            void sendPushToConsumerUser({
              userId: ambassadorId,
              title: "Récompense débloquée !",
              body: `Vous avez atteint ${totalConfirmed} conversions chez ${establishmentName}`,
              data: {},
            });
          }
        }
      } else {
        // Push notification: conversion confirmed, progress update
        void sendPushToConsumerUser({
          userId: ambassadorId,
          title: "Conversion confirmée",
          body: `+1 conversion confirmée chez ${establishmentName} (${totalConfirmed}/${conversionsRequired})`,
          data: {},
        });
      }
    }

    void auditProAction("pro.ambassador.confirm_conversion" as any, {
      proUserId: user.id,
      targetType: "user" as any,
      targetId: (conversion as any).ambassador_id,
      details: {
        conversion_id: conversionId,
        establishment_id: estId,
        status: newStatus,
        reward_unlocked: rewardUnlocked,
      },
      ip: getClientIp(req),
    });

    res.json({ ok: true, conversion: updatedConversion, reward_unlocked: rewardUnlocked });
  } catch (err) {
    log.error({ err }, "confirmAmbassadorConversion error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 10. GET /api/pro/ambassador/rewards — List rewards
// =============================================================================

const listAmbassadorRewards: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const supabase = getAdminSupabase();
    const query = req.query as Record<string, unknown>;
    const status = query.status ? String(query.status) : undefined;
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(Math.max(1, Number(query.limit ?? 20)), 100);
    const offset = (page - 1) * limit;

    // Get program for this establishment
    const { data: program } = await supabase
      .from("ambassador_programs")
      .select("id")
      .eq("establishment_id", estId)
      .eq("is_active", true)
      .maybeSingle();

    if (!program) {
      return res.json({ ok: true, rewards: [], total: 0, page, limit });
    }

    // Build query
    let rewardQuery = supabase
      .from("ambassador_rewards")
      .select("*", { count: "exact" })
      .eq("program_id", program.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      rewardQuery = rewardQuery.eq("status", status);
    }

    const { data: rewards, count, error } = await rewardQuery;

    if (error) return res.status(500).json({ error: error.message });

    // Fetch ambassador names
    const ambassadorIds = [...new Set((rewards ?? []).map((r: any) => r.ambassador_id).filter(Boolean))];
    const userMap = new Map<string, string>();

    if (ambassadorIds.length > 0) {
      const { data: users } = await supabase
        .from("consumer_users")
        .select("id, full_name")
        .in("id", ambassadorIds);

      for (const u of users ?? []) {
        userMap.set(u.id, u.full_name ?? "Utilisateur");
      }
    }

    // Enrich rewards with ambassador names
    const enrichedRewards = (rewards ?? []).map((r: any) => ({
      ...r,
      ambassador_name: userMap.get(r.ambassador_id) ?? "Utilisateur",
    }));

    res.json({
      ok: true,
      rewards: enrichedRewards,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    log.error({ err }, "listAmbassadorRewards error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 11. POST /api/pro/ambassador/rewards/:rewardId/claim — Claim reward (mark used)
// =============================================================================

const claimAmbassadorReward: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const rewardId = req.params.rewardId;
    if (!rewardId || !isValidUUID(rewardId)) {
      return res.status(400).json({ error: "Invalid rewardId" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const qrRewardToken = body.qr_reward_token ? String(body.qr_reward_token).trim() : null;
    const claimCode = body.claim_code ? sanitizePlain(String(body.claim_code), 20) : null;

    const supabase = getAdminSupabase();

    // Find the reward — by ID, qr_reward_token, or claim_code
    let reward: any = null;

    if (qrRewardToken && isValidUUID(qrRewardToken)) {
      const { data } = await supabase
        .from("ambassador_rewards")
        .select("*")
        .eq("qr_reward_token", qrRewardToken)
        .eq("establishment_id", estId)
        .maybeSingle();
      reward = data;
    } else if (claimCode) {
      const { data } = await supabase
        .from("ambassador_rewards")
        .select("*")
        .eq("claim_code", claimCode.toUpperCase())
        .eq("establishment_id", estId)
        .maybeSingle();
      reward = data;
    } else {
      const { data } = await supabase
        .from("ambassador_rewards")
        .select("*")
        .eq("id", rewardId)
        .eq("establishment_id", estId)
        .maybeSingle();
      reward = data;
    }

    if (!reward) {
      return res.status(404).json({ error: "Récompense non trouvée" });
    }

    // Verify status is active
    if (reward.status !== "active") {
      return res.status(400).json({ error: `Récompense déjà ${reward.status === "claimed" ? "consommée" : "expirée"}` });
    }

    // Check expiration
    if (reward.expires_at && new Date(reward.expires_at) < new Date()) {
      // Auto-expire the reward
      await supabase
        .from("ambassador_rewards")
        .update({ status: "expired" })
        .eq("id", reward.id);

      return res.status(400).json({ error: "Récompense expirée" });
    }

    // Mark as claimed
    const { data: updatedReward, error } = await supabase
      .from("ambassador_rewards")
      .update({
        status: "claimed",
        claimed_at: new Date().toISOString(),
        claim_confirmed_by: user.id,
      })
      .eq("id", reward.id)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    void auditProAction("pro.ambassador.claim_reward" as any, {
      proUserId: user.id,
      targetType: "user" as any,
      targetId: reward.ambassador_id,
      details: {
        reward_id: reward.id,
        establishment_id: estId,
        claim_code: reward.claim_code,
      },
      ip: getClientIp(req),
    });

    res.json({
      ok: true,
      reward: updatedReward,
      message: "Récompense consommée avec succès",
    });
  } catch (err) {
    log.error({ err }, "claimAmbassadorReward error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 12. GET /api/pro/ambassador/stats — Detailed stats
// =============================================================================

const getAmbassadorStats: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const supabase = getAdminSupabase();

    // Get the program for this establishment
    const { data: program } = await supabase
      .from("ambassador_programs")
      .select("id")
      .eq("establishment_id", estId)
      .eq("is_active", true)
      .maybeSingle();

    if (!program) {
      return res.json({
        ok: true,
        stats: {
          total_ambassadors: 0,
          total_conversions: 0,
          conversion_rate: 0,
          rewards_distributed: 0,
          rewards_claimed: 0,
          top_ambassadors: [],
        },
      });
    }

    // Total ambassadors (accepted applications)
    const { count: totalAmbassadors } = await supabase
      .from("ambassador_applications")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("status", "accepted");

    // Total confirmed conversions
    const { count: totalConfirmed } = await supabase
      .from("post_conversions")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("status", "confirmed");

    // Total rejected conversions
    const { count: totalRejected } = await supabase
      .from("post_conversions")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("status", "rejected");

    // Total expired conversions
    const { count: totalExpired } = await supabase
      .from("post_conversions")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("status", "expired");

    const confirmed = totalConfirmed ?? 0;
    const rejected = totalRejected ?? 0;
    const expired = totalExpired ?? 0;
    const totalDecided = confirmed + rejected + expired;
    const conversionRate = totalDecided > 0 ? confirmed / totalDecided : 0;

    // Total rewards distributed
    const { count: rewardsDistributed } = await supabase
      .from("ambassador_rewards")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id);

    // Total rewards claimed
    const { count: rewardsClaimed } = await supabase
      .from("ambassador_rewards")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("status", "claimed");

    // Top 5 ambassadors by confirmed conversion count
    const { data: allConversions } = await supabase
      .from("post_conversions")
      .select("ambassador_id")
      .eq("program_id", program.id)
      .eq("status", "confirmed");

    // Group conversions by ambassador_id and count
    const ambassadorCounts = new Map<string, number>();
    for (const c of allConversions ?? []) {
      const ambId = (c as any).ambassador_id;
      if (ambId) {
        ambassadorCounts.set(ambId, (ambassadorCounts.get(ambId) ?? 0) + 1);
      }
    }

    // Sort and take top 5
    const topAmbassadorEntries = [...ambassadorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Fetch names for top ambassadors
    const topAmbassadorIds = topAmbassadorEntries.map(([id]) => id);
    const topUserMap = new Map<string, string>();

    if (topAmbassadorIds.length > 0) {
      const { data: users } = await supabase
        .from("consumer_users")
        .select("id, full_name")
        .in("id", topAmbassadorIds);

      for (const u of users ?? []) {
        topUserMap.set(u.id, u.full_name ?? "Utilisateur");
      }
    }

    const topAmbassadors = topAmbassadorEntries.map(([id, count]) => ({
      ambassador_id: id,
      full_name: topUserMap.get(id) ?? "Utilisateur",
      confirmed_conversions: count,
    }));

    res.json({
      ok: true,
      stats: {
        total_ambassadors: totalAmbassadors ?? 0,
        total_conversions: confirmed,
        conversion_rate: Math.round(conversionRate * 10000) / 10000,
        rewards_distributed: rewardsDistributed ?? 0,
        rewards_claimed: rewardsClaimed ?? 0,
        top_ambassadors: topAmbassadors,
      },
    });
  } catch (err) {
    log.error({ err }, "getAmbassadorStats error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerAmbassadorProRoutes(app: Router): void {
  // Program CRUD
  app.get("/api/pro/ambassador", loyaltyReadRateLimiter, getAmbassadorProgram);
  app.post("/api/pro/ambassador", zBody(CreateAmbassadorProgramSchema), loyaltyProActionRateLimiter, createAmbassadorProgram);
  app.put("/api/pro/ambassador/:programId", zParams(AmbassadorProgramIdParams), zBody(UpdateAmbassadorProgramSchema), loyaltyProActionRateLimiter, updateAmbassadorProgram);
  app.post("/api/pro/ambassador/:programId/activate", zParams(AmbassadorProgramIdParams), loyaltyProActionRateLimiter, activateAmbassadorProgram);
  app.post("/api/pro/ambassador/:programId/deactivate", zParams(AmbassadorProgramIdParams), loyaltyProActionRateLimiter, deactivateAmbassadorProgram);

  // Applications
  app.get("/api/pro/ambassador/applications", zQuery(ListApplicationsQuery), loyaltyReadRateLimiter, listAmbassadorApplications);
  app.patch("/api/pro/ambassador/applications/:applicationId", zParams(AmbassadorApplicationIdParams), zBody(ReviewApplicationSchema), loyaltyProActionRateLimiter, reviewAmbassadorApplication);

  // Conversions
  app.get("/api/pro/ambassador/conversions", zQuery(ListConversionsQuery), loyaltyReadRateLimiter, listAmbassadorConversions);
  app.patch("/api/pro/ambassador/conversions/:conversionId", zParams(AmbassadorConversionIdParams), zBody(ConfirmConversionSchema), loyaltyProActionRateLimiter, confirmAmbassadorConversion);

  // Rewards
  app.get("/api/pro/ambassador/rewards", zQuery(ListRewardsQuery), loyaltyReadRateLimiter, listAmbassadorRewards);
  app.post("/api/pro/ambassador/rewards/:rewardId/claim", zParams(AmbassadorRewardIdParams), loyaltyProActionRateLimiter, claimAmbassadorReward);

  // Stats
  app.get("/api/pro/ambassador/stats", loyaltyReadRateLimiter, getAmbassadorStats);
}
