/**
 * Pack Lifecycle Logic (Phase 3.1)
 *
 * Manages the full lifecycle of a Pack:
 *  - Creation (draft)
 *  - Submission for moderation (pending_moderation)
 *  - Moderation (approve/reject/request_modification)
 *  - Scheduled publishing (approved → active at sale_start_date)
 *  - Suspension / resumption
 *  - Sold out detection
 *  - End of sale (sale_end_date → ended)
 *  - Modification with moderation re-submission for significant changes
 *  - Duplication
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { emitAdminNotification } from "./adminNotifications";
import { notifyProMembers } from "./proNotifications";
import type {
  PackModerationStatus,
} from "../shared/packsBillingTypes";
import {
  PACK_MODERATION_TRANSITIONS,
  PACK_EDITABLE_STATUSES,
  calculateDiscountPercentage,
} from "../shared/packsBillingTypes";

// =============================================================================
// Types
// =============================================================================

type OpResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; errorCode?: string };

export interface CreatePackV2Input {
  establishmentId: string;
  title: string;
  shortDescription?: string | null;
  detailedDescription?: string | null;
  coverUrl?: string | null;
  additionalPhotos?: string[];
  category?: string | null;
  price: number; // cents
  originalPrice?: number | null; // cents
  partySize?: number | null;
  items?: Array<{ name: string; description?: string; quantity: number; unit?: string }>;
  inclusions?: Array<{ label: string; description?: string }>;
  exclusions?: Array<{ label: string; description?: string }> | null;
  conditions?: string | null;
  validDays?: number[] | null;
  validTimeStart?: string | null;
  validTimeEnd?: string | null;
  saleStartDate?: string | null;
  saleEndDate?: string | null;
  validityStartDate?: string | null;
  validityEndDate?: string | null;
  stock?: number | null;
  limitPerClient?: number;
  isMultiUse?: boolean;
  totalUses?: number;
}

export interface UpdatePackV2Input {
  title?: string;
  shortDescription?: string | null;
  detailedDescription?: string | null;
  coverUrl?: string | null;
  additionalPhotos?: string[];
  category?: string | null;
  price?: number; // cents
  originalPrice?: number | null; // cents
  partySize?: number | null;
  items?: Array<{ name: string; description?: string; quantity: number; unit?: string }>;
  inclusions?: Array<{ label: string; description?: string }>;
  exclusions?: Array<{ label: string; description?: string }> | null;
  conditions?: string | null;
  validDays?: number[] | null;
  validTimeStart?: string | null;
  validTimeEnd?: string | null;
  saleStartDate?: string | null;
  saleEndDate?: string | null;
  validityStartDate?: string | null;
  validityEndDate?: string | null;
  stock?: number | null;
  limitPerClient?: number;
  isMultiUse?: boolean;
  totalUses?: number;
}

/** Fields that require re-moderation when changed on an active pack */
const SIGNIFICANT_FIELDS = new Set([
  "title",
  "price",
  "originalPrice",
  "items",
  "inclusions",
  "exclusions",
  "coverUrl",
  "additionalPhotos",
  "detailedDescription",
]);

// =============================================================================
// 1. Create Pack (draft)
// =============================================================================

export async function createPackV2(
  input: CreatePackV2Input,
): Promise<OpResult<{ packId: string }>> {
  const supabase = getAdminSupabase();

  // Calculate discount percentage if both prices provided
  let discountPercentage: number | null = null;
  if (input.originalPrice && input.originalPrice > 0 && input.price < input.originalPrice) {
    discountPercentage = calculateDiscountPercentage(input.originalPrice, input.price);
  }

  const payload: Record<string, unknown> = {
    establishment_id: input.establishmentId,
    title: input.title,
    price: input.price,
    original_price: input.originalPrice ?? null,
    description: input.detailedDescription ?? null,
    short_description: input.shortDescription ?? null,
    detailed_description: input.detailedDescription ?? null,
    cover_url: input.coverUrl ?? null,
    additional_photos: input.additionalPhotos ?? [],
    category: input.category ?? null,
    discount_percentage: discountPercentage,
    party_size: input.partySize ?? null,
    items: input.items ?? [],
    inclusions: input.inclusions ?? [],
    exclusions: input.exclusions ?? null,
    conditions: input.conditions ?? null,
    valid_days: input.validDays ?? null,
    valid_time_start: input.validTimeStart ?? null,
    valid_time_end: input.validTimeEnd ?? null,
    sale_start_date: input.saleStartDate ?? null,
    sale_end_date: input.saleEndDate ?? null,
    validity_start_date: input.validityStartDate ?? null,
    validity_end_date: input.validityEndDate ?? null,
    stock: input.stock ?? null,
    is_limited: input.stock != null && input.stock > 0,
    limit_per_client: input.limitPerClient ?? 1,
    is_multi_use: input.isMultiUse ?? false,
    total_uses: input.isMultiUse ? (input.totalUses ?? 1) : 1,
    moderation_status: "draft",
    active: false,
    sold_count: 0,
    consumed_count: 0,
  };

  const { data, error } = await supabase
    .from("packs")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message, errorCode: "db_error" };
  }

  return { ok: true, data: { packId: (data as any).id } };
}

