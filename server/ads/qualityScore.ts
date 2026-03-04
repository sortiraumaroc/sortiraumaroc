/**
 * Quality Score — Calcul dynamique du score de qualité des campagnes
 *
 * Le quality_score influence le classement dans les enchères :
 *   AuctionScore = Bid × QualityScore × CTRFactor
 *
 * Score de 0.5 à 2.0, calculé à partir de :
 *   - CTR historique (40%)
 *   - Taux de conversion (30%)
 *   - Pertinence ciblage (20%)
 *   - Ancienneté / fiabilité annonceur (10%)
 */

import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adsQualityScore");

// Uses AdminSupabase type passed from callers (getAdminSupabase())

// =============================================================================
// QUALITY SCORE COMPUTATION
// =============================================================================

interface QualityScoreFactors {
  ctr: number;           // Click-through rate
  conversionRate: number; // Conversion rate (reservations + pack purchases)
  targetingScore: number; // 0-1 based on targeting completeness
  advertiserAge: number;  // Days since first campaign
}

/**
 * Calcule le quality score d'une campagne (0.5 – 2.0).
 */
function computeQualityScore(factors: QualityScoreFactors): number {
  // CTR factor (40%) — benchmark 2%, excellent 5%+
  // CTR = 0% → 0, CTR = 2% → 0.5, CTR = 5% → 1.0
  const ctrNormalized = Math.min(factors.ctr / 0.05, 1.0);
  const ctrComponent = ctrNormalized * 0.4;

  // Conversion factor (30%) — benchmark 1%, excellent 5%+
  const convNormalized = Math.min(factors.conversionRate / 0.05, 1.0);
  const convComponent = convNormalized * 0.3;

  // Targeting completeness (20%) — more targeting = better score
  const targetingComponent = factors.targetingScore * 0.2;

  // Advertiser age (10%) — trust builds with time
  // 0 days = 0, 30 days = 0.5, 90+ days = 1.0
  const ageNormalized = Math.min(factors.advertiserAge / 90, 1.0);
  const ageComponent = ageNormalized * 0.1;

  // Raw score 0-1, mapped to 0.5-2.0
  const rawScore = ctrComponent + convComponent + targetingComponent + ageComponent;
  return Math.round((0.5 + rawScore * 1.5) * 100) / 100; // 2 decimal places
}

/**
 * Évalue la complétude du ciblage d'une campagne.
 */
function evaluateTargeting(targeting: Record<string, unknown> | null): number {
  if (!targeting) return 0.1; // Minimum score if no targeting

  let score = 0.1; // Base score

  if (Array.isArray(targeting.keywords) && targeting.keywords.length > 0) score += 0.25;
  if (Array.isArray(targeting.cities) && targeting.cities.length > 0) score += 0.25;
  if (Array.isArray(targeting.categories) && targeting.categories.length > 0) score += 0.2;
  if (Array.isArray(targeting.days_of_week) && targeting.days_of_week.length > 0) score += 0.1;
  if (Array.isArray(targeting.hours_of_day) && targeting.hours_of_day.length > 0) score += 0.1;

  return Math.min(score, 1.0);
}

// =============================================================================
// RECALCULATE ALL QUALITY SCORES (Cron)
// =============================================================================

/**
 * Recalcule le quality_score et le CTR de toutes les campagnes actives.
 * À exécuter quotidiennement (ex: 3h du matin).
 */
