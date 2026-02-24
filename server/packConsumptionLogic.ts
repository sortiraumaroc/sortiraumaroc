/**
 * Pack Consumption Logic (Phase 3.3)
 *
 * Handles:
 *  - QR scan → display active packs for client at establishment
 *  - Consume a pack (single-use or multi-use)
 *  - Validations: status, validity period, day/time, uses remaining
 *  - PackConsumption record creation
 *  - Notifications to client
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { emitConsumerUserEvent } from "./consumerNotifications";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("packConsumptionLogic");

// =============================================================================
// Types
// =============================================================================

type OpResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; errorCode?: string };

export interface ActivePackForClient {
  purchaseId: string;
  packId: string;
  packTitle: string;
  coverUrl: string | null;
  usesRemaining: number;
  usesTotal: number;
  isMultiUse: boolean;
  expiresAt: string | null;
  status: string;
}

// =============================================================================
// 1. Get active packs for a client at an establishment (after QR scan)
// =============================================================================

export async function getClientActivePacksAtEstablishment(
  userId: string,
  establishmentId: string,
): Promise<OpResult<ActivePackForClient[]>> {
  const supabase = getAdminSupabase();

  const { data: purchases, error } = await supabase
    .from("pack_purchases")
    .select(`
      id,
      pack_id,
      status,
      is_multi_use,
      uses_remaining,
      uses_total,
      expires_at,
      payment_status,
      packs (
        id,
        title,
        cover_url,
        validity_end_date,
        valid_days,
        valid_time_start,
        valid_time_end
      )
    `)
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .in("payment_status", ["completed", "paid"])
    .in("status", ["active", "purchased", "partially_consumed"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { ok: false, error: error.message };
  if (!purchases || purchases.length === 0) {
    return { ok: true, data: [] };
  }

  const now = new Date();
  const activePacks: ActivePackForClient[] = [];

  for (const purchase of purchases) {
    const p = purchase as any;
    const pack = p.packs;

    // Filter out expired
    if (p.expires_at && new Date(p.expires_at) < now) continue;
    if (pack?.validity_end_date) {
      const endDate = new Date(pack.validity_end_date + "T23:59:59Z");
      if (endDate < now) continue;
    }

    // Filter out if no uses remaining
    if (p.is_multi_use && (p.uses_remaining ?? 0) <= 0) continue;

    activePacks.push({
      purchaseId: p.id,
      packId: p.pack_id,
      packTitle: pack?.title || "Pack",
      coverUrl: pack?.cover_url || null,
      usesRemaining: p.uses_remaining ?? 1,
      usesTotal: p.uses_total ?? 1,
      isMultiUse: p.is_multi_use ?? false,
      expiresAt: p.expires_at || (pack?.validity_end_date ? pack.validity_end_date + "T23:59:59Z" : null),
      status: p.status,
    });
  }

  return { ok: true, data: activePacks };
}

// =============================================================================
// 2. Consume a Pack
// =============================================================================

export async function consumePack(
  purchaseId: string,
  establishmentId: string,
  scannedByUserId: string,
  notes?: string | null,
): Promise<OpResult<{ consumptionId: string; usesRemaining: number; newStatus: string }>> {
  const supabase = getAdminSupabase();

  // ── Step 1: Fetch purchase with pack info ───────────────────
  const { data: purchase, error } = await supabase
    .from("pack_purchases")
    .select(`
      id,
      pack_id,
      user_id,
      establishment_id,
      status,
      payment_status,
      is_multi_use,
      uses_remaining,
      uses_total,
      expires_at,
      packs (
        id,
        title,
        validity_end_date,
        valid_days,
        valid_time_start,
        valid_time_end
      )
    `)
    .eq("id", purchaseId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!purchase) return { ok: false, error: "Achat de Pack introuvable.", errorCode: "not_found" };

  const p = purchase as any;
  const pack = p.packs;

  // ── Step 2: Check payment status ────────────────────────────
  if (!["completed", "paid"].includes(p.payment_status)) {
    return { ok: false, error: "Le paiement de ce Pack n'est pas confirme.", errorCode: "not_paid" };
  }

  // ── Step 3: Check purchase status ───────────────────────────
  const validStatuses = ["active", "purchased", "partially_consumed"];
  if (!validStatuses.includes(p.status)) {
    return {
      ok: false,
      error: `Ce Pack ne peut pas etre consomme (statut: ${p.status}).`,
      errorCode: "invalid_status",
    };
  }

  // ── Step 4: Check validity period ───────────────────────────
  const now = new Date();

  if (p.expires_at && new Date(p.expires_at) < now) {
    return { ok: false, error: "Ce Pack a expire.", errorCode: "expired" };
  }
  if (pack?.validity_end_date) {
    const endDate = new Date(pack.validity_end_date + "T23:59:59Z");
    if (endDate < now) {
      return { ok: false, error: "Ce Pack a expire.", errorCode: "expired" };
    }
  }

  // ── Step 5: Check valid days ────────────────────────────────
  if (pack?.valid_days && Array.isArray(pack.valid_days) && pack.valid_days.length > 0) {
    const todayDay = now.getDay(); // 0=Sun..6=Sat
    if (!pack.valid_days.includes(todayDay)) {
      const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
      const validDayNames = pack.valid_days.map((d: number) => dayNames[d]).join(", ");
      return {
        ok: false,
        error: `Ce Pack n'est valable que les jours suivants : ${validDayNames}.`,
        errorCode: "invalid_day",
      };
    }
  }

  // ── Step 6: Check valid time ────────────────────────────────
  if (pack?.valid_time_start && pack?.valid_time_end) {
    const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (nowTime < pack.valid_time_start || nowTime > pack.valid_time_end) {
      return {
        ok: false,
        error: `Ce Pack est valable uniquement entre ${pack.valid_time_start} et ${pack.valid_time_end}.`,
        errorCode: "invalid_time",
      };
    }
  }

  // ── Step 7: Check uses remaining ────────────────────────────
  const usesRemaining = p.uses_remaining ?? 1;
  if (usesRemaining <= 0) {
    return { ok: false, error: "Ce Pack a ete entierement consomme.", errorCode: "no_uses_left" };
  }

  // ── Step 8: Calculate use number ────────────────────────────
  const usesTotal = p.uses_total ?? 1;
  const useNumber = usesTotal - usesRemaining + 1;

  // ── Step 9: Create consumption record ───────────────────────
  const { data: consumption, error: consErr } = await supabase
    .from("pack_consumptions")
    .insert({
      pack_purchase_id: purchaseId,
      establishment_id: establishmentId,
      scanned_by: scannedByUserId,
      scanned_at: now.toISOString(),
      use_number: useNumber,
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (consErr) {
    return { ok: false, error: consErr.message, errorCode: "db_error" };
  }

  // ── Step 10: Update purchase (decrement uses, update status) ──
  const newUsesRemaining = usesRemaining - 1;
  const newStatus = newUsesRemaining <= 0
    ? "consumed"
    : p.is_multi_use
      ? "partially_consumed"
      : "consumed";

  const updatePayload: Record<string, unknown> = {
    uses_remaining: newUsesRemaining,
    status: newStatus === "consumed" ? "used" : newStatus, // V1 compat: "used" instead of "consumed"
    consumed_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  await supabase
    .from("pack_purchases")
    .update(updatePayload)
    .eq("id", purchaseId);

  // ── Step 11: Increment consumed_count on pack ───────────────
  void (async () => {
    try {
      const { data: packData } = await supabase
        .from("packs")
        .select("consumed_count")
        .eq("id", p.pack_id)
        .maybeSingle();
      if (packData) {
        await supabase
          .from("packs")
          .update({
            consumed_count: ((packData as any).consumed_count ?? 0) + 1,
            updated_at: now.toISOString(),
          })
          .eq("id", p.pack_id);
      }
    } catch (err) { log.warn({ err }, "Best-effort: pack consumed_count update failed"); }
  })();

  // ── Step 12: Notify client ──────────────────────────────────
  if (p.user_id) {
    void (async () => {
      try {
        await emitConsumerUserEvent({
          supabase,
          userId: p.user_id,
          eventType: "pack_consumed",
          metadata: {
            title: "Pack utilise",
            body: p.is_multi_use
              ? `Votre Pack "${pack?.title}" a ete utilise (${useNumber}/${usesTotal}). Il reste ${newUsesRemaining} utilisation(s).`
              : `Votre Pack "${pack?.title}" a ete utilise avec succes.`,
            purchase_id: purchaseId,
            pack_id: p.pack_id,
            use_number: useNumber,
            uses_remaining: newUsesRemaining,
          },
        });
      } catch (err) { log.warn({ err }, "Best-effort: pack consumed notification failed"); }
    })();
  }

  return {
    ok: true,
    data: {
      consumptionId: (consumption as any).id,
      usesRemaining: newUsesRemaining,
      newStatus,
    },
  };
}
