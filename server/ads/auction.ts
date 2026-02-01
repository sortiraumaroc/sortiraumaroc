/**
 * Algorithme d'enchères pour les campagnes publicitaires
 */

import type { AdCampaign, SponsoredResult, AdAuctionConfig } from './types';

// =============================================================================
// CONFIGURATION PAR DÉFAUT
// =============================================================================

const DEFAULT_CONFIG: Record<string, Partial<AdAuctionConfig>> = {
  sponsored_results: {
    min_bid_cents: 200,     // 2 MAD minimum
    suggested_bid_cents: 300,
    max_positions: 3,
    min_budget_cents: 50000, // 500 MAD
  },
  featured_pack: {
    min_bid_cents: 1000,    // 10 MAD / 1000 impressions
    suggested_bid_cents: 2000,
    min_budget_cents: 100000, // 1000 MAD
  },
  home_takeover: {
    min_bid_cents: 50000,   // 500 MAD / jour minimum
    suggested_bid_cents: 100000,
    min_budget_cents: 500000,
    max_positions: 1,
  },
};

// =============================================================================
// CALCUL DU SCORE D'ENCHÈRE
// =============================================================================

/**
 * Calcule le score de classement d'une campagne pour l'algorithme d'enchères.
 *
 * Score = Enchère × Quality Score × CTR Factor
 *
 * Cela permet aux annonceurs avec de meilleurs contenus (quality score élevé)
 * et de meilleurs taux de clics de payer moins cher pour la même position.
 */
export function calculateAuctionScore(campaign: AdCampaign): number {
  const bid = campaign.bid_amount_cents ?? campaign.cpc_cents ?? 200;
  const qualityScore = campaign.quality_score ?? 1.0;
  const ctr = campaign.ctr ?? 0;

  // CTR factor: boost les campagnes avec un bon CTR historique
  // Si CTR = 0, factor = 1. Si CTR = 5%, factor = 1.5
  const ctrFactor = 1 + (ctr * 10);

  return bid * qualityScore * ctrFactor;
}

// =============================================================================
// SÉLECTION DES RÉSULTATS SPONSORISÉS
// =============================================================================

export interface SelectSponsoredResultsParams {
  campaigns: AdCampaign[];
  searchQuery?: string;
  city?: string;
  category?: string;
  limit?: number;
}

/**
 * Sélectionne les campagnes sponsorisées à afficher pour une recherche donnée.
 *
 * 1. Filtre les campagnes éligibles (active, approuvée, budget restant)
 * 2. Applique le ciblage (mots-clés, ville, catégorie)
 * 3. Calcule le score de chaque campagne
 * 4. Retourne les top N par score
 */
export function selectSponsoredResults(
  params: SelectSponsoredResultsParams
): SponsoredResult[] {
  const { campaigns, searchQuery, city, category, limit = 3 } = params;
  const now = new Date();

  // 1. Filtrer les campagnes éligibles
  const eligible = campaigns.filter(c => {
    // Type correct
    if (c.type !== 'sponsored_results') return false;

    // Statuts
    if (c.status !== 'active') return false;
    if (c.moderation_status !== 'approved') return false;

    // Dates
    if (c.starts_at && new Date(c.starts_at) > now) return false;
    if (c.ends_at && new Date(c.ends_at) <= now) return false;

    // Budget
    const minBid = c.bid_amount_cents ?? c.cpc_cents ?? 200;
    if (c.remaining_cents < minBid) return false;

    // Budget quotidien
    if (c.daily_budget_cents && c.daily_spent_cents >= c.daily_budget_cents) return false;

    return true;
  });

  // 2. Appliquer le ciblage
  const targeted = eligible.filter(c => {
    const targeting = c.targeting ?? {};

    // Ciblage par mots-clés
    if (searchQuery && targeting.keywords?.length) {
      const queryLower = searchQuery.toLowerCase();
      const hasMatchingKeyword = targeting.keywords.some(
        kw => queryLower.includes(kw.toLowerCase())
      );
      if (!hasMatchingKeyword) return false;
    }

    // Ciblage par ville
    if (city && targeting.cities?.length) {
      const cityLower = city.toLowerCase();
      const hasMatchingCity = targeting.cities.some(
        c => c.toLowerCase() === cityLower
      );
      if (!hasMatchingCity) return false;
    }

    // Ciblage par catégorie
    if (category && targeting.categories?.length) {
      const categoryLower = category.toLowerCase();
      const hasMatchingCategory = targeting.categories.some(
        cat => cat.toLowerCase() === categoryLower
      );
      if (!hasMatchingCategory) return false;
    }

    return true;
  });

  // 3. Calculer les scores et trier
  const scored = targeted.map(c => ({
    campaign: c,
    score: calculateAuctionScore(c),
  }));

  scored.sort((a, b) => b.score - a.score);

  // 4. Retourner les top N avec position
  return scored.slice(0, limit).map((item, index) => ({
    campaign_id: item.campaign.id,
    establishment_id: item.campaign.establishment_id,
    bid_amount_cents: item.campaign.bid_amount_cents ?? item.campaign.cpc_cents ?? 200,
    score: item.score,
    position: index + 1,
  }));
}

// =============================================================================
// SÉLECTION PACK MISE EN AVANT (RANDOM)
// =============================================================================