export async function recalculateQualityScores(
  supabase: any
): Promise<{ updated: number; errors: number }> {
  let updated = 0;
  let errors = 0;

  try {
    // Récupérer toutes les campagnes actives ou en pause (pas cancelled/completed)
    const { data: campaigns, error: fetchError } = await supabase
      .from("pro_campaigns")
      .select("id, establishment_id, type, targeting, created_at")
      .in("status", ["active", "paused", "draft"]);

    if (fetchError || !campaigns) {
      log.error({ err: fetchError }, "Error fetching campaigns");
      return { updated: 0, errors: 1 };
    }

    for (const campaign of campaigns) {
      try {
        const campaignId = (campaign as any).id;
        const establishmentId = (campaign as any).establishment_id;
        const targeting = (campaign as any).targeting;
        const createdAt = (campaign as any).created_at;

        // Récupérer les stats (30 derniers jours)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

        // Impressions count
        const { count: impressionCount } = await supabase
          .from("ad_impressions")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .gte("created_at", thirtyDaysAgo);

        // Valid clicks count
        const { count: clickCount } = await supabase
          .from("ad_clicks")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("is_valid", true)
          .gte("created_at", thirtyDaysAgo);

        // Conversions count
        const { count: conversionCount } = await supabase
          .from("ad_conversions")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .gte("created_at", thirtyDaysAgo);

        const impressions = impressionCount ?? 0;
        const clicks = clickCount ?? 0;
        const conversions = conversionCount ?? 0;

        // Calculer CTR
        const ctr = impressions > 0 ? clicks / impressions : 0;

        // Calculer conversion rate
        const conversionRate = clicks > 0 ? conversions / clicks : 0;

        // Évaluer le ciblage
        const targetingScore = evaluateTargeting(targeting);

        // Ancienneté de l'annonceur (jours depuis la première campagne de cet établissement)
        const { data: firstCampaign } = await supabase
          .from("pro_campaigns")
          .select("created_at")
          .eq("establishment_id", establishmentId)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        const firstDate = firstCampaign
          ? new Date((firstCampaign as any).created_at)
          : new Date(createdAt);
        const advertiserAge = Math.floor((Date.now() - firstDate.getTime()) / 86400000);

        // Calculer le quality score
        const qualityScore = computeQualityScore({
          ctr,
          conversionRate,
          targetingScore,
          advertiserAge,
        });

        // Mettre à jour la campagne
        const { error: updateError } = await supabase
          .from("pro_campaigns")
          .update({
            quality_score: qualityScore,
            ctr: Math.round(ctr * 10000) / 10000, // 4 decimal places
          })
          .eq("id", campaignId);

        if (updateError) {
          log.error({ err: updateError, campaignId }, "Error updating campaign");
          errors++;
        } else {
          updated++;
        }
      } catch (e) {
        log.error({ err: e }, "Error processing campaign");
        errors++;
      }
    }

    log.info({ updated, errors }, "Quality scores recalculated");
    return { updated, errors };
  } catch (e) {
    log.error({ err: e }, "Unexpected error in quality score recalculation");
    return { updated, errors: errors + 1 };
  }
}

// =============================================================================
// RECORD CONVERSION
// =============================================================================

/**
 * Enregistre une conversion publicitaire.
 * Appelé quand un utilisateur effectue une action valorisable (réservation, achat pack)
 * après avoir cliqué sur une pub (attribution window de 24h par défaut).
 */
export async function recordConversion(
  supabase: any,
  params: {
    userId: string;
    conversionType: "reservation" | "pack_purchase" | "page_view" | "contact";
    conversionValueCents?: number;
    entityType?: string;
    entityId?: string;
    establishmentId: string;
  }
): Promise<{ attributed: boolean; campaignId?: string }> {
  const { userId, conversionType, conversionValueCents, entityType, entityId, establishmentId } = params;
  const attributionWindowMs = 24 * 3600000; // 24h

  try {
    // Trouver le dernier clic valide de cet utilisateur sur une campagne de cet établissement
    const windowStart = new Date(Date.now() - attributionWindowMs).toISOString();

    const { data: recentClick } = await supabase
      .from("ad_clicks")
      .select("id, campaign_id, created_at")
      .eq("user_id", userId)
      .eq("is_valid", true)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recentClick) {
      return { attributed: false };
    }

    // Vérifier que la campagne appartient au même établissement
    const { data: campaign } = await supabase
      .from("pro_campaigns")
      .select("establishment_id")
      .eq("id", (recentClick as any).campaign_id)
      .single();

    if (!campaign || (campaign as any).establishment_id !== establishmentId) {
      return { attributed: false };
    }

    // Calculer le temps clic → conversion
    const clickTime = new Date((recentClick as any).created_at).getTime();
    const clickToConversionSeconds = Math.round((Date.now() - clickTime) / 1000);

    // Insérer la conversion
    const { error: insertError } = await supabase.from("ad_conversions").insert({
      click_id: (recentClick as any).id,
      campaign_id: (recentClick as any).campaign_id,
      conversion_type: conversionType,
      conversion_value_cents: conversionValueCents ?? null,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      user_id: userId,
      attribution_window_hours: 24,
      click_to_conversion_seconds: clickToConversionSeconds,
    });

    if (insertError) {
      log.error({ err: insertError }, "Error recording conversion");
      return { attributed: false };
    }

    // Mettre à jour le compteur de conversions de la campagne (best-effort)
    try {
      await supabase.rpc("increment_campaign_conversions", {
        p_campaign_id: (recentClick as any).campaign_id,
      });
    } catch (err) {
      log.warn({ err }, "Best-effort: increment_campaign_conversions RPC failed");
    }

    return { attributed: true, campaignId: (recentClick as any).campaign_id };
  } catch (e) {
    log.error({ err: e }, "recordConversion error");
    return { attributed: false };
  }
}
