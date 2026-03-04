/**
 * Routes API pour le système de parrainage
 *
 * Endpoints:
 * - Public: Validation de code, inscription avec parrainage
 * - Parrain: Dashboard, filleuls, commissions, retraits
 * - Admin: Gestion des parrains, configuration, payouts
 */

import type { RequestHandler } from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { createRateLimiter } from "../middleware/rateLimiter";
import { zBody, zQuery, zParams } from "../lib/validate";
import {
  trackReferralLinkSchema,
  applyReferralSchema,
  updateReferralProfileSchema,
  updateReferralPartnerSchema,
  updateReferralConfigSchema,
  updateReferralUniverseConfigSchema,
  createReferralPayoutSchema,
  updateReferralPayoutSchema,
  ListMyReferreesQuery,
  ListMyCommissionsQuery,
  ListMyPayoutsQuery,
  ListReferralPartnersQuery,
  ListAllCommissionsQuery,
  ReferralCodeParams,
  ReferralPartnerIdParams,
  ReferralPayoutIdParams,
  ReferralUniverseParams,
} from "../schemas/referral";

const log = createModuleLogger("referral");

// =============================================================================
// HELPERS
// =============================================================================

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

type UserResult =
  | { ok: true; user: { id: string; email?: string | null } }
  | { ok: false; status: number; error: string };

async function getUserFromBearerToken(token: string): Promise<UserResult> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }

  return {
    ok: true,
    user: { id: data.user.id, email: data.user.email ?? null },
  };
}

async function getConsumerUserFromBearerToken(token: string): Promise<UserResult> {
  const supabase = getAdminSupabase();

  // D'abord vérifier le token Firebase/Supabase
  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (!authError && authData.user) {
    // Token Supabase valide - chercher le consumer_user lié
    const { data: consumer } = await supabase
      .from("consumer_users")
      .select("id, email")
      .eq("firebase_uid", authData.user.id)
      .maybeSingle();

    if (consumer) {
      return { ok: true, user: { id: consumer.id, email: consumer.email } };
    }
  }

  // Essayer comme ID consumer direct (pour les anciens tokens)
  const { data: directConsumer } = await supabase
    .from("consumer_users")
    .select("id, email")
    .eq("id", token)
    .maybeSingle();

  if (directConsumer) {
    return { ok: true, user: { id: directConsumer.id, email: directConsumer.email } };
  }

  return { ok: false, status: 401, error: "Invalid or expired token" };
}

// =============================================================================
// PUBLIC ENDPOINTS
// =============================================================================

/**
 * Valider un code de parrainage
 * GET /api/public/referral/validate/:code
 */
