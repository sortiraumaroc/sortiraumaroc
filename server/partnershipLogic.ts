/**
 * Partnership Logic — Helper functions for Partner Agreements
 *
 * Provides reusable utilities for:
 * - Agreement history logging
 * - Establishment flag sync
 * - Agreement retrieval
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("partnershipLogic");
import type { AgreementHistoryActor } from "../shared/partnershipTypes";

const supabase = () => getAdminSupabase();

// ============================================================================
// History Logging
// ============================================================================

/**
 * Append an entry to the agreement_history audit journal.
 * Fire-and-forget: errors are logged but don't throw.
 */
export async function logAgreementHistory(
  agreementId: string,
  actorType: AgreementHistoryActor,
  actorId: string | null,
  action: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase().from("agreement_history").insert({
      agreement_id: agreementId,
      actor_type: actorType,
      actor_id: actorId,
      action,
      details: details ?? null,
    });
  } catch (err) {
    log.error({ err }, "failed to log agreement history");
  }
}

// ============================================================================
// Establishment Flag Sync
// ============================================================================

/**
 * Update `establishments.has_partner_agreement` flag based on
 * whether the establishment has at least one active, non-deleted agreement.
 */
export async function syncEstablishmentPartnerFlag(establishmentId: string): Promise<void> {
  try {
    const sb = supabase();

    const { count } = await sb
      .from("partner_agreements")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", establishmentId)
      .eq("status", "active")
      .is("deleted_at", null);

    await sb
      .from("establishments")
      .update({ has_partner_agreement: (count ?? 0) > 0 })
      .eq("id", establishmentId);
  } catch (err) {
    log.error({ err }, "failed to sync establishment partner flag");
  }
}

// ============================================================================
// Agreement Retrieval
// ============================================================================

/**
 * Get the current (non-deleted) agreement for an establishment.
 * Returns null if no agreement exists.
 */
export async function getAgreementForEstablishment(
  establishmentId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase()
    .from("partner_agreements")
    .select("*")
    .eq("establishment_id", establishmentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    log.error({ err: error }, "error fetching agreement");
    return null;
  }
  return data;
}

/**
 * Get agreement lines for an agreement, ordered by sort_order.
 */
export async function getAgreementLines(
  agreementId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase()
    .from("agreement_lines")
    .select("*")
    .eq("agreement_id", agreementId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    log.error({ err: error }, "error fetching agreement lines");
    return [];
  }
  return data ?? [];
}

/**
 * Get agreement history, most recent first.
 */
export async function getAgreementHistory(
  agreementId: string,
  limit = 50,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase()
    .from("agreement_history")
    .select("*")
    .eq("agreement_id", agreementId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    log.error({ err: error }, "error fetching agreement history");
    return [];
  }
  return data ?? [];
}

// ============================================================================
// Line Counts (for enrichment)
// ============================================================================

/**
 * Count lines by status for a given agreement.
 */
export async function countAgreementLines(agreementId: string): Promise<{
  total: number;
  active: number;
  ce: number;
  conciergerie: number;
  both: number;
}> {
  const sb = supabase();

  const [totalRes, activeRes, ceRes, conciergerieRes, bothRes] = await Promise.all([
    sb.from("agreement_lines").select("id", { count: "exact", head: true })
      .eq("agreement_id", agreementId).is("deleted_at", null),
    sb.from("agreement_lines").select("id", { count: "exact", head: true })
      .eq("agreement_id", agreementId).eq("is_active", true).is("deleted_at", null),
    sb.from("agreement_lines").select("id", { count: "exact", head: true })
      .eq("agreement_id", agreementId).eq("module", "ce").is("deleted_at", null),
    sb.from("agreement_lines").select("id", { count: "exact", head: true })
      .eq("agreement_id", agreementId).eq("module", "conciergerie").is("deleted_at", null),
    sb.from("agreement_lines").select("id", { count: "exact", head: true })
      .eq("agreement_id", agreementId).eq("module", "both").is("deleted_at", null),
  ]);

  return {
    total: totalRes.count ?? 0,
    active: activeRes.count ?? 0,
    ce: ceRes.count ?? 0,
    conciergerie: conciergerieRes.count ?? 0,
    both: bothRes.count ?? 0,
  };
}