// =============================================================================
// 2. Submit for moderation (draft/modification_requested → pending_moderation)
// =============================================================================

export async function submitPackForModeration(
  packId: string,
  establishmentId: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: pack, error } = await supabase
    .from("packs")
    .select("id, moderation_status, title, establishment_id")
    .eq("id", packId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!pack) return { ok: false, error: "Pack introuvable.", errorCode: "not_found" };

  const currentStatus = (pack as any).moderation_status as PackModerationStatus;
  const allowed = PACK_MODERATION_TRANSITIONS[currentStatus];
  if (!allowed?.includes("pending_moderation")) {
    return {
      ok: false,
      error: `Impossible de soumettre un Pack en statut "${currentStatus}".`,
      errorCode: "invalid_transition",
    };
  }

  await supabase
    .from("packs")
    .update({
      moderation_status: "pending_moderation",
      updated_at: new Date().toISOString(),
    })
    .eq("id", packId);

  // Notify admin
  void (async () => {
    try {
      await emitAdminNotification({
        type: "pack_moderation",
        title: "Nouveau Pack en attente de moderation",
        body: `Le Pack "${(pack as any).title}" a ete soumis pour moderation.`,
        data: { pack_id: packId, establishment_id: establishmentId },
      });
    } catch { /* best-effort */ }
  })();

  return { ok: true, data: undefined };
}

// =============================================================================
// 3. Moderate: Approve
// =============================================================================

export async function approvePack(
  packId: string,
  adminUserId: string,
  note?: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: pack, error } = await supabase
    .from("packs")
    .select("id, moderation_status, title, establishment_id, sale_start_date")
    .eq("id", packId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!pack) return { ok: false, error: "Pack introuvable.", errorCode: "not_found" };

  const currentStatus = (pack as any).moderation_status as PackModerationStatus;
  if (currentStatus !== "pending_moderation") {
    return {
      ok: false,
      error: `Le Pack n'est pas en attente de moderation (statut: ${currentStatus}).`,
      errorCode: "invalid_transition",
    };
  }

  // Determine target status: active immediately or approved (scheduled)
  const saleStartDate = (pack as any).sale_start_date;
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const shouldActivateNow = !saleStartDate || saleStartDate <= today;

  const targetStatus: PackModerationStatus = shouldActivateNow ? "active" : "approved";

  await supabase
    .from("packs")
    .update({
      moderation_status: targetStatus,
      active: targetStatus === "active",
      moderated_by: adminUserId,
      moderated_at: now.toISOString(),
      moderation_note: note ?? null,
      rejection_reason: null,
      updated_at: now.toISOString(),
    })
    .eq("id", packId);

  // Notify pro
  void (async () => {
    try {
      await notifyProMembers({
        supabase,
        establishmentId: (pack as any).establishment_id,
        category: "pack_moderation",
        title: "Pack approuve !",
        body: targetStatus === "active"
          ? `Votre Pack "${(pack as any).title}" est maintenant en vente.`
          : `Votre Pack "${(pack as any).title}" a ete approuve et sera mis en vente le ${saleStartDate}.`,
        data: { pack_id: packId, status: targetStatus },
      });
    } catch { /* best-effort */ }
  })();

  return { ok: true, data: undefined };
}

// =============================================================================
// 4. Moderate: Reject
// =============================================================================

