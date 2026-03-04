/**
 * Facturation des campagnes publicitaires
 * Gère le débit du wallet et la mise à jour des compteurs
 */

import { createClient } from '@supabase/supabase-js';
import type { AdCampaign, AdClick, AdImpression, AdWallet } from './types';
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adsBilling");

// =============================================================================
// TYPES
// =============================================================================

export interface BillingResult {
  success: boolean;
  amount_charged_cents: number;
  new_balance_cents: number;
  error?: string;
}

export interface CampaignSpendUpdate {
  campaign_id: string;
  amount_cents: number;
  impression_count?: number;
  click_count?: number;
}

// =============================================================================
// FACTURATION AU CLIC (CPC)
// =============================================================================

/**
 * Facture un clic sur une campagne CPC.
 * - Vérifie que le wallet a assez de solde
 * - Débite le wallet
 * - Met à jour les compteurs de la campagne
 */
export async function billClick(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
  clickId: string,
  costCents: number
): Promise<BillingResult> {
  try {
    // 1. Récupérer la campagne et le wallet
    const { data: campaign, error: campaignError } = await supabase
      .from('pro_campaigns')
      .select('id, establishment_id, remaining_cents, spent_cents, daily_spent_cents, daily_budget_cents')
      .eq('id', campaignId)
      .single() as { data: any; error: any };

    if (campaignError || !campaign) {
      return { success: false, amount_charged_cents: 0, new_balance_cents: 0, error: 'Campagne introuvable' };
    }

    // 2. Récupérer le wallet
    const { data: wallet, error: walletError } = await supabase
      .from('ad_wallets')
      .select('id, balance_cents')
      .eq('establishment_id', campaign.establishment_id)
      .single() as { data: any; error: any };

    if (walletError || !wallet) {
      return { success: false, amount_charged_cents: 0, new_balance_cents: 0, error: 'Wallet introuvable' };
    }

    // 3. Vérifier le solde
    if (wallet.balance_cents < costCents) {
      return { success: false, amount_charged_cents: 0, new_balance_cents: wallet.balance_cents, error: 'Solde insuffisant' };
    }

    // 4. Vérifier le budget campagne
    if (campaign.remaining_cents < costCents) {
      return { success: false, amount_charged_cents: 0, new_balance_cents: wallet.balance_cents, error: 'Budget campagne épuisé' };
    }

    // 5. Vérifier le budget quotidien
    if (campaign.daily_budget_cents && campaign.daily_spent_cents + costCents > campaign.daily_budget_cents) {
      return { success: false, amount_charged_cents: 0, new_balance_cents: wallet.balance_cents, error: 'Budget quotidien épuisé' };
    }

    // 6. Débiter le wallet (utilise la fonction SQL)
    const { data: debitResult, error: debitError } = await (supabase.rpc as any)('debit_ad_wallet', {
      p_wallet_id: wallet.id,
      p_amount_cents: costCents,
      p_description: `Clic campagne ${campaign.id}`,
      p_reference_type: 'campaign_click',
      p_reference_id: clickId,
    }) as { data: any; error: any };

    if (debitError || !debitResult) {
      return { success: false, amount_charged_cents: 0, new_balance_cents: wallet.balance_cents, error: 'Échec du débit' };
    }

    // 7. Mettre à jour les compteurs de la campagne
    await (supabase
      .from('pro_campaigns') as any)
      .update({
        spent_cents: campaign.spent_cents + costCents,
        remaining_cents: campaign.remaining_cents - costCents,
        daily_spent_cents: campaign.daily_spent_cents + costCents,
        clicks: (campaign as any).clicks + 1,
      })
      .eq('id', campaignId);

    // 8. Marquer le clic comme facturé
    await (supabase
      .from('ad_clicks') as any)
      .update({ cost_cents: costCents, is_billable: true })
      .eq('id', clickId);

    // 9. Récupérer le nouveau solde
    const { data: updatedWallet } = await supabase
      .from('ad_wallets')
      .select('balance_cents')
      .eq('id', wallet.id)
      .single() as { data: any; error: any };

    return {
      success: true,
      amount_charged_cents: costCents,
      new_balance_cents: updatedWallet?.balance_cents ?? wallet.balance_cents - costCents,
    };

  } catch (error) {
    log.error({ err: error }, "error billing click");
    return { success: false, amount_charged_cents: 0, new_balance_cents: 0, error: 'Erreur interne' };
  }
}