export const validateReferralCode: RequestHandler = async (req, res) => {
  const code = typeof req.params.code === "string" ? req.params.code.trim() : "";

  if (!code) {
    return res.status(400).json({ error: "Code de parrainage requis" });
  }

  if (!/^[A-Za-z0-9_-]{3,20}$/.test(code)) {
    return res.status(400).json({
      valid: false,
      error: "Format de code invalide",
    });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase.rpc("validate_referral_code", {
    p_code: code,
  });

  if (error) {
    log.error({ err: error }, "validate_referral_code failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }

  const result = Array.isArray(data) ? data[0] : data;

  if (!result) {
    return res.json({
      valid: false,
      error: "Code de parrainage invalide",
    });
  }

  return res.json({
    valid: result.is_valid === true,
    partner_id: result.is_valid ? result.partner_id : undefined,
    partner_name: result.is_valid ? result.partner_display_name : undefined,
    error: result.error_message || undefined,
  });
};

/**
 * Créer le lien parrain-filleul lors de l'inscription
 * POST /api/public/referral/link
 * Body: { referral_code: string, referree_user_id: string, source?: string, source_url?: string }
 *
 * NOTE: Appelé après création du consumer_user avec le code de parrainage
 */
export const createReferralLink: RequestHandler = async (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  const referralCode = asString(body.referral_code);
  const referreeUserId = asString(body.referree_user_id);
  const source = asString(body.source) || "registration";
  const sourceUrl = asString(body.source_url);

  if (!referralCode) {
    return res.status(400).json({ error: "Code de parrainage requis" });
  }

  if (!referreeUserId) {
    return res.status(400).json({ error: "ID utilisateur requis" });
  }

  const supabase = getAdminSupabase();

  // 1. Valider le code
  const { data: validation, error: validationError } = await supabase.rpc(
    "validate_referral_code",
    { p_code: referralCode }
  );

  if (validationError) {
    log.error({ err: validationError }, "validate referral code failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }

  const validResult = Array.isArray(validation) ? validation[0] : validation;

  if (!validResult?.is_valid) {
    return res.status(400).json({
      error: validResult?.error_message || "Code de parrainage invalide",
    });
  }

  // 2. Vérifier que le filleul n'a pas déjà un parrain
  const { data: existingLink } = await supabase
    .from("referral_links")
    .select("id")
    .eq("referree_user_id", referreeUserId)
    .maybeSingle();

  if (existingLink) {
    return res.status(409).json({ error: "Cet utilisateur a déjà un parrain" });
  }

  // 3. Vérifier que le parrain ne se parraine pas lui-même
  const { data: partner } = await supabase
    .from("referral_partners")
    .select("user_id")
    .eq("id", validResult.partner_id)
    .single();

  if (partner?.user_id === referreeUserId) {
    return res.status(400).json({ error: "Vous ne pouvez pas vous parrainer vous-même" });
  }

  // 4. Créer le lien
  const { data: link, error: linkError } = await supabase
    .from("referral_links")
    .insert({
      partner_id: validResult.partner_id,
      referree_user_id: referreeUserId,
      referral_code_used: referralCode.toUpperCase(),
      source,
      source_url: sourceUrl,
    })
    .select()
    .single();

  if (linkError) {
    log.error({ err: linkError }, "create referral link failed");
    if (linkError.code === "23505") {
      return res.status(409).json({ error: "Cet utilisateur a déjà un parrain" });
    }
    return res.status(500).json({ error: "Erreur lors de la création du lien" });
  }

  return res.status(201).json({
    ok: true,
    link_id: link.id,
    partner_name: validResult.partner_display_name,
  });
};

// =============================================================================
// REFERRAL PARTNER ENDPOINTS (Espace Parrain)
// =============================================================================

/**
 * Demander un compte parrain
 * POST /api/referral/apply
 */
export const applyAsReferralPartner: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const userResult = await getConsumerUserFromBearerToken(token);
  if ('error' in userResult) {
    return res.status(userResult.status).json({ error: userResult.error });
  }

  const body = isRecord(req.body) ? req.body : {};
  const requestedCode = asString(body.referral_code);
  const partnerType = asString(body.partner_type) || "individual";
  const displayName = asString(body.display_name);
  const bio = asString(body.bio);
  const bankName = asString(body.bank_name);
  const bankAccountHolder = asString(body.bank_account_holder);
  const bankRib = asString(body.bank_rib);

  const supabase = getAdminSupabase();

  // 1. Vérifier si l'utilisateur a déjà un compte parrain
  const { data: existing } = await supabase
    .from("referral_partners")
    .select("id, status")
    .eq("user_id", userResult.user.id)
    .maybeSingle();

  if (existing) {
    if (existing.status === "rejected") {
      return res.status(400).json({
        error: "Votre demande précédente a été refusée. Contactez le support.",
      });
    }
    return res.status(409).json({
      error: "Vous avez déjà un compte parrain",
      status: existing.status,
    });
  }

  // 2. Générer ou valider le code
  let finalCode: string;

  if (requestedCode) {
    // Valider le format
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(requestedCode)) {
      return res.status(400).json({
        error: "Le code doit contenir 3-20 caractères alphanumériques",
      });
    }

    // Vérifier l'unicité
    const { data: codeExists } = await supabase
      .from("referral_partners")
      .select("id")
      .ilike("referral_code", requestedCode)
      .maybeSingle();

    if (codeExists) {
      return res.status(409).json({ error: "Ce code est déjà utilisé" });
    }

    finalCode = requestedCode.toUpperCase();
  } else {
    // Générer un code unique
    const { data: generated, error: genError } = await supabase.rpc(
      "generate_unique_referral_code",
      { p_base: displayName || null }
    );

    if (genError || !generated) {
      log.error({ err: genError }, "generate unique referral code failed");
      return res.status(500).json({ error: "Erreur lors de la génération du code" });
    }

    finalCode = generated;
  }

  // 3. Créer la demande
  const { data: partner, error: createError } = await supabase
    .from("referral_partners")
    .insert({
      user_id: userResult.user.id,
      referral_code: finalCode,
      status: "pending",
      partner_type: partnerType,
      display_name: displayName,
      bio,
      bank_name: bankName,
      bank_account_holder: bankAccountHolder,
      bank_rib: bankRib,
    })
    .select()
    .single();

  if (createError) {
    log.error({ err: createError }, "create referral partner failed");
    return res.status(500).json({ error: "Erreur lors de la création de la demande" });
  }

  // TODO: Notifier les admins de la nouvelle demande

  return res.status(201).json({
    ok: true,
    partner_id: partner.id,
    referral_code: partner.referral_code,
    status: partner.status,
    message: "Votre demande a été soumise et est en attente de validation",
  });
};

/**
 * Obtenir mon profil parrain
 * GET /api/referral/me
 */
export const getReferralPartnerMe: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const userResult = await getConsumerUserFromBearerToken(token);
  if ('error' in userResult) {
    return res.status(userResult.status).json({ error: userResult.error });
  }

  const supabase = getAdminSupabase();

  const { data: partner, error } = await supabase
    .from("referral_partners")
    .select("*")
    .eq("user_id", userResult.user.id)
    .maybeSingle();

  if (error) {
    log.error({ err: error }, "get referral partner profile failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }

  if (!partner) {
    return res.status(404).json({ error: "Vous n'avez pas de compte parrain" });
  }

  // Récupérer les stats
  const { data: stats } = await supabase.rpc("get_referral_partner_stats", {
    p_partner_id: partner.id,
  });

  const statsResult = Array.isArray(stats) ? stats[0] : stats;

  return res.json({
    partner,
    stats: statsResult || {
      total_referrees: 0,
      total_commissions: 0,
      total_earned_cents: 0,
      pending_cents: 0,
      validated_cents: 0,
      paid_cents: 0,
      this_month_earned_cents: 0,
      this_month_referrees: 0,
    },
  });
};

/**
 * Mettre à jour mon profil parrain
 * PATCH /api/referral/me
 */
export const updateReferralPartnerMe: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const userResult = await getConsumerUserFromBearerToken(token);
  if ('error' in userResult) {
    return res.status(userResult.status).json({ error: userResult.error });
  }

  const supabase = getAdminSupabase();

  // Vérifier que le parrain existe
  const { data: existing } = await supabase
    .from("referral_partners")
    .select("id, status")
    .eq("user_id", userResult.user.id)
    .maybeSingle();

  if (!existing) {
    return res.status(404).json({ error: "Vous n'avez pas de compte parrain" });
  }

  const body = isRecord(req.body) ? req.body : {};
  const updates: Record<string, unknown> = {};

  if (body.display_name !== undefined) {
    updates.display_name = asString(body.display_name) || null;
  }
  if (body.bio !== undefined) {
    updates.bio = asString(body.bio) || null;
  }
  if (body.bank_name !== undefined) {
    updates.bank_name = asString(body.bank_name) || null;
  }
  if (body.bank_account_holder !== undefined) {
    updates.bank_account_holder = asString(body.bank_account_holder) || null;
  }
  if (body.bank_rib !== undefined) {
    updates.bank_rib = asString(body.bank_rib) || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Aucune modification fournie" });
  }

  const { data: partner, error } = await supabase
    .from("referral_partners")
    .update(updates)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    log.error({ err: error }, "update referral partner profile failed");
    return res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }

  return res.json({ ok: true, partner });
};

/**
 * Lister mes filleuls
 * GET /api/referral/me/referrees
 */
export const listMyReferrees: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const userResult = await getConsumerUserFromBearerToken(token);
  if ('error' in userResult) {
    return res.status(userResult.status).json({ error: userResult.error });
  }

  const supabase = getAdminSupabase();

  // Récupérer le partner_id
  const { data: partner } = await supabase
    .from("referral_partners")
    .select("id, status")
    .eq("user_id", userResult.user.id)
    .maybeSingle();

  if (!partner) {
    return res.status(404).json({ error: "Vous n'avez pas de compte parrain" });
  }

  // Pagination
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
  const offset = (page - 1) * limit;

  // Récupérer les filleuls avec leurs infos
  const { data: links, error, count } = await supabase
    .from("referral_links")
    .select(
      `
      id,
      referree_user_id,
      referral_code_used,
      source,
      created_at
    `,
      { count: "exact" }
    )
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    log.error({ err: error }, "list referrees failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }

  // Enrichir avec les infos des consumers
  const referreeIds = (links || []).map((l) => l.referree_user_id);

  let consumers: Record<string, { full_name: string | null; email: string | null }> = {};

  if (referreeIds.length > 0) {
    const { data: consumerData } = await supabase
      .from("consumer_users")
      .select("id, full_name, email")
      .in("id", referreeIds);

    if (consumerData) {
      consumers = Object.fromEntries(
        consumerData.map((c) => [c.id, { full_name: c.full_name, email: c.email }])
      );
    }
  }

  // Récupérer les stats de commissions par filleul
  const { data: commissionStats } = await supabase
    .from("referral_commissions")
    .select("referral_link_id, final_commission_cents, status")
    .eq("partner_id", partner.id);

  const commissionsByLink: Record<
    string,
    { total: number; pending: number; validated: number; count: number }
  > = {};

  for (const c of commissionStats || []) {
    if (!commissionsByLink[c.referral_link_id]) {
      commissionsByLink[c.referral_link_id] = { total: 0, pending: 0, validated: 0, count: 0 };
    }
    commissionsByLink[c.referral_link_id].count++;
    if (c.status !== "cancelled") {
      commissionsByLink[c.referral_link_id].total += c.final_commission_cents || 0;
    }
    if (c.status === "pending") {
      commissionsByLink[c.referral_link_id].pending += c.final_commission_cents || 0;
    }
    if (c.status === "validated") {
      commissionsByLink[c.referral_link_id].validated += c.final_commission_cents || 0;
    }
  }

  const enrichedLinks = (links || []).map((link) => ({
    ...link,
    referree_name: consumers[link.referree_user_id]?.full_name || null,
    referree_email: consumers[link.referree_user_id]?.email || null,
    commissions: commissionsByLink[link.id] || { total: 0, pending: 0, validated: 0, count: 0 },
  }));

  return res.json({
    referrees: enrichedLinks,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  });
};

/**
 * Lister mes commissions
 * GET /api/referral/me/commissions
 */
export const listMyCommissions: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const userResult = await getConsumerUserFromBearerToken(token);
  if ('error' in userResult) {
    return res.status(userResult.status).json({ error: userResult.error });
  }

  const supabase = getAdminSupabase();

  // Récupérer le partner_id
  const { data: partner } = await supabase
    .from("referral_partners")
    .select("id")
    .eq("user_id", userResult.user.id)
    .maybeSingle();

  if (!partner) {
    return res.status(404).json({ error: "Vous n'avez pas de compte parrain" });
  }

  // Filtres
  const status = asString(req.query.status as string);
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
  const offset = (page - 1) * limit;

  let query = supabase
    .from("referral_commissions")
    .select(
      `
      id,
      reservation_id,
      reservation_amount_cents,
      deposit_amount_cents,
      commission_rate_percent,
      final_commission_cents,
      status,
      establishment_name,
      establishment_universe,
      reservation_date,
      validated_at,
      cancelled_at,
      cancellation_reason,
      created_at
    `,
      { count: "exact" }
    )
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && ["pending", "validated", "cancelled", "paid"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data: commissions, error, count } = await query;

  if (error) {
    log.error({ err: error }, "list commissions failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }

  return res.json({
    commissions: commissions || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  });
};

/**
 * Lister mes paiements
 * GET /api/referral/me/payouts
 */
export const listMyPayouts: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const userResult = await getConsumerUserFromBearerToken(token);
  if ('error' in userResult) {
    return res.status(userResult.status).json({ error: userResult.error });
  }

  const supabase = getAdminSupabase();

  // Récupérer le partner_id
  const { data: partner } = await supabase
    .from("referral_partners")
    .select("id")
    .eq("user_id", userResult.user.id)
    .maybeSingle();

  if (!partner) {
    return res.status(404).json({ error: "Vous n'avez pas de compte parrain" });
  }

  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
  const offset = (page - 1) * limit;

  const { data: payouts, error, count } = await supabase
    .from("referral_payouts")
    .select("*", { count: "exact" })
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    log.error({ err: error }, "list payouts failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }

  return res.json({
    payouts: payouts || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  });
};

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

/**
 * Vérifier si l'utilisateur est admin
 */
async function requireAdmin(token: string): Promise<UserResult & { isAdmin?: boolean }> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { ok: false, status: 401, error: "Token invalide" };
  }

  // Vérifier si l'utilisateur est admin
  const { data: adminProfile } = await supabase
    .from("admin_profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!adminProfile) {
    return { ok: false, status: 403, error: "Accès refusé" };
  }

  return { ok: true, user: { id: data.user.id, email: data.user.email }, isAdmin: true };
}

/**
 * Lister les demandes de parrains (admin)
 * GET /api/admin/referral/partners
 */
export const listReferralPartners: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const adminResult = await requireAdmin(token);
  if ('error' in adminResult) {
    return res.status(adminResult.status).json({ error: adminResult.error });
  }

  const supabase = getAdminSupabase();

  const status = asString(req.query.status as string);
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
  const offset = (page - 1) * limit;

  let query = supabase
    .from("referral_partners_with_stats")
    .select("*", { count: "exact" })
    .order("requested_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && ["pending", "active", "suspended", "rejected"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data: partners, error, count } = await query;

  if (error) {
    log.error({ err: error }, "admin list referral partners failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }

  // Enrichir avec les infos des consumers
  const userIds = (partners || []).map((p) => p.user_id);

  let consumers: Record<string, { full_name: string | null; email: string | null; phone: string | null }> = {};

  if (userIds.length > 0) {
    const { data: consumerData } = await supabase
      .from("consumer_users")
      .select("id, full_name, email, phone")
      .in("id", userIds);

    if (consumerData) {
      consumers = Object.fromEntries(
        consumerData.map((c) => [c.id, { full_name: c.full_name, email: c.email, phone: c.phone }])
      );
    }
  }

  const enrichedPartners = (partners || []).map((partner) => ({
    ...partner,
    user_name: consumers[partner.user_id]?.full_name || null,
    user_email: consumers[partner.user_id]?.email || null,
    user_phone: consumers[partner.user_id]?.phone || null,
  }));

  return res.json({
    partners: enrichedPartners,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  });
};

/**
 * Approuver/Rejeter un parrain (admin)
 * PATCH /api/admin/referral/partners/:id
 */
export const updateReferralPartnerStatus: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const adminResult = await requireAdmin(token);
  if ('error' in adminResult) {
    return res.status(adminResult.status).json({ error: adminResult.error });
  }

  const partnerId = req.params.id;
  if (!partnerId) {
    return res.status(400).json({ error: "ID parrain requis" });
  }

  const body = isRecord(req.body) ? req.body : {};
  const newStatus = asString(body.status);
  const rejectionReason = asString(body.rejection_reason);
  const adminNotes = asString(body.admin_notes);

  if (!newStatus || !["active", "suspended", "rejected"].includes(newStatus)) {
    return res.status(400).json({ error: "Statut invalide" });
  }

  if (newStatus === "rejected" && !rejectionReason) {
    return res.status(400).json({ error: "Raison de refus requise" });
  }

  const supabase = getAdminSupabase();

  const updates: Record<string, unknown> = {
    status: newStatus,
    reviewed_at: new Date().toISOString(),
    reviewed_by: adminResult.user.id,
  };

  if (rejectionReason) {
    updates.rejection_reason = rejectionReason;
  }

  if (adminNotes !== undefined) {
    updates.admin_notes = adminNotes;
  }

  const { data: partner, error } = await supabase
    .from("referral_partners")
    .update(updates)
    .eq("id", partnerId)
    .select()
    .single();

  if (error) {
    log.error({ err: error }, "update referral partner status failed");
    return res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }

  // TODO: Notifier le parrain du changement de statut

  return res.json({ ok: true, partner });
};

/**
 * Obtenir la configuration du parrainage (admin)
 * GET /api/admin/referral/config
 */
export const getReferralConfig: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const adminResult = await requireAdmin(token);
  if ('error' in adminResult) {
    return res.status(adminResult.status).json({ error: adminResult.error });
  }

  const supabase = getAdminSupabase();

  const [configResult, universesResult] = await Promise.all([
    supabase.from("referral_config").select("*").eq("id", 1).single(),
    supabase.from("referral_config_universes").select("*").order("universe"),
  ]);

  if (configResult.error) {
    log.error({ err: configResult.error }, "get referral config failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }

  return res.json({
    config: configResult.data,
    universes: universesResult.data || [],
  });
};

/**
 * Mettre à jour la configuration du parrainage (admin)
 * PATCH /api/admin/referral/config
 */
export const updateReferralConfig: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const adminResult = await requireAdmin(token);
  if ('error' in adminResult) {
    return res.status(adminResult.status).json({ error: adminResult.error });
  }

  const body = isRecord(req.body) ? req.body : {};
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: adminResult.user.id,
  };

  if (body.default_commission_percent !== undefined) {
    const pct = asNumber(body.default_commission_percent);
    if (pct !== undefined && (pct < 0 || pct > 100)) {
      return res.status(400).json({ error: "Pourcentage invalide (0-100)" });
    }
    updates.default_commission_percent = pct ?? null;
  }

  if (body.default_commission_fixed_cents !== undefined) {
    updates.default_commission_fixed_cents = asNumber(body.default_commission_fixed_cents) ?? null;
  }

  if (body.commission_mode !== undefined) {
    const mode = asString(body.commission_mode);
    if (mode && !["percent", "fixed", "both_max", "both_min"].includes(mode)) {
      return res.status(400).json({ error: "Mode invalide" });
    }
    updates.commission_mode = mode;
  }

  if (body.commission_base !== undefined) {
    const base = asString(body.commission_base);
    if (base && !["deposit", "total"].includes(base)) {
      return res.status(400).json({ error: "Base invalide" });
    }
    updates.commission_base = base;
  }

  if (body.min_reservation_amount_cents !== undefined) {
    updates.min_reservation_amount_cents = asNumber(body.min_reservation_amount_cents) ?? 0;
  }

  if (body.min_commission_amount_cents !== undefined) {
    updates.min_commission_amount_cents = asNumber(body.min_commission_amount_cents) ?? 0;
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
  }

  const supabase = getAdminSupabase();

  const { data: config, error } = await supabase
    .from("referral_config")
    .update(updates)
    .eq("id", 1)
    .select()
    .single();

  if (error) {
    log.error({ err: error }, "update referral config failed");
    return res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }

  return res.json({ ok: true, config });
};

/**
 * Mettre à jour la configuration d'un univers (admin)
 * PUT /api/admin/referral/config/universes/:universe
 */
export const upsertReferralConfigUniverse: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const adminResult = await requireAdmin(token);
  if ('error' in adminResult) {
    return res.status(adminResult.status).json({ error: adminResult.error });
  }

  const universe = req.params.universe;
  if (!universe) {
    return res.status(400).json({ error: "Univers requis" });
  }

  const body = isRecord(req.body) ? req.body : {};

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("referral_config_universes")
    .upsert(
      {
        universe,
        commission_percent: asNumber(body.commission_percent) ?? null,
        commission_fixed_cents: asNumber(body.commission_fixed_cents) ?? null,
        is_active: body.is_active !== false,
      },
      { onConflict: "universe" }
    )
    .select()
    .single();

  if (error) {
    log.error({ err: error }, "upsert referral universe config failed");
    return res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }

  return res.json({ ok: true, universe_config: data });
};