export interface SelectFeaturedPackParams {
  campaigns: AdCampaign[];
  section: string; // 'best_offers', 'selected_for_you', 'nearby', 'most_booked'
  excludeEstablishmentIds?: string[];
}

/**
 * Sélectionne UNE campagne "Pack mise en avant" de manière aléatoire pondérée.
 * La pondération est basée sur le score d'enchère.
 */
export function selectFeaturedPack(
  params: SelectFeaturedPackParams
): SponsoredResult | null {
  const { campaigns, section, excludeEstablishmentIds = [] } = params;
  const now = new Date();

  // Filtrer les campagnes éligibles
  const eligible = campaigns.filter(c => {
    if (c.type !== 'featured_pack') return false;
    if (c.status !== 'active') return false;
    if (c.moderation_status !== 'approved') return false;
    if (c.starts_at && new Date(c.starts_at) > now) return false;
    if (c.ends_at && new Date(c.ends_at) <= now) return false;
    if (c.remaining_cents < (c.cpm_cents ?? 1000) / 1000) return false; // Au moins 1 impression possible
    if (excludeEstablishmentIds.includes(c.establishment_id)) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  // Calculer les scores
  const scored = eligible.map(c => ({
    campaign: c,
    score: calculateAuctionScore(c),
  }));

  // Sélection aléatoire pondérée
  const totalScore = scored.reduce((sum, item) => sum + item.score, 0);
  let random = Math.random() * totalScore;

  for (const item of scored) {
    random -= item.score;
    if (random <= 0) {
      return {
        campaign_id: item.campaign.id,
        establishment_id: item.campaign.establishment_id,
        bid_amount_cents: item.campaign.cpm_cents ?? 1000,
        score: item.score,
        position: 1,
      };
    }
  }

  // Fallback au premier
  const first = scored[0];
  return {
    campaign_id: first.campaign.id,
    establishment_id: first.campaign.establishment_id,
    bid_amount_cents: first.campaign.cpm_cents ?? 1000,
    score: first.score,
    position: 1,
  };
}

// =============================================================================
// CALCUL DU PRIX SUGGÉRÉ DYNAMIQUE
// =============================================================================

export interface SuggestedBidParams {
  campaignType: string;
  targeting?: {
    keywords?: string[];
    cities?: string[];
  };
  activeCampaignsCount: number;
  config: AdAuctionConfig;
}

/**
 * Calcule le prix d'enchère suggéré basé sur la demande actuelle.
 * Plus il y a de campagnes actives, plus le prix suggéré augmente.
 */
export function calculateSuggestedBid(params: SuggestedBidParams): number {
  const { config, activeCampaignsCount } = params;

  const baseBid = config.suggested_bid_cents;
  const demandMultiplier = config.demand_multiplier ?? 1.0;

  // Augmenter le prix si beaucoup de demande
  // 0-5 campagnes: x1, 5-10: x1.2, 10-20: x1.5, 20+: x2
  let demandFactor = 1.0;
  if (activeCampaignsCount > 20) demandFactor = 2.0;
  else if (activeCampaignsCount > 10) demandFactor = 1.5;
  else if (activeCampaignsCount > 5) demandFactor = 1.2;

  const suggested = Math.round(baseBid * demandMultiplier * demandFactor);

  // Respecter les limites min/max
  const min = config.min_bid_cents;
  const max = config.max_bid_cents ?? Infinity;

  return Math.max(min, Math.min(max, suggested));
}

// =============================================================================
// VALIDATION ENCHÈRE
// =============================================================================

export interface ValidateBidParams {
  bidAmountCents: number;
  budgetCents: number;
  dailyBudgetCents?: number;
  config: AdAuctionConfig;
}

export interface BidValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valide une enchère avant création/modification de campagne.
 */
export function validateBid(params: ValidateBidParams): BidValidationResult {
  const { bidAmountCents, budgetCents, dailyBudgetCents, config } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Enchère minimum
  if (bidAmountCents < config.min_bid_cents) {
    errors.push(`L'enchère minimum est de ${(config.min_bid_cents / 100).toFixed(2)} MAD`);
  }

  // Enchère maximum
  if (config.max_bid_cents && bidAmountCents > config.max_bid_cents) {
    errors.push(`L'enchère maximum est de ${(config.max_bid_cents / 100).toFixed(2)} MAD`);
  }

  // Budget minimum
  if (budgetCents < config.min_budget_cents) {
    errors.push(`Le budget minimum est de ${(config.min_budget_cents / 100).toFixed(2)} MAD`);
  }

  // Budget quotidien minimum
  if (dailyBudgetCents && config.min_daily_budget_cents) {
    if (dailyBudgetCents < config.min_daily_budget_cents) {
      errors.push(`Le budget quotidien minimum est de ${(config.min_daily_budget_cents / 100).toFixed(2)} MAD`);
    }
  }

  // Warnings
  if (bidAmountCents < config.suggested_bid_cents) {
    warnings.push(`Votre enchère est inférieure au prix suggéré (${(config.suggested_bid_cents / 100).toFixed(2)} MAD). Votre visibilité pourrait être limitée.`);
  }

  // Budget trop faible pour le nombre d'interactions estimées
  const estimatedInteractions = Math.floor(budgetCents / bidAmountCents);
  if (estimatedInteractions < 10) {
    warnings.push(`Avec ce budget et cette enchère, vous aurez environ ${estimatedInteractions} interactions. Considérez augmenter votre budget.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