export async function rejectPack(
  packId: string,
  adminUserId: string,
  reason: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: pack, error } = await supabase
    .from("packs")
    .select("id, moderation_status, title, establishment_id")
    .eq("id", packId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!pack) return { ok: false, error: "Pack introuvable.", errorCode: "not_found" };

  if ((pack as any).moderation_status !== "pending_moderation") {
    return { ok: false, error: "Le Pack n'est pas en attente de moderation.", errorCode: "invalid_transition" };
  }

  await supabase
    .from("packs")
    .update({
      moderation_status: "rejected",
      active: false,
      moderated_by: adminUserId,
      moderated_at: new Date().toISOString(),
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", packId);

  void (async () => {
    try {
      await notifyProMembers({
        supabase,
        establishmentId: (pack as any).establishment_id,
        category: "pack_moderation",
        title: "Pack rejete",
        body: `Votre Pack "${(pack as any).title}" a ete rejete. Motif : ${reason}`,
        data: { pack_id: packId, reason },
      });
    } catch { /* best-effort */ }
  })();

  return { ok: true, data: undefined };
}

// =============================================================================
// 5. Moderate: Request modification
// =============================================================================

export async function requestPackModification(
  packId: string,
  adminUserId: string,
  note: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: pack, error } = await supabase
    .from("packs")
    .select("id, moderation_status, title, establishment_id")
    .eq("id", packId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!pack) return { ok: false, error: "Pack introuvable.", errorCode: "not_found" };

  if ((pack as any).moderation_status !== "pending_moderation") {
    return { ok: false, error: "Le Pack n'est pas en attente de moderation.", errorCode: "invalid_transition" };
  }

  await supabase
    .from("packs")
    .update({
      moderation_status: "modification_requested",
      active: false,
      moderated_by: adminUserId,
      moderated_at: new Date().toISOString(),
      moderation_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", packId);

  void (async () => {
    try {
      await notifyProMembers({
        supabase,
        establishmentId: (pack as any).establishment_id,
        category: "pack_moderation",
        title: "Modification demandee pour votre Pack",
        body: `Des modifications ont ete demandees pour "${(pack as any).title}": ${note}`,
        data: { pack_id: packId, note },
      });
    } catch { /* best-effort */ }
  })();

  return { ok: true, data: undefined };
}

// =============================================================================
// 6. Feature / Unfeature (admin)
// =============================================================================

export async function featurePack(packId: string, featured: boolean): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("packs")
    .update({ is_featured: featured, updated_at: new Date().toISOString() })
    .eq("id", packId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

// =============================================================================
// 7. Update Pack (pro)
// =============================================================================

export async function updatePackV2(
  packId: string,
  establishmentId: string,
  input: UpdatePackV2Input,
): Promise<OpResult<{ requiresModeration: boolean }>> {
  const supabase = getAdminSupabase();

  const { data: pack, error } = await supabase
    .from("packs")
    .select("id, moderation_status, price, original_price, establishment_id")
    .eq("id", packId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!pack) return { ok: false, error: "Pack introuvable.", errorCode: "not_found" };

  const currentStatus = (pack as any).moderation_status as PackModerationStatus;

  // Check if pack is in an editable state (draft, modification_requested, rejected)
  // OR if it's active (minor edits allowed, significant edits re-submit)
  const isEditable = PACK_EDITABLE_STATUSES.includes(currentStatus);
  const isActive = currentStatus === "active" || currentStatus === "suspended";

  if (!isEditable && !isActive) {
    return {
      ok: false,
      error: `Impossible de modifier un Pack en statut "${currentStatus}".`,
      errorCode: "not_editable",
    };
  }

  // Build update payload
  const payload: Record<string, unknown> = {};
  const now = new Date().toISOString();
  payload.updated_at = now;

  if (input.title !== undefined) payload.title = input.title;
  if (input.shortDescription !== undefined) payload.short_description = input.shortDescription;
  if (input.detailedDescription !== undefined) {
    payload.detailed_description = input.detailedDescription;
    payload.description = input.detailedDescription;
  }
  if (input.coverUrl !== undefined) payload.cover_url = input.coverUrl;
  if (input.additionalPhotos !== undefined) payload.additional_photos = input.additionalPhotos;
  if (input.category !== undefined) payload.category = input.category;
  if (input.price !== undefined) payload.price = input.price;
  if (input.originalPrice !== undefined) payload.original_price = input.originalPrice;
  if (input.partySize !== undefined) payload.party_size = input.partySize;
  if (input.items !== undefined) payload.items = input.items;
  if (input.inclusions !== undefined) payload.inclusions = input.inclusions;
  if (input.exclusions !== undefined) payload.exclusions = input.exclusions;
  if (input.conditions !== undefined) payload.conditions = input.conditions;
  if (input.validDays !== undefined) payload.valid_days = input.validDays;
  if (input.validTimeStart !== undefined) payload.valid_time_start = input.validTimeStart;
  if (input.validTimeEnd !== undefined) payload.valid_time_end = input.validTimeEnd;
  if (input.saleStartDate !== undefined) payload.sale_start_date = input.saleStartDate;
  if (input.saleEndDate !== undefined) payload.sale_end_date = input.saleEndDate;
  if (input.validityStartDate !== undefined) payload.validity_start_date = input.validityStartDate;
  if (input.validityEndDate !== undefined) payload.validity_end_date = input.validityEndDate;
  if (input.stock !== undefined) {
    payload.stock = input.stock;
    payload.is_limited = input.stock != null && input.stock > 0;
  }
  if (input.limitPerClient !== undefined) payload.limit_per_client = input.limitPerClient;
  if (input.isMultiUse !== undefined) payload.is_multi_use = input.isMultiUse;
  if (input.totalUses !== undefined) payload.total_uses = input.totalUses;

  // Recalculate discount percentage
  const newPrice = input.price ?? (pack as any).price;
  const newOriginal = input.originalPrice !== undefined ? input.originalPrice : (pack as any).original_price;
  if (newOriginal && newOriginal > 0 && newPrice < newOriginal) {
    payload.discount_percentage = calculateDiscountPercentage(newOriginal, newPrice);
  } else {
    payload.discount_percentage = null;
  }

  // Check if significant fields changed → re-submit for moderation
  let requiresModeration = false;
  if (isActive) {
    const changedKeys = Object.keys(input).filter(
      (k) => (input as any)[k] !== undefined,
    );
    requiresModeration = changedKeys.some((k) => SIGNIFICANT_FIELDS.has(k));

    if (requiresModeration) {
      payload.moderation_status = "pending_moderation";
      payload.active = false;
    }
  }

  const { error: updateErr } = await supabase
    .from("packs")
    .update(payload)
    .eq("id", packId);

  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true, data: { requiresModeration } };
}

// =============================================================================
// 8. Suspend / Resume (pro)
// =============================================================================

export async function suspendPack(
  packId: string,
  establishmentId: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: pack, error } = await supabase
    .from("packs")
    .select("id, moderation_status")
    .eq("id", packId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!pack) return { ok: false, error: "Pack introuvable.", errorCode: "not_found" };

  if ((pack as any).moderation_status !== "active") {
    return { ok: false, error: "Seul un Pack actif peut etre suspendu.", errorCode: "invalid_transition" };
  }

  await supabase
    .from("packs")
    .update({ moderation_status: "suspended", active: false, updated_at: new Date().toISOString() })
    .eq("id", packId);

  return { ok: true, data: undefined };
}

export async function resumePack(
  packId: string,
  establishmentId: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: pack, error } = await supabase
    .from("packs")
    .select("id, moderation_status")
    .eq("id", packId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!pack) return { ok: false, error: "Pack introuvable.", errorCode: "not_found" };

  if ((pack as any).moderation_status !== "suspended") {
    return { ok: false, error: "Seul un Pack suspendu peut etre reactive.", errorCode: "invalid_transition" };
  }

  await supabase
    .from("packs")
    .update({ moderation_status: "active", active: true, updated_at: new Date().toISOString() })
    .eq("id", packId);

  return { ok: true, data: undefined };
}

