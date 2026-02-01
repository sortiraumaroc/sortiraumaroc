/**
 * Routes publiques pour le système publicitaire
 *
 * - GET /api/public/ads/sponsored - Résultats sponsorisés pour une recherche
 * - POST /api/public/ads/impression - Tracker une impression
 * - POST /api/public/ads/click - Tracker un clic
 */

import type { RequestHandler, Router } from "express";
import { randomUUID } from "node:crypto";
import { getAdminSupabase } from "../supabaseAdmin";

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
// REGISTER ROUTES
// =============================================================================

export function registerPublicAdsRoutes(app: Router) {
  app.get("/api/public/ads/sponsored", getSponsoredResults);
  app.post("/api/public/ads/impression", trackImpression);
  app.post("/api/public/ads/click", trackClick);
}
