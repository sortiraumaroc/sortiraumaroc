/**
 * Routes API ADMIN - Système Publicitaire
 *
 * Endpoints pour :
 * - Modération des campagnes
 * - Configuration des enchères
 * - Dashboard revenus
 * - Gestion globale
 */

import type { Router } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import type { AdCampaign, AdModerationStatus } from "../ads/types";

// =============================================================================
// TYPES & HELPERS
// =============================================================================

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// =============================================================================
// MODÉRATION
// =============================================================================

/**
 * GET /api/admin/ads/moderation/queue
 * Récupère la file de modération (campagnes en attente)
 */
export const getModerationQueue: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();

  try {
    const { data: campaigns, error } = await supabase
      .from("pro_campaigns")
      .select(`
        id,
        establishment_id,
        type,
        title,
        budget,
        bid_amount_cents,
        targeting,
        moderation_status,
        submitted_at,
        created_at,
        establishments!inner(name)
      `)
      .in("moderation_status", ["pending_review", "changes_requested"])
      .order("submitted_at", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("[adminAds] Error fetching moderation queue:", error);
      return res.status(500).json({ error: "Erreur récupération file" });
    }

    // Compter les créatives par campagne
    const campaignIds = campaigns?.map(c => c.id) ?? [];
    const { data: creativeCounts } = await supabase
      .from("ad_creatives")
      .select("campaign_id")
      .in("campaign_id", campaignIds);

    const creativeCountMap: Record<string, number> = {};
    for (const c of creativeCounts ?? []) {
      creativeCountMap[c.campaign_id] = (creativeCountMap[c.campaign_id] ?? 0) + 1;
    }

    const enrichedCampaigns = (campaigns ?? []).map(c => ({
      ...c,
      establishment_name: (c as any).establishments?.name ?? "N/A",
      creative_count: creativeCountMap[c.id] ?? 0,
    }));

    return res.json({
      ok: true,
      queue: enrichedCampaigns,
      total: enrichedCampaigns.length,
    });
  } catch (error) {
    console.error("[adminAds] getModerationQueue error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * GET /api/admin/ads/campaigns/:campaignId
 * Récupère les détails d'une campagne pour modération
 */
export const getCampaignForModeration: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();
  const campaignId = req.params.campaignId;

  try {
    // Campagne avec établissement
    const { data: campaign, error } = await supabase
      .from("pro_campaigns")
      .select(`
        *,
        establishments!inner(id, name, slug, cover_url, city)
      `)
      .eq("id", campaignId)
      .single();

    if (error || !campaign) {
      return res.status(404).json({ error: "Campagne introuvable" });
    }

    // Créatives
    const { data: creatives } = await supabase
      .from("ad_creatives")
      .select("*")
      .eq("campaign_id", campaignId);

    // Logs de modération
    const { data: moderationLogs } = await supabase
      .from("ad_moderation_logs")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Wallet de l'établissement
    const { data: wallet } = await supabase
      .from("ad_wallets")
      .select("balance_cents")
      .eq("establishment_id", campaign.establishment_id)
      .maybeSingle();

    return res.json({
      ok: true,
      campaign: {
        ...campaign,
        establishment: (campaign as any).establishments,
      },
      creatives: creatives ?? [],
      moderation_logs: moderationLogs ?? [],
      wallet_balance_cents: wallet?.balance_cents ?? 0,
    });
  } catch (error) {
    console.error("[adminAds] getCampaignForModeration error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/admin/ads/campaigns/:campaignId/moderate
 * Modère une campagne (approve, reject, request_changes)
 */
export const moderateCampaign: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();
  const campaignId = req.params.campaignId;
  const adminUser = (req as any).adminUser;
  const { action, rejection_reason, admin_notes } = req.body;

  if (!adminUser?.id) {
    return res.status(401).json({ error: "Admin non authentifié" });
  }

  if (!["approve", "reject", "request_changes"].includes(action)) {
    return res.status(400).json({ error: "Action invalide" });
  }

  try {
    // Récupérer la campagne
    const { data: campaign, error: fetchError } = await supabase
      .from("pro_campaigns")
      .select("moderation_status, establishment_id, title")
      .eq("id", campaignId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({ error: "Campagne introuvable" });
    }

    // Vérifier qu'elle peut être modérée
    if (!["pending_review", "changes_requested"].includes(campaign.moderation_status)) {
      return res.status(400).json({
        error: "Cette campagne ne peut pas être modérée. Statut: " + campaign.moderation_status,
      });
    }

    // Déterminer les nouveaux statuts
    let newModerationStatus: AdModerationStatus;
    let newStatus: string;

    switch (action) {
      case "approve":
        newModerationStatus = "approved";
        newStatus = "active";
        break;
      case "reject":
        if (!rejection_reason?.trim()) {
          return res.status(400).json({ error: "Motif de rejet requis" });
        }
        newModerationStatus = "rejected";
        newStatus = "cancelled";
        break;
      case "request_changes":
        if (!rejection_reason?.trim()) {
          return res.status(400).json({ error: "Détail des modifications requises" });
        }
        newModerationStatus = "changes_requested";
        newStatus = "draft";
        break;
      default:
        return res.status(400).json({ error: "Action invalide" });
    }

    // Mettre à jour la campagne
    const updates: Record<string, any> = {
      moderation_status: newModerationStatus,
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminUser.id,
    };

    if (rejection_reason) {
      updates.rejection_reason = rejection_reason.trim();
    }

    if (admin_notes) {
      updates.admin_notes = admin_notes.trim();
    }

    const { data: updated, error: updateError } = await supabase
      .from("pro_campaigns")
      .update(updates)
      .eq("id", campaignId)
      .select()
      .single();

    if (updateError) {
      console.error("[adminAds] Error moderating campaign:", updateError);
      return res.status(500).json({ error: "Erreur modération" });
    }

    // Créer un log
    await supabase.from("ad_moderation_logs").insert({
      campaign_id: campaignId,
      admin_user_id: adminUser.id,
      action: action === "approve" ? "approved" : action === "reject" ? "rejected" : "changes_requested",
      previous_status: campaign.moderation_status,
      new_status: newModerationStatus,
      notes: rejection_reason || admin_notes || null,
    });

    // TODO: Notifier le PRO par email

    return res.json({ ok: true, campaign: updated });
  } catch (error) {
    console.error("[adminAds] moderateCampaign error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// GESTION CAMPAGNES
// =============================================================================

/**
 * GET /api/admin/ads/campaigns
 * Liste toutes les campagnes (avec filtres)
 */
export const listAllCampaigns: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();

  const status = asString(req.query.status);
  const moderationStatus = asString(req.query.moderation_status);
  const type = asString(req.query.type);
  const establishmentId = asString(req.query.establishment_id);
  const search = asString(req.query.search);
  const limit = Math.min(asNumber(req.query.limit) ?? 50, 100);
  const offset = asNumber(req.query.offset) ?? 0;

  try {
    let query = supabase
      .from("pro_campaigns")
      .select(`
        *,
        establishments!inner(id, name)
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (moderationStatus) {
      query = query.eq("moderation_status", moderationStatus);
    }

    if (type) {
      query = query.eq("type", type);
    }

    if (establishmentId) {
      query = query.eq("establishment_id", establishmentId);
    }

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }

    const { data: campaigns, error, count } = await query;

    if (error) {
      console.error("[adminAds] Error listing campaigns:", error);
      return res.status(500).json({ error: "Erreur récupération campagnes" });
    }

    const enriched = (campaigns ?? []).map(c => ({
      ...c,
      establishment_name: (c as any).establishments?.name ?? "N/A",
    }));

    return res.json({
      ok: true,
      campaigns: enriched,
      total: count ?? 0,
    });
  } catch (error) {
    console.error("[adminAds] listAllCampaigns error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/admin/ads/campaigns/:campaignId/pause
 * Met en pause une campagne active
 */
export const pauseCampaign: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();
  const campaignId = req.params.campaignId;
  const adminUser = (req as any).adminUser;

  try {
    const { data: campaign, error: fetchError } = await supabase
      .from("pro_campaigns")
      .select("status")
      .eq("id", campaignId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({ error: "Campagne introuvable" });
    }

    if (campaign.status !== "active") {
      return res.status(400).json({ error: "La campagne n'est pas active" });
    }

    const { data: updated, error: updateError } = await supabase
      .from("pro_campaigns")
      .update({ status: "paused" })
      .eq("id", campaignId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: "Erreur mise en pause" });
    }

    // Log
    await supabase.from("ad_moderation_logs").insert({
      campaign_id: campaignId,
      admin_user_id: adminUser?.id ?? "system",
      action: "paused",
      previous_status: "active",
      new_status: "paused",
    });

    return res.json({ ok: true, campaign: updated });
  } catch (error) {
    console.error("[adminAds] pauseCampaign error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * POST /api/admin/ads/campaigns/:campaignId/resume
 * Reprend une campagne en pause
 */
export const resumeCampaign: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();
  const campaignId = req.params.campaignId;
  const adminUser = (req as any).adminUser;

  try {
    const { data: campaign, error: fetchError } = await supabase
      .from("pro_campaigns")
      .select("status, moderation_status")
      .eq("id", campaignId)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({ error: "Campagne introuvable" });
    }

    if (campaign.status !== "paused") {
      return res.status(400).json({ error: "La campagne n'est pas en pause" });
    }

    if (campaign.moderation_status !== "approved") {
      return res.status(400).json({ error: "La campagne n'est pas approuvée" });
    }

    const { data: updated, error: updateError } = await supabase
      .from("pro_campaigns")
      .update({ status: "active" })
      .eq("id", campaignId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: "Erreur reprise" });
    }

    // Log
    await supabase.from("ad_moderation_logs").insert({
      campaign_id: campaignId,
      admin_user_id: adminUser?.id ?? "system",
      action: "resumed",
      previous_status: "paused",
      new_status: "active",
    });

    return res.json({ ok: true, campaign: updated });
  } catch (error) {
    console.error("[adminAds] resumeCampaign error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// CONFIGURATION ENCHÈRES
// =============================================================================

/**
 * GET /api/admin/ads/auction-config
 * Récupère toute la configuration des enchères
 */
export const getAuctionConfigs: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();

  try {
    const { data: configs, error } = await supabase
      .from("ad_auction_config")
      .select("*")
      .order("product_type");

    if (error) {
      console.error("[adminAds] Error fetching auction configs:", error);
      return res.status(500).json({ error: "Erreur récupération configuration" });
    }

    return res.json({ ok: true, configs: configs ?? [] });
  } catch (error) {
    console.error("[adminAds] getAuctionConfigs error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * PATCH /api/admin/ads/auction-config/:productType
 * Met à jour la configuration d'enchères pour un type de produit
 */
export const updateAuctionConfig: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();
  const productType = req.params.productType;
  const adminUser = (req as any).adminUser;
  const body = req.body;

  try {
    const updates: Record<string, any> = {};

    if (body.min_bid_cents !== undefined) {
      updates.min_bid_cents = asNumber(body.min_bid_cents);
    }

    if (body.suggested_bid_cents !== undefined) {
      updates.suggested_bid_cents = asNumber(body.suggested_bid_cents);
    }

    if (body.max_bid_cents !== undefined) {
      updates.max_bid_cents = body.max_bid_cents === null ? null : asNumber(body.max_bid_cents);
    }

    if (body.demand_multiplier !== undefined) {
      updates.demand_multiplier = asNumber(body.demand_multiplier);
    }

    if (body.min_budget_cents !== undefined) {
      updates.min_budget_cents = asNumber(body.min_budget_cents);
    }

    if (body.min_daily_budget_cents !== undefined) {
      updates.min_daily_budget_cents = body.min_daily_budget_cents === null ? null : asNumber(body.min_daily_budget_cents);
    }

    if (body.max_positions !== undefined) {
      updates.max_positions = body.max_positions === null ? null : asNumber(body.max_positions);
    }

    if (body.is_active !== undefined) {
      updates.is_active = !!body.is_active;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Aucune mise à jour fournie" });
    }

    updates.updated_at = new Date().toISOString();
    updates.updated_by = adminUser?.id ?? null;

    const { data: updated, error } = await supabase
      .from("ad_auction_config")
      .update(updates)
      .eq("product_type", productType)
      .select()
      .single();

    if (error) {
      console.error("[adminAds] Error updating auction config:", error);
      return res.status(500).json({ error: "Erreur mise à jour configuration" });
    }

    return res.json({ ok: true, config: updated });
  } catch (error) {
    console.error("[adminAds] updateAuctionConfig error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// DASHBOARD REVENUS
// =============================================================================

/**
 * GET /api/admin/ads/revenue
 * Récupère les statistiques de revenus
 */
export const getRevenueStats: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();

  const period = asString(req.query.period) || "month"; // day, week, month
  const startDate = asString(req.query.start_date);
  const endDate = asString(req.query.end_date);

  try {
    // Déterminer la période
    let since: Date;
    if (startDate) {
      since = new Date(startDate);
    } else {
      since = new Date();
      if (period === "day") {
        since.setDate(since.getDate() - 1);
      } else if (period === "week") {
        since.setDate(since.getDate() - 7);
      } else {
        since.setMonth(since.getMonth() - 1);
      }
    }

    const until = endDate ? new Date(endDate) : new Date();

    // Clics avec revenus
    const { data: clicks, error: clicksError } = await supabase
      .from("ad_clicks")
      .select(`
        cost_cents,
        created_at,
        campaign_id,
        pro_campaigns!inner(type, establishment_id)
      `)
      .eq("is_billable", true)
      .eq("is_valid", true)
      .gte("created_at", since.toISOString())
      .lte("created_at", until.toISOString());

    if (clicksError) {
      console.error("[adminAds] Error fetching revenue data:", clicksError);
      return res.status(500).json({ error: "Erreur récupération revenus" });
    }

    // Calculer les totaux
    const totalRevenue = clicks?.reduce((sum, c) => sum + (c.cost_cents ?? 0), 0) ?? 0;
    const totalClicks = clicks?.length ?? 0;

    // Par type de campagne
    const byType: Record<string, { revenue: number; clicks: number }> = {};
    for (const click of clicks ?? []) {
      const type = (click as any).pro_campaigns?.type ?? "unknown";
      if (!byType[type]) {
        byType[type] = { revenue: 0, clicks: 0 };
      }
      byType[type].revenue += click.cost_cents ?? 0;
      byType[type].clicks++;
    }

    // Par jour
    const byDay: Record<string, { revenue: number; clicks: number }> = {};
    for (const click of clicks ?? []) {
      const day = new Date(click.created_at).toISOString().split("T")[0];
      if (!byDay[day]) {
        byDay[day] = { revenue: 0, clicks: 0 };
      }
      byDay[day].revenue += click.cost_cents ?? 0;
      byDay[day].clicks++;
    }

    // Top annonceurs
    const byEstablishment: Record<string, { spent: number; campaigns: Set<string> }> = {};
    for (const click of clicks ?? []) {
      const estId = (click as any).pro_campaigns?.establishment_id;
      if (!estId) continue;
      if (!byEstablishment[estId]) {
        byEstablishment[estId] = { spent: 0, campaigns: new Set() };
      }
      byEstablishment[estId].spent += click.cost_cents ?? 0;
      byEstablishment[estId].campaigns.add(click.campaign_id);
    }

    // Récupérer les noms des établissements top
    const topEstablishmentIds = Object.entries(byEstablishment)
      .sort((a, b) => b[1].spent - a[1].spent)
      .slice(0, 10)
      .map(([id]) => id);

    const { data: establishments } = await supabase
      .from("establishments")
      .select("id, name")
      .in("id", topEstablishmentIds);

    const establishmentNames: Record<string, string> = {};
    for (const e of establishments ?? []) {
      establishmentNames[e.id] = e.name;
    }

    const topAdvertisers = Object.entries(byEstablishment)
      .sort((a, b) => b[1].spent - a[1].spent)
      .slice(0, 10)
      .map(([id, data]) => ({
        establishment_id: id,
        establishment_name: establishmentNames[id] ?? "N/A",
        spent_cents: data.spent,
        campaign_count: data.campaigns.size,
      }));

    return res.json({
      ok: true,
      stats: {
        period,
        start_date: since.toISOString(),
        end_date: until.toISOString(),
        total_revenue_cents: totalRevenue,
        total_clicks: totalClicks,
        by_campaign_type: Object.entries(byType).map(([type, data]) => ({
          type,
          revenue_cents: data.revenue,
          clicks: data.clicks,
        })),
        by_day: Object.entries(byDay)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, data]) => ({
            date,
            revenue_cents: data.revenue,
            clicks: data.clicks,
          })),
        top_advertisers: topAdvertisers,
      },
    });
  } catch (error) {
    console.error("[adminAds] getRevenueStats error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

/**
 * GET /api/admin/ads/overview
 * Vue d'ensemble rapide pour le dashboard admin
 */
export const getAdsOverview: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();

  try {
    // Campagnes en attente
    const { count: pendingCount } = await supabase
      .from("pro_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("moderation_status", "pending_review");

    // Campagnes actives
    const { count: activeCount } = await supabase
      .from("pro_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .eq("moderation_status", "approved");

    // Revenus aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayClicks } = await supabase
      .from("ad_clicks")
      .select("cost_cents")
      .eq("is_billable", true)
      .eq("is_valid", true)
      .gte("created_at", today.toISOString());

    const todayRevenue = todayClicks?.reduce((sum, c) => sum + (c.cost_cents ?? 0), 0) ?? 0;

    // Revenus ce mois
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: monthClicks } = await supabase
      .from("ad_clicks")
      .select("cost_cents")
      .eq("is_billable", true)
      .eq("is_valid", true)
      .gte("created_at", startOfMonth.toISOString());

    const monthRevenue = monthClicks?.reduce((sum, c) => sum + (c.cost_cents ?? 0), 0) ?? 0;

    // Total wallets
    const { data: wallets } = await supabase
      .from("ad_wallets")
      .select("balance_cents");

    const totalWalletBalance = wallets?.reduce((sum, w) => sum + (w.balance_cents ?? 0), 0) ?? 0;

    return res.json({
      ok: true,
      overview: {
        pending_moderation: pendingCount ?? 0,
        active_campaigns: activeCount ?? 0,
        today_revenue_cents: todayRevenue,
        month_revenue_cents: monthRevenue,
        total_wallet_balance_cents: totalWalletBalance,
      },
    });
  } catch (error) {
    console.error("[adminAds] getAdsOverview error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// REGISTER ROUTES
// =============================================================================

export function registerAdminAdsRoutes(app: Router) {
  // Modération
  app.get("/api/admin/ads/moderation/queue", getModerationQueue);
  app.get("/api/admin/ads/campaigns/:campaignId", getCampaignForModeration);
  app.post("/api/admin/ads/campaigns/:campaignId/moderate", moderateCampaign);

  // Gestion campagnes
  app.get("/api/admin/ads/campaigns", listAllCampaigns);
  app.post("/api/admin/ads/campaigns/:campaignId/pause", pauseCampaign);
  app.post("/api/admin/ads/campaigns/:campaignId/resume", resumeCampaign);

  // Configuration
  app.get("/api/admin/ads/auction-config", getAuctionConfigs);
  app.patch("/api/admin/ads/auction-config/:productType", updateAuctionConfig);

  // Dashboard
  app.get("/api/admin/ads/revenue", getRevenueStats);
  app.get("/api/admin/ads/overview", getAdsOverview);
}
