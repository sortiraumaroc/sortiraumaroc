/**
 * Routes API PRO - Système Publicitaire
 *
 * Endpoints pour :
 * - Wallet (solde, transactions, recharge)
 * - Campagnes (CRUD, soumission, stats)
 * - Créatives
 */

import type { Router, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  type AdCampaign,
  type AdCampaignTargeting,
  type CreateAdCampaignRequest,
  type UpdateAdCampaignRequest,
  AD_CAMPAIGN_TYPES,
  AD_BILLING_MODELS,
} from "../ads/types";
import { validateBid, calculateSuggestedBid } from "../ads/auction";
import { checkCampaignBudget } from "../ads/billing";

// =============================================================================
// TYPES & HELPERS
// =============================================================================

type ProUser = { id: string; email?: string | null };
type ProRole = "owner" | "manager" | "reception" | "accounting" | "marketing" | string;

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

async function getUserFromBearerToken(token: string): Promise<
  { ok: true; user: ProUser } | { ok: false; error: string; status: number }
> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return { ok: false, status: 401, error: error.message };
  if (!data.user) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, user: { id: data.user.id, email: data.user.email } };
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

// =============================================================================
// WALLET ENDPOINTS
// =============================================================================

/**
 * GET /api/pro/establishments/:id/ads/wallet
 * Récupère le wallet publicitaire d'un établissement
 */