// =============================================================================
// 9. Close (pro — ended)
// =============================================================================

export async function closePack(
  packId: string,
  establishmentId: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: pack, error } = await supabase
    .from("packs")
    .select("id, moderation_status")
    .eq("id", packId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!pack) return { ok: false, error: "Pack introuvable.", errorCode: "not_found" };

  const status = (pack as any).moderation_status as PackModerationStatus;
  const canClose = ["active", "suspended", "sold_out"].includes(status);
  if (!canClose) {
    return { ok: false, error: `Impossible de cloturer un Pack en statut "${status}".`, errorCode: "invalid_transition" };
  }

  await supabase
    .from("packs")
    .update({ moderation_status: "ended", active: false, updated_at: new Date().toISOString() })
    .eq("id", packId);

  return { ok: true, data: undefined };
}

// =============================================================================
// 10. Duplicate (pro)
// =============================================================================

export async function duplicatePack(
  packId: string,
  establishmentId: string,
): Promise<OpResult<{ newPackId: string }>> {
  const supabase = getAdminSupabase();

  const { data: pack, error } = await supabase
    .from("packs")
    .select("*")
    .eq("id", packId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!pack) return { ok: false, error: "Pack introuvable.", errorCode: "not_found" };

  const p = pack as Record<string, unknown>;
  const now = new Date().toISOString();

  // Copy all fields except IDs, counts, and moderation state
  const newPack: Record<string, unknown> = {
    establishment_id: p.establishment_id,
    title: `${p.title} (copie)`,
    description: p.description,
    label: p.label,
    price: p.price,
    original_price: p.original_price,
    items: p.items,
    is_limited: p.is_limited,
    stock: p.stock,
    availability: p.availability,
    max_reservations: p.max_reservations,
    active: false,
    valid_from: p.valid_from,
    valid_to: p.valid_to,
    conditions: p.conditions,
    cover_url: p.cover_url,
    // V2 fields
    short_description: p.short_description,
    detailed_description: p.detailed_description,
    additional_photos: p.additional_photos,
    category: p.category,
    discount_percentage: p.discount_percentage,
    party_size: p.party_size,
    inclusions: p.inclusions,
    exclusions: p.exclusions,
    valid_days: p.valid_days,
    valid_time_start: p.valid_time_start,
    valid_time_end: p.valid_time_end,
    limit_per_client: p.limit_per_client,
    is_multi_use: p.is_multi_use,
    total_uses: p.total_uses,
    // Reset
    moderation_status: "draft",
    sold_count: 0,
    consumed_count: 0,
    is_featured: false,
    sale_start_date: null,
    sale_end_date: null,
    validity_start_date: null,
    validity_end_date: null,
    scheduled_publish_at: null,
    moderated_by: null,
    moderated_at: null,
    moderation_note: null,
    rejection_reason: null,
    created_at: now,
    updated_at: now,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("packs")
    .insert(newPack)
    .select("id")
    .single();

  if (insErr) return { ok: false, error: insErr.message };

  return { ok: true, data: { newPackId: (inserted as any).id } };
}

// =============================================================================
// 11. Cron: Activate scheduled packs (approved → active at sale_start_date)
// =============================================================================

export async function activateScheduledPacks(): Promise<number> {
  const supabase = getAdminSupabase();
  const today = new Date().toISOString().split("T")[0];

  const { data: packs, error } = await supabase
    .from("packs")
    .select("id, title, establishment_id")
    .eq("moderation_status", "approved")
    .lte("sale_start_date", today)
    .limit(100);

  if (error || !packs) return 0;

  let activated = 0;
  for (const pack of packs) {
    await supabase
      .from("packs")
      .update({
        moderation_status: "active",
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (pack as any).id);

    void (async () => {
      try {
        await notifyProMembers({
          supabase,
          establishmentId: (pack as any).establishment_id,
          category: "pack_lifecycle",
          title: "Pack active !",
          body: `Votre Pack "${(pack as any).title}" est maintenant en vente.`,
          data: { pack_id: (pack as any).id },
        });
      } catch { /* best-effort */ }
    })();

    activated++;
  }

  if (activated > 0) {
    console.log(`[Pack Lifecycle] Activated ${activated} scheduled packs`);
  }

  return activated;
}

// =============================================================================
// 12. Cron: End expired packs (active → ended at sale_end_date)
// =============================================================================

export async function endExpiredPacks(): Promise<number> {
  const supabase = getAdminSupabase();
  const today = new Date().toISOString().split("T")[0];

  const { data: packs, error } = await supabase
    .from("packs")
    .select("id, title, establishment_id")
    .eq("moderation_status", "active")
    .lt("sale_end_date", today)
    .not("sale_end_date", "is", null)
    .limit(200);

  if (error || !packs) return 0;

  let ended = 0;
  for (const pack of packs) {
    await supabase
      .from("packs")
      .update({
        moderation_status: "ended",
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (pack as any).id);

    void (async () => {
      try {
        await notifyProMembers({
          supabase,
          establishmentId: (pack as any).establishment_id,
          category: "pack_lifecycle",
          title: "Periode de vente terminee",
          body: `La vente de votre Pack "${(pack as any).title}" est terminee. Les Packs deja vendus restent valables.`,
          data: { pack_id: (pack as any).id },
        });
      } catch { /* best-effort */ }
    })();

    ended++;
  }

  if (ended > 0) {
    console.log(`[Pack Lifecycle] Ended ${ended} expired packs`);
  }

  return ended;
}

// =============================================================================
// 13. Mark sold out (called after each sale)
// =============================================================================

export async function checkAndMarkSoldOut(packId: string): Promise<boolean> {
  const supabase = getAdminSupabase();

  const { data: pack, error } = await supabase
    .from("packs")
    .select("id, stock, sold_count, moderation_status, is_limited")
    .eq("id", packId)
    .maybeSingle();

  if (error || !pack) return false;

  const p = pack as any;
  if (p.moderation_status !== "active") return false;
  if (!p.is_limited || !p.stock) return false;
  if (p.sold_count < p.stock) return false;

  // Sold out!
  await supabase
    .from("packs")
    .update({
      moderation_status: "sold_out",
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", packId);

  return true;
}
