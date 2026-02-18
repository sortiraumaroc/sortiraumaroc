/**
 * Routes publiques pour le système publicitaire
 *
 * - GET /api/public/ads/sponsored - Résultats sponsorisés pour une recherche
 * - GET /api/public/ads/featured-pack - Pack Mise en Avant pour la homepage
 * - POST /api/public/ads/impression - Tracker une impression
 * - POST /api/public/ads/click - Tracker un clic
 */

import type { RequestHandler, Router } from "express";
import { randomUUID } from "node:crypto";
import { getAdminSupabase } from "../supabaseAdmin";
import { adReadRateLimiter, adImpressionRateLimiter, adClickRateLimiter } from "../middleware/rateLimiter";

// =============================================================================
// HELPERS
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

function hashIP(ip: string): string {
  // Simple hash for privacy (in production, use crypto)
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// =============================================================================
// GET SPONSORED RESULTS
// =============================================================================

/**
 * GET /api/public/ads/sponsored
 * Récupère les résultats sponsorisés pour une recherche
 */
export const getSponsoredResults: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();

  const city = asString(req.query.city);
  const universe = asString(req.query.universe);
  const keywords = asString(req.query.q);
  const limit = Math.min(asNumber(req.query.limit) ?? 3, 5);

  try {
    // Récupérer les campagnes actives de type "sponsored_result"
    let query = supabase
      .from("pro_campaigns")
      .select(`
        id,
        establishment_id,
        title,
        bid_amount_cents,
        daily_budget_cents,
        daily_spent_cents,
        targeting,
        quality_score,
        ctr,
        establishments!inner(
          id,
          name,
          city,
          address,
          neighborhood,
          cover_url,
          subcategory,
          avg_rating,
          review_count,
          booking_enabled,
          lat,
          lng,
          status
        )
      `)
      .eq("type", "sponsored_result")
      .eq("status", "active")
      .eq("moderation_status", "approved");

    const { data: campaigns, error } = await query;

    if (error) {
      console.error("[publicAds] Error fetching sponsored campaigns:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    if (!campaigns || campaigns.length === 0) {
      return res.json({ ok: true, sponsored: [], total: 0 });
    }

    // Filtrer par ciblage (ville, mots-clés)
    const eligibleCampaigns = campaigns.filter((campaign) => {
      // Vérifier le budget quotidien
      if (campaign.daily_budget_cents && campaign.daily_spent_cents) {
        if (campaign.daily_spent_cents >= campaign.daily_budget_cents) {
          return false; // Budget quotidien épuisé
        }
      }

      const establishment = (campaign as any).establishments;
      if (!establishment || establishment.status !== "active") {
        return false;
      }

      const targeting = campaign.targeting as any;

      // Filtre par ville
      if (city && targeting?.cities?.length > 0) {
        const targetCities = (targeting.cities as string[]).map((c) => c.toLowerCase());
        if (!targetCities.includes(city.toLowerCase())) {
          return false;
        }
      }

      // Filtre par mots-clés
      if (keywords && targeting?.keywords?.length > 0) {
        const targetKeywords = (targeting.keywords as string[]).map((k) => k.toLowerCase());
        const searchKeywords = keywords.toLowerCase().split(/\s+/);
        const hasMatch = searchKeywords.some((sk) =>
          targetKeywords.some((tk) => tk.includes(sk) || sk.includes(tk))
        );
        if (!hasMatch) {
          return false;
        }
      }

      return true;
    });

    // Calculer le score d'enchères pour chaque campagne
    const scoredCampaigns = eligibleCampaigns.map((campaign) => {
      const bidCents = campaign.bid_amount_cents ?? 0;
      const qualityScore = campaign.quality_score ?? 1.0;
      const ctr = campaign.ctr ?? 0.01;

      // Score = Enchère × Score Qualité × Facteur CTR
      const ctrFactor = 1 + Math.log10(1 + ctr * 100);
      const auctionScore = bidCents * qualityScore * ctrFactor;

      return {
        ...campaign,
        auctionScore,
      };
    });

    // Trier par score d'enchères et limiter
    scoredCampaigns.sort((a, b) => b.auctionScore - a.auctionScore);
    const topCampaigns = scoredCampaigns.slice(0, limit);

    // Formater la réponse
    const sponsored = topCampaigns.map((campaign, position) => {
      const establishment = (campaign as any).establishments;

      return {
        campaign_id: campaign.id,
        position: position + 1,
        establishment: {
          id: establishment.id,
          name: establishment.name,
          city: establishment.city,
          address: establishment.address,
          neighborhood: establishment.neighborhood ?? null,
          cover_url: establishment.cover_url,
          subcategory: establishment.subcategory,
          avg_rating: establishment.avg_rating,
          review_count: establishment.review_count,
          booking_enabled: establishment.booking_enabled,
          lat: establishment.lat,
          lng: establishment.lng,
        },
        bid_amount_cents: campaign.bid_amount_cents,
      };
    });

    return res.json({
      ok: true,
      sponsored,
      total: sponsored.length,
    });
  } catch (error) {
    console.error("[publicAds] getSponsoredResults error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// GET FEATURED PACK (for homepage sections)
// =============================================================================

/**
 * GET /api/public/ads/featured-pack
 * Récupère un établissement mis en avant pour une section de la homepage
 * Utilise une sélection aléatoire pondérée par le score d'enchère
 */
export const getFeaturedPack: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();

  const section = asString(req.query.section) || "selected_for_you";
  const universe = asString(req.query.universe);
  const excludeIds = asString(req.query.exclude)?.split(",").filter(Boolean) || [];

  try {
    // Récupérer les campagnes actives de type "featured_pack"
    const { data: campaigns, error } = await supabase
      .from("pro_campaigns")
      .select(`
        id,
        establishment_id,
        title,
        bid_amount_cents,
        cpm_cents,
        daily_budget_cents,
        daily_spent_cents,
        targeting,
        quality_score,
        ctr,
        establishments!inner(
          id,
          name,
          slug,
          universe,
          city,
          address,
          neighborhood,
          cover_url,
          subcategory,
          avg_rating,
          review_count,
          booking_enabled,
          lat,
          lng,
          status
        )
      `)
      .eq("type", "featured_pack")
      .eq("status", "active")
      .eq("moderation_status", "approved");

    if (error) {
      console.error("[publicAds] Error fetching featured pack campaigns:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    if (!campaigns || campaigns.length === 0) {
      return res.json({ ok: true, featured: null });
    }

    // Filtrer les campagnes éligibles
    const eligibleCampaigns = campaigns.filter((campaign) => {
      // Vérifier le budget quotidien
      if (campaign.daily_budget_cents && campaign.daily_spent_cents) {
        if (campaign.daily_spent_cents >= campaign.daily_budget_cents) {
          return false;
        }
      }

      const establishment = (campaign as any).establishments;
      if (!establishment || establishment.status !== "active") {
        return false;
      }

      // Exclure les IDs déjà affichés
      if (excludeIds.includes(establishment.id)) {
        return false;
      }

      // Filtrer par univers si spécifié
      if (universe && establishment.universe !== universe) {
        return false;
      }

      const targeting = campaign.targeting as any;

      // Filtrer par section si ciblage défini
      if (targeting?.sections?.length > 0) {
        if (!targeting.sections.includes(section)) {
          return false;
        }
      }

      return true;
    });

    if (eligibleCampaigns.length === 0) {
      return res.json({ ok: true, featured: null });
    }

    // Calculer les scores pour la sélection pondérée
    const scoredCampaigns = eligibleCampaigns.map((campaign) => {
      const bidCents = campaign.cpm_cents ?? campaign.bid_amount_cents ?? 1000;
      const qualityScore = campaign.quality_score ?? 1.0;
      const ctr = campaign.ctr ?? 0.01;
      const ctrFactor = 1 + Math.log10(1 + ctr * 100);
      const score = bidCents * qualityScore * ctrFactor;

      return { campaign, score };
    });

    // Sélection aléatoire pondérée
    const totalScore = scoredCampaigns.reduce((sum, item) => sum + item.score, 0);
    let random = Math.random() * totalScore;
    let selectedCampaign = scoredCampaigns[0].campaign;

    for (const item of scoredCampaigns) {
      random -= item.score;
      if (random <= 0) {
        selectedCampaign = item.campaign;
        break;
      }
    }

    const establishment = (selectedCampaign as any).establishments;

    return res.json({
      ok: true,
      featured: {
        campaign_id: selectedCampaign.id,
        establishment: {
          id: establishment.id,
          slug: establishment.slug,
          name: establishment.name,
          universe: establishment.universe,
          city: establishment.city,
          address: establishment.address,
          neighborhood: establishment.neighborhood ?? null,
          cover_url: establishment.cover_url,
          subcategory: establishment.subcategory,
          avg_rating: establishment.avg_rating,
          review_count: establishment.review_count,
          booking_enabled: establishment.booking_enabled,
          lat: establishment.lat,
          lng: establishment.lng,
        },
        cpm_cents: selectedCampaign.cpm_cents ?? selectedCampaign.bid_amount_cents,
      },
    });
  } catch (error) {
    console.error("[publicAds] getFeaturedPack error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// TRACK IMPRESSION
// =============================================================================

/**
 * POST /api/public/ads/impression
 * Tracker une impression publicitaire
 */
export const trackImpression: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();
  const { campaign_id, position, search_query, user_id } = req.body;

  if (!campaign_id) {
    return res.status(400).json({ error: "campaign_id requis" });
  }

  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket.remoteAddress || "";
  const userAgent = req.headers["user-agent"] || "";

  try {
    const impressionId = randomUUID();

    await supabase.from("ad_impressions").insert({
      id: impressionId,
      campaign_id,
      user_id: user_id || null,
      position: position ?? null,
      search_query: search_query || null,
      ip_hash: hashIP(ip),
      user_agent: userAgent.substring(0, 500),
    });

    return res.json({ ok: true, impression_id: impressionId });
  } catch (error) {
    console.error("[publicAds] trackImpression error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// TRACK CLICK
// =============================================================================

/**
 * POST /api/public/ads/click
 * Tracker un clic publicitaire
 */
export const trackClick: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();
  const { campaign_id, impression_id, user_id, destination_url } = req.body;

  if (!campaign_id) {
    return res.status(400).json({ error: "campaign_id requis" });
  }

  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket.remoteAddress || "";
  const userAgent = req.headers["user-agent"] || "";
  const ipHash = hashIP(ip);

  try {
    // Vérification anti-fraude basique
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count: recentClicks } = await supabase
      .from("ad_clicks")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("ip_hash", ipHash)
      .gte("created_at", oneHourAgo);

    const isValid = (recentClicks ?? 0) < 3; // Max 3 clics par IP par heure par campagne

    // Récupérer l'enchère de la campagne pour calculer le coût
    const { data: campaign } = await supabase
      .from("pro_campaigns")
      .select("bid_amount_cents, billing_model, establishment_id")
      .eq("id", campaign_id)
      .single();

    const costCents = campaign?.billing_model === "cpc" && isValid ? (campaign.bid_amount_cents ?? 0) : 0;
    const clickId = randomUUID();

    // Insérer le clic
    await supabase.from("ad_clicks").insert({
      id: clickId,
      campaign_id,
      impression_id: impression_id || null,
      user_id: user_id || null,
      ip_hash: ipHash,
      user_agent: userAgent.substring(0, 500),
      destination_url: destination_url || null,
      cost_cents: costCents,
      is_valid: isValid,
      is_billable: isValid && costCents > 0,
      fraud_signals: isValid ? null : { reason: "rate_limit_exceeded" },
    });

    // Si le clic est facturable, mettre à jour le wallet et les dépenses
    if (isValid && costCents > 0 && campaign?.establishment_id) {
      // Débiter le wallet
      await supabase.rpc("debit_ad_wallet", {
        p_establishment_id: campaign.establishment_id,
        p_amount: costCents,
        p_transaction_type: "click_charge",
        p_reference_id: clickId,
        p_description: `Clic campagne ${campaign_id}`,
      });

      // Mettre à jour les dépenses de la campagne
      await supabase
        .from("pro_campaigns")
        .update({
          spent_cents: supabase.rpc("increment", { x: costCents }),
          daily_spent_cents: supabase.rpc("increment", { x: costCents }),
        })
        .eq("id", campaign_id);
    }

    return res.json({
      ok: true,
      click_id: clickId,
      is_valid: isValid,
    });
  } catch (error) {
    console.error("[publicAds] trackClick error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// TRACK CONVERSION
// =============================================================================

/**
 * POST /api/public/ads/conversion
 * Enregistre une conversion publicitaire (réservation, achat pack, etc.)
 */
export const trackConversion: RequestHandler = async (req, res) => {
  const { user_id, conversion_type, conversion_value_cents, entity_type, entity_id, establishment_id } = req.body;

  if (!user_id || !conversion_type || !establishment_id) {
    return res.status(400).json({ error: "user_id, conversion_type et establishment_id requis" });
  }

  const validTypes = ["reservation", "pack_purchase", "page_view", "contact"];
  if (!validTypes.includes(conversion_type)) {
    return res.status(400).json({ error: `conversion_type invalide. Attendu: ${validTypes.join(", ")}` });
  }

  try {
    const { recordConversion } = await import("../ads/qualityScore");
    const supabase = getAdminSupabase();

    const result = await recordConversion(supabase, {
      userId: user_id,
      conversionType: conversion_type,
      conversionValueCents: conversion_value_cents,
      entityType: entity_type,
      entityId: entity_id,
      establishmentId: establishment_id,
    });

    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[publicAds] trackConversion error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

// =============================================================================
// GET HOME TAKEOVER (today's homepage takeover)
// =============================================================================

/**
 * GET /api/public/ads/home-takeover
 * Récupère l'habillage homepage du jour (si actif)
 */
export const getHomeTakeover: RequestHandler = async (req, res) => {
  const supabase = getAdminSupabase();
  const today = new Date().toISOString().split("T")[0];

  try {
    // Chercher une entrée confirmée pour aujourd'hui
    const { data: entry } = await supabase
      .from("ad_home_takeover_calendar")
      .select(`
        id,
        date,
        campaign_id,
        campaign:pro_campaigns(
          id,
          title,
          targeting,
          status,
          moderation_status,
          establishment_id,
          establishment:establishments(
            id,
            name,
            slug,
            cover_url
          )
        )
      `)
      .eq("date", today)
      .eq("status", "confirmed")
      .maybeSingle();

    if (!entry || !(entry as any).campaign) {
      return res.json({ ok: true, takeover: null });
    }

    const campaign = (entry as any).campaign;
    const establishment = campaign.establishment;
    const targeting = campaign.targeting ?? {};

    // Vérifier que la campagne est active
    if (campaign.status !== "active" || campaign.moderation_status !== "approved") {
      return res.json({ ok: true, takeover: null });
    }

    return res.json({
      ok: true,
      takeover: {
        campaign_id: campaign.id,
        title: campaign.title,
        banner_desktop_url: targeting.banner_desktop_url ?? null,
        banner_mobile_url: targeting.banner_mobile_url ?? null,
        cta_text: targeting.cta_text ?? null,
        cta_url: targeting.cta_url ?? null,
        establishment: establishment
          ? {
              id: establishment.id,
              name: establishment.name,
              slug: establishment.slug,
              cover_url: establishment.cover_url,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[publicAds] getHomeTakeover error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};

export function registerPublicAdsRoutes(app: Router) {
  app.get("/api/public/ads/sponsored", adReadRateLimiter, getSponsoredResults);
  app.get("/api/public/ads/featured-pack", adReadRateLimiter, getFeaturedPack);
  app.get("/api/public/ads/home-takeover", adReadRateLimiter, getHomeTakeover);
  app.post("/api/public/ads/impression", adImpressionRateLimiter, trackImpression);
  app.post("/api/public/ads/click", adClickRateLimiter, trackClick);
  app.post("/api/public/ads/conversion", adClickRateLimiter, trackConversion);
}