// =============================================================================
// FACTURATION À L'IMPRESSION (CPM)
// =============================================================================

/**
 * Facture des impressions pour une campagne CPM.
 * Le coût est calculé proportionnellement (cpm / 1000 par impression).
 */
export async function billImpressions(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
  impressionCount: number
): Promise<BillingResult> {
  try {
    // 1. Récupérer la campagne
    const { data: campaign, error: campaignError } = await supabase
      .from('pro_campaigns')
      .select('id, establishment_id, cpm_cents, remaining_cents, spent_cents, daily_spent_cents, daily_budget_cents')
      .eq('id', campaignId)
      .single() as { data: any; error: any };

    if (campaignError || !campaign) {
      return { success: false, amount_charged_cents: 0, new_balance_cents: 0, error: 'Campagne introuvable' };
    }

    // 2. Calculer le coût
    const cpmCents = campaign.cpm_cents ?? 2000; // 20 MAD par défaut
    const costCents = Math.round((cpmCents / 1000) * impressionCount);

    if (costCents === 0) {
      return { success: true, amount_charged_cents: 0, new_balance_cents: 0 };
    }

    // 3. Récupérer le wallet
    const { data: wallet, error: walletError } = await supabase
      .from('ad_wallets')
      .select('id, balance_cents')
      .eq('establishment_id', campaign.establishment_id)
      .single() as { data: any; error: any };

    if (walletError || !wallet) {
      return { success: false, amount_charged_cents: 0, new_balance_cents: 0, error: 'Wallet introuvable' };
    }

    // 4. Vérifier et débiter
    if (wallet.balance_cents < costCents) {
      // Facturer ce qu'on peut
      const actualCost = Math.min(wallet.balance_cents, costCents);
      if (actualCost === 0) {
        return { success: false, amount_charged_cents: 0, new_balance_cents: wallet.balance_cents, error: 'Solde insuffisant' };
      }
    }

    // 5. Débiter
    const { data: debitResult, error: debitError } = await (supabase.rpc as any)('debit_ad_wallet', {
      p_wallet_id: wallet.id,
      p_amount_cents: costCents,
      p_description: `${impressionCount} impressions campagne ${campaign.id}`,
      p_reference_type: 'campaign_impressions',
      p_reference_id: campaignId,
    }) as { data: any; error: any };

    if (debitError || !debitResult) {
      return { success: false, amount_charged_cents: 0, new_balance_cents: wallet.balance_cents, error: 'Échec du débit' };
    }

    // 6. Mettre à jour la campagne
    await (supabase
      .from('pro_campaigns') as any)
      .update({
        spent_cents: campaign.spent_cents + costCents,
        remaining_cents: campaign.remaining_cents - costCents,
        daily_spent_cents: campaign.daily_spent_cents + costCents,
        impressions: (campaign as any).impressions + impressionCount,
      })
      .eq('id', campaignId);

    const { data: updatedWallet } = await supabase
      .from('ad_wallets')
      .select('balance_cents')
      .eq('id', wallet.id)
      .single() as { data: any; error: any };

    return {
      success: true,
      amount_charged_cents: costCents,
      new_balance_cents: updatedWallet?.balance_cents ?? wallet.balance_cents - costCents,
    };

  } catch (error) {
    log.error({ err: error }, "error billing impressions");
    return { success: false, amount_charged_cents: 0, new_balance_cents: 0, error: 'Erreur interne' };
  }
}