/**
 * Lister toutes les commissions (admin)
 * GET /api/admin/referral/commissions
 */
export const listAllCommissions: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const adminResult = await requireAdmin(token);
  if ('error' in adminResult) {
    return res.status(adminResult.status).json({ error: adminResult.error });
  }

  const supabase = getAdminSupabase();

  const status = asString(req.query.status as string);
  const partnerId = asString(req.query.partner_id as string);
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 50));
  const offset = (page - 1) * limit;

  let query = supabase
    .from("referral_commissions")
    .select(
      `
      *,
      referral_partners!inner (
        id,
        referral_code,
        display_name,
        user_id
      )
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && ["pending", "validated", "cancelled", "paid"].includes(status)) {
    query = query.eq("status", status);
  }

  if (partnerId) {
    query = query.eq("partner_id", partnerId);
  }

  const { data: commissions, error, count } = await query;

  if (error) {
    log.error({ err: error }, "admin list commissions failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }

  return res.json({
    commissions: commissions || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  });
};

/**
 * Créer un payout pour un parrain (admin)
 * POST /api/admin/referral/payouts
 */
export const createReferralPayout: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const adminResult = await requireAdmin(token);
  if ('error' in adminResult) {
    return res.status(adminResult.status).json({ error: adminResult.error });
  }

  const body = isRecord(req.body) ? req.body : {};
  const partnerId = asString(body.partner_id);
  const periodStart = asString(body.period_start);
  const periodEnd = asString(body.period_end);

  if (!partnerId) {
    return res.status(400).json({ error: "ID parrain requis" });
  }

  if (!periodStart || !periodEnd) {
    return res.status(400).json({ error: "Période requise" });
  }

  const supabase = getAdminSupabase();

  // Vérifier que le parrain existe et est actif
  const { data: partner } = await supabase
    .from("referral_partners")
    .select("id, status")
    .eq("id", partnerId)
    .single();

  if (!partner) {
    return res.status(404).json({ error: "Parrain non trouvé" });
  }

  // Récupérer les commissions validées non payées
  const { data: commissions, error: commError } = await supabase
    .from("referral_commissions")
    .select("id, final_commission_cents")
    .eq("partner_id", partnerId)
    .eq("status", "validated")
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd);

  if (commError) {
    log.error({ err: commError }, "get commissions for payout failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }

  if (!commissions || commissions.length === 0) {
    return res.status(400).json({ error: "Aucune commission à payer pour cette période" });
  }

  const totalCents = commissions.reduce((sum, c) => sum + (c.final_commission_cents || 0), 0);
  const commissionIds = commissions.map((c) => c.id);

  // Créer le payout
  const { data: payout, error: payoutError } = await supabase
    .from("referral_payouts")
    .insert({
      partner_id: partnerId,
      amount_cents: totalCents,
      period_start: periodStart,
      period_end: periodEnd,
      commission_count: commissions.length,
      status: "pending",
    })
    .select()
    .single();

  if (payoutError) {
    log.error({ err: payoutError }, "create referral payout failed");
    return res.status(500).json({ error: "Erreur lors de la création du paiement" });
  }

  // Mettre à jour les commissions avec le payout_id
  await supabase
    .from("referral_commissions")
    .update({ payout_id: payout.id })
    .in("id", commissionIds);

  return res.status(201).json({ ok: true, payout });
};

/**
 * Marquer un payout comme payé (admin)
 * PATCH /api/admin/referral/payouts/:id
 */
export const updateReferralPayout: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const adminResult = await requireAdmin(token);
  if ('error' in adminResult) {
    return res.status(adminResult.status).json({ error: adminResult.error });
  }

  const payoutId = req.params.id;
  if (!payoutId) {
    return res.status(400).json({ error: "ID payout requis" });
  }

  const body = isRecord(req.body) ? req.body : {};
  const newStatus = asString(body.status);
  const paymentMethod = asString(body.payment_method);
  const paymentReference = asString(body.payment_reference);
  const adminNotes = asString(body.admin_notes);

  if (!newStatus || !["processing", "paid", "failed", "cancelled"].includes(newStatus)) {
    return res.status(400).json({ error: "Statut invalide" });
  }

  const supabase = getAdminSupabase();

  const updates: Record<string, unknown> = {
    status: newStatus,
    processed_by: adminResult.user.id,
  };

  if (newStatus === "paid") {
    updates.paid_at = new Date().toISOString();
    if (paymentMethod) updates.payment_method = paymentMethod;
    if (paymentReference) updates.payment_reference = paymentReference;
  }

  if (newStatus === "processing") {
    updates.processed_at = new Date().toISOString();
  }

  if (adminNotes !== undefined) {
    updates.admin_notes = adminNotes;
  }

  const { data: payout, error } = await supabase
    .from("referral_payouts")
    .update(updates)
    .eq("id", payoutId)
    .select()
    .single();

  if (error) {
    log.error({ err: error }, "update referral payout failed");
    return res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }

  // Si payé, mettre à jour les commissions
  if (newStatus === "paid") {
    await supabase
      .from("referral_commissions")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("payout_id", payoutId);
  }

  return res.json({ ok: true, payout });
};

/**
 * Obtenir les KPIs du programme de parrainage (admin)
 * GET /api/admin/referral/stats
 */
export const getReferralStats: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ error: "Token requis" });
  }

  const adminResult = await requireAdmin(token);
  if ('error' in adminResult) {
    return res.status(adminResult.status).json({ error: adminResult.error });
  }

  const supabase = getAdminSupabase();

  const [
    partnersResult,
    linksResult,
    commissionsResult,
    payoutsResult,
    monthlyPartnersResult,
    monthlyLinksResult,
    monthlyCommissionsResult,
  ] = await Promise.all([
    // Total parrains par statut
    supabase
      .from("referral_partners")
      .select("status", { count: "exact", head: false }),

    // Total filleuls
    supabase.from("referral_links").select("id", { count: "exact", head: true }),

    // Commissions par statut
    supabase
      .from("referral_commissions")
      .select("status, final_commission_cents"),

    // Payouts par statut
    supabase.from("referral_payouts").select("status, amount_cents"),

    // Parrains ce mois
    supabase
      .from("referral_partners")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),

    // Filleuls ce mois
    supabase
      .from("referral_links")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),

    // Commissions ce mois
    supabase
      .from("referral_commissions")
      .select("final_commission_cents, status")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  // Calculer les stats
  const partnersByStatus: Record<string, number> = {};
  for (const p of partnersResult.data || []) {
    partnersByStatus[p.status] = (partnersByStatus[p.status] || 0) + 1;
  }

  const commissionsByStatus: Record<string, { count: number; total: number }> = {};
  for (const c of commissionsResult.data || []) {
    if (!commissionsByStatus[c.status]) {
      commissionsByStatus[c.status] = { count: 0, total: 0 };
    }
    commissionsByStatus[c.status].count++;
    commissionsByStatus[c.status].total += c.final_commission_cents || 0;
  }

  const payoutsByStatus: Record<string, { count: number; total: number }> = {};
  for (const p of payoutsResult.data || []) {
    if (!payoutsByStatus[p.status]) {
      payoutsByStatus[p.status] = { count: 0, total: 0 };
    }
    payoutsByStatus[p.status].count++;
    payoutsByStatus[p.status].total += p.amount_cents || 0;
  }

  const monthlyCommissionsTotal = (monthlyCommissionsResult.data || [])
    .filter((c) => c.status !== "cancelled")
    .reduce((sum, c) => sum + (c.final_commission_cents || 0), 0);

  return res.json({
    partners: {
      total: partnersResult.data?.length || 0,
      by_status: partnersByStatus,
      this_month: monthlyPartnersResult.count || 0,
    },
    referrees: {
      total: linksResult.count || 0,
      this_month: monthlyLinksResult.count || 0,
    },
    commissions: {
      total_count: commissionsResult.data?.length || 0,
      by_status: commissionsByStatus,
      this_month_total_cents: monthlyCommissionsTotal,
    },
    payouts: {
      by_status: payoutsByStatus,
    },
  });
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerReferralRoutes(app: Express) {
  // Public endpoints
  app.get("/api/public/referral/validate/:code", zParams(ReferralCodeParams), createRateLimiter("referral-validate", { windowMs: 5 * 60 * 1000, maxRequests: 10 }), validateReferralCode);
  app.post("/api/public/referral/link", createRateLimiter("referral-link", { windowMs: 15 * 60 * 1000, maxRequests: 5 }), zBody(trackReferralLinkSchema), createReferralLink);

  // Referral Partner endpoints (espace parrain)
  app.post("/api/referral/apply", zBody(applyReferralSchema), applyAsReferralPartner);
  app.get("/api/referral/me", getReferralPartnerMe);
  app.patch("/api/referral/me", zBody(updateReferralProfileSchema), updateReferralPartnerMe);
  app.get("/api/referral/me/referrees", zQuery(ListMyReferreesQuery), listMyReferrees);
  app.get("/api/referral/me/commissions", zQuery(ListMyCommissionsQuery), listMyCommissions);
  app.get("/api/referral/me/payouts", zQuery(ListMyPayoutsQuery), listMyPayouts);

  // Admin referral endpoints
  app.get("/api/admin/referral/partners", zQuery(ListReferralPartnersQuery), listReferralPartners);
  app.patch("/api/admin/referral/partners/:id", zParams(ReferralPartnerIdParams), zBody(updateReferralPartnerSchema), updateReferralPartnerStatus);
  app.get("/api/admin/referral/config", getReferralConfig);
  app.patch("/api/admin/referral/config", zBody(updateReferralConfigSchema), updateReferralConfig);
  app.put("/api/admin/referral/config/universes/:universe", zParams(ReferralUniverseParams), zBody(updateReferralUniverseConfigSchema), upsertReferralConfigUniverse);
  app.get("/api/admin/referral/commissions", zQuery(ListAllCommissionsQuery), listAllCommissions);
  app.post("/api/admin/referral/payouts", zBody(createReferralPayoutSchema), createReferralPayout);
  app.patch("/api/admin/referral/payouts/:id", zParams(ReferralPayoutIdParams), zBody(updateReferralPayoutSchema), updateReferralPayout);
  app.get("/api/admin/referral/stats", getReferralStats);
}