export const getWallet: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const proUser = userResult.user;

  try {
    // Vérifier l'accès
    const { data: membership, error: memberError } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (memberError || !membership) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Récupérer ou créer le wallet
    let { data: wallet, error: walletError } = await supabase
      .from("ad_wallets")
      .select("*")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (!wallet) {
      // Créer le wallet s'il n'existe pas
      const { data: newWallet, error: createError } = await supabase
        .from("ad_wallets")
        .insert({
          establishment_id: establishmentId,
          balance_cents: 0,
          total_credited_cents: 0,
          total_spent_cents: 0,
        })
        .select()
        .single();

      if (createError) {
        console.error("[proAds] Error creating wallet:", createError);
        return res.status(500).json({ error: "Erreur création wallet" });
      }

      wallet = newWallet;
    }

    return res.json({ ok: true, wallet });
  } catch (error) {
    console.error("[proAds] getWallet error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * GET /api/pro/establishments/:id/ads/wallet/transactions
 * Récupère l'historique des transactions
 */
export const getWalletTransactions: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const proUser = userResult.user;

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Récupérer le wallet
    const { data: wallet } = await supabase
      .from("ad_wallets")
      .select("id")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (!wallet) {
      return res.json({ ok: true, transactions: [], total: 0 });
    }

    // Récupérer les transactions
    const { data: transactions, error, count } = await supabase
      .from("ad_wallet_transactions")
      .select("*", { count: "exact" })
      .eq("wallet_id", wallet.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[proAds] Error fetching transactions:", error);
      return res.status(500).json({ error: "Erreur récupération transactions" });
    }

    return res.json({ ok: true, transactions: transactions ?? [], total: count ?? 0 });
  } catch (error) {
    console.error("[proAds] getWalletTransactions error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/pro/establishments/:id/ads/wallet/recharge
 * Initie une recharge de wallet via LaCaissePay
 */
export const initiateWalletRecharge: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const proUser = userResult.user;

  // Valider les données
  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Corps de requête invalide" });
  }

  const amountMad = asNumber(req.body.amount_mad);
  const acceptUrl = asString(req.body.accept_url);
  const declineUrl = asString(req.body.decline_url);

  if (!amountMad || amountMad < 100 || amountMad > 50000) {
    return res.status(400).json({ error: "Montant invalide (100-50000 MAD)" });
  }

  if (!acceptUrl || !declineUrl) {
    return res.status(400).json({ error: "URLs de retour manquantes" });
  }

  try {
    // Vérifier l'accès (owner ou marketing)
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership || !["owner", "marketing"].includes(membership.role)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Récupérer l'établissement pour les infos
    const { data: establishment } = await supabase
      .from("establishments")
      .select("id, name")
      .eq("id", establishmentId)
      .single();

    if (!establishment) {
      return res.status(404).json({ error: "Établissement introuvable" });
    }

    // Récupérer ou créer le wallet
    let { data: wallet } = await supabase
      .from("ad_wallets")
      .select("id")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (!wallet) {
      const { data: newWallet } = await supabase
        .from("ad_wallets")
        .insert({
          establishment_id: establishmentId,
          balance_cents: 0,
          total_credited_cents: 0,
          total_spent_cents: 0,
        })
        .select("id")
        .single();
      wallet = newWallet;
    }

    if (!wallet) {
      return res.status(500).json({ error: "Erreur création wallet" });
    }

    // Créer un identifiant unique pour la recharge
    const rechargeId = randomUUID();
    const externalReference = `WALLET_RECHARGE_${rechargeId}`;
    const orderId = `WR-${Date.now()}-${rechargeId.slice(0, 8)}`;

    // Stocker la recharge pending dans une table de métadonnées
    // On utilise ad_wallet_transactions avec type='pending_credit'
    const { error: txError } = await supabase
      .from("ad_wallet_transactions")
      .insert({
        wallet_id: wallet.id,
        type: "credit",
        amount_cents: Math.round(amountMad * 100),
        balance_after_cents: 0, // Sera mis à jour après le paiement
        description: `Recharge en attente - ${orderId}`,
        reference_type: "lacaissepay_pending",
        reference_id: null,
        created_by: proUser.id,
      });

    // Note: On ne bloque pas si l'insert échoue, c'est juste un log

    // Construire l'URL de notification webhook
    const webhookKey = process.env.PAYMENTS_WEBHOOK_KEY || process.env.ADMIN_API_KEY || "";
    const origin = new URL(acceptUrl).origin;
    const notificationUrl = `${origin}/api/payments/webhook?webhook_key=${encodeURIComponent(webhookKey)}`;

    // Préparer les données pour LaCaissePay
    const sessionPayload = {
      orderId,
      externalReference,
      amountMad,
      customerEmail: proUser.email || "noemail@sortiraumaroc.com",
      customerPhone: "+212600000000", // TODO: Récupérer depuis le profil PRO
      customerFirstName: establishment.name,
      customerLastName: "Ads Wallet",
      acceptUrl,
      declineUrl,
      notificationUrl,
    };

    // Appeler l'endpoint interne de création de session LaCaissePay
    const { createLacaissePaySessionInternal, buildLacaissePayCheckoutUrlServer } = await import("./lacaissepay");

    const session = await createLacaissePaySessionInternal({
      ...sessionPayload,
      companyName: "Sortir Au Maroc",
    });

    // Construire l'URL de paiement
    const paymentUrl = buildLacaissePayCheckoutUrlServer({
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      config: {
        customer: {
          email: sessionPayload.customerEmail,
          phone: sessionPayload.customerPhone,
          firstName: sessionPayload.customerFirstName,
          lastName: sessionPayload.customerLastName,
        },
        urls: {
          accept: acceptUrl,
          decline: declineUrl,
          notification: notificationUrl,
          externalReference,
        },
      },
    });

    // Stocker les métadonnées pour le webhook
    // On utilise la table existante payments_meta ou une variable en mémoire
    // Pour simplifier, on encode les infos dans externalReference qui sera retourné par le webhook

    return res.json({
      ok: true,
      payment_url: paymentUrl,
      session_id: session.sessionId,
      order_id: orderId,
      external_reference: externalReference,
      amount_mad: amountMad,
      amount_cents: Math.round(amountMad * 100),
    });
  } catch (error) {
    console.error("[proAds] initiateWalletRecharge error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// CAMPAIGN ENDPOINTS
// =============================================================================

/**
 * GET /api/pro/establishments/:id/ads/campaigns
 * Liste les campagnes publicitaires d'un établissement
 */
export const listCampaigns: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const proUser = userResult.user;

  const status = asString(req.query.status);
  const type = asString(req.query.type);

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Construire la requête
    let query = supabase
      .from("pro_campaigns")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (type) {
      query = query.eq("type", type);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      console.error("[proAds] Error listing campaigns:", error);
      return res.status(500).json({ error: "Erreur récupération campagnes" });
    }

    // Récupérer le wallet pour le solde
    const { data: wallet } = await supabase
      .from("ad_wallets")
      .select("balance_cents")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    return res.json({
      ok: true,
      campaigns: campaigns ?? [],
      wallet_balance_cents: wallet?.balance_cents ?? 0,
    });
  } catch (error) {
    console.error("[proAds] listCampaigns error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * GET /api/pro/establishments/:id/ads/campaigns/:campaignId
 * Récupère une campagne avec ses stats
 */
export const getCampaign: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const campaignId = req.params.campaignId;
  const proUser = userResult.user;

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Récupérer la campagne
    const { data: campaign, error } = await supabase
      .from("pro_campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("establishment_id", establishmentId)
      .single();

    if (error || !campaign) {
      return res.status(404).json({ error: "Campagne introuvable" });
    }

    // Récupérer les créatives
    const { data: creatives } = await supabase
      .from("ad_creatives")
      .select("*")
      .eq("campaign_id", campaignId);

    // Récupérer les stats (derniers 30 jours)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { count: impressionCount } = await supabase
      .from("ad_impressions")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .gte("created_at", thirtyDaysAgo);

    const { count: clickCount } = await supabase
      .from("ad_clicks")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("is_valid", true)
      .gte("created_at", thirtyDaysAgo);

    const { count: conversionCount } = await supabase
      .from("ad_conversions")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .gte("created_at", thirtyDaysAgo);

    const stats = {
      impressions_30d: impressionCount ?? 0,
      clicks_30d: clickCount ?? 0,
      conversions_30d: conversionCount ?? 0,
      ctr_30d: impressionCount && impressionCount > 0
        ? ((clickCount ?? 0) / impressionCount * 100).toFixed(2)
        : "0.00",
    };

    return res.json({
      ok: true,
      campaign,
      creatives: creatives ?? [],
      stats,
    });
  } catch (error) {
    console.error("[proAds] getCampaign error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/pro/establishments/:id/ads/campaigns
 * Crée une nouvelle campagne
 */
export const createCampaign: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const proUser = userResult.user;
  const body = req.body as CreateAdCampaignRequest;

  try {
    // Vérifier l'accès (owner ou marketing)
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership || !["owner", "marketing"].includes(membership.role)) {
      return res.status(403).json({ error: "Accès refusé. Rôle owner ou marketing requis." });
    }

    // Validation
    if (!body.type || !AD_CAMPAIGN_TYPES.includes(body.type as any)) {
      return res.status(400).json({ error: "Type de campagne invalide" });
    }

    if (!body.title?.trim()) {
      return res.status(400).json({ error: "Titre requis" });
    }

    if (!body.budget_cents || body.budget_cents < 50000) {
      return res.status(400).json({ error: "Budget minimum: 500 MAD" });
    }

    // Récupérer la config d'enchères pour ce type
    const { data: auctionConfig } = await supabase
      .from("ad_auction_config")
      .select("*")
      .eq("product_type", body.type)
      .maybeSingle();

    // Valider l'enchère si fournie
    if (body.bid_amount_cents && auctionConfig) {
      const validation = validateBid({
        bidAmountCents: body.bid_amount_cents,
        budgetCents: body.budget_cents,
        dailyBudgetCents: body.daily_budget_cents,
        config: auctionConfig,
      });

      if (!validation.valid) {
        return res.status(400).json({
          error: "Enchère invalide",
          details: validation.errors,
          warnings: validation.warnings,
        });
      }
    }

    // Créer la campagne
    const campaignData = {
      establishment_id: establishmentId,
      type: body.type,
      title: body.title.trim(),
      budget: body.budget_cents,
      remaining_cents: body.budget_cents,
      bid_amount_cents: body.bid_amount_cents ?? auctionConfig?.suggested_bid_cents ?? 200,
      daily_budget_cents: body.daily_budget_cents ?? null,
      billing_model: body.billing_model ?? (body.type === "sponsored_results" ? "cpc" : "cpm"),
      cpc_cents: body.type === "sponsored_results" ? (body.bid_amount_cents ?? 200) : null,
      cpm_cents: body.type !== "sponsored_results" ? (body.bid_amount_cents ?? 2000) : null,
      starts_at: body.starts_at ?? null,
      ends_at: body.ends_at ?? null,
      targeting: body.targeting ?? {},
      promoted_entity_type: body.promoted_entity_type ?? "establishment",
      promoted_entity_id: body.promoted_entity_id ?? establishmentId,
      status: "draft",
      moderation_status: "draft",
    };

    const { data: campaign, error } = await supabase
      .from("pro_campaigns")
      .insert(campaignData)
      .select()
      .single();

    if (error) {
      console.error("[proAds] Error creating campaign:", error);
      return res.status(500).json({ error: "Erreur création campagne" });
    }

    return res.json({ ok: true, campaign });
  } catch (error) {
    console.error("[proAds] createCampaign error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * PATCH /api/pro/establishments/:id/ads/campaigns/:campaignId
 * Met à jour une campagne (si pas encore soumise ou rejetée)
 */
export const updateCampaign: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const campaignId = req.params.campaignId;
  const proUser = userResult.user;
  const body = req.body as UpdateAdCampaignRequest;

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership || !["owner", "marketing"].includes(membership.role)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Récupérer la campagne
    const { data: campaign, error: fetchError } = await supabase
      .from("pro_campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("establishment_id", establishmentId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({ error: "Campagne introuvable" });
    }

    // Vérifier qu'on peut modifier (draft, rejected, ou changes_requested)
    const editableStatuses = ["draft", "rejected", "changes_requested"];
    if (!editableStatuses.includes(campaign.moderation_status)) {
      return res.status(400).json({
        error: "Campagne non modifiable. Elle doit être en brouillon ou rejetée.",
      });
    }

    // Préparer les mises à jour
    const updates: Record<string, any> = {};

    if (body.title !== undefined) {
      updates.title = body.title.trim();
    }

    if (body.budget_cents !== undefined) {
      if (body.budget_cents < 50000) {
        return res.status(400).json({ error: "Budget minimum: 500 MAD" });
      }
      updates.budget = body.budget_cents;
      updates.remaining_cents = body.budget_cents - (campaign.spent_cents ?? 0);
    }

    if (body.bid_amount_cents !== undefined) {
      updates.bid_amount_cents = body.bid_amount_cents;
      if (campaign.billing_model === "cpc") {
        updates.cpc_cents = body.bid_amount_cents;
      } else {
        updates.cpm_cents = body.bid_amount_cents;
      }
    }

    if (body.daily_budget_cents !== undefined) {
      updates.daily_budget_cents = body.daily_budget_cents;
    }

    if (body.starts_at !== undefined) {
      updates.starts_at = body.starts_at;
    }

    if (body.ends_at !== undefined) {
      updates.ends_at = body.ends_at;
    }

    if (body.targeting !== undefined) {
      updates.targeting = body.targeting;
    }

    if (body.status !== undefined) {
      // Le PRO peut seulement pause/active/cancel sa campagne approuvée
      if (campaign.moderation_status === "approved") {
        if (body.status === "paused" || body.status === "active" || body.status === "cancelled") {
          updates.status = body.status;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.json({ ok: true, campaign });
    }

    // Mettre à jour
    const { data: updated, error: updateError } = await supabase
      .from("pro_campaigns")
      .update(updates)
      .eq("id", campaignId)
      .select()
      .single();

    if (updateError) {
      console.error("[proAds] Error updating campaign:", updateError);
      return res.status(500).json({ error: "Erreur mise à jour" });
    }

    return res.json({ ok: true, campaign: updated });
  } catch (error) {
    console.error("[proAds] updateCampaign error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/pro/establishments/:id/ads/campaigns/:campaignId/submit
 * Soumet une campagne pour modération
 */
export const submitCampaign: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const campaignId = req.params.campaignId;
  const proUser = userResult.user;

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership || !["owner", "marketing"].includes(membership.role)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Récupérer la campagne
    const { data: campaign, error: fetchError } = await supabase
      .from("pro_campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("establishment_id", establishmentId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({ error: "Campagne introuvable" });
    }

    // Vérifier qu'on peut soumettre
    const submittableStatuses = ["draft", "rejected", "changes_requested"];
    if (!submittableStatuses.includes(campaign.moderation_status)) {
      return res.status(400).json({
        error: "Cette campagne ne peut pas être soumise. Statut actuel: " + campaign.moderation_status,
      });
    }

    // Vérifier le wallet
    const { data: wallet } = await supabase
      .from("ad_wallets")
      .select("balance_cents")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (!wallet || wallet.balance_cents < campaign.budget) {
      return res.status(400).json({
        error: "Solde insuffisant. Rechargez votre wallet avant de soumettre.",
        required: campaign.budget,
        available: wallet?.balance_cents ?? 0,
      });
    }

    // Mettre à jour le statut
    const { data: updated, error: updateError } = await supabase
      .from("pro_campaigns")
      .update({
        moderation_status: "pending_review",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", campaignId)
      .select()
      .single();

    if (updateError) {
      console.error("[proAds] Error submitting campaign:", updateError);
      return res.status(500).json({ error: "Erreur soumission" });
    }

    // Créer un log de modération
    await supabase.from("ad_moderation_logs").insert({
      campaign_id: campaignId,
      admin_user_id: proUser.id, // En fait c'est le PRO qui soumet
      action: "submitted",
      previous_status: campaign.moderation_status,
      new_status: "pending_review",
    });

    // TODO: Notifier les admins

    return res.json({ ok: true, campaign: updated });
  } catch (error) {
    console.error("[proAds] submitCampaign error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * DELETE /api/pro/establishments/:id/ads/campaigns/:campaignId
 * Supprime une campagne (si pas encore active)
 */
export const deleteCampaign: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const campaignId = req.params.campaignId;
  const proUser = userResult.user;

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership || !["owner", "marketing"].includes(membership.role)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Récupérer la campagne
    const { data: campaign, error: fetchError } = await supabase
      .from("pro_campaigns")
      .select("status, spent_cents")
      .eq("id", campaignId)
      .eq("establishment_id", establishmentId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({ error: "Campagne introuvable" });
    }

    // Vérifier qu'on peut supprimer (pas de dépenses)
    if ((campaign.spent_cents ?? 0) > 0) {
      return res.status(400).json({
        error: "Impossible de supprimer une campagne avec des dépenses. Utilisez l'annulation.",
      });
    }

    // Supprimer
    const { error: deleteError } = await supabase
      .from("pro_campaigns")
      .delete()
      .eq("id", campaignId);

    if (deleteError) {
      console.error("[proAds] Error deleting campaign:", deleteError);
      return res.status(500).json({ error: "Erreur suppression" });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("[proAds] deleteCampaign error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * GET /api/pro/establishments/:id/ads/auction-config
 * Récupère la configuration des enchères pour créer une campagne
 */
export const getAuctionConfig: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const proUser = userResult.user;
  const campaignType = asString(req.query.type);

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Récupérer la config
    let query = supabase.from("ad_auction_config").select("*");

    if (campaignType) {
      query = query.eq("product_type", campaignType);
    }

    const { data: configs, error } = await query;

    if (error) {
      console.error("[proAds] Error fetching auction config:", error);
      return res.status(500).json({ error: "Erreur récupération configuration" });
    }

    // Compter les campagnes actives pour ajuster le prix suggéré
    const { count: activeCampaignsCount } = await supabase
      .from("pro_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .eq("moderation_status", "approved");

    // Calculer les prix suggérés dynamiques
    const configsWithSuggested = (configs ?? []).map(config => {
      const suggested = calculateSuggestedBid({
        campaignType: config.product_type,
        activeCampaignsCount: activeCampaignsCount ?? 0,
        config,
      });

      return {
        ...config,
        dynamic_suggested_bid_cents: suggested,
        active_campaigns_count: activeCampaignsCount ?? 0,
      };
    });

    return res.json({
      ok: true,
      configs: campaignType ? configsWithSuggested[0] : configsWithSuggested,
    });
  } catch (error) {
    console.error("[proAds] getAuctionConfig error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * GET /api/pro/establishments/:id/ads/stats
 * Récupère les statistiques globales des campagnes
 */
export const getAdsStats: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const proUser = userResult.user;

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Wallet
    const { data: wallet } = await supabase
      .from("ad_wallets")
      .select("balance_cents, total_spent_cents")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    // Campagnes
    const { data: campaigns } = await supabase
      .from("pro_campaigns")
      .select("id, status, spent_cents, impressions, clicks")
      .eq("establishment_id", establishmentId);

    const activeCampaigns = campaigns?.filter(c => c.status === "active").length ?? 0;
    const totalSpent = campaigns?.reduce((sum, c) => sum + (c.spent_cents ?? 0), 0) ?? 0;
    const totalImpressions = campaigns?.reduce((sum, c) => sum + (c.impressions ?? 0), 0) ?? 0;
    const totalClicks = campaigns?.reduce((sum, c) => sum + (c.clicks ?? 0), 0) ?? 0;

    // Stats ce mois
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: monthlyClicks } = await supabase
      .from("ad_clicks")
      .select("cost_cents")
      .in("campaign_id", campaigns?.map(c => c.id) ?? [])
      .eq("is_valid", true)
      .gte("created_at", startOfMonth.toISOString());

    const monthlySpent = monthlyClicks?.reduce((sum, c) => sum + (c.cost_cents ?? 0), 0) ?? 0;

    return res.json({
      ok: true,
      stats: {
        wallet_balance_cents: wallet?.balance_cents ?? 0,
        total_spent_cents: totalSpent,
        monthly_spent_cents: monthlySpent,
        active_campaigns: activeCampaigns,
        total_campaigns: campaigns?.length ?? 0,
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        average_ctr: totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : "0.00",
      },
    });
  } catch (error) {
    console.error("[proAds] getAdsStats error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// HOME TAKEOVER CALENDAR
// =============================================================================

/**
 * GET /api/pro/establishments/:id/ads/home-takeover/calendar
 * Récupère le calendrier des jours disponibles pour l'habillage home
 */
export const getHomeTakeoverCalendar: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;

  // Date range: from today to 90 days in the future
  const startDate = asString(req.query.start_date) || new Date().toISOString().split("T")[0];
  const endDate =
    asString(req.query.end_date) ||
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", userResult.user.id)
      .maybeSingle();

    if (!membership || !["owner", "marketing"].includes(membership.role)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Récupérer le calendrier
    const { data: calendar, error } = await supabase
      .from("ad_home_takeover_calendar")
      .select(`
        id,
        date,
        price_cents,
        status,
        winning_bid_cents,
        campaign_id,
        notes
      `)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (error) {
      console.error("[proAds] Error fetching calendar:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    // Récupérer la config de l'enchère pour home_takeover
    const { data: config } = await supabase
      .from("ad_auction_config")
      .select("*")
      .eq("campaign_type", "home_takeover")
      .maybeSingle();

    // Générer les jours manquants avec prix par défaut
    const basePrice = (config as any)?.min_bid_cents ?? 50000; // 500 MAD minimum
    const existingDates = new Set((calendar ?? []).map((c: any) => c.date));
    const allDates: any[] = [...(calendar ?? [])];

    // Générer les dates manquantes
    let currentDate = new Date(startDate);
    const end = new Date(endDate);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split("T")[0];
      if (!existingDates.has(dateStr)) {
        // Calculer le prix basé sur le jour de la semaine
        const dayOfWeek = currentDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
        const dayPrice = isWeekend ? Math.round(basePrice * 1.5) : basePrice;

        allDates.push({
          id: null,
          date: dateStr,
          price_cents: dayPrice,
          status: "available",
          winning_bid_cents: null,
          campaign_id: null,
          notes: null,
        });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Trier par date
    allDates.sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      ok: true,
      calendar: allDates,
      config: {
        min_bid_cents: (config as any)?.min_bid_cents ?? 50000,
        suggested_bid_cents: (config as any)?.suggested_bid_cents ?? 100000,
        min_budget_cents: (config as any)?.min_budget_cents ?? 500000,
      },
    });
  } catch (error) {
    console.error("[proAds] getHomeTakeoverCalendar error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/pro/establishments/:id/ads/home-takeover/reserve
 * Réserver un jour pour l'habillage home
 */
export const reserveHomeTakeoverDay: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;
  const proUser = userResult.user;

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: "Corps de requête invalide" });
  }

  const date = asString(req.body.date);
  const bidCents = asNumber(req.body.bid_cents);
  const title = asString(req.body.title) || "Habillage Homepage";
  const bannerDesktopUrl = asString(req.body.banner_desktop_url);
  const bannerMobileUrl = asString(req.body.banner_mobile_url);
  const ctaText = asString(req.body.cta_text);
  const ctaUrl = asString(req.body.cta_url);

  if (!date || !bidCents) {
    return res.status(400).json({ error: "Date et enchère requises" });
  }

  // Vérifier que la date est dans le futur
  const targetDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (targetDate <= today) {
    return res.status(400).json({ error: "La date doit être dans le futur" });
  }

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", proUser.id)
      .maybeSingle();

    if (!membership || !["owner", "marketing"].includes(membership.role)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Vérifier la config minimale
    const { data: config } = await supabase
      .from("ad_auction_config")
      .select("min_bid_cents")
      .eq("campaign_type", "home_takeover")
      .maybeSingle();

    const minBid = (config as any)?.min_bid_cents ?? 50000;
    if (bidCents < minBid) {
      return res.status(400).json({
        error: `L'enchère minimum est de ${(minBid / 100).toFixed(2)} MAD`,
      });
    }

    // Vérifier le solde du wallet
    const { data: wallet } = await supabase
      .from("ad_wallets")
      .select("id, balance_cents")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    const walletBalance = (wallet as any)?.balance_cents ?? 0;
    if (walletBalance < bidCents) {
      return res.status(400).json({
        error: `Solde insuffisant. Vous avez ${(walletBalance / 100).toFixed(2)} MAD`,
      });
    }

    // Vérifier si le jour est disponible
    const { data: existingEntry } = await supabase
      .from("ad_home_takeover_calendar")
      .select("id, status, winning_bid_cents, campaign_id")
      .eq("date", date)
      .maybeSingle();

    if (existingEntry) {
      const status = (existingEntry as any).status;
      if (status === "confirmed" || status === "blocked") {
        return res.status(400).json({ error: "Ce jour n'est plus disponible" });
      }

      // Si déjà réservé, vérifier si notre enchère est supérieure
      if (status === "reserved") {
        const currentBid = (existingEntry as any).winning_bid_cents ?? 0;
        if (bidCents <= currentBid) {
          return res.status(400).json({
            error: `Une enchère de ${(currentBid / 100).toFixed(2)} MAD existe déjà. Votre enchère doit être supérieure.`,
          });
        }
        // TODO: Notifier l'ancien enchérisseur qu'il a été surenchéri
      }
    }

    // Créer la campagne home_takeover
    const campaignId = randomUUID();
    const { error: campaignError } = await supabase.from("pro_campaigns").insert({
      id: campaignId,
      establishment_id: establishmentId,
      title,
      type: "home_takeover",
      status: "draft",
      moderation_status: "pending_review",
      billing_model: "cpd", // Cost per day
      bid_amount_cents: bidCents,
      budget_cents: bidCents,
      starts_at: `${date}T00:00:00.000Z`,
      ends_at: `${date}T23:59:59.999Z`,
      targeting: {
        banner_desktop_url: bannerDesktopUrl,
        banner_mobile_url: bannerMobileUrl,
        cta_text: ctaText,
        cta_url: ctaUrl,
      },
      created_by: proUser.id,
    });

    if (campaignError) {
      console.error("[proAds] Error creating campaign:", campaignError);
      return res.status(500).json({ error: "Erreur création campagne" });
    }

    // Mettre à jour ou créer l'entrée calendrier
    const calendarData = {
      date,
      campaign_id: campaignId,
      price_cents: bidCents,
      status: "reserved",
      winning_bid_cents: bidCents,
      updated_at: new Date().toISOString(),
    };

    if (existingEntry) {
      await supabase
        .from("ad_home_takeover_calendar")
        .update(calendarData)
        .eq("id", (existingEntry as any).id);
    } else {
      await supabase.from("ad_home_takeover_calendar").insert({
        ...calendarData,
        created_at: new Date().toISOString(),
      });
    }

    return res.json({
      ok: true,
      campaign_id: campaignId,
      date,
      bid_cents: bidCents,
      status: "reserved",
      message: "Réservation en attente de validation admin",
    });
  } catch (error) {
    console.error("[proAds] reserveHomeTakeoverDay error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// INVOICES
// =============================================================================

/**
 * GET /api/pro/establishments/:id/ads/invoices
 * Récupère les factures publicitaires d'un établissement
 */
export const getAdInvoices: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();
  const establishmentId = req.params.id;

  try {
    // Vérifier l'accès
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("establishment_id", establishmentId)
      .eq("user_id", userResult.user.id)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Récupérer les factures
    const { data: invoices, error } = await supabase
      .from("ad_invoices")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("issued_at", { ascending: false });

    if (error) {
      console.error("[proAds] Error fetching invoices:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    return res.json({
      ok: true,
      invoices: invoices ?? [],
    });
  } catch (error) {
    console.error("[proAds] getAdInvoices error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// REGISTER ROUTES
// =============================================================================

export function registerProAdsRoutes(app: Router) {
  // Wallet
  app.get("/api/pro/establishments/:id/ads/wallet", getWallet);
  app.get("/api/pro/establishments/:id/ads/wallet/transactions", getWalletTransactions);
  app.post("/api/pro/establishments/:id/ads/wallet/recharge", initiateWalletRecharge);

  // Campaigns
  app.get("/api/pro/establishments/:id/ads/campaigns", listCampaigns);
  app.get("/api/pro/establishments/:id/ads/campaigns/:campaignId", getCampaign);
  app.post("/api/pro/establishments/:id/ads/campaigns", createCampaign);
  app.patch("/api/pro/establishments/:id/ads/campaigns/:campaignId", updateCampaign);
  app.post("/api/pro/establishments/:id/ads/campaigns/:campaignId/submit", submitCampaign);
  app.delete("/api/pro/establishments/:id/ads/campaigns/:campaignId", deleteCampaign);

  // Config & Stats
  app.get("/api/pro/establishments/:id/ads/auction-config", getAuctionConfig);
  app.get("/api/pro/establishments/:id/ads/stats", getAdsStats);

  // Home Takeover Calendar
  app.get("/api/pro/establishments/:id/ads/home-takeover/calendar", getHomeTakeoverCalendar);
  app.post("/api/pro/establishments/:id/ads/home-takeover/reserve", reserveHomeTakeoverDay);

  // Invoices
  app.get("/api/pro/establishments/:id/ads/invoices", getAdInvoices);
}