// =============================================================================
// VÉRIFICATION BUDGET
// =============================================================================

/**
 * Vérifie si une campagne a encore du budget disponible.
 */
export async function checkCampaignBudget(
  supabase: ReturnType<typeof createClient>,
  campaignId: string
): Promise<{ hasbudget: boolean; remaining_cents: number; reason?: string }> {
  const { data: campaign, error } = await supabase
    .from('pro_campaigns')
    .select('remaining_cents, daily_spent_cents, daily_budget_cents, status')
    .eq('id', campaignId)
    .single() as { data: any; error: any };

  if (error || !campaign) {
    return { hasbudget: false, remaining_cents: 0, reason: 'Campagne introuvable' };
  }

  if (campaign.status !== 'active') {
    return { hasbudget: false, remaining_cents: campaign.remaining_cents, reason: 'Campagne non active' };
  }

  if (campaign.remaining_cents <= 0) {
    return { hasbudget: false, remaining_cents: 0, reason: 'Budget total épuisé' };
  }

  if (campaign.daily_budget_cents && campaign.daily_spent_cents >= campaign.daily_budget_cents) {
    return { hasbudget: false, remaining_cents: campaign.remaining_cents, reason: 'Budget quotidien épuisé' };
  }

  return { hasbudget: true, remaining_cents: campaign.remaining_cents };
}

// =============================================================================
// PAUSE AUTOMATIQUE
// =============================================================================

/**
 * Met en pause les campagnes qui ont épuisé leur budget.
 */
export async function pauseExhaustedCampaigns(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  const { data, error } = await (supabase
    .from('pro_campaigns') as any)
    .update({ status: 'paused' })
    .eq('status', 'active')
    .lte('remaining_cents', 0)
    .select('id') as { data: any[] | null; error: any };

  if (error) {
    log.error({ err: error }, "error pausing exhausted campaigns");
    return 0;
  }

  return data?.length ?? 0;
}

// =============================================================================
// RESET BUDGETS QUOTIDIENS
// =============================================================================

/**
 * Remet à zéro les compteurs de dépenses quotidiennes.
 * À exécuter tous les jours à minuit.
 */
export async function resetDailyBudgets(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  const { data, error } = await (supabase
    .from('pro_campaigns') as any)
    .update({
      daily_spent_cents: 0,
      last_daily_reset: new Date().toISOString(),
    })
    .not('daily_budget_cents', 'is', null)
    .or('last_daily_reset.is.null,last_daily_reset.lt.' + new Date().toISOString().split('T')[0])
    .select('id') as { data: any[] | null; error: any };

  if (error) {
    log.error({ err: error }, "error resetting daily budgets");
    return 0;
  }

  return data?.length ?? 0;
}

// =============================================================================
// RECHARGE WALLET
// =============================================================================

/**
 * Crédite le wallet d'un établissement après un paiement.
 */
export async function creditWallet(
  supabase: ReturnType<typeof createClient>,
  establishmentId: string,
  amountCents: number,
  paymentReference: string
): Promise<BillingResult> {
  try {
    const { data, error } = await (supabase.rpc as any)('credit_ad_wallet', {
      p_establishment_id: establishmentId,
      p_amount_cents: amountCents,
      p_description: 'Recharge wallet publicitaire',
      p_reference_type: 'payment',
      p_reference_id: paymentReference,
    }) as { data: any; error: any };

    if (error) {
      return { success: false, amount_charged_cents: 0, new_balance_cents: 0, error: error.message };
    }

    return {
      success: true,
      amount_charged_cents: amountCents,
      new_balance_cents: data?.balance_cents ?? amountCents,
    };

  } catch (error) {
    log.error({ err: error }, "error crediting wallet");
    return { success: false, amount_charged_cents: 0, new_balance_cents: 0, error: 'Erreur interne' };
  }
}
